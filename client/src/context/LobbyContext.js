import { createContext } from 'react';
// Fast-churning lobby data (match list broadcasts, online players, challenges).
// Kept separate from GameContext so mid-game screens don't re-render on lobby traffic.
export const LobbyContext = createContext(null);
