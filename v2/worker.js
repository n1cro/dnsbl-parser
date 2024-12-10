import { parentPort, workerData } from "worker_threads";
import dns from "dns/promises";

let counter = 0;

const NOT_FOUND_ERR = "ENOTFOUND";
const errors = [];

let resolverIndex = 0;

function rotateResolver(resolvers) {
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
  const { workerId, ips, blocklists, resolvers } = workerData;

  const results = [];
  const step = 200;

  for (let i = 0; i < ips.length; i += step) {
    rotateResolver(resolvers);

    const chunk = ips.slice(i, i + step);
    const promises = chunk.flatMap((ip) =>
      blocklists.map((dnsbl) => queryDnsbl(ip, dnsbl))
    );

    const chunkResults = await Promise.all(promises);
    results.push(...chunkResults);
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
