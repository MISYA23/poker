# Poker Monkey — Claude Context

## What this is
1v1 Texas Hold'em matchmaking app (chess.com style). Players queue up, get paired, play heads-up NL Hold'em, ELO rating updates after each match. Full hand history stored in Postgres. Real-time via Socket.IO.

**Live:** https://poker-production-d726.up.railway.app  
**Repo:** https://github.com/briandanilo/poker.git  
**Current version:** v4.2 — bump `VERSION` in `client/src/config.js` on **every single commit**

---

## Stack
- **Server:** Node/Express + Socket.IO (`server/index.js`) + pg + ioredis
- **Client:** React Native (Expo SDK 54) — `client/` — Android, iOS, web
- **DB:** Railway Postgres
- **Cache:** Railway Redis — live game snapshot + hand event log per hand
- **Deploy:** Railway — auto-deploys on push to `main`

---

## Dev workflow

### Always use prod server
Client always connects to `https://poker-production-d726.up.railway.app` by default.

**`client/.env`** (gitignored):
```
# Uncomment for emulator-only local dev:
# EXPO_PUBLIC_SERVER_URL=http://localhost:3843
```

**`server/.env`** (gitignored):
```
DATABASE_URL=postgresql://...@shortline.proxy.rlwy.net:35104/railway
REDIS_URL=redis://default:...@acela.proxy.rlwy.net:44840
```

### Run local server
```bash
cd server && node index.js   # port 3843
```

### Run Expo
```bash
cd client && ./node_modules/.bin/expo start
```
⚠️ Always use `./node_modules/.bin/expo`, never `npx expo` (pulls wrong version).

Press `a` for Android emulator, `w` for web, scan QR for physical device.

### Android emulator
```bash
~/Library/Android/sdk/emulator/emulator -avd Pixel_8 -no-audio -no-boot-anim -gpu host &
```
- Pixel 8 AVD, API 37, **must have 4GB RAM** (`hw.ramSize=4096` in `~/.android/avd/Pixel_8.avd/config.ini`)
- Kill Metro only: `lsof -ti:8081 | xargs kill -9` — never `pkill -f expo`

### Deploy
```bash
git add -A && git commit -m "vX.Y: description" && git push origin main
```

---

## Screen flow
```
LoginScreen → LobbyScreen → GameScreen
                          ↳ ProfileScreen (from hamburger on either screen)
                          ↳ HandReplayScreen (from ProfileScreen match history)
```

- **LoginScreen** — Google Sign In (mobile only) + guest (name + avatar + Join). Auto-login from AsyncStorage.
- **LobbyScreen** — "Hi {name}!", dashboard cards (recent games, friends placeholder, leaderboard placeholder), PLAY! button, Active Tables list, Players Online Now list
- **GameScreen** — felt table, opponent pod + my pod, cards extending toward table, community cards, pot, betting controls, match-over modal with ELO + rematch
- **ProfileScreen** — username/avatar editor, 4-color deck toggle, match history list (clickable)
- **HandReplayScreen** — hand tabs, event log, ⏮◀▶⏭ controls to step through every action

Navigation: `@react-navigation/stack`, `headerShown: false`, `fade` animation.

---

## Matchmaking flow
1. Player hits PLAY! → `find-match` socket event
2. If opponent waiting → instant pair → `match-found` → both navigate to GameScreen
3. If no opponent → `in-queue` → spinner + Cancel
4. Game plays out (hand events logged to Redis → flushed to Postgres at hand end)
5. One player busted → `match-over` event with ELO change
6. Match-over modal: Play Again (rematch as new match) or Leave → Lobby

**Rematch** = brand new match with `previous_match_id` pointing to the match it came from. Two rematches = three separate history entries.

---

## Architecture

### Data layers
| Layer | What lives there |
|---|---|
| **Postgres** | Players, matches, hands, hand events, ELO — permanent |
| **Redis** | Live game snapshot (crash recovery) + append-only hand event log |
| **Server memory** | Active matches Map, socket→player Map, matchmaking queue |
| **AsyncStorage** | Player UUID + display name + avatar (persists across sessions on same device) |

### DB schema
```
players       — id TEXT PK, display_name, avatar_id, is_guest, created_at, last_seen_at
player_stats  — player_id FK, elo, matches_played, matches_won
matches       — id, uuid, player1_id FK, player2_id FK, status, winner_id FK,
                elo_before/after for each, previous_match_id FK (null = first match)
hands         — id, match_id FK, hand_uuid, hand_number, pot, community_cards, winner_id FK, winning_hand
hand_events   — id, hand_id FK, sequence_num, event_type, player_id FK, amount, phase, data JSONB
```

### Identity model
- **UUID is the PK** — never use display_name as a key or FK
- **Google users**: UUID = `g_<google_sub>` — permanent across devices
- **Guest users**: UUID = random, stored in AsyncStorage — persists on same device/browser, lost on cache clear
- **display_name** is mutable — always join `players` table to resolve names for display

