import { parentPort, workerData } from "worker_threads";
import { promisify } from "util";
import dns from "dns/promises";
import pMap, { pMapSkip } from "p-map";

let counter = 0;
let activeRequests = 0;

const NOT_FOUND_ERR = "ENOTFOUND";
const TIMEOUT_ERR = "ETIMEOUT";
const SERV_ERR = "ESERVFAIL";
const CONNECTION_ERR = "ECONNREFUSED";

const errors = [];

const resolvers = [
  "127.0.0.1",
  "91.202.160.77",
  "91.202.160.20",
  "91.202.160.152",
  "91.202.160.154",
];

let resolverIndex = 0;
let requestCount = 0;
const N = 10; // менять резолвер после каждых 10 запросов

function rotateResolver() {
  resolverIndex = (resolverIndex + 1) % resolvers.length;
  const currentResolver = resolvers[resolverIndex];
  console.log(currentResolver, "RESOLVER");
  dns.setServers([currentResolver]);
}

/**
 * Process DNSBL-query.
 * @param {string} ip - IP-address.
 * @param {string} dnsbl - DNSBL server.
 * @returns {Promise<{dnsbl: string, ip: string, isBlocked: boolean}>} - Result of query.
 */
async function queryDnsbl(ip, dnsbl) {
  if (requestCount % N === 0) {
    rotateResolver();
  }

  const reversedIp = ip.split(".").reverse().join(".");
  const query = `${reversedIp}.${dnsbl}`;

  const response = {
    dnsbl,
    ip,
    isBlocked: false,
  };

  try {
    const addresses = await dns.resolve4(query);
    if (!addresses[0].includes("127.0.0")) {
      console.log(query, addresses, "ERROR");
    }
    response.isBlocked = true;
  } catch (err) {
    if (!errors.includes(err.code)) {
      errors.push(err.code);
    }
    if (err.code !== NOT_FOUND_ERR) {
      console.log(err.code, query);
      counter += 1;
    }
  } finally {
    requestCount++;
  }

  return response;
}

async function processBlacklist() {
  const { dnsbl, ips } = workerData;

  const results = await Promise.all(ips.map((ip) => queryDnsbl(ip, dnsbl)));

  const onlyBlocked = results.filter((item) => item.isBlocked);
  console.log(dnsbl, counter, errors, "errors");
  parentPort.postMessage(onlyBlocked);
}

processBlacklist().catch((err) => {
  parentPort.postMessage({ error: err.message });
});
