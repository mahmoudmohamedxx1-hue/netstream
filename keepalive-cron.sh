#!/bin/bash
cd /home/z/my-project
if ! pgrep -f "next-server" > /dev/null 2>&1; then
  nohup bun run dev >> dev.log 2>&1 &
  echo "$(date) - restarted dev server" >> keepalive.log
fi
