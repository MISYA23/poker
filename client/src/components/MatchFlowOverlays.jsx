import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Animated, Easing, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

if (Platform.OS === 'web') {
  const s = document.createElement('style');
  s.textContent = '@keyframes radarPulse{0%{transform:scale(0.55);opacity:0.7}70%{opacity:0.25}100%{transform:scale(1.25);opacity:0}}';
  document.head.appendChild(s);
}
import { colors } from '../theme';
import { flagEmoji } from '../utils/flag';

const AVATAR_IMAGES = {
  cigar: require('../../assets/cigar.png'),
  queen: require('../../assets/queen.png'),
  lemur: require('../../assets/lemur.png'),
  captain: require('../../assets/captain.png'),
  baboon: require('../../assets/baboon.png'),
  sailor: require('../../assets/sailor.png'),
  banana: require('../../assets/banana.png'),
  parrot: require('../../assets/parrot.png'),
  rickdeckard: require('../../assets/rickdeckard.png'),
};

function calcEloGain(winnerElo, loserElo, K = 32) {
  const exp = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  return Math.round(K * (1 - exp));
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function StakePot({ potElo, label, winElo, loseElo }) {
  return (
    <View style={ov.stakePot}>
      {label ? <Text style={ov.stakePotLabel}>{label}</Text> : null}
      <View style={ov.stakePotItems}>
        <View style={ov.stakePotItem}>
          <Text style={ov.stakePotIcon}>🍌</Text>
          <Text style={ov.stakePotBig}>1</Text>
          <Text style={ov.stakePotSmall}>banana</Text>
        </View>
        <Text style={ov.stakePotSep}>+</Text>
        <View style={ov.stakePotItem}>
          <Text style={ov.stakePotIcon}>📈</Text>
          {winElo != null && loseElo != null ? (
            <>
              <Text style={ov.stakePotElo}>+{winElo} / −{loseElo}</Text>
              <Text style={ov.stakePotSmall}>ELO win/lose</Text>
            </>
          ) : (
            <>
              <Text style={ov.stakePotElo}>{potElo ?? '?'} ELO</Text>
              <Text style={ov.stakePotSmall}>on the line</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function BotOpponentBlock({ name = 'Rick Deckard', elo = 1394 }) {
  return (
    <View style={ov.oppRow}>
      <AvatarBadge avatarId="rickdeckard" isBot size={68} />
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={ov.oppName} numberOfLines={1}>{name}</Text>
          <View style={ov.botTag}><Text style={ov.botTagTxt}>BOT</Text></View>
        </View>
        <Text style={ov.oppMeta}>ELO <Text style={ov.oppElo}>{elo}</Text></Text>
      </View>
    </View>
  );
}

// Rounded-square avatar with a big flag badge in the corner (design spec:
// flags are the main at-a-glance identifier, keep them prominent)
export function AvatarBadge({ avatarId, country, isBot = false, size = 74 }) {
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={AVATAR_IMAGES[avatarId] || AVATAR_IMAGES.captain}
        style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: '#1b2a3b' }}
        resizeMode="cover"
      />
      {!isBot && country ? <Text style={[ov.flagBadge, { fontSize: size * 0.38 }]}>{flagEmoji(country)}</Text> : null}
    </View>
  );
}

function RadarNative() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, {
      toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.25] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.7, 0.25, 0] });
  return (
    <View style={ov.radar}>
      <Animated.View style={[ov.radarRing, { transform: [{ scale }], opacity }]} />
      <View style={[ov.radarRing, { transform: [{ scale: 0.62 }], opacity: 0.25 }]} />
      <Text style={ov.radarMonkey}>🐵</Text>
    </View>
  );
}

function RadarWeb() {
  return (
    <View style={ov.radar}>
      <View style={[ov.radarRing, {
        animationName: 'radarPulse', animationDuration: '1.6s',
        animationTimingFunction: 'ease-out', animationIterationCount: 'infinite',
      }]} />
      <View style={[ov.radarRing, { transform: [{ scale: 0.62 }], opacity: 0.25 }]} />
      <Text style={ov.radarMonkey}>🐵</Text>
    </View>
  );
}

const Radar = Platform.OS === 'web' ? RadarWeb : RadarNative;

function OpponentCard({ name, avatarId, country, elo, isBot }) {
  return (
    <View style={ov.oppRow}>
      <AvatarBadge avatarId={avatarId} country={country} isBot={isBot} />
      <View>
        <Text style={ov.oppName} numberOfLines={1}>{name}</Text>
        <Text style={ov.oppMeta}>ELO <Text style={ov.oppElo}>{elo ?? 1200}</Text></Text>
      </View>
    </View>
  );
}

