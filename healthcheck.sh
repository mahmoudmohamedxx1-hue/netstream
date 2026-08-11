#!/bin/bash
cd /home/z/my-project
if ! curl -s --max-time 5 -o /dev/null "http://localhost:3000/" 2>/dev/null; then
  pkill -9 -f "next-server" 2>/dev/null
  sleep 1
  nohup bun run dev > dev.log 2>&1 &
  echo "$(date) - server was down, restarted" >> restart.log
fi
