#!/bin/bash
# Render mockups to PNG with headless Chrome, one at a time (memory-tight Mac).
# Usage: ./render.sh live-map home-empty ...   (no args = all *.html except contact-sheet)
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="${TMPDIR:-/tmp}/tt-mock-chrome"
names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in *.html; do [ "$f" = contact-sheet.html ] || names+=("${f%.html}"); done
fi
for n in "${names[@]}"; do
  out="png/$n.png"; [ "$n" = contact-sheet ] && out="$n.png"; rm -f "$out"
  W=390; H=844
  [ "$n" = contact-sheet ] && W=2040 && H=1560
  "$CHROME" --headless --hide-scrollbars --use-mock-keychain --no-first-run --disable-extensions \
    --use-angle=swiftshader --enable-unsafe-swiftshader --force-device-scale-factor=2 \
    --allow-file-access-from-files --user-data-dir="$PROFILE" --virtual-time-budget=15000 \
    --window-size=$W,$H --screenshot="$PWD/$out" "file://$PWD/$n.html" >/dev/null 2>&1 &
  pid=$!
  for i in $(seq 1 60); do [ -s "$out" ] && break; sleep 1; done
  sleep 1; kill $pid 2>/dev/null; wait $pid 2>/dev/null
  pkill -f "user-data-dir=$PROFILE" 2>/dev/null
  echo "$n -> $( [ -s "$out" ] && echo ok || echo FAILED )"
done
