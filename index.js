// process.env.UV_THREADPOOL_SIZE = 80;
console.log(process.env.UV_THREADPOOL_SIZE, "threads");
import { Worker } from "worker_threads";
import fs from "fs";
import path from "path";
import OS from "os";

import { execSync } from "child_process";
import { generateIpRange } from "./utils.js";

try {
  const softLimit = execSync("ulimit -Sn", { shell: "/bin/bash" })
    .toString()
    .trim();
  console.log(`Soft ulimit: ${softLimit}`);
} catch (error) {
  console.error("Error checking soft ulimit:", error);
}

// b.barracudacentral.org 10-20
// dnsbl.justspam.org 10-20
// all.s5h.net 20

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
const outputFile = "dnsbl_results.csv";

async function createWorker(dnsbl, ips) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(path.resolve(), "worker.js"), {
      workerData: { dnsbl, ips },
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

/**
 * Обработка диапазонов IP с использованием воркеров.
 */
async function scanIps() {
  console.time("scan");
  // 178.37.224.0/22

  const cidrRanges = ["79.110.120.0/19"];
  const ips = cidrRanges.flatMap((cidr) => generateIpRange(cidr));
  console.log(ips.length, "ip counts");
  const results = [];

  const counter = {};

  // Создаём worker для каждого DNSBL
  const workers = dnsblServers.map((dnsbl) => {
    counter[dnsbl] = 0;
    return createWorker(dnsbl, ips);
  });

  try {
    const workerResults = await Promise.all(workers);
    console.log(workerResults.length, "workerResults");
    console.timeEnd("scan");

    // Объединяем результаты
    workerResults.forEach((result) => {
      if (result.length > 0) {
        counter[result[0].dnsbl] = result.length;
      }

      results.push(...result);
    });

    // Сохраняем результаты
    const output = results.map((r) => `${r.ip},${r.dnsbl}`).join("\n");

    fs.writeFileSync(outputFile, output, "utf8");
    console.log(`Results saved to ${outputFile} | ${JSON.stringify(counter)}`);
  } catch (err) {
    console.error("Error while scanning IPs:", err);
  }
}

scanIps().catch(console.error);

// console.log(generateIpRange("178.37.224.0/24"));

// function reverseIp(ip) {
//   const reversedIp = ip.split(".").reverse().join(".");
//   console.log(reversedIp);
// }

// console.log(reverseIp("178.37.224.33"));
