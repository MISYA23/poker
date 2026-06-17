// Bot-match action gate — enforces a minimum gap between the last human action
// or deal animation end and when the bot's response is rendered on screen.
//
// Only imported and called from bot-match code paths in App.js.
// Human-to-human logic never touches this module.

const GATE_MS = 500;

let gateUntil = 0;

// Call when the human sends a player-action in a bot match.
export function recordHumanAction() {
  gateUntil = Math.max(gateUntil, Date.now() + GATE_MS);
}

// Call when a bot-match animation lock (deal, hand-end) releases.
export function recordAnimEnd() {
  gateUntil = Math.max(gateUntil, Date.now() + GATE_MS);
}

// Returns ms to wait before applying the next bot game-state (0 if gate is clear).
export function getBotDelay() {
  return Math.max(0, gateUntil - Date.now());
}
