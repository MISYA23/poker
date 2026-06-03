# Poker — Claude Context

## What this is
Multiplayer Texas Hold'em (Poker Monkey). Up to 9 players per table. Three permanent named tables: California, Paris, Dublin. Real-time via Socket.IO. Google SSO or guest identity. Full game state persisted to Postgres.

**Active branch:** `main` — React Native (Expo SDK 54) app  
**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git  
**Current version:** v2.0

> `generic` branch = old web React/Vite client (deprecated, kept for reference)

---

## Stack
- **Server:** Node/Express + Socket.IO (`server/index.js`) + pg (Railway Postgres)
- **Client:** React Native (Expo SDK 54) — `client/` — runs on Android, iOS, and web
- **Deploy:** Railway — auto-deploys on push to `main`

---

## Dev workflow

### Local dev (server + Expo web)

**Start server:**
```bash
cd server && node index.js
# Runs on port 3843. Loads rooms from Railway Postgres.
```

**Start Expo web:**
```bash
cd client && ./node_modules/.bin/expo start --web --port 7843
```
⚠️ Use `./node_modules/.bin/expo`, NOT `npx expo` — npx will pull down expo v56 which is incompatible with SDK 54.

**Client env (`client/.env`):**
```
EXPO_PUBLIC_SERVER_URL=http://localhost:3843
```
When this var is set, `src/config.js` uses it instead of the prod URL. Remove or unset to point back at prod.

### Android emulator dev
```bash
# Start emulator (must be running before Expo)
~/Library/Android/sdk/emulator/emulator -avd Pixel_8 -no-audio -no-boot-anim -gpu host &

# Start Expo
cd client && ./node_modules/.bin/expo start --android
```
- Pixel 8 AVD, API 37, **must have 4GB RAM** — default 2GB causes silent OOM crashes
- Fix: `sed -i '' 's/hw.ramSize=2048/hw.ramSize=4096/' ~/.android/avd/Pixel_8.avd/config.ini`

### Deploy to prod
```bash
git push origin main   # Railway auto-deploys
```

---

## Screen flow
```
LobbyScreen → TableSelectScreen → [WaitlistScreen] → GameScreen
```
- `LobbyScreen.jsx` — name input, Google SSO (`expo-auth-session`), avatar picker (4 image avatars), jungle background
- `TableSelectScreen.jsx` — California / Paris / Dublin table cards with live player counts
- `WaitlistScreen.jsx` — queue position if table is full
- `GameScreen.jsx` — felt oval, up to 9-player portrait layout, community cards, pot, betting controls

Navigation: `@react-navigation/stack` in `App.js`, `headerShown: false`, `fade` animation.

---

## Project structure
```
poker/
├── CLAUDE.md
├── package.json            ← root: build + start for Railway
├── server/
│   ├── index.js            ← Express + Socket.IO + all game coordination
│   ├── db.js               ← Postgres schema + queries
│   └── game/
│       ├── PokerGame.js    ← pure game logic
│       ├── Deck.js
│       └── HandEvaluator.js
└── client/
    ├── App.js              ← navigation root, socket event handlers, GameContext provider
    ├── app.json            ← Expo config (name: Poker Monkey, SDK 54)
    ├── eas.json            ← EAS build profiles
    ├── assets/             ← dk.png, diddy.webp, alfie.png, jazz.png, jungle.png
    └── src/
        ├── config.js           ← SERVER_URL (env var or prod fallback)
        ├── theme.js            ← color tokens
        ├── context/
        │   └── GameContext.js  ← shared React context (myId, gameState, emit, onJoin, etc.)
        ├── hooks/
        │   └── useSocket.js    ← singleton socket.io-client connecting to SERVER_URL
        ├── utils/
        │   └── user.js         ← AsyncStorage helpers (getUser, setUser, getOrCreatePlayerId)
        ├── components/
        │   ├── Avatar.jsx          ← image avatar (dk/diddy/alfie/jazz)
        │   ├── Bananas.jsx         ← exists but NOT used in GameScreen (chips are canonical)
        │   ├── BettingControls.jsx ← fold/check/call/raise + slider
        │   ├── Card.jsx            ← playing card (View + Text)
        │   ├── PokerChip.jsx       ← SVG chips via react-native-svg; exports PokerChip + ChipStack
        │   └── TimerRing.jsx       ← pure-JS SVG countdown ring (setInterval, no Reanimated)
        └── screens/
            ├── LobbyScreen.jsx
            ├── TableSelectScreen.jsx
            ├── WaitlistScreen.jsx
            └── GameScreen.jsx
```

