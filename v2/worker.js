import { parentPort, workerData } from "worker_threads";
import dns from "dns/promises";
import { shuffleResolvers } from "../utils.js";

let counter = 0;

const NOT_FOUND_ERR = "ENOTFOUND";
const errors = [];

const resolvers = [
  "127.0.0.1",
  "91.202.160.77",
  "91.202.160.20",
  "91.202.160.152",
  "91.202.160.154",
];

let resolverIndex = 0;

function rotateResolver(index) {
  resolverIndex = (resolverIndex + 1) % resolvers.length;
  const currentResolver = resolvers[resolverIndex];
  dns.setServers([currentResolver]);
}

/**
 * Process DNSBL-query.
 * @param {string} ip - IP-address.
 * @param {string} dnsbl - DNSBL server.
 * @returns {Promise<{dnsbl: string, ip: string, isBlocked: boolean}>} - Result of query.
 */
async function queryDnsbl(ip, dnsbl) {
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
  }

  return response;
}

async function processBlacklist() {
  const { workerId, ips, blocklists } = workerData;

  const results = [];
  const step = 100;

  shuffleResolvers(resolvers);

  for (let i = 0; i < ips.length; i += step) {
    rotateResolver(i);

    const chunk = ips.slice(i, i + step);

    for (const dnsbl of blocklists) {
      const chunkResults = await Promise.all(
        chunk.map((ip) => queryDnsbl(ip, dnsbl))
      );
      results.push(...chunkResults);
    }
  }

  const onlyBlocked = results.filter((item) => item.isBlocked);
  console.log(errors, "errors");

  parentPort.postMessage({
    workerId,
    blockedIps: onlyBlocked,
    errors: counter,
  });
}

processBlacklist().catch((err) => {
  parentPort.postMessage({ error: err.message });
});
