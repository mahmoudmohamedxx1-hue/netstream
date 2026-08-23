#!/bin/bash
set +e
cd /home/z/my-project

if ! ss -tlnp 2>/dev/null | grep -q ":3000 "; then
  echo "Starting Next.js..."
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
agent-browser set viewport 1280 800 2>&1 | tail -1
agent-browser open "http://127.0.0.1:3000/" --timeout 30000 2>&1 | tail -1
sleep 6
agent-browser set viewport 1280 800 2>&1 | tail -1
sleep 1

echo "=== Elements at bottom of document (desktop) ==="
agent-browser eval "(() => {
  const docH = document.documentElement.scrollHeight;
  const footer = document.querySelector('footer');
  const footerBottom = footer ? footer.getBoundingClientRect().bottom + window.scrollY : 0;
  const all = document.querySelectorAll('body > *');
  const result = [];
  // Find direct children of body and their positions
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const bottom = r.bottom + window.scrollY;
    result.push({
      tag: el.tagName,
      id: el.id || '',
      cls: (el.className && typeof el.className === 'string') ? el.className.substring(0,60) : '',
      top: Math.round(top),
      bottom: Math.round(bottom),
      height: Math.round(r.height)
    });
  }
  return JSON.stringify({docH, footerBottom, bodyChildren: result});
})()" 2>&1 | tail -5

echo ""
echo "=== Last 5 elements in DOM order ==="
agent-browser eval "(() => {
  const all = document.querySelectorAll('body *');
  const last = [];
  for (let i = all.length - 1; i >= 0 && last.length < 8; i--) {
    const el = all[i];
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const bottom = r.bottom + window.scrollY;
    last.push({
      tag: el.tagName,
      id: el.id || '',
      cls: (el.className && typeof el.className === 'string') ? el.className.substring(0,50) : '',
      top: Math.round(top),
      bottom: Math.round(bottom)
    });
  }
  return JSON.stringify(last);
})()" 2>&1 | tail -5

echo ""
echo "=== Footer HTML ==="
agent-browser eval "(() => {
  const f = document.querySelector('footer');
  if(!f) return 'NO FOOTER';
  return f.outerHTML.substring(0, 300);
})()" 2>&1 | tail -3

echo ""
echo "=== Root wrapper structure ==="
agent-browser eval "(() => {
  const body = document.body;
  const children = [];
  for (const c of body.children) {
    children.push({
      tag: c.tagName,
      id: c.id || '',
      cls: (c.className && typeof c.className === 'string') ? c.className.substring(0,80) : ''
    });
  }
  return JSON.stringify(children);
})()" 2>&1 | tail -3

agent-browser close 2>&1 | tail -1
echo "Done"
