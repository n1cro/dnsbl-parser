import { parentPort, workerData } from "worker_threads";
import { promisify } from "util";
import dns from "dns";
import pMap from "p-map";

let counter = 0;

const NOT_FOUND_ERR = "ENOTFOUND";
const TIMEOUT_ERR = "ETIMEOUT";
const SERV_ERR = "ESERVFAIL";
const CONNECTION_ERR = "ECONNREFUSED";

const errors = [];

const resolve4Async = promisify(dns.resolve4);

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
    const addresses = await resolve4Async(query);
    if (!addresses[0].includes("127.0.0")) {
      console.log(query, addresses, "ERROR");
    }
    response.isBlocked = true;
  } catch (err) {
    // addresses = [ '127.0.0.2' ] can be 127.0.0.3, 127.0.0.4, 127.255.255.254, 127.255.255.252??
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
  const { dnsbl, ips } = workerData;

  const results = await pMap(ips, (ip) => queryDnsbl(ip, dnsbl), {
    concurrency: 20,
  });

  // const results = await Promise.all(ips.map((ip) => queryDnsbl(ip, dnsbl)));

  const onlyBlocked = results.filter((item) => item.isBlocked);
  console.log(dnsbl, counter, errors, "errors");
  parentPort.postMessage(onlyBlocked);
}

// async function processBlacklistSync() {
//   const { dnsbl, ips } = workerData;
//   const results = [];

//   for (const ip of ips) {
//     const result = await queryDnsbl(ip, dnsbl);
//     if (result.isBlocked) {
//       results.push({ ip: result.ip, dnsbl: result.dnsbl });
//     }
//   }
//   console.log(counter, "counter of errors");
//   parentPort.postMessage(results);
// }

processBlacklist().catch((err) => {
  parentPort.postMessage({ error: err.message });
});
