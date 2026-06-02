# Poker — Claude Context

## What this is
Multiplayer Texas Hold'em. Up to 9 players, overflow goes to a waitlist. Real-time via Socket.IO. No auth, no persistence — all state is in-memory on the server.

**Branches:** `generic` = active development branch (multi-table, emoji avatars, bots, lobby)  
**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git  
**Current version:** v1.04

---

## Stack
- **Server:** Node/Express + Socket.IO (`server/index.js`)
- **Client:** React Native (Expo SDK 54) — `client/`
- **Deploy:** Railway — auto-deploys on every push to `main`

---

## Dev workflow — always prod server
The client always connects to the production Railway server. There is no local server. This eliminates local/prod drift entirely.

**First time setup on a new machine:**
```bash
# 1. Install EAS CLI (global, one-time)
npm install -g eas-cli

# 2. Log into Expo account
eas login   # account: coinburst / brian.danilo@gmail.com

# 3. Install deps
cd client && npm install

# 4. Start Android emulator (must be running before step 5)
#    Open Android Studio → Device Manager → start Pixel 8
#    OR from terminal:
~/Library/Android/sdk/emulator/emulator -avd Pixel_8 -no-audio -no-boot-anim -gpu host &

# 5. Run the app
cd /path/to/poker/client && npx expo start --android
```

**Emulator requirements:**
- Pixel 8 AVD must have at least **4GB RAM** (default 2GB causes OOM crashes)
- To check/fix: `~/.android/avd/Pixel_8.avd/config.ini` → `hw.ramSize=4096`
- API 37 (Android 17 "CinnamonBun") — only system image currently installed

**Daily dev loop:**
```bash
cd /Users/briandanilo/poker/client && npx expo start --android
```
The emulator must be running first. Expo auto-opens Expo Go and loads the app.

**To deploy:** push to `main` on GitHub. Railway redeploys automatically.

---

## Screen flow
```
SignIn (name + avatar) → Lobby (table picker) → GameTable
```
- `SignIn.jsx` — name + avatar selection; auto-advances if localStorage has saved profile
- `Lobby.jsx` — shows California / Paris / Dublin cards with player count + phase
- `GameTable.jsx` — full game UI

---

## Project structure
```
poker/
├── CLAUDE.md               ← this file, keep updated
├── package.json            ← root: build + start for Railway, dev launches Expo
├── client/                 ← Expo RN app (Android / iOS / web)
│   ├── App.js              ← navigation root, socket handlers
│   ├── app.json            ← Expo config (name: Poker Monkey, SDK 54)
│   ├── eas.json            ← EAS build profiles (preview = internal APK)
│   ├── assets/             ← dk.png, diddy.webp, jungle.png + Expo icons
│   └── src/
│       ├── config.js           ← SERVER_URL (always prod Railway URL)
│       ├── theme.js            ← color tokens
│       ├── context/
│       │   └── GameContext.js  ← React context shared across screens
│       ├── hooks/
│       │   └── useSocket.js    ← singleton socket.io-client, websocket transport
│       ├── components/
│       │   ├── Card.jsx            ← playing card (View + Text)
│       │   ├── PokerChip.jsx       ← SVG chips via react-native-svg + ChipStack
│       │   ├── Avatar.jsx          ← player avatar image (dk / diddy)
│       │   ├── TimerRing.jsx       ← pure-JS SVG ring (setInterval, no Reanimated)
│       │   ├── PlayerSeat.jsx      ← opponent seat (cards + nameplate + ring)
│       │   └── BettingControls.jsx ← fold/check/call/raise + horizontal slider
│       └── screens/
│           ├── LobbyScreen.jsx    ← name + avatar picker, jungle bg
│           ├── WaitlistScreen.jsx ← queue position + live table view
│           └── GameScreen.jsx     ← felt oval, community cards, pot, my seat
└── server/
    ├── index.js                 ← all game coordination + Socket.IO
    ├── db.js                    ← Postgres schema + queries
    └── game/
        ├── PokerGame.js         ← pure game logic
        ├── Deck.js
        └── HandEvaluator.js
```

---

## Key architecture decisions

**GameContext:** Lives in `src/context/GameContext.js`. `App.js` provides it; screens consume via `useContext(GameContext)`. Kept separate to avoid circular imports (screens used to import from `../../App` which caused cycles).

**State flow:** Server owns all truth. Every action emits `game-state` to all sockets with a per-player view (hole cards hidden for opponents except at showdown).

**Turn timer:** Server enforces 20s auto-fold. `turnDeadline` (Unix ms) is broadcast in every `game-state`. `TimerRing` uses `setInterval` at 100ms to update SVG `strokeDashoffset` — pure JS, no Reanimated (see troubleshooting below).

