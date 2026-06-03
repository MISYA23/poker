// In-memory queue of players waiting for a match
const queue = []; // [{ playerId, playerName, avatarId, socketId }]

function enqueue(player) {
  // Replace if already waiting
  const idx = queue.findIndex(p => p.playerId === player.playerId);
  if (idx >= 0) queue.splice(idx, 1);
  queue.push(player);
}

function dequeue(playerId) {
  const idx = queue.findIndex(p => p.playerId === playerId);
  if (idx >= 0) return queue.splice(idx, 1)[0];
  return null;
}

// Returns { p1, p2 } if two players are waiting, otherwise null
function tryPair() {
  if (queue.length < 2) return null;
  return { p1: queue.shift(), p2: queue.shift() };
}

function queueSize() { return queue.length; }

// Standard ELO — K=32
function calcElo(winnerElo, loserElo, K = 32) {
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const winnerGain = Math.round(K * (1 - expected));
  const loserLoss  = Math.round(K * expected);
  return { winnerGain, loserLoss };
}

module.exports = { enqueue, dequeue, tryPair, queueSize, calcElo };
