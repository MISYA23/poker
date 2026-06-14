#!/bin/bash
# Renders every .html in ad-assets/images/ to a 1080x1920 PNG of the same name.
# Usage: ./render.sh
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for f in images/*.html; do
  [ -e "$f" ] || continue
  out="${f%.html}.png"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1920 --default-background-color=00000000 \
    --screenshot="$PWD/$out" "file://$PWD/$f" >/dev/null 2>&1
  echo "rendered $out"
done
