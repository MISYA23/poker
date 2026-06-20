import 'react-native-gesture-handler';
import { Sentry, initSentry } from './src/sentry';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { GameContext } from './src/context/GameContext';
import { LobbyContext } from './src/context/LobbyContext';
import { useSocket } from './src/hooks/useSocket';
import { clearUser } from './src/utils/user';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track, trackScreen } from './src/utils/analytics';
import { SERVER_URL } from './src/config';
import { startMusic, setMusicContext, loadMusicConfig, setMusicMuted } from './src/audio/music';
import { setSfxEnabled } from './src/audio/sfx';
import { HAND_END_MAX_MS, BUST_REVEAL_MS, FORFEIT_REVEAL_MS, MATCH_OVER_FALLBACK_MS } from './src/timings';
import MatchFlowOverlays from './src/components/MatchFlowOverlays';
import LoginScreen   from './src/screens/LoginScreen';
import LobbyScreen   from './src/screens/LobbyScreen';
import GameScreen    from './src/screens/GameScreen';
import ProfileScreen    from './src/screens/ProfileScreen';
import HandReplayScreen   from './src/screens/HandReplayScreen';
import LeaderboardScreen  from './src/screens/LeaderboardScreen';
import AdLandingScreen   from './src/screens/AdLandingScreen';

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
      AdLanding: 'ad',
    },
  },
};

