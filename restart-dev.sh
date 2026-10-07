#!/bin/bash
cd /home/z/my-project
pkill -9 -f "next-server" 2>/dev/null
sleep 1
# Always source .env so the dev server uses the project's configured
# environment — an inherited DATABASE_URL from an interactive shell must not
# win (dotenv semantics: real env vars override .env files). The SQLite file
# lives OUTSIDE the project tree on purpose: the Next dev file watcher would
# otherwise rebuild + remount the whole app on every DB write.
set -a; source .env; set +a
nohup bun run dev > dev.log 2>&1 &
echo "$(date) - server restarted (DATABASE_URL=$DATABASE_URL)" >> restart.log
