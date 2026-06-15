import 'react-native-gesture-handler';
import { Sentry, initSentry } from './src/sentry';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { GameContext } from './src/context/GameContext';
import { LobbyContext } from './src/context/LobbyContext';
import { useSocket } from './src/hooks/useSocket';
import { clearUser } from './src/utils/user';
import { track, trackScreen } from './src/utils/analytics';
import { SERVER_URL } from './src/config';
import { startMusic, setMusicContext, loadMusicConfig } from './src/audio/music';
import MatchFlowOverlays from './src/components/MatchFlowOverlays';
import LoginScreen   from './src/screens/LoginScreen';
import LobbyScreen   from './src/screens/LobbyScreen';
import GameScreen    from './src/screens/GameScreen';
import ProfileScreen    from './src/screens/ProfileScreen';
import HandReplayScreen   from './src/screens/HandReplayScreen';
import LeaderboardScreen  from './src/screens/LeaderboardScreen';

// Initialize crash reporting as early as possible, before any app code runs.
initSentry();

const Stack = createStackNavigator();

const linking = {
  prefixes: [],
  config: {
    screens: {
      Login: '',
      Lobby: 'lobby',
      Game: 'game',
      Profile: 'profile',
      HandReplay: 'replay',
      Leaderboard: 'leaderboard',
    },
  },
};

