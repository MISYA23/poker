# Poker — Claude Context

## What this is
Multiplayer Texas Hold'em. Up to 9 players, overflow goes to a waitlist. Real-time via Socket.IO. No auth, no persistence — all state is in-memory on the server.

**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git

---

## Stack
- **Server:** Node/Express + Socket.IO (`server/index.js`)
- **Client:** React Native (Expo SDK 56) — `client/`
- **Deploy:** Railway — auto-deploys on every push to `main`

---

## Dev workflow — always prod server
The client always connects to the production Railway server (`https://poker-production-d726.up.railway.app`). There is no local server. This eliminates local/prod drift.

**To run the client locally:**
```
npm run dev          # from root — launches Expo
cd client && npm start   # equivalent
```

Expo will print a QR code. Scan with the Expo Go app on Android, or press `a` to open in an Android emulator.

**To deploy:** push to `main` on GitHub. Railway redeploys automatically.

---

## Deploy rule
**Always push to GitHub after every change.** Railway is connected to `main` and redeploys automatically. Never leave changes uncommitted.

---

## Project structure
```
poker/
├── CLAUDE.md               ← this file, keep updated
├── package.json            ← root: build + start for Railway, dev launches Expo
├── client/                 ← Expo RN app (Android / iOS / web)
│   ├── App.js              ← navigation root, GameContext, socket handlers
│   ├── app.json            ← Expo config (name: Poker Monkey)
│   ├── assets/             ← dk.png, diddy.webp, jungle.png + Expo icons
│   └── src/
│       ├── config.js       ← SERVER_URL (always prod Railway URL)
│       ├── theme.js        ← color tokens
│       ├── hooks/
│       │   └── useSocket.js ← singleton socket.io-client, websocket transport
│       ├── components/
│       │   ├── Card.jsx         ← playing card (View + Text, no SVG needed)
│       │   ├── PokerChip.jsx    ← SVG chips via react-native-svg + ChipStack
│       │   ├── Avatar.jsx       ← player avatar image
│       │   ├── TimerRing.jsx    ← Reanimated 4 animated SVG ring
│       │   ├── PlayerSeat.jsx   ← opponent seat (cards + nameplate + ring)
│       │   └── BettingControls.jsx ← fold/check/call/raise + horizontal slider
│       └── screens/
│           ├── LobbyScreen.jsx    ← name + avatar picker, jungle bg
│           ├── WaitlistScreen.jsx ← queue position + live table view
│           └── GameScreen.jsx     ← felt oval, community cards, pot, my seat
└── server/
    ├── index.js            ← Express + Socket.IO + all game coordination
    └── game/
        ├── PokerGame.js    ← pure game logic, no I/O
        ├── Deck.js
        └── HandEvaluator.js
```

---

## Key architecture decisions

**GameContext:** `App.js` owns all game state and socket handlers. Screens read via `useContext(GameContext)`. Navigation is driven programmatically via `useNavigationContainerRef` — the server's socket events (`joined`, `game-state`, `reset`) trigger navigation, not the screens themselves.

**State flow:** Server owns all truth. Every action emits `game-state` to all connected sockets with a per-player view (hole cards hidden for opponents except at showdown).

**Turn timer:** Server enforces a 20-second auto-fold. `turnDeadline` (Unix ms timestamp) is broadcast in every `game-state`. `TimerRing` uses Reanimated 4 `withTiming` on SVG `strokeDashoffset`, synced to the deadline so it's accurate even if state arrives mid-turn.

**Raise slider:** Horizontal `@react-native-community/slider`. `raiseAmount` state lives in `GameScreen`, passed to `BettingControls`.

**Winner display:** No overlay. During showdown, winner is shown in the nameplate chips area. Next hand starts automatically after 3s.

**Pot chips:** `ChipStack` breaks any amount into $100/$25/$10 denominations, rendered as SVG circles via `react-native-svg`.

**Reset:** `POST /admin/reset` — button in Lobby and GameScreen. Clears all timers server-side, emits `reset` to all clients which navigates everyone back to Lobby.

---

## Timers — all must be cleared on reset
| Variable | Purpose |
|---|---|
| `turnTimer` | Auto-folds current player after 20s |
| `timerPlayerId` | Tracks who the turn timer is for |
| `turnDeadline` | Unix ms timestamp broadcast to clients |
| `autoStartTimer` | 3s delay before auto-starting a hand |
| `nextHandTimer` | 3s delay between hands |

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
Railway runs:
```
npm run build   → npm install --prefix server  (no client build — Expo apps are distributed separately)
npm start       → node server/index.js
```
Server exposes Socket.IO on Railway-injected `PORT`. No static file serving.
