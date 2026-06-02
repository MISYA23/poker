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
import WaitlistScreen from './src/screens/WaitlistScreen';
import GameScreen from './src/screens/GameScreen';

const Stack = createStackNavigator();

export default function App() {
  const [myId, setMyId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const navigationRef = useNavigationContainerRef();

  // Store pending join info while waiting for lobby-state to get a tableId
  const pendingJoinRef = useRef(null);
  const emitRef = useRef(null);

  const emit = useSocket({
    'lobby-state': ({ tables }) => {
      const pending = pendingJoinRef.current;
      if (!pending || !emitRef.current) return;
      // Find first table with room (playerCount < 2), or any table
      const table = tables?.find(t => (t.playerCount ?? 0) < 2) || tables?.[0];
      if (!table) return; // wait for next lobby-state
      pendingJoinRef.current = null;
      emitRef.current('join', {
        playerId: pending.playerId,
        playerName: pending.playerName,
        avatarId: pending.avatarId,
        tableId: table.id,
      });
    },
    joined: ({ playerId }) => {
      setMyId(playerId);
      setError(null);
      navigationRef.navigate('Game');
    },
    'game-state': (state) => {
      setGameState(state);
      if (state.atTable) navigationRef.navigate('Game');
    },
    error: ({ message }) => setError(message),
    reset: () => {
      setMyId(null);
      setGameState(null);
      setError(null);
      pendingJoinRef.current = null;
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    },
  });

  // Keep emitRef current so lobby-state handler can call it
  emitRef.current = emit;

  const onJoin = useCallback((playerName, avatarId, playerId) => {
    setError(null);
    pendingJoinRef.current = { playerName, avatarId, playerId };
    emit('enter-lobby', { playerId });
  }, [emit]);

  const onAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const onLeave = useCallback(() => {
    setMyId(null);
    setGameState(null);
    setError(null);
    pendingJoinRef.current = null;
    emit('leave-table');
    emit('enter-lobby', { playerId: myId });
    navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
  }, [emit, myId]);

  return (
    <GameContext.Provider value={{ gameState, myId, error, emit, onJoin, onAction, onLeave }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="Lobby" component={LobbyScreen} />
              <Stack.Screen name="Waitlist" component={WaitlistScreen} />
              <Stack.Screen name="Game" component={GameScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </GameContext.Provider>
  );
}
