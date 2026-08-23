#!/bin/bash
set +e
cd /home/z/my-project

# Check Next.js is alive
if ! ss -tlnp 2>/dev/null | grep -q ":3000 "; then
  echo "Next.js not running, starting..."
  pkill -9 -f "next" 2>/dev/null
  sleep 2
  bun run dev > dev.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 5 2>/dev/null)
    [ "$CODE" = "200" ] && break
  done
fi
echo "Next.js ready"

agent-browser close 2>/dev/null
sleep 1

# ===== Desktop test (1280x800) - should have 85% scale =====
echo "========== DESKTOP (1280x800) =========="
agent-browser set viewport 1280 800 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -1
sleep 6
agent-browser set viewport 1280 800 2>&1 | tail -1
sleep 1

echo "--- Viewport & scale ---"
agent-browser eval "(() => {
  const html = document.documentElement;
  const st = getComputedStyle(html);
  const body = document.body;
  const bst = getComputedStyle(body);
  return JSON.stringify({
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    htmlTransform: st.transform,
    htmlWidth: st.width,
    docWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
    hScroll: document.documentElement.scrollWidth - window.innerWidth,
    bodyBg: bst.backgroundColor
  });
})()" 2>&1 | tail -2

echo "--- Errors ---"
agent-browser errors 2>&1 | tail -5

echo "--- Screenshot ---"
agent-browser screenshot /tmp/screenshots/desktop-1280.png 2>&1 | tail -1
ls -la /tmp/screenshots/desktop-1280.png 2>&1 | awk '{print $5, $9}'

echo ""
echo "========== PLAYER TEST ON PIXEL 7 =========="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 412 915 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -1
sleep 6
agent-browser set viewport 412 915 2>&1 | tail -1
sleep 1

echo "--- Find Play button in hero ---"
agent-browser snapshot -i 2>&1 | grep -iE "Play|More Info" | head -5

echo "--- Click Play button ---"
agent-browser find role button click --name "Play" 2>&1 | tail -2
sleep 5

echo "--- Player open? ---"
agent-browser eval "(() => {
  const iframe = document.querySelector('iframe');
  const dialog = document.querySelector('[role=dialog]') || document.querySelector('.fixed.inset-0');
  return JSON.stringify({
    hasIframe: !!iframe,
    iframeSrc: iframe ? iframe.src.substring(0, 100) : null,
    hasDialog: !!dialog,
    dialogVisible: dialog ? dialog.getBoundingClientRect().width > 0 : false
  });
})()" 2>&1 | tail -2

echo "--- Screenshot ---"
agent-browser screenshot /tmp/screenshots/pixel7-player-open.png 2>&1 | tail -1
ls -la /tmp/screenshots/pixel7-player-open.png 2>&1 | awk '{print $5, $9}'

echo "--- Errors ---"
agent-browser errors 2>&1 | tail -10

echo ""
echo "========== FOOTER STICKY TEST ON DESKTOP =========="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 1280 800 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -1
sleep 6
agent-browser set viewport 1280 800 2>&1 | tail -1
sleep 1

echo "--- Footer position ---"
agent-browser eval "(() => {
  const f = document.querySelector('footer');
  if(!f) return 'NO FOOTER';
  const r = f.getBoundingClientRect();
  const vh = window.innerHeight;
  return JSON.stringify({
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    viewportH: vh,
    docHeight: document.documentElement.scrollHeight,
    footerAtDocBottom: Math.abs(r.bottom - document.documentElement.scrollHeight) < 10
  });
})()" 2>&1 | tail -2

echo "--- Scroll to bottom ---"
agent-browser eval "window.scrollTo(0, document.documentElement.scrollHeight)" 2>&1 | tail -1
sleep 2
echo "--- Footer visible after scroll? ---"
agent-browser eval "(() => {
  const f = document.querySelector('footer');
  if(!f) return 'NO FOOTER';
  const r = f.getBoundingClientRect();
  const vh = window.innerHeight;
  return JSON.stringify({
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    visibleInViewport: r.top < vh && r.bottom > 0
  });
})()" 2>&1 | tail -2
agent-browser screenshot /tmp/screenshots/desktop-footer.png 2>&1 | tail -1

agent-browser close 2>&1 | tail -1
echo "Done"
