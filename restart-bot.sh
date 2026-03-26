#!/bin/bash
echo "Stopping any process on port 8080..."
PID=$(ss -tlnp sport = :8080 2>/dev/null | awk '{print $6}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
if [ -n "$PID" ]; then
  kill -9 "$PID" 2>/dev/null
  echo "Killed PID $PID"
else
  echo "No process found on port 8080"
fi
sleep 1
echo "Starting bot..."
cd /home/runner/workspace/artifacts/api-server
PORT=8080 node --enable-source-maps ./dist/index.mjs
