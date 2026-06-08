# Session Notes — June 4–8, 2026

Participants: Brian, Claude  
For review by: Brian, Thibault

---

## What was shipped this session

### Profile save fix (v5.1)
- Changing your username wasn't saving to the DB or updating the server's in-memory player list
- Added `PUT /api/player/:id/profile` endpoint to write `display_name` + `avatar_id` to Postgres
- ProfileScreen now calls the endpoint on save (alongside AsyncStorage)
- After save, re-emits `enter-lobby` so server's `socketPlayers` map updates immediately
- **Files:** `server/index.js`, `client/src/screens/ProfileScreen.jsx`, `client/App.js`

### Lobby broadcast fix (v5.2)
- Every single game action (every bet, fold, card dealt) was broadcasting the player list to ALL connected sockets — players in active games were getting lobby updates constantly
- Fixed: `broadcastMatchList` now only emits to sockets where `matchId === null` (lobby players only)
- Removed the `broadcastMatchList()` call from inside `broadcastMatchState`
- Added explicit lobby broadcasts at the moments that actually change lobby state: match created, match ended, leave-table, disconnect
- **Files:** `server/index.js`

### Background Postgres writes (v5.14)
- `endMatch` was awaiting 4–6 sequential Postgres queries before emitting `match-over` to players — causing 300–700ms of dead air after someone goes bust
- Fixed: ELO is now computed from in-memory `eloCache` (single lightweight query only on cold-start cache miss). `match-over` is emitted immediately. All DB persistence (player upserts, stats, match row) runs in background via `persistMatchResult()`
- `flushHandToDb` in `scheduleNextHand` is also fire-and-forget — next hand no longer waits for previous hand to be persisted before dealing cards
- Redis writes (`logStartHand`) remain awaited — Redis is the crash-recovery layer and should be confirmed before proceeding
- **Design note for Thibault:** Timing pauses between hands (inter-hand delay, auto-start delay) are intentional UX and were NOT changed. Only the data layer was made async.
- **Files:** `server/index.js`

### Game config moved to Postgres (v5.8)
- All game timing/chip values were hardcoded constants scattered in `server/index.js`
- Now live in a `game_config` Postgres table, loaded on server startup
- Config keys: `starting_chips`, `big_blind`, `small_blind`, `turn_seconds`, `inter_hand_delay_ms`, `auto_start_delay_ms`
- **Admin UI at `/admin`** (password: `1111`) — dark-themed page showing all config values with editable inputs and Save buttons. Changes take effect on the live server immediately without redeploy.
- **Files:** `server/index.js`

### Responsive game UI (v5.83) — branch: `feature/responsive-ui`
- Pod geometry (avatar size, nameplate height, pod height, timer ring) now interpolates between compact and normal values based on screen scale factor
- `computeGeo(scale)` function: t=0 at scale≤0.65 (old small phones), t=1 at scale≥0.90 (modern phones)
- Controls height and mySection translateY are also adaptive
- BettingControls button `paddingVertical` reduced from 29 → 16 (buttons were overly tall)
- iPhone SE and small Android devices now get proportionate layout instead of oversized fixed pods
- **This branch has NOT been merged to main yet** — needs testing on actual devices
- **Files:** `client/src/screens/GameScreen.jsx`, `client/src/components/BettingControls.jsx`

---

## Architecture decisions made

### Branch protection rule (global)
- ALL work must be done on feature branches, never directly on main
- If any Claude session is on main before coding, it must warn and ask for confirmation
- Merge → push → delete branch workflow
- Saved to: global CLAUDE.md, poker CLAUDE.md, and Claude memory

### Gameplay timing pauses
- Inter-hand delays, auto-start delays, etc. are intentional UX decisions owned by Thibault (game design)
- Do NOT treat these as performance problems or suggest shortening without a design conversation
- Only the data/network layer should be optimized for speed

### Always use prod server
- Client always connects to `https://poker-production-d726.up.railway.app`
- For local UI dev: run `cd client && ./node_modules/.bin/expo start`, Expo serves locally but all socket/API traffic hits prod Railway server

---

## Play Store setup (in progress)

### What happened
- Package name in `app.json` changed from `com.briandanilo.pokermonkey` → `hu.poker.app` to match Play Console app
- EAS keystore situation was complex — resolved by downloading old keystore backup from Expo dashboard and uploading it to the `hu.poker.app` credential set
- AAB successfully uploaded to Internal Testing track
- Advertising ID permission: declared "Yes" in Play Console but not yet in the manifest — currently released without the permission (fine for now, needs to be added before running UAC ad campaigns)
- 14-day closed testing requirement: Google requires games (not apps) to run a closed test with 12+ testers for 14 days before production access

### Current status
- Internal testing release is active
- Some devices can install, some (Pixel 9 Pro XL, Moto G Play) show "Won't work on your device" even though Play Console says they're compatible
- Diagnosis: most likely a Play Store cache/propagation issue, not an app or manifest problem. Fix: clear Play Store cache on those devices and wait up to 48h for full propagation

### To add before running ads
- Add `com.google.android.gms.permission.AD_ID` permission to `app.json` android section and rebuild

---

## Performance analysis (for future work)

Remaining data-transfer slowness items not yet addressed:
1. `logStartHand` Redis write is still awaited before new hand cards are broadcast (intentional — Redis is crash recovery, this is acceptable)
2. Profile screen fetches match history on every mount with no caching
3. Google auth involves two external round-trips (client → server → Google → server → DB → client)

Scaling ceiling:
- `broadcastMatchList` still does two O(n) scans of all connected sockets on every lobby event — fine now, degrades linearly
- Single Railway Node instance handles ~150–300 concurrent users before `broadcastMatchList` becomes a bottleneck
- If scale becomes a real concern: debounce `broadcastMatchList` to max once/second for a ~10x capacity increase without any other changes

---

## Open items / next session

- [ ] Test `feature/responsive-ui` branch on actual devices (especially iPhone SE and small Androids)
- [ ] Merge responsive UI branch once tested
- [ ] Recruit 12 testers for closed testing (14-day clock needs to start)
- [ ] Add `AD_ID` permission to `app.json` before launching UAC campaigns
- [ ] Continue game UI responsiveness work (landscape not yet addressed)
