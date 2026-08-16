#!/bin/bash
cd /home/z/my-project
pkill -9 -f "next-server" 2>/dev/null
sleep 1
nohup bun run dev > dev.log 2>&1 &
echo "$(date) - server restarted" >> restart.log
