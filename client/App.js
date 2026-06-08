import 'react-native-gesture-handler';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { GameContext } from './src/context/GameContext';
import { useSocket } from './src/hooks/useSocket';
import { clearUser } from './src/utils/user';
import { SERVER_URL } from './src/config';
import LoginScreen   from './src/screens/LoginScreen';
import LobbyScreen   from './src/screens/LobbyScreen';
import GameScreen    from './src/screens/GameScreen';
import ProfileScreen    from './src/screens/ProfileScreen';
import HandReplayScreen   from './src/screens/HandReplayScreen';
import LeaderboardScreen  from './src/screens/LeaderboardScreen';

const Stack = createStackNavigator();

export default function App() {
  const [myId, setMyId]           = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError]         = useState(null);
  const [inQueue, setInQueue]     = useState(false);
  const [matchList, setMatchList]       = useState([]);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [myElo, setMyElo]                   = useState(null);
  const [deckStyle, setDeckStyle]           = useState('regular');
  const [matchOver, setMatchOver]           = useState(null);
  const [myRecentMatches, setMyRecentMatches] = useState([]);
  const [opponentDisconnected, setOpponentDisconnected] = useState(null);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [incomingChallenge, setIncomingChallenge] = useState(null); // { fromId, fromName, fromAvatarId }
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [uiConfig, setUiConfig] = useState({});

  const navigationRef = useNavigationContainerRef();
  const matchIdRef    = useRef(null);
  const isObserverRef = useRef(false);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/config/ui`)
      .then(r => r.json())
      .then(setUiConfig)
      .catch(() => {});
  }, []);

  const emit = useSocket({
    'in-queue':        ()            => { setInQueue(true); setError(null); },
    'queue-cancelled': ()            => setInQueue(false),
    'match-found':     ({ matchId }) => {
      if (isObserverRef.current) {
        emit('unobserve', { matchId: matchIdRef.current });
        isObserverRef.current = false;
      }
      setInQueue(false);
      matchIdRef.current = matchId;
      setMatchOver(null);
      setOpponentDisconnected(null);
      navigationRef.navigate('Game');
    },
    'match-list':  ({ matches, onlinePlayers: op }) => { setMatchList(matches || []); setOnlinePlayers(op || []); },
    'game-state':  (state)           => {
      setGameState(state);
      if (state.atTable && !state.gameOver) setMatchOver(null);
      const belongsToUs = state.matchId === matchIdRef.current;
      if (belongsToUs && (state.atTable || (state.observing && isObserverRef.current))) {
        navigationRef.navigate('Game');
      }
    },
    'match-over':  (data)            => {
      setMatchOver({ ...data, myVote: null, opponentWantsRematch: null });
      if (data.newElo != null) setMyElo(data.newElo);
    },
    'rematch-pending': ({ from })    => {
      setMatchOver(prev => prev ? { ...prev, opponentWantsRematch: from } : prev);
    },
    'opponent-disconnected':  ({ deadline }) => setOpponentDisconnected(deadline),
    'opponent-reconnected':   ()             => setOpponentDisconnected(null),
    'challenge-received':     (data)         => setIncomingChallenge(data),
    'challenge-declined':     ()             => setIncomingChallenge(null),
    'challenge-expired':      ()             => {},
    'friend-request':         ()             => setPendingFriendRequests(n => n + 1),
    'friend-accepted':        ()             => {},
    error:         ({ message })     => setError(message),
    reset:         ()                => {
      if (isObserverRef.current) emit('unobserve', { matchId: matchIdRef.current });
      setGameState(null);
      setInQueue(false); setMatchOver(null);
      setOpponentDisconnected(null);
      matchIdRef.current = null;
      isObserverRef.current = false;
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    },
  });

  // Called from LoginScreen after Google or guest auth
  const onLogin = useCallback((name, avatarId, playerId) => {
    setMyId(playerId);
    setPlayerInfo({ name, avatarId, playerId });
    setError(null);
    emit('enter-lobby', { playerId });
    // Fetch profile + pending friend request count on login
    fetch(`${SERVER_URL}/api/player/${playerId}/profile`)
      .then(r => r.json())
      .then(d => { setMyRecentMatches(d.history?.slice(0, 3) || []); if (d.stats?.elo) setMyElo(d.stats.elo); })
      .catch(() => {});
    fetch(`${SERVER_URL}/api/friends/${playerId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPendingFriendRequests(d.filter(f => f.status === 'pending' && !f.isRequester).length); })
      .catch(() => {});
    navigationRef.navigate('Lobby');
  }, [emit]);

  // Called from Lobby hamburger → Log Out
  const onLogout = useCallback(async () => {
    if (isObserverRef.current) emit('unobserve', { matchId: matchIdRef.current });
    emit('logout', {});
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
    setPlayerInfo(p => {
      const updated = { ...p, name, avatarId };
      emit('enter-lobby', { playerId: updated.playerId });
      return updated;
    });
  }, [emit]);

  const onFindMatch = useCallback((playerId) => {
    if (isObserverRef.current) {
      emit('unobserve', { matchId: matchIdRef.current });
      isObserverRef.current = false;
      matchIdRef.current = null;
    }
    setError(null);
    emit('find-match', { playerId });
  }, [emit]);

  const onCancelMatch = useCallback(() => {
    emit('cancel-match', {});
    setInQueue(false);
  }, [emit]);

  const onObserve = useCallback((matchId) => {
    matchIdRef.current = matchId;
    isObserverRef.current = true;
    emit('observe', { matchId });
    navigationRef.navigate('Game');
  }, [emit]);

  const onAction = useCallback((action, amount) => {
    emit('player-action', { action, amount });
  }, [emit]);

  const onLeave = useCallback(() => {
    if (isObserverRef.current) {
      emit('unobserve', { matchId: matchIdRef.current });
    } else {
      emit('leave-table', {});
    }
    isObserverRef.current = false;
    setGameState(null); setMatchOver(null);
    matchIdRef.current = null;
    navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
  }, [emit]);

  const onRematch = useCallback((vote) => {
    emit('rematch-vote', { vote });
    if (vote) {
      setMatchOver(prev => prev ? { ...prev, myVote: true } : prev);
    } else {
      setGameState(null); setMatchOver(null);
      matchIdRef.current = null;
      navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
    }
  }, [emit]);

  return (
    <GameContext.Provider value={{
      gameState, myId, error, inQueue, matchList, onlinePlayers, myElo, matchOver,
      playerInfo, myRecentMatches, deckStyle, setDeckStyle, opponentDisconnected,
      incomingChallenge, setIncomingChallenge, pendingFriendRequests, setPendingFriendRequests,
      uiConfig, emit, onLogin, onLogout, onUpdateProfile, onFindMatch, onCancelMatch,
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
              <Stack.Screen name="Profile"    component={ProfileScreen} />
              <Stack.Screen name="HandReplay"   component={HandReplayScreen} />
              <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </GameContext.Provider>
  );
}
