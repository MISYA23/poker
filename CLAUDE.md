# Poker Monkey — Claude Context

## Session startup (do this at the start of EVERY session)

1. **Greet and recap** — Show the last 5 commits
2. **Confirm who's here** — Ask: "Who's working today?"
3. **Confirm branch** — Ask which branch, then `git checkout <branch> && git pull origin <branch>`
4. **Confirm server state** — Check `lsof -i:3843`, offer to start if not running

---

## Team

| Person | GitHub | Notes |
|---|---|---|
| Brian Danilo | briandanilo | Owner, primary dev. Expo account: coinburst |
| Thibault (MISYA23) | MISYA23 | Collaborator — PRs only, never push to main directly |

**Rules:**
- All work on feature branches — never commit to `main` directly. Warn loudly if on main.
- Thibault: open PR against `main`, request review from `briandanilo`, do not self-merge.
- Bump `VERSION` in `client/src/config.js` on every single commit.
- Push to GitHub after every change — Railway auto-deploys from `main`.
- Kill Metro only: `lsof -ti:8081 | xargs kill -9` — never `pkill -f expo`.

---

## App

1v1 Texas Hold'em matchmaking (chess.com style). ELO-rated, real-time via Socket.IO. React Native (Expo SDK 54) + Node/Express + Railway Postgres + Redis.

**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git

---

## Dev commands

```bash
# Local server (port 3843, connects to prod DB)
cd server && node index.js

# Expo — always use local binary, never npx expo
cd client && ./node_modules/.bin/expo start
# a = Android emulator, w = web, QR = physical device

# Android emulator
~/Library/Android/sdk/emulator/emulator -avd Pixel_8 -no-audio -no-boot-anim -gpu host &
```

Client connects to prod by default. To use local server, uncomment `EXPO_PUBLIC_SERVER_URL` in `client/.env`.

---

## Identity model

- UUID is the PK — never use display_name as a key or FK
- Google: UUID = `g_<google_sub>`, permanent across devices
- Guest: UUID = random in AsyncStorage, lost on cache clear
- display_name is mutable — always join `players` table to resolve names

---

## Known bugs

- **Observer leak**: leaving an observed game doesn't emit `unobserve` → server keeps sending `game-state` → forces nav back to GameScreen. Fix: emit `unobserve` on lobby nav.

---

## Troubleshooting

- **Wrong URL on physical device**: keep `client/.env` commented out. `localhost` only works in emulator.
- **Metro cache stale**: `r` doesn't re-read `.env`. Restart: `Ctrl+C` then `./node_modules/.bin/expo start --clear`
- **DO NOT USE react-native-reanimated**: Expo Go SDK 54 causes `TurboModule installTurboModule` crash. Use `setInterval` instead.
- **Emulator OOM**: `sed -i '' 's/hw.ramSize=2048/hw.ramSize=4096/' ~/.android/avd/Pixel_8.avd/config.ini`
