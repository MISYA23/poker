import 'react-native-gesture-handler';
import React, { useState, useCallback, useRef } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { GameContext } from './src/context/GameContext';
import { useSocket } from './src/hooks/useSocket';
import { clearUser } from './src/utils/user';
import LoginScreen   from './src/screens/LoginScreen';
import LobbyScreen   from './src/screens/LobbyScreen';
import GameScreen    from './src/screens/GameScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createStackNavigator();

export default function App() {
  const [myId, setMyId]           = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError]         = useState(null);
  const [inQueue, setInQueue]     = useState(false);
  const [matchList, setMatchList]       = useState([]);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [myElo, setMyElo]         = useState(null);
  const [matchOver, setMatchOver] = useState(null);
  const [playerInfo, setPlayerInfo] = useState(null); // { playerId, name, avatarId }

  const navigationRef = useNavigationContainerRef();
  const matchIdRef    = useRef(null);

  const emit = useSocket({
    'in-queue':        ()            => { setInQueue(true); setError(null); },
    'queue-cancelled': ()            => setInQueue(false),
    'match-found':     ({ matchId }) => {
      setInQueue(false);
      matchIdRef.current = matchId;
      setMatchOver(null);
      navigationRef.navigate('Game');
    },
    'match-list':  ({ matches, onlinePlayers: op }) => { setMatchList(matches || []); setOnlinePlayers(op || []); },
    'game-state':  (state)           => {
      setGameState(state);
      if (state.atTable || state.observing) navigationRef.navigate('Game');
    },
    'match-over':  (data)            => {
      setMatchOver(data);
      if (data.newElo != null) setMyElo(data.newElo);
    },
    error:         ({ message })     => setError(message),
    reset:         ()                => {
      setMyId(null); setGameState(null);
      setInQueue(false); setMatchOver(null);
      matchIdRef.current = null;
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    },
  });

  // Called from LoginScreen after Google or guest auth
  const onLogin = useCallback((name, avatarId, playerId) => {
    setMyId(playerId);
    setPlayerInfo({ name, avatarId, playerId });
    setError(null);
    emit('enter-lobby', { playerId, playerName: name, avatarId });
    navigationRef.navigate('Lobby');
  }, [emit]);

  // Called from Lobby hamburger → Log Out
  const onLogout = useCallback(async () => {
    await clearUser();
    setMyId(null);
    setPlayerInfo(null);
    setMyElo(null);
    setInQueue(false);
    setMatchOver(null);
    setGameState(null);
    matchIdRef.current = null;
    navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, []);

  const onUpdateProfile = useCallback((name, avatarId) => {
    setPlayerInfo(p => ({ ...p, name, avatarId }));
  }, []);

  const onFindMatch = useCallback((name, avatarId, playerId) => {
    setError(null);
    emit('find-match', { playerId, playerName: name, avatarId });
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
      gameState, myId, error, inQueue, matchList, onlinePlayers, myElo, matchOver, playerInfo,
      emit, onLogin, onLogout, onUpdateProfile, onFindMatch, onCancelMatch,
      onObserve, onAction, onLeave, onRematch, navigationRef,
    }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Lobby"   component={LobbyScreen} />
              <Stack.Screen name="Game"    component={GameScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </GameContext.Provider>
  );
}
