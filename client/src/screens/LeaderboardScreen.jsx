import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL } from '../config';
import { flagEmoji } from '../utils/flag';

const AVATAR_IMAGES = {
  cigar:   require('../../assets/cigar.png'),
  queen:   require('../../assets/queen.png'),
  lemur:   require('../../assets/lemur.png'),
  captain: require('../../assets/captain.png'),
  baboon:  require('../../assets/baboon.png'),
  sailor:  require('../../assets/sailor.png'),
  banana:  require('../../assets/banana.png'),
  parrot:  require('../../assets/parrot.png'),
};

function PlayerRow({ p, isMe }) {
  return (
    <View style={[s.row, isMe && s.rowMe]}>
      <Text style={[s.rankNum, p.rank <= 3 && s.rankNumGold]}>{p.rank}</Text>
      <View style={s.avatarWrap}>
        <Image
          source={AVATAR_IMAGES[p.avatarId] || AVATAR_IMAGES.captain}
          style={s.avatar}
        />
        <Text style={s.flagOverlay}>{p.isBot ? '🤖' : flagEmoji(p.country)}</Text>
      </View>
      <Text style={[s.name, isMe && s.nameMe]} numberOfLines={1}>
        {isMe ? 'You' : p.displayName}
      </Text>
      <Text style={[s.eloTxt, isMe && s.eloMe]}>{p.elo}</Text>
    </View>
  );
}

export default function LeaderboardScreen({ navigation }) {
  const { playerInfo } = useContext(GameContext);
  const myId = playerInfo?.playerId;

  useEffect(() => {
    if (Platform.OS === 'web' && !playerInfo) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, []);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const url = myId
      ? `${SERVER_URL}/api/leaderboard?playerId=${encodeURIComponent(myId)}`
      : `${SERVER_URL}/api/leaderboard`;
    fetch(url)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [myId]);

  useEffect(() => { load(); }, [load]);

  const entries      = data?.entries      || [];
  const myStats      = data?.myStats      || null;
  const neighborhood = data?.neighborhood || [];

  const winPct      = myStats ? Math.round(myStats.winRate * 100) : 0;
  const eloFloor    = myStats ? Math.floor(myStats.elo / 100) * 100 : 1200;
  const eloProgress = myStats ? (myStats.elo - eloFloor) / 100 : 0;

  return (
    <SafeAreaView style={s.safe}>
      {/* Nav — back only, no reload button */}
      <View style={s.nav}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>‹ Back</Text>
        </Pressable>
        <Text style={s.navTitle}>Leaderboard</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.goldLight} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.col}>

            {/* ── Your standing hero ── */}
            {myStats && (
              <>
                <View style={s.hero}>
                  <View style={s.heroLeft}>
                    <Text style={s.heroRank}>#{myStats.rank}</Text>
                    <Text style={s.heroSub}>Top {myStats.topPercent}%</Text>
                  </View>
                  <Image
                    source={AVATAR_IMAGES[playerInfo?.avatarId] || AVATAR_IMAGES.captain}
                    style={s.heroAvatar}
                  />
                  <View style={s.heroRight}>
                    <Text style={s.heroName} numberOfLines={1}>{playerInfo?.name}</Text>
                    <Text style={s.heroWinRate}>{winPct}% win rate</Text>
                    <Text style={s.heroElo}>{myStats.elo} ELO</Text>
                  </View>
                </View>
                <View style={s.progressWrap}>
                  <View style={s.progressBar}>
                    <View style={[s.progressFill, { width: `${Math.round(eloProgress * 100)}%` }]} />
                  </View>
                  <Text style={s.progressLabel}>{eloFloor} → {eloFloor + 100}</Text>
                </View>
                {myStats.nextTarget && (
                  <View style={s.targetRow}>
                    <Text style={s.targetTxt}>
                      <Text style={s.targetElo}>+{myStats.nextTarget.eloDiff} ELO</Text>
                      {' '}to pass {myStats.nextTarget.displayName} (#{myStats.nextTarget.rank})
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* ── Ranked list ── */}
            <View style={s.list}>
              {entries.slice(0, 50).map((p, i) => (
                <View key={p.playerId}>
                  {i > 0 && <View style={s.sep} />}
                  <PlayerRow p={p} isMe={p.playerId === myId} />
                </View>
              ))}
            </View>

            {/* ── Your neighborhood ── */}
            {neighborhood.length > 0 && myStats && myStats.rank > 10 && (
              <>
                <View style={s.divider}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerTxt}>your neighborhood</Text>
                  <View style={s.dividerLine} />
                </View>
                <View style={s.list}>
                  {neighborhood.map((p, i) => (
                    <View key={p.playerId}>
                      {i > 0 && <View style={s.sep} />}
                      <PlayerRow p={p} isMe={p.playerId === myId} />
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#0b1420' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  scroll: { flexGrow: 1 },
  col:    { width: '100%', maxWidth: 500, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32 },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  backBtn:  { width: 60 },
  backTxt:  { color: colors.goldLight, fontSize: 17, fontWeight: '700' },
  navTitle: { color: colors.white, fontSize: 17, fontWeight: '900' },

  // Hero
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: 'rgba(240,192,64,0.09)', borderWidth: 1, borderColor: 'rgba(240,192,64,0.25)',
    borderRadius: 20, padding: 18, marginTop: 16,
  },
  heroLeft:    { alignItems: 'center', minWidth: 52 },
  heroRank:    { color: colors.goldLight, fontSize: 32, fontWeight: '900', lineHeight: 36 },
  heroSub:     { color: '#8a98aa', fontSize: 10, fontWeight: '700', marginTop: 2 },
  heroAvatar:  { width: 58, height: 58, borderRadius: 14 },
  heroRight:   { flex: 1, minWidth: 0 },
  heroName:    { color: colors.white, fontSize: 17, fontWeight: '900' },
  heroWinRate: { color: '#8a98aa', fontSize: 12, fontWeight: '700', marginTop: 2 },
  heroElo:     { color: colors.goldLight, fontSize: 24, fontWeight: '900', marginTop: 2 },

  progressWrap:  { marginTop: 10, paddingHorizontal: 4 },
  progressBar:   { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, backgroundColor: colors.goldLight, borderRadius: 3 },
  progressLabel: { color: '#5b6a7d', fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'right' },

  targetRow: { marginTop: 8, paddingHorizontal: 4 },
  targetTxt: { color: '#8a98aa', fontSize: 12, fontWeight: '700' },
  targetElo: { color: '#4ade80', fontWeight: '900' },

  // Ranked list
  list: {
    marginTop: 20,
    backgroundColor: '#111c2d', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden',
  },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 14 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  rowMe: { backgroundColor: 'rgba(240,192,64,0.08)' },

  rankNum:     { color: '#5b6a7d', fontSize: 16, fontWeight: '800', width: 28, textAlign: 'center' },
  rankNumGold: { color: colors.goldLight },

  avatarWrap: { position: 'relative', width: 52, height: 52 },
  avatar:     { width: 52, height: 52, borderRadius: 13, backgroundColor: '#1a2a3d' },
  flagOverlay: {
    position: 'absolute', bottom: -2, right: -4,
    fontSize: 16, lineHeight: 20,
  },

  name:   { flex: 1, color: colors.white, fontSize: 16, fontWeight: '800' },
  nameMe: { color: colors.goldLight },
  eloTxt: { color: colors.goldLight, fontSize: 16, fontWeight: '900' },
  eloMe:  { color: colors.goldLight },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerTxt:  { color: '#5b6a7d', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
