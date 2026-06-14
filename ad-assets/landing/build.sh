#!/usr/bin/env bash
# Render each landing overlay to a PNG at the SAME pixel size as the source login image.
# Output: <name>-landing.png (originals in client/assets are never touched).
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# name:WIDTHxHEIGHT  (must match the source image's exact dimensions)
SPECS=(
  "login-bg-16-9:1672x941"
  "login-bg-21-9:1915x821"
  "login-bg-4-3:1448x1086"
  "login-bg-9-19:852x1846"
  "login-island:853x1844"
)

for spec in "${SPECS[@]}"; do
  name="${spec%%:*}"; dim="${spec##*:}"
  w="${dim%%x*}"; h="${dim##*x}"
  out="${name}-landing.png"
  echo "→ $out  (${w}x${h})"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="${w},${h}" \
    --default-background-color=00000000 \
    --screenshot="$PWD/$out" "file://$PWD/${name}.html" 2>/dev/null
done
echo "Done. PNGs written to $PWD"
