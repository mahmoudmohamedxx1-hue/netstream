#!/bin/bash
# NetStream API Health Check — hits every route, reports status/latency/size
BASE="http://localhost:3000"
PASS=0; FAIL=0; SLOW=0

check() {
  local name="$1"; local url="$2"; local expect="${3:-200}"
  local start=$(date +%s%N)
  local body=$(curl -s -w "\n%{http_code}" --max-time 25 "$url" 2>/dev/null)
  local code=$(echo "$body" | tail -1)
  local payload=$(echo "$body" | head -n -1)
  local end=$(date +%s%N)
  local ms=$(( (end - start) / 1000000 ))
  local size=${#payload}
  local status="OK"
  if [ "$code" != "$expect" ]; then status="FAIL(exp $expect)"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi
  if [ $ms -gt 3000 ]; then SLOW=$((SLOW+1)); fi
  local sample=$(echo "$payload" | head -c 120 | tr '\n' ' ')
  printf "%-28s %s  %5sms  %7dB  %s\n" "$name" "$code" "$ms" "$size" "$sample"
}

echo "=== NetStream API Health Check — $(date '+%H:%M:%S') ==="
echo ""
echo "--- Core content routes ---"
check "GET /api (root)"            "$BASE/api"
check "GET /api/tmdb/home"         "$BASE/api/tmdb/home"
check "GET /api/tmdb/tt0111161"    "$BASE/api/tmdb/tt0111161"
check "GET /api/tmdb/browse"       "$BASE/api/tmdb/browse?page=1"
check "GET /api/tmdb/search"       "$BASE/api/tmdb/search?q=dune"
check "GET /api/tmdb/genres"       "$BASE/api/tmdb/genres"
check "GET /api/tmdb/season"       "$BASE/api/tmdb/season?imdbId=tt0903747&season=1"

echo ""
echo "--- User data routes (Prisma) ---"
check "GET /api/watchlist"         "$BASE/api/watchlist"
check "GET /api/history"           "$BASE/api/history"

echo ""
echo "--- Provider/download routes ---"
check "GET /api/provider-stats"    "$BASE/api/provider-stats"
check "GET /api/titles/tt0111161"  "$BASE/api/titles/tt0111161"
check "GET /api/download-movie"    "$BASE/api/download-movie?imdbId=tt0111161"

echo ""
echo "--- Static assets / PWA ---"
check "GET /manifest.json"         "$BASE/manifest.json"
check "GET /sw.js"                 "$BASE/sw.js"
check "GET / (home page)"          "$BASE/"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed, $SLOW slow(>3s) ==="
