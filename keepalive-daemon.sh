#!/bin/bash
cd /home/z/my-project
while true; do
  # Check if server responds with 200
  CODE=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "http://localhost:3000/" 2>/dev/null)
  if [ "$CODE" != "200" ]; then
    pkill -9 -f "next-server" 2>/dev/null
    pkill -9 -f "bun run dev" 2>/dev/null
    sleep 2
    rm -rf .next
    nohup bun run dev > /home/z/my-project/dev.log 2>&1 &
    echo "$(date) - Server restarted (was: $CODE)" >> /home/z/my-project/keepalive.log
    for i in $(seq 1 40); do
      sleep 2
      CODE=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "http://localhost:3000/" 2>/dev/null)
      if [ "$CODE" = "200" ]; then
        echo "$(date) - Server ready (200)" >> /home/z/my-project/keepalive.log
        curl -s --max-time 30 -o /dev/null "http://localhost:3000/api/tmdb/home" 2>/dev/null
        curl -s --max-time 15 -o /dev/null "http://localhost:3000/api/watchlist" 2>/dev/null
        break
      fi
    done
  fi
  sleep 10
done
