# Poker — Claude Context

## What this is
Multiplayer Texas Hold'em. One table, up to 9 players, overflow goes to a waitlist. Real-time via Socket.IO. No auth, no persistence — all state is in-memory on the server.

**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git

---

## Stack
- **Server:** Node/Express + Socket.IO (`server/index.js`)
- **Client:** React + Vite (`client/src/`)
- **Deploy:** Railway — auto-deploys on every push to `main`

---

## Dev ports
- Client (Vite): **5843** — `cd client && npm run dev`
- Server (Express): **3843** — `cd server && npm run dev`

Open http://localhost:5843. Vite proxies `/socket.io` to 3843.

Start both: `npm start` from root (uses concurrently).

---

## Deploy rule
**Always push to GitHub after every change.** Railway is connected to `main` and redeploys automatically. Never leave changes uncommitted.

---

## Project structure
```
poker-game/
├── CLAUDE.md               ← this file, keep updated
├── README.md               ← human-facing short doc
├── package.json            ← root: build + start scripts for Railway
├── client/
│   ├── src/
│   │   ├── App.jsx         ← top-level state: screen, myId, gameState
│   │   ├── App.css         ← all styles (single file)
│   │   ├── hooks/
│   │   │   └── useSocket.js ← singleton socket, registers handlers
│   │   └── components/
│   │       ├── GameTable.jsx     ← main game layout, owns raiseAmount state
│   │       ├── BettingControls.jsx ← action buttons only (no slider)
│   │       ├── PlayerSeat.jsx    ← opponent seat card
│   │       ├── Card.jsx          ← playing card SVG
│   │       ├── PokerChip.jsx     ← SVG chips ($10 red, $25 green, $100 black) + ChipStack
│   │       ├── Lobby.jsx         ← name entry screen
│   │       ├── WaitlistScreen.jsx
│   │       └── WinnerDisplay.jsx ← unused (winner shown inline now)
│   └── vite.config.js      ← port 5843, proxies /socket.io → 3843
└── server/
    ├── index.js            ← Express + Socket.IO + all game coordination
    └── game/
        ├── PokerGame.js    ← pure game logic, no I/O
        ├── Deck.js
        └── HandEvaluator.js
```

---

## Key architecture decisions

**Single table:** One global `PokerGame` instance on the server. No rooms/lobbies.

**State flow:** Server owns all truth. Every action emits `game-state` to all connected sockets with a per-player view (hole cards hidden for opponents except at showdown).

**Turn timer:** Server enforces a 20-second auto-fold. `turnDeadline` (Unix ms timestamp) is broadcast in every `game-state` so clients can show an accurate countdown without drift.

**Raise slider:** Vertical, positioned absolute on the right edge of `.game-table` (middle 50% of screen height). `raiseAmount` state lives in `GameTable`, passed down to `BettingControls` (buttons only) and rendered as a slider alongside.

**Winner display:** No overlay. During showdown, chips appear on the winner's seat with hand name. Next hand starts automatically after 3s.

**Pot chips:** `ChipStack` component breaks any amount into $100/$25/$10 chips and renders them as SVG. Shown in pot center and on player bets.

**Reset:** `GET /reset` (browser URL bar) or `POST /admin/reset` (button). Clears all four timers (`turnTimer`, `autoStartTimer`, `nextHandTimer`, `timerPlayerId`), replaces the `PokerGame` instance, clears `socketPlayers` and `waitlist`, then `io.emit('reset')` sends all clients to the lobby. The button also does `window.location.href = '/'` to guarantee clean client state.

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
| `join` | client→server | Player joins with `{ playerName }` |
| `joined` | server→client | Confirms join with `{ playerId, atTable }` |
| `game-state` | server→client | Full state update (every action) |
| `player-action` | client→server | `{ action, amount }` — fold/check/call/raise/all-in |
| `reset` | server→client | Wipe and go to lobby |
| `error` | server→client | `{ message }` for invalid actions |

---

## Railway build
Railway runs:
```
npm run build   → installs deps + vite build → client/dist
npm start       → node server/index.js (serves client/dist as static)
```
Single service — Express serves both the built React app and Socket.IO on the same port (Railway-injected `PORT` env var).
