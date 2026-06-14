# Gameplay Capture Plan — real footage for ads

Authentic gameplay is the strongest-converting TikTok ad material. Goal: capture 3–5 short, punchy clips you can drop into any of the scripts in `SCRIPTS.md`.

## Shot list (capture these moments)
| Clip | What to record | Use in |
|---|---|---|
| **A. The queue → match** | Tap PLAY, "finding opponent" spinner, then MATCH FOUND | hook / "3 taps" |
| **B. The shove** | A big raise / all-in with the betting controls | "all in" beat |
| **C. The flip** | Community cards revealing on the river | tension beat |
| **D. The win** | Win animation + ELO change modal | payoff / CTA |
| **E. Leaderboard** | Scroll the leaderboard / your rank | "climb the rank" |

Keep each clip 2–5s, shot in **portrait**, no dead air. Record several matches and keep the best beats.

## Easiest capture method — phone (recommended)
1. Open **https://pokermonkey.app** on your phone browser, or the installed app.
2. **iPhone:** Settings → Control Center → add *Screen Recording*. Swipe down, tap record, play a match. Recordings land in Photos (already 9:16, App-Store/TikTok-ready).
3. **Android:** Quick Settings → *Screen record*.
4. Play a couple of real matches (or have Brian/Thibault queue against each other to script the beats — one of you intentionally shoves so you get a clean all-in + win).

> Two people queueing simultaneously = you control the action and can stage the perfect "all-in → river → win" sequence for clip B/C/D.

## Mac capture method — web app, no phone
The Android emulator isn't installed on this machine and `EXPO_PUBLIC_SERVER_URL` should stay pointed at prod, so the simplest desktop route is the **web build in a phone-sized window**:

1. Start Expo web (from repo root):
   ```bash
   cd client && ./node_modules/.bin/expo start --web
   ```
   (or just open https://pokermonkey.app in Chrome)
2. Open Chrome DevTools → toggle device toolbar (⌘⇧M) → pick **iPhone 14 Pro Max (430×932)** for a 9:16 frame.
3. Record the window with **QuickTime → File → New Screen Recording** (⌃⌘5 → Record Selected Portion, draw a box over the game), or capture the whole screen and crop later.
4. Play a match (open a second browser/incognito as the opponent to control both sides).

## Turning raw captures into ad clips (needs ffmpeg — installed in this repo's tooling)
```bash
# Crop a desktop recording to clean 1080x1920 (adjust x:y crop offset to your window)
ffmpeg -i raw.mov -vf "crop=ih*9/16:ih,scale=1080:1920" -c:a copy clip.mp4

# Trim to a 4-second beat starting at 00:12
ffmpeg -ss 00:12 -i clip.mp4 -t 4 -c copy beatB.mp4

# Stack the coded promo + a gameplay clip back-to-back into one ad
ffmpeg -f concat -safe 0 -i list.txt -c:v libx264 -pix_fmt yuv420p ad-final.mp4
#   where list.txt contains:  file 'promo.mp4'  /  file 'beatB.mp4'
```

## Best assembly for launch
1. **promo.mp4** (coded, this repo) as the branded 0–7s spine.
2. Splice in **clip B (all-in)** + **clip D (win)** real footage in the middle for authenticity.
3. End on the CTA frame. Add trending TikTok audio in the editor (or in TikTok's native editor for organic/Spark posts).
