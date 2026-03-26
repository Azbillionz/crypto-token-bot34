#!/bin/bash
echo "Looking for process on port 8080..."

PID=$(node -e "
const fs = require('fs');
let inode = null;
for (const path of ['/proc/net/tcp6', '/proc/net/tcp']) {
  try {
    const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[1] && parts[1].toUpperCase().includes('1F90')) {
        inode = parts[9]; break;
      }
    }
  } catch(e) {}
  if (inode) break;
}
if (inode) {
  for (const pid of fs.readdirSync('/proc').filter(p => /^\d+\$/.test(p))) {
    try {
      for (const fd of fs.readdirSync('/proc/'+pid+'/fd')) {
        try {
          const link = fs.readlinkSync('/proc/'+pid+'/fd/'+fd);
          if (link.includes('['+inode+']')) { process.stdout.write(pid); process.exit(); }
        } catch(e) {}
      }
    } catch(e) {}
  }
}
" 2>/dev/null)

if [ -n "$PID" ]; then
  echo "Stopping process $PID..."
  kill -9 "$PID" 2>/dev/null
  sleep 2
else
  echo "No existing process found."
fi

echo "Starting bot..."
cd /home/runner/workspace/artifacts/api-server
PORT=8080 node --enable-source-maps ./dist/index.mjs