function App() {
  const [myId, setMyId]           = useState(null);
  const [gameState, setGameState] = useState(null);
  const [transition, setTransition] = useState(null);
  // Latest live hand-event batch — arrives just before the game-state that
  // reflects it; GameScreen consumes (and clears) it to choreograph beats
  const handEventsRef = useRef(null);
  const [error, setError]         = useState(null);
  const [inQueue, setInQueue]     = useState(false);
  const [matchList, setMatchList]       = useState([]);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [myElo, setMyElo]                   = useState(null);
  const [opponentElo, setOpponentElo]       = useState(null);
  const [deckStyle, setDeckStyle]           = useState('regular');
  const [matchOver, setMatchOver]           = useState(null);
  const [myRecentMatches, setMyRecentMatches] = useState([]);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [incomingChallenges, setIncomingChallenges] = useState([]); // [{ fromId, fromName, fromAvatarId }]
  const [outgoingChallenges, setOutgoingChallenges] = useState([]); // [{ toId, toName }]
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [uiConfig, setUiConfig] = useState({});
  const [lives, setLives]               = useState(3);
  const [maxLives, setMaxLives]         = useState(3);
  const [lifeRefillAt, setLifeRefillAt] = useState(null); // kept for socket compat, always null now

  // Quick Match funnel overlays (see MatchFlowOverlays)
  const [searchOverlay, setSearchOverlay] = useState(null); // null | {status:'searching'} | {status:'found', opponent}
  const [meantime, setMeantime]           = useState(false); // "play a bot while we keep searching" dialog
  const [preMatch, setPreMatch]           = useState(null);  // null | { opponent } — vs countdown before first hand
  const [bustReveal, setBustReveal]       = useState(null);  // null | { winnerId } — bust chip-flight + winner badge window
  const [forfeitReveal, setForfeitReveal] = useState(null);  // null | { loserId, loserChips, loserName } — forfeit countdown animation window

  const navigationRef = useNavigationContainerRef();
  const matchIdRef          = useRef(null);
  const firstMatchBegunRef  = useRef(null); // null = unknown, true/false from server analytics-status
  const startSessionFiredRef = useRef(false); // resets each app session; fires StartSession on first match-found
  // Current player id, mirrored into a ref so the socket 'connect' handler
  // (bound once at mount) can re-announce identity on every reconnect.
  const playerIdRef   = useRef(null);
  // Socket handlers are bound once at mount (useSocket) — they must read these
  // refs, never the overlay state above.
  const searchRef        = useRef(null);
  const foundDelayRef    = useRef(false); // mid pre-match countdown — hold navigation
  const botOfferTimerRef   = useRef(null); // 5s timer → show bot-offer dialog
  const matchOverTimerRef  = useRef(null); // pending match-over reveal delay
  const bustRevealRef      = useRef(null); // mirrors bustReveal for socket-bound handlers
  const forfeitRevealRef   = useRef(null); // mirrors forfeitReveal for socket-bound handlers
  const handEndLockRef     = useRef(null); // truthy (holds the safety-cap timer) while a hand-end animation is playing
  const handEndPendingRef  = useRef(null); // queued game-state to apply when lock releases
  const releaseHandEndRef  = useRef(null); // set while locked; the client animation calls this to release
  const matchOverPendingRef = useRef(null); // queued match-over to apply when the hand-end animation finishes
  const [route, setRoute] = useState('Login');   // current screen (gates music start)
  const [myConnected,       setMyConnected]       = useState(true);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const wasDisconnectedRef = useRef(false); // true between disconnect and next connect

  // Capture ?ref= from the URL on first load (web only) and persist it so it
  // survives OAuth redirects. Sent to the server on first enter-lobby.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || window.location.search.slice(1) || null;
    if (ref) AsyncStorage.setItem('referrer', ref).catch(() => {});
  }, []);

  const setSearch = useCallback((v) => { searchRef.current = v; setSearchOverlay(v); }, []);
  const clearBotOfferTimer = useCallback(() => {
    if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
  }, []);
  const startBotOfferTimer = useCallback(() => {
    clearBotOfferTimer();
    botOfferTimerRef.current = setTimeout(() => {
      botOfferTimerRef.current = null;
      setSearch(null);
      setMeantime(true);
    }, 5000);
  }, [clearBotOfferTimer, setSearch]);

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

  // Reveal the end-of-match state (bust badge / forfeit flight / plain pause →
  // modal). Deferred while a hand-end animation is still playing — see the
  // match-over handler — so a busting all-in finishes its runout first.
  const applyMatchOver = useCallback((data) => {
    setMeantime(false);
    if (data.newElo != null) setMyElo(data.newElo);
    if (matchOverTimerRef.current) clearTimeout(matchOverTimerRef.current);
    if (data.bust) {
      // Natural bust: freeze showdown state, show winner badge for 3s, then modal
      bustRevealRef.current = { winnerId: data.winnerId };
      setBustReveal({ winnerId: data.winnerId });
      matchOverTimerRef.current = setTimeout(() => {
        matchOverTimerRef.current = null;
        bustRevealRef.current = null;
        setBustReveal(null);
        setMatchOver({ ...data, myVote: null, opponentWantsRematch: null });
      }, BUST_REVEAL_MS);
    } else if (data.forfeit) {
      // Forfeit: chip countdown + flight animation for 2.5s, then modal
      const rev = { loserId: data.loserId, loserChips: data.loserChips, loserName: data.loserName };
      forfeitRevealRef.current = rev;
      setForfeitReveal(rev);
      matchOverTimerRef.current = setTimeout(() => {
        matchOverTimerRef.current = null;
        forfeitRevealRef.current = null;
        setForfeitReveal(null);
        setMatchOver({ ...data, myVote: null, opponentWantsRematch: null });
      }, FORFEIT_REVEAL_MS);
    } else {
      // Fallback: plain brief pause
      bustRevealRef.current = null;
      setBustReveal(null);
      forfeitRevealRef.current = null;
      setForfeitReveal(null);
      matchOverTimerRef.current = setTimeout(() => {
        matchOverTimerRef.current = null;
        setMatchOver({ ...data, myVote: null, opponentWantsRematch: null });
      }, MATCH_OVER_FALLBACK_MS);
    }
  }, []);

  const emit = useSocket({
    // Re-establish identity on every (re)connect. Socket.IO hands out a new
    // socket id each time and the server forgets the old one on disconnect; the
    // `session` handshake re-announces us so the server can place us back where
    // we belong (lobby, or re-seated at a live match within its grace window).
    // Without it the server rejects our next action with "Not in lobby" and a
    // brief blip at the table lapses into a forfeit.
    connect: () => {
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        setMyConnected(true);
      }
      if (playerIdRef.current) emit('session', { playerId: playerIdRef.current });
    },
    disconnect: () => {
      wasDisconnectedRef.current = true;
      setMyConnected(false);
    },
    'opponent-disconnected': () => setOpponentConnected(false),
    'opponent-connected':    () => setOpponentConnected(true),
    'in-queue':        ()            => { setInQueue(true); setError(null); },
    'queue-cancelled': ()            => { clearBotOfferTimer(); setInQueue(false); setSearch(null); setMeantime(false); },
    'match-found':     ({ matchId, opponent, fallback, reconnect, fromChallenge }) => {
      clearBotOfferTimer();
      if (isObserverRef.current) {
        emit('unobserve', { matchId: matchIdRef.current });
        isObserverRef.current = false;
      }
      pendingObserveRef.current = false;
      setInQueue(false);
      matchIdRef.current = matchId;
      setMatchOver(null);
      setSearch(null);
      setMeantime(false);
      setBustReveal(null);
      if (matchOverTimerRef.current) { clearTimeout(matchOverTimerRef.current); matchOverTimerRef.current = null; }
      if (handEndLockRef.current) { clearTimeout(handEndLockRef.current); handEndLockRef.current = null; }
      handEndPendingRef.current = null;
      releaseHandEndRef.current = null;
      matchOverPendingRef.current = null;
      bustRevealRef.current = null;
      forfeitRevealRef.current = null;
      // Starting any match voids all challenges (server does the same)
      setOpponentConnected(true);
      setIncomingChallenges([]);
      setOutgoingChallenges([]);
      if (firstMatchBegunRef.current === false) {
        firstMatchBegunRef.current = true;
        track('StartMatch');
      }
      if (!startSessionFiredRef.current) {
        startSessionFiredRef.current = true;
        track('StartSession');
      }
      if (!reconnect) track('StartAnyMatch');
      if (reconnect) {
        // Re-seated at a live match after disconnect — skip countdown, go straight in
        navigationRef.navigate('Game');
        return;
      }
      // Navigate to the table immediately so the countdown appears over the felt.
      // foundDelayRef blocks game-state from re-navigating until the client confirms ready.
      setOpponentElo(opponent?.elo ?? null);
      setPreMatch({ opponent, fromChallenge: !!fromChallenge });
      foundDelayRef.current = true;
      navigationRef.navigate('Game');
    },
    'match-list':  ({ matches, onlinePlayers: op }) => { setMatchList(matches || []); setOnlinePlayers(op || []); },
    'analytics-status': ({ firstMatchBegun }) => { firstMatchBegunRef.current = firstMatchBegun; },
    'hand-events': (batch)           => { handEventsRef.current = batch; },
    'game-state':  (payload)         => {
      if (bustRevealRef.current || forfeitRevealRef.current) return;
      const { transition: t, seq, ...state } = payload;
      if (handEndLockRef.current) {
        handEndPendingRef.current = { t, state };
        return;
      }

      const apply = (t, state) => {
        setTransition(t || null);
        setGameState(state);
        if (state.atTable && !state.gameOver) setMatchOver(null);
        // Dismiss the pre-match overlay only after the user has confirmed ready
        // (foundDelayRef cleared) AND the hand is actually live on the server.
        // This prevents the dialog from closing early if the server fires for
        // any reason before the user has had a chance to act.
        if (!foundDelayRef.current && state.phase !== 'waiting') {
          setPreMatch(null);
        }
        const belongsToUs = state.matchId === matchIdRef.current;
        if (belongsToUs && state.atTable && !foundDelayRef.current) {
          navigationRef.navigate('Game');
        } else if (belongsToUs && state.observing && isObserverRef.current && pendingObserveRef.current) {
          pendingObserveRef.current = false;
          navigationRef.navigate('Game');
        }
      };

      // HAND_ENDED locks out the next-hand state until the hand-end animation
      // finishes (chip flight, runout, etc.). Everything else applies immediately.
      if (t?.type === 'HAND_ENDED' && !state.gameOver) {
        apply(t, state);
        handEndPendingRef.current = null;
        const release = () => {
          if (!handEndLockRef.current) return;
          clearTimeout(handEndLockRef.current);
          handEndLockRef.current = null;
          releaseHandEndRef.current = null;
          const pending = handEndPendingRef.current;
          handEndPendingRef.current = null;
          if (pending) { apply(pending.t, pending.state); }
          const pendingMO = matchOverPendingRef.current;
          matchOverPendingRef.current = null;
          if (pendingMO) applyMatchOver(pendingMO);
        };
        releaseHandEndRef.current = release;
        handEndLockRef.current = setTimeout(release, HAND_END_MAX_MS);
        return;
      }
      apply(t, state);
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
      // If a hand-end animation is still playing (e.g. the all-in runout that
      // produced this bust), defer the reveal until it finishes — otherwise the
      // winner badge shows and the runout freezes before the cards are dealt.
      // The release in the HAND_ENDED branch drains this when winDone fires.
      if (handEndLockRef.current) { matchOverPendingRef.current = data; return; }
      applyMatchOver(data);
    },
    'rematch-pending': ({ from })    => {
      setMatchOver(prev => prev ? { ...prev, opponentWantsRematch: from } : prev);
    },
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
    'achievement-earned': ({ key, isFirst }) => {
      track('AchievementEarned', { achievement: key });
      if (isFirst) track('FirstAchievementEarned');
      if (key === 'back_to_back') track('BackToBackWinningDays');
    },
    'lives-update': ({ lives: l, maxLives: m }) => { setLives(l); if (m != null) setMaxLives(m); setLifeRefillAt(null); },
    error:         ({ message })     => { clearBotOfferTimer(); setError(message); setSearch(null); setMeantime(false); },
    reset:         ()                => {
      clearBotOfferTimer();
      if (isObserverRef.current) emit('unobserve', { matchId: matchIdRef.current });
      bustRevealRef.current = null;
      forfeitRevealRef.current = null;
      if (handEndLockRef.current) { clearTimeout(handEndLockRef.current); handEndLockRef.current = null; }
      handEndPendingRef.current = null;
      releaseHandEndRef.current = null;
      matchOverPendingRef.current = null;
      setGameState(null);
      setOpponentElo(null);
      setInQueue(false); setMatchOver(null);
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
    AsyncStorage.getItem('referrer').then(referrer => {
      emit('enter-lobby', { playerId, referrer: referrer || undefined });
    }).catch(() => emit('enter-lobby', { playerId }));
    // Fetch profile + pending friend request count on login
    fetch(`${SERVER_URL}/api/player/${playerId}/profile`)
      .then(r => r.json())
      .then(d => {
        setMyRecentMatches(d.history?.slice(0, 3) || []);
        if (d.stats?.elo) setMyElo(d.stats.elo);
        if (typeof d.musicEnabled === 'boolean') setMusicMuted(!d.musicEnabled);
        if (typeof d.sfxEnabled  === 'boolean') setSfxEnabled(d.sfxEnabled);
      })
      .catch(() => {});
    fetch(`${SERVER_URL}/api/friends/${playerId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPendingFriendRequests(d.filter(f => f.status === 'pending' && !f.isRequester).length); })
      .catch(() => {});
    fetch(`${SERVER_URL}/api/player/${encodeURIComponent(playerId)}/lives`)
      .then(r => r.json())
      .then(d => { setLives(d.lives ?? 3); if (d.maxLives != null) setMaxLives(d.maxLives); setLifeRefillAt(null); })
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
    setLives(3);
    setMaxLives(3);
    setLifeRefillAt(null);
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

  const fetchLives = useCallback(() => {
    const pid = playerInfo?.playerId;
    if (!pid) return;
    fetch(`${SERVER_URL}/api/player/${encodeURIComponent(pid)}/lives`)
      .then(r => r.json())
      .then(d => { setLives(d.lives ?? 3); if (d.maxLives != null) setMaxLives(d.maxLives); setLifeRefillAt(null); })
      .catch(() => {});
  }, [playerInfo?.playerId]);

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
    startBotOfferTimer();
  }, [emit, setSearch, startBotOfferTimer]);

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
    clearBotOfferTimer();
    emit('cancel-match', {});
    setInQueue(false);
    setSearch(null);
    setMeantime(false);
  }, [emit, setSearch, clearBotOfferTimer]);

  // Client confirmed ready — fire first hand immediately.
  // Don't clear preMatch here; game-state with phase !== 'waiting' will do it
  // once the hand is actually live, so the dialog stays up until the game starts.
  const onMatchReady = useCallback(() => {
    foundDelayRef.current = false;
    emit('match-ready', {});
  }, [emit]);

  // Cancelled during pre-match countdown — forfeit the match (enter-lobby triggers
  // endMatch server-side with the opponent as winner) and return to lobby.
  const onPreMatchCancel = useCallback(() => {
    foundDelayRef.current = false;
    setPreMatch(null);
    matchIdRef.current = null;
    emit('enter-lobby', { playerId: playerIdRef.current });
    navigationRef.reset({ index: 0, routes: [{ name: 'Lobby' }] });
  }, [emit]);

  // "Keep Waiting" — hide the dialog, restore searching overlay, restart 5s timer
  const onDismissMeantime = useCallback(() => {
    setMeantime(false);
    setSearch({ status: 'searching' });
    startBotOfferTimer();
  }, [setSearch, startBotOfferTimer]);

  // "Play Bot" — confirmed via dialog; overlay stays up until match-found closes it
  // to avoid a flash of the bare lobby between tap and navigation.
  const onConfirmBot = useCallback(() => {
    clearBotOfferTimer();
    track('PlayMatch', { mode: 'bot_confirmed' });
    emit('play-bot', { playerId: playerIdRef.current });
  }, [clearBotOfferTimer, emit]);

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

  const onBotActionRequest = useCallback(() => {
    emit('bot-action-request', { matchId: matchIdRef.current });
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

  // The GameScreen calls this when its hand-end animation (runout → reveal →
  // chip flight) has fully finished, releasing the buffered next-hand state.
  const onHandEndAnimDone = useCallback(() => {
    releaseHandEndRef.current?.();
  }, []);

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
    gameState, transition, myId, matchOver, handEventsRef,
    playerInfo, deckStyle, setDeckStyle, uiConfig, bustReveal, forfeitReveal,
    lives, maxLives, lifeRefillAt, fetchLives,
    myElo, opponentElo,
    myConnected, opponentConnected,
    emit, onLogin, onLogout, onUpdateProfile,
    onAction, onLeave, onRematch, onHandEndAnimDone, onBotActionRequest, navigationRef,
  }), [gameState, transition, myId, matchOver, playerInfo, deckStyle, uiConfig, bustReveal, forfeitReveal,
       lives, maxLives, lifeRefillAt, fetchLives, myElo, opponentElo,
       myConnected, opponentConnected,
       emit, onLogin, onLogout, onUpdateProfile, onAction, onLeave, onRematch, onHandEndAnimDone, onBotActionRequest]);

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
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', cardStyle: { flex: 1 } }}>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Lobby"   component={LobbyScreen} />
              <Stack.Screen name="Game"    component={GameScreen} />
              <Stack.Screen name="Profile"    component={ProfileScreen} />
              <Stack.Screen name="HandReplay"   component={HandReplayScreen} />
              <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
              <Stack.Screen name="AdLanding"   component={AdLandingScreen} />
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
            onPreMatchReady={onMatchReady}
            onPreMatchCancel={onPreMatchCancel}
            onConfirmBot={onConfirmBot}
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
