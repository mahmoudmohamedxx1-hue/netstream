#!/bin/bash
cd /home/z/my-project
while true; do
  if ! pgrep -f "next-server" > /dev/null 2>&1; then
    echo "[$(date)] Starting dev server..." >> /home/z/my-project/watchdog.log
    bun run dev >> /home/z/my-project/dev.log 2>&1 &
    DEV_PID=$!
    sleep 8
    if pgrep -f "next-server" > /dev/null 2>&1; then
      echo "[$(date)] Dev server started (PID $DEV_PID)" >> /home/z/my-project/watchdog.log
    else
      echo "[$(date)] Dev server failed to start" >> /home/z/my-project/watchdog.log
    fi
  fi
  sleep 5
done
