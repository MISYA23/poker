# Poker Game

Multiplayer Texas Hold'em — React frontend + Node.js/Socket.IO backend.

## Quick Start

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start both (two terminals)
cd server && npm run dev       # http://localhost:3001
cd client && npm run dev       # http://localhost:5173
```

Or from root:
```bash
npm install   # installs concurrently
npm start     # starts both concurrently
```

## How to Play

1. Open http://localhost:5173 on multiple devices/tabs
2. One player creates a room, shares the 5-letter code
3. Others join with the code
4. Host clicks **Start Game**
5. Texas Hold'em — blinds, flop, turn, river, showdown
6. Next hand starts automatically after 5 seconds

## Features

- 2–8 players per room
- Full Texas Hold'em rules (small/big blind, all betting rounds)
- All hand types (Royal Flush → High Card)
- Side pots for all-in situations
- Mobile-first responsive design
- Real-time via Socket.IO

## Config

When creating a room you can set starting chips ($500–$10k) and big blind ($10–$100).