---

## Key architecture decisions

**No localStorage** — this is React Native. Use `AsyncStorage` via `src/utils/user.js`.

**GameContext** (`src/context/GameContext.js`) — provided by `App.js`, consumed by all screens. Contains: `gameState`, `myId`, `error`, `lobbyRooms`, `emit`, `onJoin`, `onJoinTable`, `onAction`, `onLeave`. Kept in its own file to avoid circular imports.

**Socket** (`useSocket.js`) — singleton, connects to `SERVER_URL` with `transports: ['websocket']`. Reconnects automatically. For web, `SERVER_URL` must point to the Express server, not the Metro bundler port.

**Rooms** — loaded from Postgres on server startup (`loadRooms()`). Keyed by UUID in `rooms` Map. Three permanent rooms: California 🌴, Paris 🗼, Dublin 🍀. Room object: `{ id (uuid), name, emoji, maxPlayers, game, rematchVotes, timers }`.

**State flow** — server owns all truth. Every action emits `game-state` to all sockets in the room with per-player hole card visibility.

**Turn timer** — server enforces 20s auto-fold. `turnDeadline` (Unix ms) broadcast in `game-state`. `TimerRing` uses `setInterval` + React state at 100ms — no Reanimated.

**Avatars** — 4 image-based: `dk`, `diddy`, `alfie`, `jazz`. VALID_AVATARS checked on server; unknown IDs default to `dk`.

**Auth:**
- Google: `expo-auth-session` → `/auth/google` on server (validates token via Google userinfo API) → returns `{ playerId, name }`
- Guest: `getOrCreatePlayerId()` from AsyncStorage → `/api/player/guest` (fire-and-forget acknowledgement)

**Pot / bet display — use ChipStack, not Bananas:**
`Bananas.jsx` still exists but is not used in `GameScreen`. Pot, bet badges, and the win-flight animation all use `ChipStack` from `PokerChip.jsx`. Do not swap back to Bananas.

**9-player layout:**
`OPP_SLOTS` in `GameScreen.jsx` handles 1–8 opponents (9 total players including local player). `PokerGame.js` caps at 9. DB `max_players = 9` for all rooms. The layout positions (`getSeatStyle`/`getBetStyle`) cover all slots including `top-cl`, `top-cr`, `bot-left`, `bot-right`.

**SeatView `hideCards` prop:**
The local player's seat (`bottom` slot) passes `hideCards` to `SeatView` to suppress the small xs-size card thumbnails — their large hole cards are rendered separately below the oval. Opponents never get `hideCards`.

**Oval size — use `useWindowDimensions`, never `onLayout`:**
`GameScreen` derives `ovalSize` from `useWindowDimensions()` (only fires on actual window resize). Do NOT attach `onLayout` to `ovalWrap` — game state changes (pot text, community cards, narration) would cause layout thrash, re-firing `onLayout` on every update and making the oval visually unstable. `ovalSize` feeds `getSeatStyle`/`getBetStyle`/`myCards` positioning.

**Portrait layout:**
The app is portrait-first. `ovalWrap` uses `flex: 1` (not `aspectRatio`) so the felt fills vertical space. Stage has `paddingVertical: 80` to give seats room to extend ±60px outside the oval edges. My large hole cards sit at `bottom: -90` relative to the oval.

---

## HTTP routes (server)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Health check |
| GET | `/health` | Detailed health |
| GET | `/api/rooms` | Room list (used by TableSelectScreen seed fetch) |
| POST | `/api/player/guest` | Guest registration acknowledgement |
| POST | `/auth/google` | Google token validation → returns playerId |
| POST | `/admin/reset` | Wipe all rooms, emit reset to all clients |

