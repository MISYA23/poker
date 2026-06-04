import React, { useState, useCallback } from 'react';
import { useSocket } from './hooks/useSocket.js';
import Lobby from './components/Lobby.jsx';
import WaitlistScreen from './components/WaitlistScreen.jsx';
import GameTable from './components/GameTable.jsx';

export default function App() {
  const [screen, setScreen] = useState('lobby'); // lobby | waitlist | game
  const [myId, setMyId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [deckStyle, setDeckStyle] = useState('regular');

  const emit = useSocket({
    joined: ({ playerId, atTable }) => {
      setMyId(playerId);
      setScreen(atTable ? 'game' : 'waitlist');
      setError(null);
    },
    'game-state': (state) => {
      setGameState(state);
      // Promoted off waitlist
      if (state.atTable && screen === 'waitlist') {
        setScreen('game');
      }
    },
    error: ({ message }) => {
      setError(message);
    },
    reset: () => {
      setScreen('lobby');
      setMyId(null);
      setGameState(null);
      setError(null);
    },
  });

  const handleJoin = useCallback((playerName, avatarId, ds) => {
    setError(null);
    if (ds) setDeckStyle(ds);
    emit('join', { playerName, avatarId });
  }, [emit]);

  const handleAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const handleRematchVote = useCallback((vote) => {
    emit('rematch-vote', { vote });
  }, [emit]);

  const handleLeave = useCallback(() => {
    emit('leave');
    setScreen('lobby');
    setMyId(null);
    setGameState(null);
    setError(null);
  }, [emit]);

  const handleToggleDeckStyle = useCallback(() => {
    setDeckStyle(ds => ds === 'four-color' ? 'regular' : 'four-color');
  }, []);

  const handleAddBot = useCallback(() => emit('add-bot'), [emit]);
  const handleRemoveBot = useCallback(() => emit('remove-bot'), [emit]);
  const handleReset = useCallback(() => {
    fetch('/admin/reset', { method: 'POST' }).then(() => window.location.href = '/');
  }, []);

  if (screen === 'lobby') {
    return <Lobby onJoin={handleJoin} error={error} />;
  }

  if (screen === 'waitlist') {
    return (
      <WaitlistScreen
        gameState={gameState}
        position={gameState?.waitlistPosition || '?'}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <GameTable
      gameState={gameState}
      myId={myId}
      onAction={handleAction}
      onLeave={handleLeave}
      onRematchVote={handleRematchVote}
      deckStyle={deckStyle}
      onToggleDeckStyle={handleToggleDeckStyle}
      onAddBot={handleAddBot}
      onRemoveBot={handleRemoveBot}
      onReset={handleReset}
    />
  );
}
