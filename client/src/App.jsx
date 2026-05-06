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

  const handleJoin = useCallback((playerName) => {
    setError(null);
    emit('join', { playerName });
  }, [emit]);

  const handleAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const handleLeave = useCallback(() => {
    setScreen('lobby');
    setMyId(null);
    setGameState(null);
    setError(null);
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
    />
  );
}