// Pre-match vs card with animated ELO drop + ring countdown. Tap anywhere to skip.
function PreMatchCountdown({ opponent, playerInfo, myElo, onReady, onLeave, canCancel = true }) {
  const DURATION = 1000;
  const RING_R = 36;
  const RING_C = 2 * Math.PI * RING_R;

  const myEloVal = myElo ?? 1200;
  const oppEloVal = opponent?.elo ?? 1200;
  const myLoss  = calcEloGain(oppEloVal, myEloVal);
  const oppLoss = calcEloGain(myEloVal, oppEloVal);
  const potElo  = calcEloGain(myEloVal, oppEloVal);

  const [skipped, setSkipped] = useState(false);
  const [myEloDisplay, setMyEloDisplay]   = useState(myEloVal);
  const [oppEloDisplay, setOppEloDisplay] = useState(oppEloVal);
  const ringOffset = useRef(new Animated.Value(0)).current;
  const firedRef   = useRef(false);

  const fireReady = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    setSkipped(true);
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    Animated.timing(ringOffset, {
      toValue: RING_C, duration: DURATION, easing: Easing.linear, useNativeDriver: false,
    }).start();
    const STEPS = 60;
    const stepMs = DURATION / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const t = step / STEPS;
      const ease = 1 - Math.pow(1 - t, 3);
      setMyEloDisplay(Math.round(myEloVal - myLoss * ease));
      setOppEloDisplay(Math.round(oppEloVal - oppLoss * ease));
      if (step >= STEPS) { clearInterval(id); fireReady(); }
    }, stepMs);
    return () => clearInterval(id);
  }, []);

  if (skipped) return null;

  return (
    <Pressable style={ov.scrim} onPress={() => {}}>
      <Pressable style={ov.dialog} onPress={() => {}}>
        <Text style={ov.vsHeading}>Match Starting</Text>
        <View style={ov.vsRow}>
          <View style={ov.vsPlayer}>
            <AvatarBadge avatarId={playerInfo?.avatarId} size={64} />
            <Text style={ov.vsName} numberOfLines={1}>{playerInfo?.name || 'You'}</Text>
            <Text style={ov.vsEloBlue}>{myEloDisplay}</Text>
          </View>

          <View style={ov.countRingWrap}>
            <Svg width={80} height={80} viewBox="0 0 80 80">
              <Circle cx="40" cy="40" r={RING_R} stroke="rgba(255,255,255,0.1)" strokeWidth="5" fill="none" />
              <AnimatedCircle
                cx="40" cy="40" r={RING_R} stroke={colors.goldLight} strokeWidth="5" fill="none"
                strokeLinecap="round" strokeDasharray={`${RING_C}`} strokeDashoffset={ringOffset}
                transform="rotate(-90 40 40)"
              />
            </Svg>
            <Text style={ov.vsVs}>VS</Text>
          </View>

          <View style={ov.vsPlayer}>
            <AvatarBadge avatarId={opponent?.avatarId} country={opponent?.country} isBot={!!opponent?.isBot} size={64} />
            <Text style={ov.vsName} numberOfLines={1}>{opponent?.name || '…'}</Text>
            <Text style={ov.vsEloBlue}>{oppEloDisplay}</Text>
          </View>
        </View>

        <StakePot potElo={potElo} label="Winner takes the pot" />

        <Pressable style={[ov.cta, { marginTop: 10, alignSelf: 'stretch' }]}
          onPress={fireReady}>
          <Text style={ov.ctaTxt}>LET'S PLAY</Text>
        </Pressable>

        {canCancel && (
          <Pressable style={[ov.ghostBtn, { marginTop: 8, alignSelf: 'stretch' }]}
            onPress={() => { onLeave?.(); setSkipped(true); }}>
            <Text style={[ov.ghostBtnTxt, { fontSize: 13 }]}>Cancel</Text>
          </Pressable>
        )}
      </Pressable>
    </Pressable>
  );
}

