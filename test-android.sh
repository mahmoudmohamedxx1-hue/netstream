#!/bin/bash
# Comprehensive Android device test for NetStream
# Runs in a single bash session so Next.js stays alive

set +e
cd /home/z/my-project

# Kill any existing Next.js
pkill -9 -f "next" 2>/dev/null
sleep 2
rm -f dev.log

# Start Next.js in background
bun run dev > dev.log 2>&1 &
NEXT_PID=$!
echo "[$(date +%T)] Next.js PID: $NEXT_PID"

# Wait for ready
READY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 5 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    echo "[$(date +%T)] Ready after ${i}x2s (HTTP $CODE)"
    READY=1
    break
  fi
  echo "[$(date +%T)] Waiting... attempt $i (HTTP $CODE)"
done

if [ "$READY" != "1" ]; then
  echo "[$(date +%T)] FAILED to start Next.js"
  cat dev.log
  exit 1
fi

mkdir -p /tmp/screenshots
agent-browser close 2>/dev/null

# ===== TEST 1: Pixel 7 (412x915) =====
echo ""
echo "========== TEST 1: Pixel 7 (412x915) =========="
agent-browser set viewport 412 915 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -2
sleep 6
agent-browser set viewport 412 915 2>&1 | tail -1
sleep 1

echo "--- URL & Title ---"
agent-browser get url 2>&1 | tail -1
agent-browser get title 2>&1 | tail -1

echo "--- Viewport ---"
agent-browser eval "JSON.stringify({w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio})" 2>&1 | tail -1

echo "--- Errors ---"
agent-browser errors 2>&1 | tail -10

echo "--- Horizontal scroll (should be 0) ---"
agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>&1 | tail -1

echo "--- Navbar visible? ---"
agent-browser eval "(() => { const nav = document.querySelector('nav'); if(!nav) return 'NO NAV'; const r = nav.getBoundingClientRect(); return JSON.stringify({visible: r.bottom > 0, top: r.top, height: r.height}); })()" 2>&1 | tail -1

echo "--- Hero visible? ---"
agent-browser eval "(() => { const h = document.querySelector('h1'); if(!h) return 'NO H1'; const r = h.getBoundingClientRect(); return JSON.stringify({text: h.innerText, visible: r.bottom > 0 && r.top < window.innerHeight}); })()" 2>&1 | tail -1

echo "--- Content rows count ---"
agent-browser eval "document.querySelectorAll('section').length" 2>&1 | tail -1

echo "--- Screenshot ---"
agent-browser screenshot /tmp/screenshots/pixel7-home.png 2>&1 | tail -1
ls -la /tmp/screenshots/pixel7-home.png 2>&1 | awk '{print $5, $9}'

# Scroll down to test scrolling
echo "--- Scroll down test ---"
agent-browser scroll down 800 2>&1 | tail -1
sleep 1
agent-browser eval "window.scrollY" 2>&1 | tail -1

# Test search
echo "--- Search test ---"
agent-browser find role button click --name "Search" 2>&1 | tail -2
sleep 1
agent-browser snapshot -i 2>&1 | grep -iE "textbox|search" | head -5

# Take screenshot of search
agent-browser screenshot /tmp/screenshots/pixel7-search.png 2>&1 | tail -1
ls -la /tmp/screenshots/pixel7-search.png 2>&1 | awk '{print $5, $9}'

# Reload home
agent-browser open "http://127.0.0.1:3000/" --timeout 20000 2>&1 | tail -1
sleep 4
agent-browser set viewport 412 915 2>&1 | tail -1
sleep 1

# Test opening a movie (player)
echo "--- Player test ---"
agent-browser find role button click --name "Toy Story 5 8.1 Toy Story 5 2026" 2>&1 | tail -2
sleep 4
agent-browser screenshot /tmp/screenshots/pixel7-player.png 2>&1 | tail -1
ls -la /tmp/screenshots/pixel7-player.png 2>&1 | awk '{print $5, $9}'
agent-browser errors 2>&1 | tail -5

# Close player
agent-browser press Escape 2>&1 | tail -1
sleep 1

# Test Continue Watching (IndexedDB)
echo "--- Continue Watching (IndexedDB) test ---"
agent-browser eval "(() => { return new Promise((resolve) => { const req = indexedDB.open('netstream-client'); req.onsuccess = (e) => { const db = e.target.result; try { const tx = db.transaction('watch-history', 'readonly'); const store = tx.objectStore('watch-history'); const all = store.getAll(); all.onsuccess = () => resolve(JSON.stringify({count: all.result.length, items: all.result.map(i => ({title: i.title, position: i.position, duration: i.duration, progress: i.progress}))})); all.onerror = () => resolve('read error'); } catch(err) { resolve('no store: ' + err.message); } }; req.onerror = () => resolve('no db'); }); })()" 2>&1 | tail -1

echo ""
echo "========== TEST 1 COMPLETE =========="
echo ""

# ===== TEST 2: Samsung Galaxy S20 (360x800) =====
echo "========== TEST 2: Samsung Galaxy S20 (360x800) =========="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 360 800 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -2
sleep 6
agent-browser set viewport 360 800 2>&1 | tail -1
sleep 1

