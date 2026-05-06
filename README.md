# Poker

Multiplayer Texas Hold'em. Live at **https://poker-production-d726.up.railway.app**

---

## Running locally

```bash
cd server && npm install
cd ../client && npm install

# Two terminals:
cd server && npm run dev     # http://localhost:3843
cd client && npm run dev     # http://localhost:5843  ← open this
```

Ports are fixed at **5843** (client) and **3843** (server) to avoid conflicts.

---

## Resetting the game

Go to **/reset** in the browser. Wipes all players, clears the table, sends everyone back to the lobby instantly.

The Reset button in the top-right of the game does the same thing.

---

## Deploying

Push to `main`. Railway picks it up and redeploys automatically (~1 min).
