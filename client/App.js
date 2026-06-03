import 'react-native-gesture-handler';
import React, { useState, useCallback, useRef } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { GameContext } from './src/context/GameContext';
import { useSocket } from './src/hooks/useSocket';
import LobbyScreen from './src/screens/LobbyScreen';
import GameScreen from './src/screens/GameScreen';

const Stack = createStackNavigator();

export default function App() {
  const [myId, setMyId]           = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError]         = useState(null);
  const [inQueue, setInQueue]     = useState(false);
  const [matchList, setMatchList] = useState([]);
  const [myElo, setMyElo]         = useState(null);
  const [matchOver, setMatchOver] = useState(null);

  const navigationRef = useNavigationContainerRef();
  const playerRef     = useRef(null);
  const matchIdRef    = useRef(null);

  const emit = useSocket({
    'in-queue':        ()               => { setInQueue(true); setError(null); },
    'queue-cancelled': ()               => setInQueue(false),
    'match-found':     ({ matchId })    => {
      setInQueue(false);
      matchIdRef.current = matchId;
      setMatchOver(null);
      navigationRef.navigate('Game');
    },
    'match-list':      ({ matches })    => setMatchList(matches || []),
    'game-state':      (state)          => {
      setGameState(state);
      if (state.atTable || state.observing) navigationRef.navigate('Game');
    },
    'match-over':      (data)           => {
      setMatchOver(data);
      if (data.newElo != null) setMyElo(data.newElo);
    },
    error:             ({ message })    => setError(message),
    reset:             ()               => {
      setMyId(null); setGameState(null);
      setInQueue(false); setMatchOver(null);
      matchIdRef.current = null; playerRef.current = null;
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    },
  });

  const onFindMatch = useCallback((playerName, avatarId, playerId) => {
    setError(null);
    setMyId(playerId);
    playerRef.current = { playerId, playerName, avatarId };
    emit('enter-lobby', { playerId });
    emit('find-match', { playerId, playerName, avatarId });
  }, [emit]);

  const onCancelMatch = useCallback(() => {
    emit('cancel-match', {});
    setInQueue(false);
  }, [emit]);

  const onObserve = useCallback((matchId) => {
    matchIdRef.current = matchId;
    emit('observe', { matchId });
    navigationRef.navigate('Game');
  }, [emit]);

  const onAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const onLeave = useCallback(() => {
    emit('leave-table', {});
    setMyId(null); setGameState(null); setMatchOver(null);
    matchIdRef.current = null;
    navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
  }, [emit]);

  const onRematch = useCallback((vote) => {
    emit('rematch-vote', { vote });
    if (!vote) {
      setGameState(null); setMatchOver(null);
      matchIdRef.current = null;
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    }
  }, [emit]);

  return (
    <GameContext.Provider value={{
      gameState, myId, error, inQueue, matchList, myElo, matchOver,
      emit, onFindMatch, onCancelMatch, onObserve, onAction, onLeave, onRematch,
    }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="Lobby" component={LobbyScreen} />
              <Stack.Screen name="Game"  component={GameScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </GameContext.Provider>
  );
}
