#!/bin/bash
cd /home/z/my-project
# Check if server is already running on port 3000
if ss -tlnp 2>/dev/null | grep -q ":3000 " || netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
  echo "$(date) - server already running" >> server-cron.log
  exit 0
fi
# Kill any stale processes
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "bun run dev" 2>/dev/null
sleep 1
# Start fresh
nohup bun run dev > dev.log 2>&1 &
echo "$(date) - server started" >> server-cron.log
