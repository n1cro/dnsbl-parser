import { Worker } from "worker_threads";
import path from "path";

import { generateIpRange } from "../utils.js";

const dnsblServers = [
  "zen.spamhaus.org",
  "pbl.spamhaus.org",
  "sbl.spamhaus.org",
  "xbl.spamhaus.org",
  "all.spamrats.com",
  "b.barracudacentral.org",
  "dnsbl.justspam.org",
  "all.s5h.net",
  "dnsbl.dronebl.org",
  "bl.mailspike.net",
];

const allResolvers = [
  "91.202.160.2",
  "91.202.160.9",
  "91.202.160.19",
  "91.202.160.5",
  "91.202.160.11",
  "91.202.160.10",
  "91.202.160.8",
  "91.202.160.12",
  "91.202.160.3",
  "91.202.160.16",
  "91.202.160.18",
  "91.202.160.4",
  "91.202.160.13",
  "91.202.160.14",
  "91.202.160.6",
  "91.202.160.20",
  "91.202.160.17",
  "91.202.160.77",
  "91.202.160.152",
  "91.202.160.154",
];

async function createWorker(index, chunk, blocklists, resolvers) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(path.resolve(), "worker.js"), {
      workerData: {
        workerId: index,
        ips: chunk,
        blocklists,
        resolvers,
      },
    });

    worker.on("message", (data) => resolve(data));
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

async function scanIps() {
  console.time("scan");

  const cidrRanges = ["178.37.224.0/19"];

  const ips = cidrRanges.flatMap((cidr) => generateIpRange(cidr));
  console.log(ips.length, "IP counts");

  const numWorkers = 4;
  const chunkSize = Math.ceil(ips.length / numWorkers);
  const chunks = Array.from({ length: numWorkers }, (_, i) =>
    ips.slice(i * chunkSize, (i + 1) * chunkSize)
  );
  const resolversPerWorker = Math.floor(allResolvers.length / numWorkers);

  const workers = chunks.map((chunk, index) => {
    const start = index * resolversPerWorker;
    const end = start + resolversPerWorker;
    const workerResolvers = allResolvers.slice(start, end);

    return createWorker(index + 1, chunk, dnsblServers, workerResolvers);
  });

  const results = [];

  try {
    const workerResults = await Promise.all(workers);
    console.timeEnd("scan");
    console.log(workerResults.length, "workerResults");

    workerResults.forEach((result) => {
      console.log(
        `Worker ${result.workerId} completed | Errors: ${result.errors}`
      );
      results.push(...result.blockedIps);
    });

    console.log(results.length, "Total blacklisted");
  } catch (err) {
    console.error("Error while scanning IPs:", err);
  }
}

scanIps().catch(console.error);