## Socket events
| Event | Direction | Payload |
|---|---|---|
| `enter-lobby` | client→server | `{ playerId }` |
| `join` | client→server | `{ playerId, playerName, avatarId, tableId }` |
| `leave-table` | client→server | — |
| `player-action` | client→server | `{ action, amount }` |
| `rematch-vote` | client→server | `{ vote }` |
| `joined` | server→client | `{ playerId, tableId }` |
| `game-state` | server→client | Full state for this player |
| `lobby-state` | server→client | `{ tables: [{id, name, emoji, playerCount, phase, maxPlayers}] }` |
| `reset` | server→client | Go back to Lobby |
| `error` | server→client | `{ message }` |

---

## Building an APK
```bash
cd client
eas build --platform android --profile preview
```
- `preview` → internal distribution APK (~15 min, EAS cloud)
- EAS project: `coinburst/poker-monkey` (ID: `8b891cf4-46a6-46b7-951b-7cc826e8a4e7`)
- EAS account: `coinburst` / brian.danilo@gmail.com

---

## Railway build
```
npm run build   → npm install --prefix server
npm start       → node server/index.js
```
No static file serving — Expo apps are distributed separately (Expo Go or APK).

---

## Troubleshooting

### Socket connects to wrong port on web
**Symptom:** `[socket] connect_error: server error` — socket tries to connect to Metro bundler port instead of Express.  
**Root cause:** `useSocket.js` was using `window.location.origin` (Metro port) instead of `SERVER_URL`.  
**Fix:** `useSocket.js` now uses `SERVER_URL` from `config.js`. Make sure `EXPO_PUBLIC_SERVER_URL` in `client/.env` points to the Express server port.

### npx expo pulls wrong version
**Symptom:** `npm warn exec The following package was not found and will be installed: expo@56.x.x`  
**Fix:** Always use `./node_modules/.bin/expo start`, never `npx expo start`.

### DO NOT USE react-native-reanimated
**Symptom:** `TurboModule method "installTurboModule"` crash or `NullPointerException in ReanimatedModule`  
**Root cause:** Expo Go SDK 54 bundled native Reanimated doesn't match any installable JS version.  
**Fix:** `TimerRing` uses `setInterval` + React state. If you need animations, use Reanimated only in EAS builds, not Expo Go.

### Emulator OOM (Expo Go silently closes)
**Symptom:** `lowmemorykiller: Kill 'host.exp.exponent'` in adb logcat  
**Fix:** `sed -i '' 's/hw.ramSize=2048/hw.ramSize=4096/' ~/.android/avd/Pixel_8.avd/config.ini` then restart emulator.

### Emulator black screen
**Fix:** `rm -rf ~/.android/avd/Pixel_8.avd/snapshots` then cold boot.

### pkill -f expo kills the emulator
**Fix:** Never use `pkill -f expo`. Kill Metro only: `lsof -ti:8081 | xargs kill -9`

### Circular import: App.js ↔ screens
**Fix:** `GameContext` lives in `src/context/GameContext.js`. Never import it from `App.js`.

### Expo Go SDK mismatch
**Fix:** `npx expo install expo@~54.0.0 && npx expo install --fix`

### Oval background shifts during gameplay
**Symptom:** The felt oval appears to resize or jump as cards are dealt, pot updates, or narration text appears.  
**Root cause:** `onLayout` on `ovalWrap` fires on every flex recalculation caused by game state changes. Each fire updates `ovalSize` state → re-render → another layout pass → infinite churn.  
**Fix:** Use `useWindowDimensions()` to derive `ovalSize`. It only fires on actual window/screen resize. Never attach `onLayout` to `ovalWrap`.

### Hole cards rendered twice on local player's seat
**Symptom:** Local player sees small cards above the nameplate AND large cards below it.  
**Root cause:** `SeatView` renders xs-size card thumbnails for all players. The local player also has a separate large-card block below the oval.  
**Fix:** Pass `hideCards` prop to `SeatView` for the bottom (local player) seat only. Opponents never get this prop.

### Table appears in landscape mode
**Symptom:** The poker table oval is wider than it is tall, even on a portrait phone.  
**Root cause:** `ovalWrap` had `aspectRatio: 2.1` which forces a landscape-ratio rectangle.  
**Fix:** `ovalWrap` uses `flex: 1` so the oval fills available portrait height. Do not add `aspectRatio` back.
