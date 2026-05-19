# Poker — Claude Context

## What this is
Multiplayer Texas Hold'em, up to 9 players per table (mix of real + bots). Three named permanent tables: California, Paris, Dublin. Real-time via Socket.IO. Google SSO or guest identity (clientId in localStorage). Full action log persisted to Postgres.

**Branches:** `generic` = active development branch (multi-table, emoji avatars, bots, lobby)  
**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git  
**Current version:** v1.04

---

## Deploy rules
- **After every user command:** commit changes + push to `generic` branch on GitHub
- **To push to prod:** `git push origin generic:main` (do NOT merge locally — just push the ref)
- **Never merge generic → main locally** unless user explicitly says "merge"
- Railway auto-deploys on push to `main`

---

## Stack
- **Server:** Node/Express + Socket.IO (`server/index.js`) + google-auth-library + pg
- **Client:** React + Vite + Tailwind CSS (`client/src/`)
- **Auth:** Google SSO (`googleSub`) or guest (`clientId` UUID in localStorage under `poker_user`)
- **DB:** Railway Postgres — `server/db.js` owns schema + queries. Runs `migrate()` on startup.
- **Deploy:** Railway — auto-deploys on push to `main`

## Env vars (never commit)
- `server/.env` → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`
- `client/.env` → `VITE_GOOGLE_CLIENT_ID`
- Railway: `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `DATABASE_URL`

## Dev ports
- Client (Vite): **5843** — fixed in `vite.config.js`
- Server (Express): **3843** — fixed in `server/index.js`
- Start both: `node server/index.js &` and `cd client && npm run dev`

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
├── CLAUDE.md
├── client/src/
│   ├── App.jsx                  ← screen state machine: signin | lobby | game
│   ├── App.css                  ← all styles
│   ├── hooks/useSocket.js       ← singleton socket
│   └── components/
│       ├── SignIn.jsx           ← name + avatar entry (was Lobby.jsx)
│       ├── Lobby.jsx            ← table picker (California / Paris / Dublin)
│       ├── GameTable.jsx        ← game layout + hamburger menu
│       ├── Avatar.jsx           ← exports AVATARS (8 emojis) + Avatar component
│       ├── BettingControls.jsx
│       ├── Card.jsx             ← sizes: xs, sm, md, lg, xl
│       ├── PokerChip.jsx
│       └── PlayerSeat.jsx       ← exports useActionFlash hook
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

**Three permanent named tables:** California, Paris, Dublin — created on startup, never destroyed even when empty. `t.permanent = true`.

**Player identity:**
- Google users: identified by `googleSub`
- Guests: `clientId` UUID generated once and stored in `localStorage` under `poker_user`
- `identityKey = googleSub || clientId` — used to reconnect/reclaim seat

**Reconnect / grace period:** On disconnect, player is held in `disconnectedPlayers` map for 15 seconds. If same identity rejoins within that window, they reclaim their seat. After 15s, `evictPlayer` removes them from the game.

**Duplicate window handling:** On `rejoin`, the old socket gets `io.to(oldSid).emit('reset')` so it returns to lobby rather than staying frozen.

**Bots:** Per-table, off by default. `Add Bot` / `Remove Bot` in hamburger menu add/remove one bot at a time. Bots fold 80% when facing a bet, otherwise check or occasionally raise minimum.

**Seat max:** 9 per table. Bots fill empty seats (when enabled). Real players can bump bots.

**Turn timer:** 20 seconds, toggleable per-table via Settings in hamburger. When disabled, clears immediately.

**State flow:** Server owns all truth. `game-state` broadcast on every action with per-player hole card visibility.

**Bet chips on felt:** Rendered as separate absolutely-positioned elements at `BET_POS` coordinates, not inside nameplates.

**Action labels on felt:** `ActionOnFelt` component renders flash labels (Fold/Call/Raise etc.) on the felt at `BET_POS`, not in nameplates. Chip count always visible in nameplate.

---

## Socket events
| Event | Direction | Meaning |
|---|---|---|
| `enter-lobby` | client→server | Register as lobby watcher; server checks for active seats |
| `join` | client→server | `{ playerName, avatarId, tableId, googleSub, clientId }` |
| `rejoin` | client→server | `{ playerId, tableId }` — reclaim existing seat |
| `leave-table` | client→server | Remove from game, go back to lobby |
| `player-action` | client→server | `{ action, amount }` |
| `add-bot` | client→server | Add one bot to current table |
| `remove-bot` | client→server | Remove one bot from current table |
| `set-timers` | client→server | `{ enabled }` — toggle turn timer |
| `joined` | server→client | `{ playerId, atTable }` |
| `game-state` | server→client | Full state update |
| `lobby-state` | server→client | `{ tables: [{id, name, playerCount, phase}] }` |
| `reset` | server→client | Go to sign-in screen |
| `displaced` | server→client | Another window took your seat — go to lobby |

---

## Timers (all cleared on reset)
| Variable | Purpose |
|---|---|
| `turnTimer` | Auto-folds current player after 20s (if timersEnabled) |
| `timerPlayerId` | Tracks whose timer is running |
| `turnDeadline` | Unix ms broadcast to clients for countdown |
| `autoStartTimer` | 3s delay before starting first hand |
| `nextHandTimer` | Delay between hands |
| `botTimer` | Schedules bot action 0.8–1.5s after bot's turn |

---

## Railway build
```
npm run build   → npm install in server/ and client/, vite build → client/dist
npm start       → node server/index.js (serves client/dist + Socket.IO on Railway PORT)
```
