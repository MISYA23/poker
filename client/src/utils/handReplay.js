// Shared hand-replay helpers — used by HandReplayScreen (full match replayer)
// and PreviousHandDialog (in-game previous-hand viewer). Events come from
// GET /api/match/:uuid/replay.

export function describeEvent(ev) {
  const name = ev.playerName || 'Player';
  const amt  = ev.amount ? ` $${ev.amount.toLocaleString()}` : '';
  switch (ev.type) {
    case 'hand_start':   return `Hand started`;
    case 'deal':         return `${name} dealt hole cards`;
    case 'blind_small':  return `${name} posts small blind${amt}`;
    case 'blind_big':    return `${name} posts big blind${amt}`;
    case 'action': {
      const d = ev.data || {};
      switch (d.action || ev.type) {
        case 'fold':    return `${name} folds`;
        case 'check':   return `${name} checks`;
        case 'call':    return `${name} calls${amt}`;
        case 'bet':     return `${name} bets${amt}`;
        case 'raise':   return `${name} raises to${amt}`;
        case 'all-in':  return `${name} is all in`;
        default:        return `${name}: ${d.action || ev.type}${amt}`;
      }
    }
    case 'community': {
      const cards = ev.data?.cards || [];
      const phase = ev.phase || ev.data?.phase || '';
      return `${phase.charAt(0).toUpperCase() + phase.slice(1)}: ${cards.join(' ')}`;
    }
    case 'showdown':     return `Showdown`;
    default:             return ev.type;
  }
}

export function parseCard(str) {
  if (!str || str.length < 2) return null;
  const rank = str.slice(0, -1);
  const suit = str.slice(-1).toLowerCase();
  return { rank, suit };
}

// Replay the event log up to (and including) eventIdx into a visual table state.
export function buildReplayState(events, eventIdx) {
  const communityCards = [];
  const players = {};
  let pot = 0;

  for (let i = 0; i <= eventIdx; i++) {
    const ev = events[i];
    if (!ev) break;
    const d = ev.data || {};

    if (ev.type === 'hand_start') {
      (d.players || []).forEach(p => {
        players[p.id] = { name: p.name, chips: p.chips, holeCards: [], lastAction: '' };
      });
    }
    if (ev.type === 'deal' && d.playerId) {
      if (!players[d.playerId]) players[d.playerId] = { name: d.playerName, chips: 0, holeCards: [], lastAction: '' };
      players[d.playerId].holeCards = (d.cards || []).map(parseCard).filter(Boolean);
    }
    if (ev.type === 'blind_small' || ev.type === 'blind_big') {
      pot += ev.amount || 0;
    }
    if (ev.type === 'action') {
      const action = d.action || '';
      if (ev.playerId && players[ev.playerId]) {
        players[ev.playerId].lastAction = action;
      }
      if (['call','raise','bet','all-in'].includes(action)) pot += ev.amount || 0;
    }
    if (ev.type === 'community') {
      (d.cards || []).forEach(c => communityCards.push(parseCard(c)));
    }
  }

  return { communityCards, players: Object.values(players), pot };
}