function App() {
  const [myId, setMyId]           = useState(null);
  const [gameState, setGameState] = useState(null);
  // Latest live hand-event batch — arrives just before the game-state that
  // reflects it; GameScreen consumes (and clears) it to choreograph beats
  const handEventsRef = useRef(null);
  const [error, setError]         = useState(null);
  const [inQueue, setInQueue]     = useState(false);
  const [matchList, setMatchList]       = useState([]);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [myElo, setMyElo]                   = useState(null);
  const [deckStyle, setDeckStyle]           = useState('regular');
  const [matchOver, setMatchOver]           = useState(null);
  const [myRecentMatches, setMyRecentMatches] = useState([]);
  const [opponentDisconnected, setOpponentDisconnected] = useState(null); // grace deadline ts
  const [playerInfo, setPlayerInfo] = useState(null);
  const [incomingChallenges, setIncomingChallenges] = useState([]); // [{ fromId, fromName, fromAvatarId }]
  const [outgoingChallenges, setOutgoingChallenges] = useState([]); // [{ toId, toName }]
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [uiConfig, setUiConfig] = useState({});

  // Quick Match funnel overlays (see MatchFlowOverlays)
  const [searchOverlay, setSearchOverlay] = useState(null); // null | {status:'searching'} | {status:'found', opponent}
  const [meantime, setMeantime]           = useState(false); // "play a bot while we keep searching" dialog
  const [preMatch, setPreMatch]           = useState(null);  // null | { opponent } — vs countdown before first hand
  const [bustReveal, setBustReveal]       = useState(null);  // null | { winnerId } — bust chip-flight + winner badge window

  const navigationRef = useNavigationContainerRef();
  const matchIdRef    = useRef(null);
  // Current player id, mirrored into a ref so the socket 'connect' handler
  // (bound once at mount) can re-announce identity on every reconnect.
  const playerIdRef   = useRef(null);
  // Socket handlers are bound once at mount (useSocket) — they must read these
  // refs, never the overlay state above.
  const searchRef        = useRef(null);
  const foundDelayRef    = useRef(false); // mid pre-match countdown — hold navigation
  const matchOverTimerRef = useRef(null); // pending match-over reveal delay
  const [route, setRoute] = useState('Login');   // current screen (gates music start)

  const setSearch = useCallback((v) => { searchRef.current = v; setSearchOverlay(v); }, []);

  useEffect(() => {
    loadMusicConfig();   // pull per-interface track config from the server (falls back to defaults)
  }, []);

  // Background music — login screen stays silent; start on first navigation past
  // Login. Navigating implies a user gesture, which also satisfies web autoplay
  // policy. startMusic() is idempotent, so later route changes are no-ops here.
  useEffect(() => {
    if (route !== 'Login') startMusic();
  }, [route]);

  const isObserverRef = useRef(false);
  // True between emitting 'observe' and receiving the first observed game-state.
  // Observers only navigate to Game on that first state — later broadcasts must
  // not yank them back if they've navigated away (Profile, Lobby).
  const pendingObserveRef = useRef(false);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/config/ui`)
      .then(r => r.json())
      .then(setUiConfig)
      .catch(() => {});
  }, []);

  // Keep the player id available to the mount-bound socket handlers below.
  useEffect(() => { playerIdRef.current = playerInfo?.playerId ?? null; }, [playerInfo]);

  const emit = useSocket({
    // Re-establish identity on every (re)connect. Socket.IO hands out a new
    // socket id each time and the server forgets the old one on disconnect; the
    // `session` handshake re-announces us so the server can place us back where
    // we belong (lobby, or re-seated at a live match within its grace window).
    // Without it the server rejects our next action with "Not in lobby" and a
    // brief blip at the table lapses into a forfeit.
    connect:           ()            => { if (playerIdRef.current) emit('session', { playerId: playerIdRef.current }); },
    'in-queue':        ()            => { setInQueue(true); setError(null); },
    'queue-cancelled': ()            => { setInQueue(false); setSearch(null); },
    'match-found':     ({ matchId, opponent, fallback, reconnect }) => {
      if (isObserverRef.current) {
        emit('unobserve', { matchId: matchIdRef.current });
        isObserverRef.current = false;
      }
      pendingObserveRef.current = false;
      setInQueue(false);
      matchIdRef.current = matchId;
      setMatchOver(null);
      setOpponentDisconnected(null);
      setSearch(null);
      setMeantime(false);
      setBustReveal(null);
      if (matchOverTimerRef.current) { clearTimeout(matchOverTimerRef.current); matchOverTimerRef.current = null; }
      // Starting any match voids all challenges (server does the same)
      setIncomingChallenges([]);
      setOutgoingChallenges([]);
      track('StartMatch');
      if (reconnect) {
        // Re-seated at a live match after disconnect — skip countdown, go straight in
        navigationRef.navigate('Game');
        return;
      }
      // Navigate to the table immediately so the countdown appears over the felt.
      // foundDelayRef blocks game-state from re-navigating during the 3s window.
      setPreMatch({ opponent });
      foundDelayRef.current = true;
      navigationRef.navigate('Game');
      setTimeout(() => {
        foundDelayRef.current = false;
        setPreMatch(null);
      }, 3000);
    },
    'match-list':  ({ matches, onlinePlayers: op }) => { setMatchList(matches || []); setOnlinePlayers(op || []); },
    'hand-events': (batch)           => { handEventsRef.current = batch; },
    'game-state':  (state)           => {
      setGameState(state);
      if (state.atTable && !state.gameOver) setMatchOver(null);
      const belongsToUs = state.matchId === matchIdRef.current;
      if (belongsToUs && state.atTable && !foundDelayRef.current) {
        navigationRef.navigate('Game');
      } else if (belongsToUs && state.observing && isObserverRef.current && pendingObserveRef.current) {
        pendingObserveRef.current = false;
        navigationRef.navigate('Game');
      }
    },
    'observe-rejected': ({ matchId }) => {
      if (matchIdRef.current === matchId) {
        matchIdRef.current = null;
        isObserverRef.current = false;
        pendingObserveRef.current = false;
      }
      setError('That match just ended');
    },
    'match-over':  (data)            => {
      setOpponentDisconnected(null);
      setMeantime(false);
      if (data.newElo != null) setMyElo(data.newElo);
      if (matchOverTimerRef.current) clearTimeout(matchOverTimerRef.current);
      if (data.bust) {
        // Natural bust: chip-flight animation (1s) + winner badge hold (2s) before modal
        setBustReveal({ winnerId: data.winnerId });
        matchOverTimerRef.current = setTimeout(() => {
          matchOverTimerRef.current = null;
          setBustReveal(null);
          setMatchOver({ ...data, myVote: null, opponentWantsRematch: null });
        }, 3000);
      } else {
        // Forfeit / disconnect: brief pause, no chip animation
        setBustReveal(null);
        matchOverTimerRef.current = setTimeout(() => {
          matchOverTimerRef.current = null;
          setMatchOver({ ...data, myVote: null, opponentWantsRematch: null });
        }, 1000);
      }
    },
    'rematch-pending': ({ from })    => {
      setMatchOver(prev => prev ? { ...prev, opponentWantsRematch: from } : prev);
    },
    'opponent-disconnected':  ({ deadline }) => setOpponentDisconnected(deadline),
    'opponent-reconnected':   ()             => setOpponentDisconnected(null),
    'challenge-received':     (data)         => setIncomingChallenges(list => [...list.filter(c => c.fromId !== data.fromId), data]),
    'challenge-sent':         (data)         => setOutgoingChallenges(list => [...list.filter(c => c.toId !== data.toId), data]),
    'challenge-declined':     ({ byId })     => setOutgoingChallenges(list => list.filter(c => c.toId !== byId)),
    'challenge-expired':      ({ toId })     => setOutgoingChallenges(list => list.filter(c => c.toId !== toId)),
    'challenge-voided':       ({ otherId })  => {
      setIncomingChallenges(list => list.filter(c => c.fromId !== otherId));
      setOutgoingChallenges(list => list.filter(c => c.toId !== otherId));
    },
    'friend-request':         ()             => setPendingFriendRequests(n => n + 1),
    'friend-accepted':        ()             => {},
    error:         ({ message })     => { setError(message); setSearch(null); },
    reset:         ()                => {
      if (isObserverRef.current) emit('unobserve', { matchId: matchIdRef.current });
      setGameState(null);
      setInQueue(false); setMatchOver(null);
      setOpponentDisconnected(null);
      setSearch(null); setMeantime(false);
      matchIdRef.current = null;
      isObserverRef.current = false;
      pendingObserveRef.current = false;
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
    isObserverRef.current = false;
    pendingObserveRef.current = false;
    emit('logout', {});
    await clearUser();
    setMyId(null);
    setPlayerInfo(null);
    setMyElo(null);
    setInQueue(false);
    setMatchOver(null);
    setGameState(null);
    setIncomingChallenges([]);
    setOutgoingChallenges([]);
    matchIdRef.current = null;
    navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, []);

  const onUpdateProfile = useCallback((name, avatarId) => {
    setPlayerInfo(p => ({ ...p, name, avatarId }));
    // enter-lobby implies leaving any table — profile saves use a neutral event
    emit('refresh-profile', {});
  }, [emit]);

  const onFindMatch = useCallback((playerId) => {
    if (isObserverRef.current) {
      emit('unobserve', { matchId: matchIdRef.current });
      isObserverRef.current = false;
      matchIdRef.current = null;
    }
    pendingObserveRef.current = false;
    setError(null);
    track('PlayMatch', { mode: 'queue' });
    setSearch({ status: 'searching' });
    emit('find-match', { playerId });
  }, [emit, setSearch]);

  const onPlayBot = useCallback((playerId) => {
    if (isObserverRef.current) {
      emit('unobserve', { matchId: matchIdRef.current });
      isObserverRef.current = false;
      matchIdRef.current = null;
    }
    pendingObserveRef.current = false;
    setError(null);
    track('PlayMatch', { mode: 'bot' });
    emit('play-bot', { playerId });
  }, [emit]);

  const onCancelMatch = useCallback(() => {
    emit('cancel-match', {});
    setInQueue(false);
    setSearch(null);
  }, [emit, setSearch]);

  const onDismissMeantime = useCallback(() => setMeantime(false), []);

  const onChallenge = useCallback((toId) => {
    setError(null);
    track('IssueChallenge', { source: 'lobby' });
    emit('challenge-send', { toId });
  }, [emit]);

  const onAcceptChallenge = useCallback((fromId) => {
    setError(null);
    emit('challenge-accept', { fromId });
  }, [emit]);

  const onDeclineChallenge = useCallback((fromId) => {
    emit('challenge-decline', { fromId });
    setIncomingChallenges(list => list.filter(c => c.fromId !== fromId));
  }, [emit]);

  const onWithdrawChallenge = useCallback((toId) => {
    emit('challenge-withdraw', { toId });
    setOutgoingChallenges(list => list.filter(c => c.toId !== toId));
  }, [emit]);

  const onObserve = useCallback((matchId) => {
    matchIdRef.current = matchId;
    isObserverRef.current = true;
    pendingObserveRef.current = true;
    // Navigation happens when the first observed game-state arrives — never
    // jump to a table the server may have already torn down.
    emit('observe', { matchId });
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
    pendingObserveRef.current = false;
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

  // Game/session context — game state, identity, and stable actions. Memoized so
  // lobby broadcasts (match-list, challenges) don't re-render mid-game screens.
  const gameValue = useMemo(() => ({
    gameState, myId, matchOver, opponentDisconnected, handEventsRef,
    playerInfo, deckStyle, setDeckStyle, uiConfig, bustReveal,
    emit, onLogin, onLogout, onUpdateProfile,
    onAction, onLeave, onRematch, navigationRef,
  }), [gameState, myId, matchOver, opponentDisconnected, playerInfo, deckStyle, uiConfig, bustReveal,
       emit, onLogin, onLogout, onUpdateProfile, onAction, onLeave, onRematch]);

  // Lobby context — fast-churning lobby data + lobby-only actions
  const lobbyValue = useMemo(() => ({
    error, inQueue, matchList, onlinePlayers, myElo, myRecentMatches,
    incomingChallenges, outgoingChallenges, pendingFriendRequests, setPendingFriendRequests,
    onChallenge, onAcceptChallenge, onDeclineChallenge, onWithdrawChallenge,
    onFindMatch, onPlayBot, onCancelMatch, onObserve,
  }), [error, inQueue, matchList, onlinePlayers, myElo, myRecentMatches,
       incomingChallenges, outgoingChallenges, pendingFriendRequests,
       onChallenge, onAcceptChallenge, onDeclineChallenge, onWithdrawChallenge,
       onFindMatch, onPlayBot, onCancelMatch, onObserve]);

  return (
    <GameContext.Provider value={gameValue}>
    <LobbyContext.Provider value={lobbyValue}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <NavigationContainer ref={navigationRef} linking={linking}
            onReady={() => { const r = navigationRef.getCurrentRoute()?.name; setRoute(r || 'Login'); setMusicContext(r === 'Game' ? 'game' : 'menu'); trackScreen(r || 'Login'); }}
            onStateChange={() => { const r = navigationRef.getCurrentRoute()?.name; setRoute(r || 'Login'); setMusicContext(r === 'Game' ? 'game' : 'menu'); trackScreen(r || 'Login'); }}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Lobby"   component={LobbyScreen} />
              <Stack.Screen name="Game"    component={GameScreen} />
              <Stack.Screen name="Profile"    component={ProfileScreen} />
              <Stack.Screen name="HandReplay"   component={HandReplayScreen} />
              <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            </Stack.Navigator>
          </NavigationContainer>
          <MatchFlowOverlays
            searchOverlay={searchOverlay}
            meantime={meantime}
            preMatch={preMatch}
            playerInfo={playerInfo}
            myElo={myElo}
            incomingChallenges={incomingChallenges}
            onCancelSearch={onCancelMatch}
            onDismissMeantime={onDismissMeantime}
            onAcceptChallenge={onAcceptChallenge}
            onDeclineChallenge={onDeclineChallenge}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </LobbyContext.Provider>
    </GameContext.Provider>
  );
}

// Wrap so Sentry captures render errors + attaches navigation/touch context.
export default Sentry.wrap(App);
