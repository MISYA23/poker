# Poker Monkey — Digital Ads Asset Pack

Everything requested for Google Ads + Meta (Facebook/Instagram) campaigns.
**Landing page / web app:** https://poker-production-d726.up.railway.app

## Inventory

### video/ — 15s gameplay videos (H.264 MP4, 30fps, silent — add music before launch)
| File | Aspect | Size | Use |
|------|--------|------|-----|
| poker_monkey_15s_16x9_1920x1080.mp4 | 16:9 | 1920x1080 | Google video ads, YouTube |
| poker_monkey_15s_1x1_1080x1080.mp4 | 1:1 | 1080x1080 | FB/IG feed |
| poker_monkey_15s_9x16_1080x1920.mp4 | 9:16 | 1080x1920 | Stories/Reels, YouTube Shorts |
| poker_monkey_15s_9x16_motion.mp4 | 9:16 | 1080x1920 | Motion-graphics version: logo hook → headline card → floating-phone gameplay → animated CTA |

Structure: real gameplay (betting controls + an all-in) → branded end card with CTA.
Footage is a genuine match vs the "Rick Deckard" bot on prod, captured in-browser.

### images/ — static ads
| File | Aspect | Size | Use |
|------|--------|------|-----|
| primary_4x5_allin.png | 4:5 | 1080x1350 | FB/IG feed primary (all-in drama) |
| primary_4x5_showdown.png | 4:5 | 1080x1350 | FB/IG feed primary ("read a bluff?") |
| square_1x1_allin.png | 1:1 | 1080x1080 | FB/IG square |
| square_1x1_lobby.png | 1:1 | 1080x1080 | FB/IG square (bots/ranking angle) |
| landscape_1200x628.png | 1.91:1 | 1200x628 | Google Display/PMax, FB link ads |

### logo/
| File | Size | Use |
|------|------|-----|
| logo_1200x1200.png | 1200x1200 | Google square logo, Meta page/ad logo |
| logo_512x512.png | 512x512 | Smaller placements |
| logo_landscape_1200x300.png | 4:1 | Google landscape logo |

### screenshots/ — clean gameplay stills (1440x2560) for store listings or extra creatives

### copy.md — headlines, descriptions, primary text for both platforms + policy notes

## Regenerating
**Full re-run playbook with all gotchas: [REGENERATE.md](REGENERATE.md)** — read it first.
All assets are scripted in `_build/` (gitignored raw footage):
1. `node _build/capture.js` — plays a live bot match in headless Chromium, records video + stills (strips version watermark/feedback pill)
2. `node _build/render.js` — renders static images/logos/end cards from HTML templates
3. `bash _build/build_videos.sh` — cuts + brands the three video formats with ffmpeg

## Notes
- Videos are silent — Brian adds music later (YouTube Audio Library / Pixabay are safe sources).
- A throwaway guest player `AceMonkey` (id in `_build/raw/player.txt`) was created on prod for the capture; its bot matches are real DB rows. Harmless, but can be cleaned like the old `test_%` players if desired.
- The cigar in the logo may trip tobacco-imagery review on Meta — see copy.md policy notes.
