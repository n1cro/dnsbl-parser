import { parentPort, workerData } from "worker_threads";
import dns from "dns/promises";

let counter = 0;

const NOT_FOUND_ERR = "ENOTFOUND";

/**
 * Process DNSBL-query.
 * @param {string} ip - IP-address.
 * @param {string} dnsbl - DNSBL server.
 * @param {dns.Resolver} resolver - DNS resolver.
 * @returns {Promise<{dnsbl: string, ip: string, isBlocked: boolean}>} - Result of query.
 */
async function queryDnsbl(ip, dnsbl, resolver) {
  const reversedIp = ip.split(".").reverse().join(".");
  const query = `${reversedIp}.${dnsbl}`;

  const response = {
    dnsbl,
    ip,
    isBlocked: false,
  };

  try {
    const addresses = await resolver.resolve4(query);
    if (!addresses[0].includes("127.0.0")) {
      console.log(query, addresses, "ERROR");
    }
    response.isBlocked = true;
  } catch (err) {
    if (err.code !== NOT_FOUND_ERR) {
      console.log(err.code, query, "catch");
      counter += 1;
    }
  }

  return response;
}

async function resolveChunks(dnsbl, chunks, resolvers) {
  let resolverIndex = 0;
  const result = [];

  for (const chunk of chunks) {
    const resolver = resolvers[resolverIndex];
    resolverIndex = (resolverIndex + 1) % resolvers.length;

    const promises = chunk.map((ip) => queryDnsbl(ip, dnsbl, resolver));

    console.time(`chunk_${dnsbl}`);
    const resolved = await Promise.all(promises);
    console.timeEnd(`chunk_${dnsbl}`);
    result.push(...resolved);
  }

  return result;
}

async function processBlacklist() {
  const { workerId, ips, blocklists, resolvers } = workerData;

  const instancesRes = resolvers.map((ip) => {
    const resolver = new dns.Resolver();
    resolver.setServers([ip]);

    return resolver;
  });

  const chunkSize = 10;
  const numChunks = Math.ceil(ips.length / chunkSize);

  const chunks = Array.from({ length: numChunks }, (_, i) =>
    ips.slice(i * chunkSize, (i + 1) * chunkSize)
  );
  console.log(ips.length, numChunks, chunkSize, "INIT");

  const promises = blocklists.flatMap((dnsbl) =>
    resolveChunks(dnsbl, chunks, instancesRes)
  );
  const results = await Promise.all(promises);
  const onlyBlocked = results.flat(1).filter((item) => item.isBlocked);

  parentPort.postMessage({
    workerId,
    blockedIps: onlyBlocked,
    errors: counter,
  });
}

processBlacklist().catch((err) => {
  console.log(err);
  parentPort.postMessage({ error: err.message });
});
