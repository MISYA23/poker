# Poker Game

Multiplayer Texas Hold'em — React + Vite frontend, Node.js/Socket.IO backend.

**Live:** https://poker-production-d726.up.railway.app

---

## Local Dev

```bash
# Install dependencies
cd server && npm install && cd ..
cd client && npm install && cd ..

# Start both servers (two terminals)
cd server && npm run dev     # Express + Socket.IO → http://localhost:3843
cd client && npm run dev     # Vite dev server    → http://localhost:5843
```

Or from root (starts both together):
```bash
npm install
npm start
```

Open **http://localhost:5843** in your browser.

> Ports: client **5843**, server **3843** — hardcoded to avoid conflicts with other local projects.

---

## Deploy

Deployed on [Railway](https://railway.app). Every push to `main` triggers an automatic redeploy.

Railway runs:
```bash
npm run build   # installs deps + builds React app into client/dist
npm start       # starts Express, which serves the built client + Socket.IO
```

No separate client service needed — Express serves the static build and handles WebSocket connections on the same port.

---

## How to Play

1. Open the live URL or local dev server
2. Enter your name and hit **Join**
3. Share the link with friends — up to 9 players per table, overflow goes to a waitlist
4. The game auto-starts once 2+ players are seated
5. Standard Texas Hold'em: blinds → pre-flop → flop → turn → river → showdown
6. Next hand starts automatically after 5 seconds

---

## Features

- Up to 9 players per table with automatic waitlist
- Full Texas Hold'em rules (small/big blind, all betting rounds)
- All hand types ranked (Royal Flush → High Card)
- Side pots for all-in situations
- SVG poker chips (red $10, green $25, black $100) displayed on player bets
- Mobile-first responsive design
- Real-time via Socket.IO

---

## Project Structure

```
poker-game/
├── client/               # React + Vite frontend
│   └── src/
│       ├── components/   # GameTable, PlayerSeat, Card, PokerChip, …
│       └── hooks/        # useSocket.js
├── server/               # Express + Socket.IO backend
│   └── game/             # Deck, HandEvaluator, PokerGame logic
└── package.json          # root: build + start scripts for Railway
```
