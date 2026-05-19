import React, { useState, useCallback, useEffect } from 'react';
import { useSocket } from './hooks/useSocket.js';
import SignIn from './components/SignIn.jsx';
import Lobby from './components/Lobby.jsx';
import GameTable from './components/GameTable.jsx';

// ── Session helpers (per-window, not shared across windows) ───────────────────
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('poker_table')) || null; }
  catch { return null; }
}
function saveSession(tableId) {
  sessionStorage.setItem('poker_table', JSON.stringify({ tableId }));
}
function clearSession() {
  sessionStorage.removeItem('poker_table');
}
function getPlayerId() {
  try { return JSON.parse(localStorage.getItem('poker_user') || '{}').playerId || null; }
  catch { return null; }
}

export default function App() {
  const [screen, setScreen] = useState('signin'); // signin | lobby | game
  const [profile, setProfile] = useState(null);   // { name, avatarId }
  const [myId, setMyId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [lobbyTables, setLobbyTables] = useState([]);
  const [activeSeats, setActiveSeats] = useState([]); // tables where player has an active seat
  const [error, setError] = useState(null);
  const [deckStyle, setDeckStyle] = useState('regular');

  const emit = useSocket({
    'lobby-state': ({ tables, activeSeats: seats }) => {
      setLobbyTables(tables || []);
      setActiveSeats(seats || []);
    },
    joined: ({ playerId, tableId }) => {
      setMyId(playerId);
      if (tableId) saveSession(tableId);
      setScreen('game');
      setError(null);
    },
    'rejoin-failed': () => {
      clearSession();
      setActiveSeats([]);
    },
    'game-state': (state) => {
      setGameState(state);
    },
    error: ({ message }) => setError(message),
    reset: () => {
      clearSession();
      setScreen('signin');
      setMyId(null);
      setGameState(null);
      setError(null);
    },
    disconnect: () => {
      setScreen('signin');
      setMyId(null);
      setGameState(null);
      setError(null);
    },
  });

  // Called from SignIn when name+avatar confirmed
  const handleReady = useCallback((name, avatarId) => {
    const playerId = getPlayerId();
    if (!playerId) { setScreen('signin'); return; }
    setProfile({ name, avatarId });
    setError(null);
    emit('enter-lobby', { playerId });
    setScreen('lobby');
  }, [emit]);

  // Called from Lobby when player picks a table
  const handleJoinTable = useCallback((tableId) => {
    if (!profile) return;
    const playerId = getPlayerId();
    if (!playerId) { setScreen('signin'); return; }
    emit('join', {
      playerId,
      playerName: profile.name,
      avatarId: profile.avatarId,
      tableId,
    });
  }, [emit, profile]);

  // Called from Lobby when player clicks "TAKE YOUR SEAT"
  const handleRejoin = useCallback((tableId) => {
    const playerId = getPlayerId();
    if (!playerId) { setScreen('signin'); return; }
    if (!tableId) return;
    emit('rejoin', { playerId, tableId });
  }, [emit]);

  const handleAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const handleRematchVote = useCallback((vote) => {
    emit('rematch-vote', { vote });
  }, [emit]);

  const handleAddBot = useCallback(() => emit('add-bot'), [emit]);
  const handleRemoveBot = useCallback(() => emit('remove-bot'), [emit]);

  const handleLeave = useCallback(() => {
    emit('leave-table');
    clearSession();
    setScreen('lobby');
    setMyId(null);
    setGameState(null);
    setError(null);
    // Refresh active seats
    const playerId = getPlayerId();
    emit('enter-lobby', { playerId });
  }, [emit]);

  const handleLogout = useCallback(() => {
    emit('leave-table');
    clearSession();
    window.google?.accounts.id.disableAutoSelect();
    localStorage.removeItem('poker_user');
    setProfile(null);
    setScreen('signin');
    setMyId(null);
    setGameState(null);
    setError(null);
  }, [emit]);

  if (screen === 'signin') {
    return <SignIn onReady={handleReady} error={error} />;
  }

  if (screen === 'lobby') {
    return (
      <Lobby
        playerName={profile?.name}
        tables={lobbyTables}
        activeSeats={activeSeats}
        onJoinTable={handleJoinTable}
        onRejoin={handleRejoin}
        onLogout={handleLogout}
        error={error}
      />
    );
  }

  return (
    <GameTable
      gameState={gameState}
      myId={myId}
      onAction={handleAction}
      onLeave={handleLeave}
      onLogout={handleLogout}
      onRematchVote={handleRematchVote}
      onAddBot={handleAddBot}
      onRemoveBot={handleRemoveBot}
      deckStyle={deckStyle}
    />
  );
}
