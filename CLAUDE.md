# Poker — Claude Context

## What this is
Multiplayer Texas Hold'em (Poker Monkey). 1v1 matchmaking (chess.com style). ELO rating system. Three permanent named tables: California, Paris, Dublin. Real-time via Socket.IO. Google SSO or guest identity. Hand history persisted to Postgres via Redis.

**Active branch:** `main`  
**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git  
**Current version:** v2.3 (bump `VERSION` in `client/src/config.js` on every push)

---

## Stack
- **Server:** Node/Express + Socket.IO (`server/index.js`) + pg + ioredis
- **Client:** React Native (Expo SDK 54) — `client/` — Android, iOS, web
- **DB:** Railway Postgres — rooms, matches, player_stats, hands, actions
- **Cache:** Railway Redis — live game snapshot + hand event log
- **Deploy:** Railway — auto-deploys on push to `main`

---

## Dev workflow

### Always use prod server
The client always connects to `https://poker-production-d726.up.railway.app` by default. `client/.env` has the local override commented out — leave it that way unless you specifically need local server testing.

```
# client/.env
# EXPO_PUBLIC_SERVER_URL=http://localhost:3843   ← emulator only, uncomment to use local
```

### Run local server (optional)
```bash
cd server && node index.js   # port 3843, connects to prod Railway Postgres + Redis via .env
```

`server/.env` contains prod DB + Redis URLs — never commit this file.

### Run Expo
```bash
cd client && ./node_modules/.bin/expo start
```
⚠️ Use `./node_modules/.bin/expo`, NOT `npx expo` — npx pulls expo v56 which is incompatible with SDK 54.

Press `a` for Android emulator, `w` for web, scan QR for physical device.

### Android emulator
```bash
~/Library/Android/sdk/emulator/emulator -avd Pixel_8 -no-audio -no-boot-anim -gpu host &
```
- Pixel 8 AVD, API 37, **must have 4GB RAM** (`hw.ramSize=4096` in `~/.android/avd/Pixel_8.avd/config.ini`)
- Kill Metro only: `lsof -ti:8081 | xargs kill -9` — never `pkill -f expo` (kills emulator too)

### Deploy
```bash
git add -A && git commit && git push origin main
```
Railway auto-deploys. Always bump `VERSION` in `client/src/config.js`.

---

## Screen flow
```
LoginScreen → LobbyScreen → GameScreen
```

- **LoginScreen** — Google Sign In (`expo-auth-session`, `usePKCE: false`) + guest (name + avatar + Join). Auto-login if AsyncStorage has saved session.
- **LobbyScreen** — PLAY! button, observer list of active matches, ☰ hamburger → Log Out
- **GameScreen** — felt oval, up to 9-player portrait layout, community cards, pot, betting controls, match-over modal with ELO

Navigation: `@react-navigation/stack`, `headerShown: false`, `fade` animation.

---

## Matchmaking flow
1. Player hits PLAY! → `find-match` socket event
2. If opponent waiting → instant pair → `match-found` → both navigate to GameScreen
3. If no opponent → `in-queue` → spinner + Cancel button
4. Game plays out (hands logged to Redis, flushed to Postgres at hand end)
5. One player busted → `match-over` event with ELO change
6. Match-over modal: Play Again (rematch) or Leave → back to Lobby

---

## Architecture

### Data layers
- **DB (Postgres)** — source of truth for permanent data: room definitions, player stats, hand history
- **Redis** — live game snapshot (crash recovery) + append-only hand event log per hand
- **Server memory** — active matches map, socket player map, matchmaking queue
- **Client** — React state + AsyncStorage for user identity

### Rooms (permanent in DB)
Three rows in `rooms` table: California 🌴, Paris 🗼, Dublin 🍀. `max_players = 2`. Loaded on server startup via `loadRooms()` — but currently unused for gameplay (matches are dynamic). Kept for hand history FK.

### Matches (dynamic, in memory)
Each match = one PokerGame instance. Created by matchmaker when two players pair. Destroyed after rematch decision. Match UUID used as room UUID in hand logging.

### Hand logging
- Every action during a hand → `server/handLogger.js` → Redis Stream `room:{id}:hand:{uuid}:events`
- Redis snapshot updated on every action → `room:{id}:snapshot`
- On hand end → `flushHandToDb()` bulk-inserts all events to `actions` table, creates `hands` row
- Redis hand key cleared for next hand

### ELO
- Stored in `player_stats` table (`player_id`, `elo`, `matches_played`, `matches_won`)
- Calculated at match end: K=32, standard ELO formula
- Both guests and Google users tracked by `player_id`

---