// 15s ring that drains around the challenger's avatar (in-game challenges)
function CountdownAvatar({ avatarId, country, seconds }) {
  const C = 2 * Math.PI * 46;
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    offset.setValue(0);
    const anim = Animated.timing(offset, {
      toValue: C, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [offset, seconds]);
  return (
    <View style={ov.ringWrap}>
      <Svg width={92} height={92} viewBox="0 0 100 100" style={ov.ringSvg}>
        <Circle cx="50" cy="50" r="46" stroke="rgba(255,255,255,0.12)" strokeWidth="5" fill="none" />
        <AnimatedCircle
          cx="50" cy="50" r="46" stroke={colors.goldLight} strokeWidth="5" fill="none"
          strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </Svg>
      <AvatarBadge avatarId={avatarId} country={country} size={68} />
    </View>
  );
}

function Scrim({ onPress, children }) {
  return (
    <Pressable style={ov.scrim} onPress={onPress}>
      <Pressable style={ov.dialog} onPress={() => {}}>
        {children}
      </Pressable>
    </Pressable>
  );
}

// All Quick-Match-funnel + challenge dialogs, rendered above every screen.
// Copy convention: opponents are "humans", bots are "🤖 bot" (never "human").
export default function MatchFlowOverlays({
  searchOverlay, meantime, preMatch, playerInfo, myElo, incomingChallenges,
  onCancelSearch, onPreMatchReady, onPreMatchCancel, onConfirmBot, onDismissMeantime,
  onAcceptChallenge, onDeclineChallenge, copy,
}) {
  // Challenges the user tap-dismissed: hide the dialog, the challenge itself
  // stays pending (lobby rows keep an Accept affordance until it expires)
  const [dismissed, setDismissed] = useState(() => new Set());
  const challenge = (incomingChallenges || []).find(c => !dismissed.has(c.fromId)) || null;
  useEffect(() => {
    // Drop dismissals for challenges that no longer exist
    setDismissed(prev => {
      const live = new Set((incomingChallenges || []).map(c => c.fromId));
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [incomingChallenges]);

  const dismissChallenge = (c) => setDismissed(prev => new Set(prev).add(c.fromId));
  // Short-fuse challenges (target is mid-bot-game) get the countdown ring
  const inGameChallenge = challenge && challenge.expiresIn != null && challenge.expiresIn <= 30;

  if (!searchOverlay && !meantime && !preMatch && !challenge) return null;

  return (
    <View style={ov.root} pointerEvents="box-none">

      {/* Pre-match vs countdown */}
      {preMatch && !challenge && (
        <PreMatchCountdown opponent={preMatch.opponent} playerInfo={playerInfo} myElo={myElo}
          onReady={onPreMatchReady} onLeave={onPreMatchCancel} canCancel={!preMatch.fromChallenge} />
      )}

      {/* Searching… / Human found! */}
      {!preMatch && searchOverlay && (
        <Scrim onPress={() => {}}>
          <Radar />
          {searchOverlay.status === 'found' ? (
            <>
              <Text style={ov.title}>{copy?.foundTitle ?? 'Human found!'}</Text>
              <OpponentCard {...(searchOverlay.opponent || {})} />
            </>
          ) : (
            <>
              <Text style={ov.title}>{copy?.searchingTitle ?? 'Searching…'}</Text>
              <Text style={ov.sub}>{copy?.searchingSub ?? 'Looking for a human to play'}</Text>
              <Pressable style={ov.ghostBtn} onPress={onCancelSearch}>
                <Text style={ov.ghostBtnTxt}>{copy?.searchingCancelBtn ?? 'Cancel'}</Text>
              </Pressable>
            </>
          )}
        </Scrim>
      )}

      {/* Bot offer dialog — shown 5s after Quick Match with no human found */}
      {!preMatch && !searchOverlay && meantime && !challenge && (
        <Scrim onPress={() => {}}>
          <Radar />
          <Text style={ov.title}>{copy?.botTitle ?? 'No humans yet…'}</Text>
          <BotOpponentBlock />
          <View style={ov.stakeBar}>
            <Text style={ov.stakeBarTxt}>🍌 1 banana · ELO on the line</Text>
          </View>
          <View style={ov.actsRow}>
            <Pressable style={ov.declineBtn} onPress={onDismissMeantime}>
              <Text style={ov.declineTxt}>{copy?.botKeepWaitingBtn ?? 'Keep waiting'}</Text>
            </Pressable>
            <Pressable style={[ov.cta, { flex: 1, marginTop: 0 }]} onPress={onConfirmBot}>
              <Text style={ov.ctaTxt}>{copy?.botPlayBtn ?? 'Play Rick →'}</Text>
            </Pressable>
          </View>
        </Scrim>
      )}

      {/* Incoming challenge — countdown ring only for in-game (15s) challenges */}
      {challenge && (
        <Scrim onPress={() => dismissChallenge(challenge)}>
          <View style={ov.badge}><Text style={ov.badgeTxt}>{copy?.challengeBadge ?? '⚔️ CHALLENGE'}</Text></View>
          <View style={ov.oppRow}>
            {inGameChallenge ? (
              <CountdownAvatar key={challenge.fromId} avatarId={challenge.fromAvatarId}
                country={challenge.fromCountry} seconds={challenge.expiresIn} />
            ) : (
              <AvatarBadge avatarId={challenge.fromAvatarId} country={challenge.fromCountry} />
            )}
            <View>
              <Text style={ov.oppName} numberOfLines={1}>{challenge.fromName}</Text>
              <Text style={ov.oppMeta}>ELO <Text style={ov.oppElo}>{challenge.fromElo ?? 1200}</Text></Text>
            </View>
          </View>
          <StakePot
            winElo={calcEloGain(myElo ?? 1200, challenge.fromElo ?? 1200)}
            loseElo={calcEloGain(challenge.fromElo ?? 1200, myElo ?? 1200)}
          />
          <View style={ov.actsRow}>
            <Pressable style={ov.declineBtn} onPress={() => { onDeclineChallenge(challenge.fromId); }}>
              <Text style={ov.declineTxt}>{copy?.challengeDeclineBtn ?? 'Decline'}</Text>
            </Pressable>
            <Pressable style={[ov.cta, { flex: 1, marginTop: 0 }]} onPress={() => onAcceptChallenge(challenge.fromId)}>
              <Text style={ov.ctaTxt}>{copy?.challengeAcceptBtn ?? 'Accept'}</Text>
            </Pressable>
          </View>
        </Scrim>
      )}

    </View>
  );
}

const ov = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 20000 },
  scrim: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,11,17,0.82)',
    alignItems: 'center', justifyContent: 'center', padding: 26,
  },
  dialog: {
    width: '100%', maxWidth: 360, backgroundColor: '#16222f',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 26,
    paddingVertical: 24, paddingHorizontal: 22, alignItems: 'center', elevation: 12,
  },

  radar: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  radarRing: {
    position: 'absolute', width: 96, height: 96, borderRadius: 48,
    borderWidth: 2, borderColor: colors.goldLight,
  },
  radarMonkey: { fontSize: 36 },

  title: { color: colors.white, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  gold: { color: colors.goldLight },
  sub: { color: '#8a98aa', fontSize: 14.5, fontWeight: '600', textAlign: 'center', lineHeight: 21, marginBottom: 18 },
  bold: { color: colors.white, fontWeight: '800' },

  badge: {
    backgroundColor: 'rgba(240,192,64,0.14)', borderWidth: 1, borderColor: 'rgba(240,192,64,0.35)',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13, marginBottom: 16,
  },
  badgeTxt: { color: colors.goldLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },

  oppRow: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 16 },
  oppName: { color: colors.white, fontSize: 22, fontWeight: '900', maxWidth: 180 },
  oppMeta: { color: '#8a98aa', fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  oppElo: { color: colors.goldLight, fontWeight: '900' },
  flagBadge: { position: 'absolute', bottom: -6, right: -7, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 },

  vsHeading: { color: '#8a98aa', fontSize: 13, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 },
  vsRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 },
  vsPlayer:  { alignItems: 'center', gap: 6, width: 96 },
  vsName:    { color: colors.white, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  vsEloBlue: { color: '#a9d0f5', fontSize: 13, fontWeight: '700' },
  vsVs:      { color: colors.goldLight, fontSize: 18, fontWeight: '900', position: 'absolute' },

  countRingWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  ringWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute' },

  tapHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700', marginTop: 10, letterSpacing: 0.5 },

  stakePot: {
    alignSelf: 'stretch', marginBottom: 14,
    backgroundColor: 'rgba(231,178,59,0.08)', borderWidth: 1, borderColor: 'rgba(231,178,59,0.3)',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center',
  },
  stakePotLabel: { color: '#8a98aa', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  stakePotItems: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stakePotItem:  { alignItems: 'center', gap: 2 },
  stakePotIcon:  { fontSize: 20 },
  stakePotBig:   { color: colors.white, fontSize: 15, fontWeight: '900' },
  stakePotElo:   { color: '#a9d0f5', fontSize: 15, fontWeight: '900' },
  stakePotSmall: { color: '#8a98aa', fontSize: 11, fontWeight: '700' },
  stakePotSep:   { color: '#8a98aa', fontSize: 18, fontWeight: '700' },

  stakeBar: {
    alignSelf: 'stretch', marginBottom: 14,
    backgroundColor: 'rgba(231,178,59,0.08)', borderWidth: 1, borderColor: 'rgba(231,178,59,0.3)',
    borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14,
  },
  stakeBarTxt: { color: '#c49a2a', fontSize: 13, fontWeight: '800', textAlign: 'center' },

  botTag: {
    backgroundColor: 'rgba(169,208,245,0.15)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  botTagTxt: { color: '#a9d0f5', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  cta: {
    alignSelf: 'stretch', backgroundColor: colors.goldLight, borderRadius: 16,
    paddingVertical: 15, alignItems: 'center', marginTop: 2,
  },
  ctaTxt: { color: '#0c151f', fontSize: 16, fontWeight: '900' },

  ghostBtn: {
    alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center',
  },
  ghostBtnTxt: { color: '#8a98aa', fontSize: 15, fontWeight: '800' },

  actsRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  declineBtn: {
    flexBasis: '38%', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16,
    paddingVertical: 15, alignItems: 'center',
  },
  declineTxt: { color: '#8a98aa', fontSize: 15, fontWeight: '800' },
});
