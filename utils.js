/**
 * Generate list of IP's in CIDR block.
 * @param {string} cidr - CIDR block (for example, "192.168.0.0/24").
 * @returns {string[]} - IP addresses list.
 */
export function generateIpRange(cidr) {
  const [baseIp, prefixLength] = cidr.split("/");
  const baseParts = baseIp.split(".").map(Number);
  const hostsCount = 2 ** (32 - Number(prefixLength));

  const ips = [];
  for (let i = 0; i < hostsCount; i++) {
    const ip = [
      (baseParts[0] + (baseParts[1] + (baseParts[2] + i / 256) / 256) / 256) %
        256,
      (baseParts[1] + (baseParts[2] + i / 256) / 256) % 256,
      (baseParts[2] + Math.floor(i / 256)) % 256,
      (baseParts[3] + i) % 256,
    ].map(Math.floor);

    ips.push(ip.join("."));
  }
  return ips;
}