echo "--- Viewport ---"
agent-browser eval "JSON.stringify({w:window.innerWidth,h:window.innerHeight})" 2>&1 | tail -1
echo "--- Title ---"
agent-browser get title 2>&1 | tail -1
echo "--- Errors ---"
agent-browser errors 2>&1 | tail -10
echo "--- Horizontal scroll ---"
agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>&1 | tail -1
echo "--- Screenshot ---"
agent-browser screenshot /tmp/screenshots/galaxys20-home.png 2>&1 | tail -1
ls -la /tmp/screenshots/galaxys20-home.png 2>&1 | awk '{print $5, $9}'

# Scroll and screenshot
agent-browser scroll down 1200 2>&1 | tail -1
sleep 1
agent-browser screenshot /tmp/screenshots/galaxys20-scrolled.png 2>&1 | tail -1
ls -la /tmp/screenshots/galaxys20-scrolled.png 2>&1 | awk '{print $5, $9}'

echo ""
echo "========== TEST 2 COMPLETE =========="
echo ""

# ===== TEST 3: Galaxy Fold outer (280x653) =====
echo "========== TEST 3: Galaxy Fold outer (280x653) =========="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 280 653 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -2
sleep 6
agent-browser set viewport 280 653 2>&1 | tail -1
sleep 1

echo "--- Viewport ---"
agent-browser eval "JSON.stringify({w:window.innerWidth,h:window.innerHeight})" 2>&1 | tail -1
echo "--- Title ---"
agent-browser get title 2>&1 | tail -1
echo "--- Errors ---"
agent-browser errors 2>&1 | tail -10
echo "--- Horizontal scroll ---"
agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>&1 | tail -1
echo "--- Screenshot ---"
agent-browser screenshot /tmp/screenshots/galaxyfold-home.png 2>&1 | tail -1
ls -la /tmp/screenshots/galaxyfold-home.png 2>&1 | awk '{print $5, $9}'

echo ""
echo "========== TEST 3 COMPLETE =========="
echo ""

# ===== TEST 4: Android Tablet (1024x1366) =====
echo "========== TEST 4: Android Tablet (1024x1366) =========="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 1024 1366 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -2
sleep 6
agent-browser set viewport 1024 1366 2>&1 | tail -1
sleep 1

echo "--- Viewport ---"
agent-browser eval "JSON.stringify({w:window.innerWidth,h:window.innerHeight})" 2>&1 | tail -1
echo "--- Title ---"
agent-browser get title 2>&1 | tail -1
echo "--- Errors ---"
agent-browser errors 2>&1 | tail -10
echo "--- Horizontal scroll ---"
agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>&1 | tail -1
echo "--- Screenshot ---"
agent-browser screenshot /tmp/screenshots/androidtablet-home.png 2>&1 | tail -1
ls -la /tmp/screenshots/androidtablet-home.png 2>&1 | awk '{print $5, $9}'

echo ""
echo "========== TEST 4 COMPLETE =========="
echo ""

# ===== TEST 5: Pixel 7 Pro (414x896) =====
echo "========== TEST 5: Pixel 7 Pro (414x896) =========="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 414 896 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -2
sleep 6
agent-browser set viewport 414 896 2>&1 | tail -1
sleep 1

echo "--- Viewport ---"
agent-browser eval "JSON.stringify({w:window.innerWidth,h:window.innerHeight})" 2>&1 | tail -1
echo "--- Title ---"
agent-browser get title 2>&1 | tail -1
echo "--- Errors ---"
agent-browser errors 2>&1 | tail -10
echo "--- Horizontal scroll ---"
agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>&1 | tail -1
echo "--- Screenshot ---"
agent-browser screenshot /tmp/screenshots/pixel7pro-home.png 2>&1 | tail -1
ls -la /tmp/screenshots/pixel7pro-home.png 2>&1 | awk '{print $5, $9}'

echo ""
echo "========== TEST 5 COMPLETE =========="
echo ""

# ===== TEST 6: Footer sticky check on Pixel 7 =====
echo "========== TEST 6: Footer sticky check =========="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 412 915 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -2
sleep 6
agent-browser set viewport 412 915 2>&1 | tail -1
sleep 1

echo "--- Footer position ---"
agent-browser eval "(() => { const f = document.querySelector('footer'); if(!f) return 'NO FOOTER'; const r = f.getBoundingClientRect(); const vh = window.innerHeight; return JSON.stringify({top: r.top, bottom: r.bottom, height: r.height, viewportH: vh, atBottom: r.bottom <= vh + 5, docHeight: document.documentElement.scrollHeight}); })()" 2>&1 | tail -1

echo ""
echo "========== TEST 6 COMPLETE =========="
echo ""

# ===== SUMMARY =====
echo ""
echo "=========================================="
echo "          ANDROID TEST SUMMARY"
echo "=========================================="
ls -la /tmp/screenshots/ 2>&1 | awk '{print $5, $9}'
echo ""
echo "Next.js still alive?"
ps -p $NEXT_PID -o pid,cmd 2>/dev/null | tail -2
ss -tlnp 2>/dev/null | grep ":3000 " && echo "PORT 3000 OK" || echo "PORT 3000 GONE"

# Cleanup
agent-browser close 2>&1 | tail -1
echo "[$(date +%T)] Done"
