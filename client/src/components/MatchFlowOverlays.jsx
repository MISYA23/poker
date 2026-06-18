import React, { useEffect, useRef, useState } from 'react';
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
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function BananaBanner() {
  return (
    <View style={ov.bananaBanner}>
      <Text style={ov.bananaEmoji}>🍌</Text>
      <View>
        <Text style={ov.bananaTitle}>1 banana on the line</Text>
        <Text style={ov.bananaSub}>Win to keep it · lose it's gone</Text>
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
      <Text style={[ov.flagBadge, { fontSize: size * 0.38 }]}>{isBot ? '🤖' : flagEmoji(country)}</Text>
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

// Pre-match vs card with 3-2-1 countdown. Shown for exactly 3s (matching the
// server's auto_start_delay_ms) so the hand deals right as we land on the table.
function PreMatchCountdown({ opponent, playerInfo, myElo }) {
  const [count, setCount] = useState(3);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.5, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,   duration: 250, useNativeDriver: true }),
    ]).start();
  }, [count]);

  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <Scrim onPress={() => {}}>
      <Text style={ov.vsHeading}>Match Starting</Text>
      <View style={ov.vsRow}>
        <View style={ov.vsPlayer}>
          <AvatarBadge avatarId={playerInfo?.avatarId} size={74} />
          <Text style={ov.vsName} numberOfLines={1}>{playerInfo?.name || 'You'}</Text>
          <Text style={ov.vsElo}>{myElo ?? 1200}</Text>
        </View>
        <Text style={ov.vsVs}>VS</Text>
        <View style={ov.vsPlayer}>
          <AvatarBadge avatarId={opponent?.avatarId} country={opponent?.country} isBot={!!opponent?.isBot} size={74} />
          <Text style={ov.vsName} numberOfLines={1}>{opponent?.name || '…'}</Text>
          <Text style={ov.vsElo}>{opponent?.elo ?? 1200}</Text>
        </View>
      </View>
      <BananaBanner />
      <Animated.Text style={[ov.countdown, { transform: [{ scale: scaleAnim }] }]}>
        {count > 0 ? count : 'GO!'}
      </Animated.Text>
    </Scrim>
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
  onCancelSearch, onConfirmBot, onDismissMeantime,
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
        <PreMatchCountdown opponent={preMatch.opponent} playerInfo={playerInfo} myElo={myElo} copy={copy} />
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
          <Text style={ov.sub}>{copy?.botSub ?? 'Play a 🤖 bot while we keep searching for a human?'}</Text>
          <BananaBanner />
          <View style={ov.actsRow}>
            <Pressable style={ov.declineBtn} onPress={onDismissMeantime}>
              <Text style={ov.declineTxt}>{copy?.botKeepWaitingBtn ?? 'Keep waiting'}</Text>
            </Pressable>
            <Pressable style={[ov.cta, { flex: 1, marginTop: 0 }]} onPress={onConfirmBot}>
              <Text style={ov.ctaTxt}>{copy?.botPlayBtn ?? 'Play a bot →'}</Text>
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
          <Text style={ov.sub}>
            <Text style={ov.bold}>{challenge.fromName}</Text>
            {(copy?.challengeSub ?? ' {name} wants to play you.').replace('{name}', '').trimStart()}
          </Text>
          <BananaBanner />
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

  vsHeading: { color: '#8a98aa', fontSize: 13, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 20 },
  vsRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 },
  vsPlayer:  { alignItems: 'center', gap: 8, width: 100 },
  vsName:    { color: colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  vsElo:     { color: colors.goldLight, fontSize: 13, fontWeight: '700' },
  vsVs:      { color: colors.goldLight, fontSize: 22, fontWeight: '900' },
  countdown: { color: colors.white, fontSize: 64, fontWeight: '900', lineHeight: 72 },

  ringWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute' },

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

  bananaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    alignSelf: 'stretch', marginBottom: 14,
    backgroundColor: 'rgba(231,178,59,0.1)', borderWidth: 1, borderColor: 'rgba(231,178,59,0.3)',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
  },
  bananaEmoji: { fontSize: 26 },
  bananaTitle: { color: colors.white, fontSize: 14, fontWeight: '900' },
  bananaSub: { color: '#8a98aa', fontSize: 12, fontWeight: '700', marginTop: 2 },
});
