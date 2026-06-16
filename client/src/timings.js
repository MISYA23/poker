// ─── Client-side timing constants ─────────────────────────────────────────────
// All presentation delays in one place. None of these affect game logic —
// the server is always ahead; these only control what the client shows and when.

// Bet collection (street close)
export const BET_HOLD_MS             =   500; // equal chips shown before slide
export const BET_SLIDE_MS            =   500; // chips slide into pot

// Board card reveal
export const STREET_DEAL_PAUSE       =   800; // pause after chips collect, before first board card
export const FLOP_CARD_GAP           =   200; // gap between each of the 3 flop cards
export const ALLIN_CARD_GAP          =  1000; // gap between turn/river cards in an all-in runout
export const ALLIN_INITIAL_PAUSE     =  2500; // dramatic pause before first card in all-in runout

// Hand end
export const FOLD_REVEAL_PAUSE       =   500; // pause after fold before chip flight
export const SHOWDOWN_REVEAL_PAUSE   =  1000; // pause after cards shown before chip flight
export const CHIP_FLIGHT_MS          =  1000; // chip flight duration (winDone fires here)
export const HAND_END_LOCK_MS        =  2000; // blocks next-hand state during hand-end animation
export const DEAL_LOCK_MS            =  1800; // bot-match only: blocks bot actions during deal animation + 1s buffer

// Match end
export const BUST_REVEAL_MS          =  3000; // match ending — cards + winner badge shown before modal
export const FORFEIT_REVEAL_MS       =  2500; // forfeit — chip countdown + flight before modal
export const MATCH_OVER_FALLBACK_MS  =  1000; // generic fallback before modal
// ──────────────────────────────────────────────────────────────────────────────