**Raise slider:** Horizontal `@react-native-community/slider`. `raiseAmount` state lives in `GameScreen`, passed to `BettingControls`.

**Winner display:** No overlay. Winner shown in nameplate chips area during showdown. Next hand starts automatically after 3s.

**Pot chips:** `ChipStack` breaks any amount into $100/$25/$10 denominations, rendered as SVG via `react-native-svg`.

**Reset:** `POST /admin/reset` — clears all timers server-side, emits `reset` to all clients → back to Lobby.

---

## Building an APK (for distribution)

```bash
cd client
eas build --platform android --profile preview
```

- `preview` profile → internal distribution APK (no Play Store needed)
- Build happens on EAS cloud servers (~15 min)
- Download link emailed when done
- EAS project: `coinburst/poker-monkey` (ID: `8b891cf4-46a6-46b7-951b-7cc826e8a4e7`)

**State flow:** Server owns all truth. `game-state` broadcast on every action with per-player hole card visibility.

**Bet chips on felt:** Rendered as separate absolutely-positioned elements at `BET_POS` coordinates, not inside nameplates.

**Action labels on felt:** `ActionOnFelt` component renders flash labels (Fold/Call/Raise etc.) on the felt at `BET_POS`, not in nameplates. Chip count always visible in nameplate.

---

## Socket events
| Event | Direction | Meaning |
|---|---|---|
| `join` | client→server | `{ playerName, avatarId }` |
| `joined` | server→client | `{ playerId, atTable }` |
| `game-state` | server→client | Full state update (every action) |
| `player-action` | client→server | `{ action, amount }` — fold/check/call/raise/all-in |
| `reset` | server→client | Wipe and go to lobby |
| `error` | server→client | `{ message }` for invalid actions |

---

## Railway build
```
npm run build   → npm install --prefix server
npm start       → node server/index.js
```
Server exposes Socket.IO on Railway-injected `PORT`. No static file serving (Expo apps are distributed separately).

---

## Troubleshooting log

### Reanimated crashes in Expo Go — DO NOT USE react-native-reanimated
**Symptom:** `Exception in HostFunction: TurboModule method "installTurboModule" called with 1 arguments (expected argument count: 0)` or `NullPointerException in ReanimatedModule`

**Root cause:** Expo Go bundles its own native Reanimated binary. The JS version we install must exactly match that native version. For SDK 54, neither Reanimated 3.x nor 4.x produced a working match — every version we tried (3.16.7, 4.1.1, 4.3.1) failed with either a signature mismatch or null pointer.

**Fix:** Removed Reanimated entirely. `TimerRing` now uses `setInterval` + React state to update SVG `strokeDashoffset` at 100ms intervals. Pure JS, no native module dependency. Looks identical.

**If adding animations in future:** Use Reanimated only in EAS/production builds, not Expo Go. Or use `react-native-reanimated` in a development build (not Expo Go).

---

### Expo Go SDK version mismatch
**Symptom:** "Project is incompatible with this version of Expo Go" or "installed version is for SDK 54, project uses SDK 53"

**Fix:** Project must match Expo Go on device. We're on SDK 54. To upgrade/downgrade:
```bash
npx expo install expo@~54.0.0
npx expo install --fix
```

---

### babel-preset-expo missing after SDK shuffle
**Symptom:** `Cannot find module 'babel-preset-expo'`

**Fix:** `npm install babel-preset-expo@~54.0.10 --save-dev`

---

### Emulator OOM crash (Expo Go killed silently)
**Symptom:** Expo Go opens then immediately closes. `adb logcat` shows `lowmemorykiller: Kill 'host.exp.exponent'`

**Fix:** Increase AVD RAM to 4096MB:
```bash
sed -i '' 's/hw.ramSize=2048/hw.ramSize=4096/' ~/.android/avd/Pixel_8.avd/config.ini
```
Restart emulator after.

---

### pkill -f expo kills the emulator too
**Symptom:** Emulator disappears after trying to restart Expo server.

**Fix:** Never use `pkill -f expo`. Kill only specific ports:
```bash
lsof -ti:8081 | xargs kill -9
```

---

### Emulator stuck on black screen / fails to boot
**Symptom:** Black screen, "Emulator failed to connect within 5 minutes" in Device Manager.

**Fix:** Wipe corrupted snapshots and cold boot:
```bash
rm -rf ~/.android/avd/Pixel_8.avd/snapshots
```
Then start with: `emulator -avd Pixel_8 -no-audio -no-boot-anim -gpu host`

---

### Circular import warning: App.js ↔ screens
**Symptom:** `Require cycle: App.js -> src/screens/LobbyScreen.jsx -> App.js`

**Root cause:** Screens were importing `GameContext` from `../../App`, creating a cycle.

**Fix:** `GameContext` lives in `src/context/GameContext.js`. All screens import from there.
