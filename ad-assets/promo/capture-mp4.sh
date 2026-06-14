#!/bin/bash
# Renders promo.html to a real MP4 by screenshotting every frame deterministically
# (via ?t=) with headless Chrome, then stitching with ffmpeg.
#
# Requires ffmpeg:  brew install ffmpeg
# Usage:  ./capture-mp4.sh        -> promo.mp4 (1080x1920, 30fps, ~7.2s, loops cleanly)
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FPS=30
DUR=7.2                 # must match T in promo.html
TOTAL=$(printf '%.0f' "$(echo "$FPS*$DUR" | bc -l)")
OUT="${1:-promo.mp4}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it first:  brew install ffmpeg"; exit 1
fi

rm -rf _seq && mkdir -p _seq
echo "Rendering $TOTAL frames @ ${FPS}fps ..."
for ((i=0;i<TOTAL;i++)); do
  t=$(echo "$i/$FPS" | bc -l)
  printf -v n "%04d" "$i"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1920 --screenshot="_seq/f_${n}.png" \
    "file://$PWD/promo.html?t=${t}" >/dev/null 2>&1
  [ $((i % 20)) -eq 0 ] && echo "  ...$i/$TOTAL"
done

echo "Encoding $OUT ..."
ffmpeg -y -framerate $FPS -i _seq/f_%04d.png \
  -c:v libx264 -pix_fmt yuv420p -profile:v high -crf 18 \
  -vf "scale=1080:1920" -movflags +faststart "$OUT"

rm -rf _seq
echo "Done -> $OUT"
