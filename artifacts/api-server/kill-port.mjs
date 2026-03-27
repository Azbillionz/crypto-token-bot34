import { readFileSync, readdirSync, readlinkSync } from "fs";

const PORT = process.argv[2] || "8080";
const hexPort = parseInt(PORT, 10).toString(16).toUpperCase().padStart(4, "0");

let inode = null;
for (const netFile of ["/proc/net/tcp6", "/proc/net/tcp"]) {
  try {
    const lines = readFileSync(netFile, "utf8").trim().split("\n").slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[1] && parts[1].toUpperCase().includes(hexPort)) {
        inode = parts[9];
        break;
      }
    }
  } catch (_) {}
  if (inode) break;
}

if (!inode) process.exit(0);

for (const pid of readdirSync("/proc").filter((p) => /^\d+$/.test(p))) {
  try {
    for (const fd of readdirSync(`/proc/${pid}/fd`)) {
      try {
        if (readlinkSync(`/proc/${pid}/fd/${fd}`).includes(`[${inode}]`)) {
          process.kill(Number(pid), 9);
          console.log(`Killed PID ${pid} holding port ${PORT}`);
          process.exit(0);
        }
      } catch (_) {}
    }
  } catch (_) {}
}
