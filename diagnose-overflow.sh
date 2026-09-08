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

# Galaxy S20 (360x800)
agent-browser set viewport 360 800 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -1
sleep 6
agent-browser set viewport 360 800 2>&1 | tail -1
sleep 1

echo "=== Widest elements on Galaxy S20 (360px) ==="
agent-browser eval "(() => {
  const vw = document.documentElement.clientWidth;
  const all = document.querySelectorAll('*');
  const wide = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const right = r.right;
    if (right > vw + 1) {
      wide.push({
        tag: el.tagName,
        id: el.id || '',
        cls: (el.className && typeof el.className === 'string') ? el.className.substring(0,80) : '',
        right: Math.round(right),
        width: Math.round(r.width),
        left: Math.round(r.left)
      });
    }
  }
  wide.sort((a,b) => b.right - a.right);
  return JSON.stringify({viewportWidth: vw, count: wide.length, top10: wide.slice(0,10)});
})()" 2>&1 | tail -5

echo ""
echo "=== Galaxy Fold (280px) widest elements ==="
agent-browser close 2>&1 | tail -1
sleep 1
agent-browser set viewport 280 653 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -1
sleep 6
agent-browser set viewport 280 653 2>&1 | tail -1
sleep 1

agent-browser eval "(() => {
  const vw = document.documentElement.clientWidth;
  const all = document.querySelectorAll('*');
  const wide = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1) {
      wide.push({
        tag: el.tagName,
        id: el.id || '',
        cls: (el.className && typeof el.className === 'string') ? el.className.substring(0,80) : '',
        right: Math.round(r.right),
        width: Math.round(r.width),
        left: Math.round(r.left)
      });
    }
  }
  wide.sort((a,b) => b.right - a.right);
  return JSON.stringify({viewportWidth: vw, count: wide.length, top10: wide.slice(0,10)});
})()" 2>&1 | tail -5

agent-browser close 2>&1 | tail -1
echo "Done"