## Project structure
```
poker/
├── CLAUDE.md
├── package.json            ← root: build + start for Railway
├── server/
│   ├── index.js            ← Express + Socket.IO + match coordination
│   ├── matchmaker.js       ← in-memory queue, ELO calc
│   ├── handLogger.js       ← Redis event log + Postgres flush
│   ├── redis.js            ← ioredis client, snapshot + stream helpers
│   ├── db.js               ← Postgres schema (from generic branch, partially used)
│   ├── .env                ← DATABASE_URL + REDIS_URL (gitignored, never commit)
│   └── game/
│       ├── PokerGame.js
│       ├── Deck.js
│       └── HandEvaluator.js
└── client/
    ├── App.js              ← navigation, socket handlers, GameContext provider
    ├── app.json            ← Expo config (scheme: poker-monkey, SDK 54)
    ├── eas.json            ← EAS build profiles
    ├── .env                ← EXPO_PUBLIC_SERVER_URL (gitignored, commented out by default)
    ├── assets/             ← dk.png, diddy.webp, alfie.png, jazz.png, jungle.png, bananas.png
    └── src/
        ├── config.js           ← SERVER_URL + VERSION
        ├── theme.js            ← color tokens
        ├── context/GameContext.js
        ├── hooks/useSocket.js  ← singleton socket.io-client
        ├── utils/user.js       ← AsyncStorage helpers
        ├── components/
        │   ├── Avatar.jsx, Bananas.jsx, BettingControls.jsx
        │   ├── Card.jsx (deckStyle prop: regular/four-color)
        │   ├── PokerChip.jsx + ChipStack
        │   └── TimerRing.jsx (setInterval, no Reanimated)
        └── screens/
            ├── LoginScreen.jsx
            ├── LobbyScreen.jsx
            └── GameScreen.jsx
```

---

## Socket events
| Event | Direction | Payload |
|---|---|---|
| `enter-lobby` | client→server | `{ playerId }` |
| `find-match` | client→server | `{ playerId, playerName, avatarId }` |
| `cancel-match` | client→server | — |
| `observe` | client→server | `{ matchId }` |
| `unobserve` | client→server | `{ matchId }` |
| `player-action` | client→server | `{ action, amount }` |
| `rematch-vote` | client→server | `{ vote: bool }` |
| `leave-table` | client→server | — |
| `in-queue` | server→client | — |
| `queue-cancelled` | server→client | — |
| `match-found` | server→client | `{ matchId, opponent: { name } }` |
| `match-list` | server→client | `{ matches: [{ id, player1, player2, phase, handCount }] }` |
| `game-state` | server→client | Full state for this player |
| `match-over` | server→client | `{ winnerId, winnerName, eloChange, newElo }` |
| `reset` | server→client | Go back to Lobby |
| `error` | server→client | `{ message }` |

---

## DB schema (key tables)
| Table | Purpose |
|---|---|
| `rooms` | Permanent table definitions (California/Paris/Dublin) |
| `matches` | Completed match records with ELO before/after |
| `player_stats` | ELO, matches played/won per player |
| `hands` | One row per completed hand (room_uuid, hand_uuid, pot, winner) |
| `actions` | Every action in every hand (player, action_type, amount, phase, seq) |
| `users` | Google auth profiles (from generic branch) |

---

## Building an APK
```bash
cd client && eas build --platform android --profile preview
```
EAS project: `coinburst/poker-monkey` (ID: `8b891cf4-46a6-46b7-951b-7cc826e8a4e7`)

---

## Railway services
| Service | Purpose |
|---|---|
| poker | Node server (auto-deploys from main) |
| Postgres | DB — public URL in server/.env |
| Redis | Cache — public URL in server/.env |

Railway API token: in global CLAUDE.md

---

## Troubleshooting

### Socket connects to wrong URL
**Symptom:** `connect_error: websocket error` on physical device  
**Fix:** Restart Metro fully (Ctrl+C + re-run). `r` (JS reload) doesn't re-read `.env`. Physical device always uses prod — make sure `EXPO_PUBLIC_SERVER_URL` is commented out in `client/.env`.

### Google OAuth Error 400: invalid_request
**Symptom:** `Parameter not allowed for this message type: code_challenge_method`  
**Fix:** `usePKCE: false` in `useAuthRequest` options (already applied in LoginScreen).

### DO NOT USE react-native-reanimated
Expo Go SDK 54 bundled native Reanimated doesn't match any installable JS version. `TimerRing` uses `setInterval`. If animations needed, use Reanimated only in EAS builds.

### Emulator OOM
`sed -i '' 's/hw.ramSize=2048/hw.ramSize=4096/' ~/.android/avd/Pixel_8.avd/config.ini`

### Oval background shifts during gameplay
Use `useWindowDimensions()` for oval sizing. Never `onLayout` on `ovalWrap` — fires on every game state change causing thrash.

### npx expo pulls wrong version
Always use `./node_modules/.bin/expo start`, never `npx expo start`.

### Duplicate hole cards on local player seat
Pass `hideCards` prop to `SeatView` for the bottom (local player) slot only.
