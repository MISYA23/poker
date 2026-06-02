# Poker Monkey

Multiplayer Texas Hold'em. Live at **https://poker-production-d726.up.railway.app**

---

## Features

- Up to 6 players per table (bots fill empty seats)
- Google SSO or guest play — name/avatar saved across sessions
- Full action log persisted to Postgres (every hand, every action)
- Sequential table & hand numbering
- Real-time via Socket.IO

---

## Running locally

```bash
# Install deps
npm install --prefix server
npm install --prefix client

# Start both servers (random ports chosen automatically)
npm run dev
```

The console will print the client URL — open that in your browser.

---

## Env vars

Create `server/.env`:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
DATABASE_URL=postgresql://...
```

Create `client/.env`:
```
VITE_GOOGLE_CLIENT_ID=...
```

---

## Branches

- `main` — canonical version (heads-up, image avatars)
- `generic` — fork (6-player, emoji avatars, bots, DB persistence)

---

## Deploying

Push to `main`. Railway picks it up and redeploys automatically (~1 min).

Railway env vars needed: `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `DATABASE_URL`
