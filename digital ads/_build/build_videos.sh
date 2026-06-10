#!/bin/bash
# Build 15s ad videos (16:9 / 1:1 / 9:16) from gameplay.webm + end cards.
# Segments: 57-63.5s (betting controls action) + 89.5-95.5s (hero all-in), then end card.
set -e
cd "$(dirname "$0")"
RAW=raw/gameplay.webm
OUT="../video"
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
BANNER="POKER MONKEY  ·  FREE HEADS-UP HOLD’EM"
mkdir -p "$OUT"

# Common gameplay prep: concat 2 clips, replace top dev strip with brand banner overlay (720x1280 src)
GP="[0:v][1:v]concat=n=2:v=1[g];[g][4:v]overlay=0:0[gt]"

# 9:16  1080x1920 — direct upscale
ffmpeg -v error -y \
  -ss 57   -t 6.5 -i "$RAW" \
  -ss 89.5 -t 6   -i "$RAW" \
  -loop 1 -t 3 -i _endcards/end_1080x1920.png \
  -f lavfi -t 16 -i anullsrc=r=44100:cl=stereo \
  -loop 1 -t 13 -i _endcards/banner_720x50.png \
  -filter_complex "$GP;[gt]scale=1080:1920:flags=lanczos,fps=30,format=yuv420p,setsar=1[gs];\
[2:v]scale=1080:1920,fps=30,format=yuv420p,setsar=1[e];\
[gs][e]xfade=transition=fade:duration=0.4:offset=12.1[v]" \
  -map "[v]" -map 3:a -shortest -t 15 \
  -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart \
  "$OUT/poker_monkey_15s_9x16_1080x1920.mp4"

# 1:1  1080x1080 — blurred-bg pillarbox
ffmpeg -v error -y \
  -ss 57   -t 6.5 -i "$RAW" \
  -ss 89.5 -t 6   -i "$RAW" \
  -loop 1 -t 3 -i _endcards/end_1080x1080.png \
  -f lavfi -t 16 -i anullsrc=r=44100:cl=stereo \
  -loop 1 -t 13 -i _endcards/banner_720x50.png \
  -filter_complex "$GP;[gt]split[a][b];\
[a]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,boxblur=22,eq=brightness=-0.08[bg];\
[b]scale=-2:1080:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:0,fps=30,format=yuv420p,setsar=1[gs];\
[2:v]scale=1080:1080,fps=30,format=yuv420p,setsar=1[e];\
[gs][e]xfade=transition=fade:duration=0.4:offset=12.1[v]" \
  -map "[v]" -map 3:a -shortest -t 15 \
  -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart \
  "$OUT/poker_monkey_15s_1x1_1080x1080.mp4"

# 16:9  1920x1080 — blurred-bg pillarbox
ffmpeg -v error -y \
  -ss 57   -t 6.5 -i "$RAW" \
  -ss 89.5 -t 6   -i "$RAW" \
  -loop 1 -t 3 -i _endcards/end_1920x1080.png \
  -f lavfi -t 16 -i anullsrc=r=44100:cl=stereo \
  -loop 1 -t 13 -i _endcards/banner_720x50.png \
  -filter_complex "$GP;[gt]split[a][b];\
[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=22,eq=brightness=-0.08[bg];\
[b]scale=-2:1080:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:0,fps=30,format=yuv420p,setsar=1[gs];\
[2:v]scale=1920:1080,fps=30,format=yuv420p,setsar=1[e];\
[gs][e]xfade=transition=fade:duration=0.4:offset=12.1[v]" \
  -map "[v]" -map 3:a -shortest -t 15 \
  -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart \
  "$OUT/poker_monkey_15s_16x9_1920x1080.mp4"

echo "videos built:"
ls -la "$OUT"
