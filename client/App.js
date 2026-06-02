import 'react-native-gesture-handler';
import React, { useState, useCallback, createContext } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useSocket } from './src/hooks/useSocket';
import LobbyScreen from './src/screens/LobbyScreen';
import WaitlistScreen from './src/screens/WaitlistScreen';
import GameScreen from './src/screens/GameScreen';

export const GameContext = createContext(null);
const Stack = createStackNavigator();

export default function App() {
  const [myId, setMyId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const navigationRef = useNavigationContainerRef();

  const emit = useSocket({
    joined: ({ playerId, atTable }) => {
      setMyId(playerId);
      setError(null);
      navigationRef.navigate(atTable ? 'Game' : 'Waitlist');
    },
    'game-state': (state) => {
      setGameState(state);
      if (state.atTable) {
        navigationRef.navigate('Game');
      }
    },
    error: ({ message }) => setError(message),
    reset: () => {
      setMyId(null);
      setGameState(null);
      setError(null);
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    },
  });

  const onJoin = useCallback((playerName, avatarId) => {
    setError(null);
    emit('join', { playerName, avatarId });
  }, [emit]);

  const onAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const onLeave = useCallback(() => {
    setMyId(null);
    setGameState(null);
    setError(null);
    navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
  }, []);

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
