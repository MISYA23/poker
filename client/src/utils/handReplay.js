// Shared hand-replay helpers — used by HandReplayScreen (full match replayer)
// and PreviousHandDialog (in-game previous-hand viewer). Events come from
// GET /api/match/:uuid/replay.
//
// Event vocabulary (hand_events v2): hand_start, blind_small, blind_big,
// deal_hole, action, deal_board, showdown, hand_end. One global seq per hand;
// phase = the street the event happened on; amount = chips committed by the
// event; data.pot = running pot after the event.

const money = (n) => `$${(n || 0).toLocaleString()}`;

export function describeEvent(ev) {
  const name = ev.playerName || 'Player';
  const d = ev.data || {};
  switch (ev.type) {
    case 'hand_start':   return `Hand #${d.handNumber || '?'} started`;
    case 'blind_small':  return `${name} posts small blind ${money(ev.amount)}`;
    case 'blind_big':    return `${name} posts big blind ${money(ev.amount)}`;
    case 'deal_hole':    return `${name} dealt hole cards`;
    case 'action': {
      const allIn = d.allIn ? ' (all in)' : '';
      switch (d.action) {
        case 'fold':    return `${name} folds`;
        case 'check':   return `${name} checks`;
        case 'call':    return `${name} calls ${money(ev.amount)}${allIn}`;
        case 'bet':     return `${name} bets ${money(d.to ?? ev.amount)}${allIn}`;
        case 'raise':   return `${name} raises to ${money(d.to)}${allIn}`;
        case 'all-in':  return `${name} is all in (${money(d.to)})`;
        default:        return `${name}: ${d.action || ev.type}`;
      }
    }
    case 'deal_board': {
      const street = d.street || '';
      return `${street.charAt(0).toUpperCase() + street.slice(1)}: ${(d.cards || []).join(' ')}`;
    }
    case 'showdown':
      return `Showdown — ${(d.hands || []).map(h => `${h.name || 'Player'} shows ${(h.cards || []).join(' ')}`).join(', ')}`;
    case 'hand_end': {
      const ws = d.winners || [];
      const who = ws.map(w => w.name || 'Player').join(', ');
      const how = d.endedBy === 'fold' ? ' (opponent folded)'
        : ws[0]?.handName ? ` with ${ws[0].handName}` : '';
      return `${who} wins ${money(d.pot)}${how}`;
    }
    default: return ev.type;
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
  let communityCards = [];
  const players = {};
  let pot = 0;

  for (let i = 0; i <= eventIdx; i++) {
    const ev = events[i];
    if (!ev) break;
    const d = ev.data || {};

    switch (ev.type) {
      case 'hand_start':
        (d.players || []).forEach(p => {
          players[p.id] = { name: p.name, chips: p.chips, holeCards: [], lastAction: '' };
        });
        break;

      case 'blind_small':
      case 'blind_big':
        pot = d.pot ?? pot + (ev.amount || 0);
        if (players[ev.playerId]) {
          players[ev.playerId].chips -= ev.amount || 0;
          players[ev.playerId].lastAction = ev.type === 'blind_small' ? 'SB' : 'BB';
        }
        break;

      case 'deal_hole':
        if (!players[ev.playerId]) players[ev.playerId] = { name: ev.playerName, chips: 0, holeCards: [], lastAction: '' };
        players[ev.playerId].holeCards = (d.cards || []).map(parseCard).filter(Boolean);
        break;

      case 'action':
        pot = d.pot ?? pot + (ev.amount || 0);
        if (players[ev.playerId]) {
          players[ev.playerId].chips -= ev.amount || 0;
          players[ev.playerId].lastAction = d.action || '';
        }
        break;

      case 'deal_board':
        communityCards = (d.allCards || []).map(parseCard).filter(Boolean);
        break;

      case 'hand_end':
        (d.winners || []).forEach(w => {
          if (players[w.playerId]) {
            players[w.playerId].chips += w.amount || 0;
            players[w.playerId].lastAction = `wins ${money(w.amount)}`;
          }
        });
        pot = 0;
        break;
    }
  }

  return { communityCards, players: Object.values(players), pot };
}
