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

async function createWorker(index, chunk, blocklists) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(path.resolve(), "worker.js"), {
      workerData: {
        workerId: index,
        ips: chunk,
        blocklists,
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

  const cidrRanges = ["178.37.224.0/24"];

  const ips = cidrRanges.flatMap((cidr) => generateIpRange(cidr));
  console.log(ips.length, "IP counts");

  const numWorkers = 4;
  const chunkSize = Math.ceil(ips.length / numWorkers);
  const chunks = Array.from({ length: numWorkers }, (_, i) =>
    ips.slice(i * chunkSize, (i + 1) * chunkSize)
  );

  const workers = chunks.map((chunk, index) => {
    return createWorker(index + 1, chunk, dnsblServers);
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
