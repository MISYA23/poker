// Slumbot API client — https://slumbot.com
// Free public HTTP API, no auth. Heads-up NLHE, blinds 50/100, stacks reset to 20000 each hand.
//
// Protocol:
//   POST /api/new_hand {}                  → { token, hole_cards, board, action, client_pos }
//   POST /api/act { token, incr }          → same shape; at hand end adds bot_hole_cards, winnings
//
// Action string encoding: 'f' fold, 'k' check, 'c' call, 'bN' bet/raise TO N total on that
// street. Streets separated by '/'. client_pos 0 = we are the big blind (Slumbot is SB and
// acts first preflop); postflop the BB acts first.

const SLUMBOT_URL = 'https://slumbot.com/api';
const SMALL_BLIND = 50;
const BIG_BLIND = 100;
const STARTING_STACK = 20000;
const STREETS = ['preflop', 'flop', 'turn', 'river'];

async function slumbotRequest(endpoint, body) {
  const res = await fetch(`${SLUMBOT_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slumbot ${endpoint} HTTP ${res.status}`);
  const data = await res.json();
  if (data.error_msg) throw new Error(`Slumbot ${endpoint}: ${data.error_msg}`);
  return data;
}

// Start a new hand. Pass the token from a previous hand to keep session stats continuous.
function newHand(token) {
  return slumbotRequest('new_hand', token ? { token } : {});
}

// Send our action ('f' | 'k' | 'c' | 'bN') and get the updated state, including any
// Slumbot actions taken in response.
function act(token, incr) {
  return slumbotRequest('act', { token, incr });
}

// Parse a full action string into a structured game state. clientPos 0 means we're BB.
// Returns per-action attribution (who did what on which street) plus pot and street totals.
function parseAction(actionStr, clientPos) {
  const clientIsBB = clientPos === 0;
  // streetCommit[player] = chips committed by that player on the current street
  const commit = { sb: SMALL_BLIND, bb: BIG_BLIND };
  let pot = 0; // completed streets only; current street adds commit.sb + commit.bb
  let streetIdx = 0;
  // Preflop the SB acts first; postflop the BB acts first.
  let turn = 'sb';
  const actions = [];

  const streets = actionStr.split('/');
  for (let s = 0; s < streets.length; s++) {
    if (s > 0) {
      pot += commit.sb + commit.bb;
      commit.sb = 0;
      commit.bb = 0;
      streetIdx = s;
      turn = 'bb';
    }
    const tokens = streets[s].match(/b\d+|[fkc]/g) || [];
    for (const tok of tokens) {
      const actor = turn;
      const opponent = actor === 'sb' ? 'bb' : 'sb';
      let play;
      if (tok === 'f') {
        play = { type: 'fold' };
      } else if (tok === 'k') {
        play = { type: 'check' };
      } else if (tok === 'c') {
        play = { type: 'call', amount: commit[opponent] - commit[actor] };
        commit[actor] = commit[opponent];
      } else {
        const to = parseInt(tok.slice(1), 10);
        // Preflop the big blind always counts as a live bet, so any bN is a raise.
        play = { type: s === 0 || commit[opponent] > 0 ? 'raise' : 'bet', to };
        commit[actor] = to;
      }
      actions.push({
        street: STREETS[streetIdx],
        actor: (actor === 'bb') === clientIsBB ? 'client' : 'slumbot',
        ...play,
        potAfter: pot + commit.sb + commit.bb,
      });
      turn = opponent;
    }
  }

  return {
    actions,
    street: STREETS[streetIdx],
    pot: pot + commit.sb + commit.bb,
    toCall: Math.abs(commit.sb - commit.bb),
    clientStack: STARTING_STACK - (clientIsBB ? commit.bb : commit.sb) - pot / 2,
  };
}

module.exports = { newHand, act, parseAction, SMALL_BLIND, BIG_BLIND, STARTING_STACK };
