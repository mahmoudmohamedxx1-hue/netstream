#!/bin/bash
while true; do
  if ! pgrep -f "next dev" > /dev/null 2>&1; then
    cd /home/z/my-project
    nohup node node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
    disown
    sleep 8
  fi
  sleep 5
done