### Hand logging
1. Every action → `server/handLogger.js` → appended to Redis Stream `room:{matchId}:hand:{uuid}:events`
2. Redis snapshot updated on every action → `room:{matchId}:snapshot`
3. On hand end → `flushHandToDb()` bulk-inserts all events into `hand_events`, creates `hands` row
4. Redis hand key cleared for next hand

### ELO
- K=32, standard formula
- Written to `player_stats` at match end
- Guest and Google users both tracked by UUID

---

## Project structure
```
poker/
├── CLAUDE.md
├── package.json            ← root: build + start for Railway
├── server/
│   ├── index.js            ← Express + Socket.IO + matchmaking + game coordination
│   ├── matchmaker.js       ← in-memory queue, ELO calc
│   ├── handLogger.js       ← Redis event log + Postgres flush
│   ├── redis.js            ← ioredis client, snapshot + stream helpers
│   ├── .env                ← DATABASE_URL + REDIS_URL (gitignored)
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
        ├── config.js           ← SERVER_URL + VERSION (bump on every commit!)
        ├── theme.js            ← color tokens
        ├── context/GameContext.js
        ├── hooks/useSocket.js  ← singleton socket.io-client
        ├── utils/user.js       ← AsyncStorage helpers
        ├── components/
        │   ├── Avatar.jsx, Bananas.jsx, BettingControls.jsx
        │   ├── Card.jsx (deckStyle prop: regular/four-color)
        │   └── PokerChip.jsx + ChipStack
        └── screens/
            ├── LoginScreen.jsx
            ├── LobbyScreen.jsx
            ├── GameScreen.jsx
            ├── ProfileScreen.jsx
            └── HandReplayScreen.jsx
```

---

## Socket events
| Event | Direction | Payload |
|---|---|---|
| `enter-lobby` | client→server | `{ playerId, playerName, avatarId }` |
| `find-match` | client→server | `{ playerId, playerName, avatarId }` |
| `cancel-match` | client→server | — |
| `observe` | client→server | `{ matchId }` |
| `unobserve` | client→server | `{ matchId }` |
| `player-action` | client→server | `{ action, amount }` |
| `rematch-vote` | client→server | `{ vote: bool }` |
| `leave-table` | client→server | — |
| `logout` | client→server | — |
| `in-queue` | server→client | — |
| `queue-cancelled` | server→client | — |
| `match-found` | server→client | `{ matchId, opponent: { name } }` |
| `match-list` | server→client | `{ matches: [...], onlinePlayers: [...] }` |
| `game-state` | server→client | Full state for this player |
| `match-over` | server→client | `{ winnerId, winnerName, eloChange, newElo }` |
| `rematch-pending` | server→client | `{ from: playerName }` |
| `reset` | server→client | Go back to Lobby |
| `error` | server→client | `{ message }` |

---

## HTTP routes
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Health check |
| GET | `/health` | Active matches, player counts |
| GET | `/api/player/:id/profile` | Stats + match history (joins players table for names) |
| GET | `/api/match/:uuid/replay` | All hands + events for a match (for replayer) |
| POST | `/api/player/guest` | Upsert guest player into players table |
| POST | `/auth/google` | Google token → upsert player, return playerId |
| POST | `/admin/reset` | Wipe all in-memory match state, emit reset to all clients |

---

## Railway services
| Service | Purpose |
|---|---|
| poker | Node server (auto-deploys from main) |
| Postgres | DB — public URL in server/.env |
| Redis | Cache — public URL in server/.env |

---

## Known bugs / watchlist
- **Observer leak**: navigating away from observed game doesn't emit `unobserve`. Server keeps sending `game-state` to the stale socket which triggers navigation back to GameScreen. Fix: emit `unobserve` on lobby navigation.

---

## Troubleshooting

### Socket connects to wrong URL on physical device
`EXPO_PUBLIC_SERVER_URL` uses `localhost` which only works in emulator (rewritten to `10.0.2.2`). Physical device should use prod — keep `.env` commented out.

### Metro cache stale after .env change
`r` (reload) doesn't re-read `.env`. Must fully restart: `Ctrl+C` then `./node_modules/.bin/expo start --clear`

### DO NOT USE react-native-reanimated
Expo Go SDK 54 bundled native Reanimated causes `TurboModule installTurboModule` crash. `TimerRing` uses `setInterval` instead.

### Emulator OOM
`sed -i '' 's/hw.ramSize=2048/hw.ramSize=4096/' ~/.android/avd/Pixel_8.avd/config.ini`

### Hand history shows "No hand history"
Means the hand flush to Postgres failed (usually FK constraint because player wasn't in `players` table yet). Fixed in v3.7 — `ensurePlayers()` runs before any inserts.

### VERSION not updating on screen
The actual `config.js` file must be edited — bumping in the commit message only is not enough. Always edit `export const VERSION = 'vX.Y'` in the file.
