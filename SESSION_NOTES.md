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

---
---

# Session Notes — June 12, 2026

Participants: Brian, Claude
For review by: Brian, Thibault

This session started as a discussion of chip-animation architecture and a security/robustness review, and ended by shipping a reconnect fix. The shipped change is first; the architectural findings (not yet acted on, but worth knowing) follow.

## SHIPPED — Reconnect `session` handshake (v5.164, b24.01) — LIVE ON PROD

**The bugs reported:** (1) Occasionally, sitting in the lobby, tapping PLAY / PLAY BOT / a challenge throws **"Not in lobby."** even though you're obviously in the lobby. (2) Rare app "freezes." Both turned out to be the same root cause, and there's a more serious sibling bug at the table.

**Root cause.** The server identifies a connection via the `socketPlayers` map, which is **keyed by the ephemeral Socket.IO `socket.id`** — and it **deletes that entry on every disconnect**. The client only re-announced its identity (`enter-lobby`) on a *navigation focus* event. So when the socket silently dropped and auto-reconnected (phone sleep/background, Wi-Fi↔cellular handoff, brief blips, or a Railway redeploy dropping all sockets), it came back with a **brand-new `socket.id`** that the server had no record of — and nothing re-announced it, because the user hadn't navigated. Result:
- In the **lobby**: the next action hits the `!sp?.playerName` guard → **"Not in lobby."** The lobby also stops receiving `match-list` broadcasts (you're not in `socketPlayers`), so it looks frozen.
- At the **table** (worse — *this was a silent match-losing bug*): a blip vacated your seat and started the 20s grace timer, but the GameScreen client had **no reconnect handler at all**, so it never re-announced and never reclaimed the seat → **grace expired → you forfeited a live match on a ~2-second hiccup.**

**Why a `session` event and not "re-emit enter-lobby" or a new "enter-table".** Reusing `enter-lobby` for reconnects was the original hack — `enter-lobby` carries *three* tangled jobs: (1) identity binding, (2) vacant-seat rejoin, (3) **forfeit** ("I walked to the lobby = abandon my table"). Overloading it to also mean "I reconnected" is fragile (a blip is one short-circuit away from a forfeit). A separate "enter-table" event would also be wrong — it makes the *client assert its location*, which is the exact class of bug we keep hitting (client and server disagreeing about where you are). The server already owns location (`liveMatchOf` is the single source of truth — see the v5.112/v5.113 match-lifecycle notes). So the right split is **identity vs location**: the client announces *who* it is; the **server decides where it belongs.**

**The fix.**
- New connection-level **`session`** socket event `{ playerId }`. The client emits it on **every** socket (re)connect — `useSocket`'s `connect` handler + a `playerIdRef` in `App.js` (the handler is bound once at mount, so it reads the id from a ref). Socket.IO v4 re-fires `connect` on every reconnection, so this catches them all.
- Server `session` handler = `bindIdentity()` + `reclaimSeat()` with **no forfeit, no dequeue** — pure reconnection recovery. If you hold a (vacant, in-grace) seat → re-seated and pulled back to the table; otherwise → free, lobby view refreshed.
- `bindIdentity()` (DB profile load + `socketPlayers` registration + IP geolocation) and `reclaimSeat()` (reclaim a vacant seat, reap grace timer, notify opponent, `match-found`) were **factored out of `enter-lobby`** and are now shared. `enter-lobby` is behavior-identical to before — it keeps its forfeit semantics and a reclaim safety-net for the web-refresh navigation race.
- **Net effect:** reconnect recovery is now one screen-agnostic path (`session`) that fixes the lobby case *and* the table case. `enter-lobby` is no longer load-bearing for reconnects, so a blip can't forfeit you.

**Files:** `server/index.js` (bindIdentity/reclaimSeat/session handler), `client/App.js` (playerIdRef + connect handler), `client/src/config.js` (version), `server/scripts/matchLifecycleTest.js` (+4 session tests), `CLAUDE.md` (socket-events table).

**Testing:** 119/119, zero failures — `matchLifecycleTest` 16/16 across **two** runs (incl. 4 new `session` cases: lobby-identity restore + table re-seat via `session`), `challengeTest` 14/14, `botChallengeTest` 16/16, `handEventsTest` 73/73, all vs a local server on the Railway DB. Web export verified (bundle contains the handshake). Test rows cleaned.

**Deploy + prod verification:** merged → `main`, Railway live. A before/after **server probe** nails it: emitting only `session` then `find-match` returned **"Not in lobby."** on the *old* server (reproducing the bug) and **`in-queue`** on the *new* one. Prod web bundle (`index-c10bed5c…`) references `v5.164 / b24.01`. Confirmed live again at end of session.

**Known follow-up (NOT done):** `session` only recovers reconnects that land **inside** the 20s grace window — which a normal reconnect easily beats. If you're gone *longer* than grace, the server has already ended the match; the late `session` finds no seat and drops you in the lobby (correct). But the **client can be left on a stale GameScreen** for a match that no longer exists server-side, because `endMatch` emitted `match-over`/`reset` to the now-dead socket. Clean fix: have `session` also tell the client "no live match — go to lobby" so a very-late reconnect self-heals instead of sitting on a dead table.

---

## Architectural findings from this session (discussed, NOT yet acted on)

These came out of reviewing chip animation and robustness. Recording them so they aren't lost — none are shipped.

### 1. Live chip/card animation is inferred from snapshots, not driven by the event stream
The **replayer** (`client/src/utils/handReplay.js` `buildReplayState`) is a clean, event-prescribed model: it walks the `hand_events` v2 stream in `seq` order and every chip move is prescribed by `amount`/`data.pot`. The **live table** (`GameScreen.jsx`) ignores that and **re-derives** the same choreography by diffing successive `game-state` snapshots with `useEffect` + `setTimeout` chains (staggered board reveal, the `snap`/`locked`/`winDone` "hold the old chip counts until the win animation finishes" trick, the all-in runout stagger). It works because heads-up snapshots arrive at human pace, but it's two sources of truth for the same thing.
- **v5.163 already added a live `hand-events` socket broadcast** (server emits redacted event rows just before each `game-state`; bet-collect animation consumes them). That's the foundation. The clean end-state: the live table plays the v2 events through a small client-side **animation queue** (same consumer as the replayer + durations), which would collapse the snapshot-lock hack, the runout-stagger inference, and unify live + replay onto one renderer.
- **Dead plumbing to wire up when doing this:** there's a full **`ui_config`** table + `/api/config/ui` endpoint + admin "Animation timings" section (`community_card_stagger_ms`, `pot_flight_duration_ms`, `win_done_delay_ms`, etc.) that **nothing currently consumes** — every timing in `GameScreen` is hardcoded. The animation-queue rework is what should finally read those values.

### 2. Missing action cursor (idempotency) — small latent bug + the animation hook
`player-action` carries no sequence token (`{ action, amount }` only). It's not idempotent: on a retry-happy bad connection, a delayed duplicate that lands after your turn comes back around (next street/hand) can execute as a fresh action — the `currentPlayerId === playerId` check passes because it *is* your turn again. Dalima (the older project) solves this with a `{level, hand, action_num}` cursor sent on every action and rejected if stale. Worth adding: the v2 `seq` already exists server-side; attaching it to `player-action` closes the dup-replay hole **and** is the same token that would order the client animation queue.

### 3. Security / robustness audit (heads-up: real gaps, none are about the card engine)
The in-hand engine is solid — server-authoritative, can't peek opponent cards (`getStateFor` redacts hole cards until a true non-fold showdown; live `deal_hole` events are redacted too), can't conjure chips (`amount` is clamped to stack), can't act out of turn. The exposure is **identity and admin**, not gameplay:
- **Identity is pure client assertion.** `enter-lobby`/`session`/`find-match` take `playerId` from the client with **no verification** — no socket-level auth binding a verified token to the connection. `/auth/google` and `/auth/facebook` verify tokens and return a `playerId`, but nothing ties that to the socket. Consequence: you can connect and *be* anyone whose id you can read (leaderboard + replay APIs expose ids) — play rated matches as them, pump/tank ELO, etc.
- **Profile edit is unauthenticated.** `PUT /api/player/:playerId/profile` takes the target id from the URL with no auth → rename/re-avatar any account.
- **Admin is unauthenticated.** The admin password `'1111'` is checked **in client-side JS** (`const PASSWORD = '1111'`) — cosmetic. The real endpoints (`POST /admin/reset` = wipe all live matches, `PUT /admin/ui-config/:key`, game-config/match-format writes) have **no server-side auth**. `/admin/reset` is a global griefing button callable with `curl`.
- Suggested core fix when prioritized: sign the `playerId` at `/auth/*`, verify it on `session`/`enter-lobby`/every action (bind socket → verified identity), and add real server-side auth to `/admin/*` and the profile PUT.

---

## Open items / next session (June 12 additions)

- [ ] **Reconnect:** make `session` self-heal a post-grace reconnect (tell the client "no live match → go to lobby" so it doesn't sit on a stale GameScreen). See follow-up above.
- [ ] **Animation:** rework live `GameScreen` to play the v2 `hand-events` stream through a client-side animation queue (one renderer for live + replay); wire the dead `ui_config` timings into it.
- [ ] **Robustness:** add a sequence/cursor token to `player-action` (idempotency + animation ordering).
- [ ] **Security (when prioritized):** server-verified identity bound to the socket; real auth on `/admin/*` and the profile PUT endpoint.
