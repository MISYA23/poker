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
import TableSelectScreen from './src/screens/TableSelectScreen';
import WaitlistScreen from './src/screens/WaitlistScreen';
import GameScreen from './src/screens/GameScreen';

const Stack = createStackNavigator();

export default function App() {
  const [myId, setMyId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const navigationRef = useNavigationContainerRef();

  // Pending player info (set on onJoin, used when onJoinTable is called)
  const playerRef = useRef(null);

  const emit = useSocket({
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
      playerRef.current = null;
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    },
  });

  // Step 1: auth complete — store player info, enter lobby, go to table select
  const onJoin = useCallback((playerName, avatarId, playerId) => {
    setError(null);
    setTables(null);
    playerRef.current = { playerName, avatarId, playerId };
    emit('enter-lobby', { playerId });
    navigationRef.navigate('TableSelect');
  }, [emit]);

  // Step 2: user picks a table
  const onJoinTable = useCallback((tableId) => {
    const p = playerRef.current;
    if (!p) return;
    setError(null);
    emit('join', { playerId: p.playerId, playerName: p.playerName, avatarId: p.avatarId, tableId });
  }, [emit]);

  const onAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const onLeave = useCallback(() => {
    setMyId(null);
    setGameState(null);
    playerRef.current = null;
    emit('leave-table');
    navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
  }, [emit]);

  return (
    <GameContext.Provider value={{ gameState, myId, error, emit, onJoin, onJoinTable, onAction, onLeave }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="Lobby" component={LobbyScreen} />
              <Stack.Screen name="TableSelect" component={TableSelectScreen} />
              <Stack.Screen name="Waitlist" component={WaitlistScreen} />
              <Stack.Screen name="Game" component={GameScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </GameContext.Provider>
  );
}
