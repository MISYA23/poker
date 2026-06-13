import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Image, ToastAndroid, Platform, Alert,
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

function toastMsg(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert('', msg);
}

const MEDAL = ['🥇', '🥈', '🥉'];
const TABS  = ['Global', 'Friends', 'Country'];

function AvatarImg({ avatarId, size = 38 }) {
  return (
    <Image
      source={AVATAR_IMAGES[avatarId] || AVATAR_IMAGES.captain}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

function RankBadge({ rank }) {
  if (rank <= 3) return <Text style={s.medal}>{MEDAL[rank - 1]}</Text>;
  return <Text style={s.rankNum}>{rank}</Text>;
}

function PlayerRow({ p, isMe }) {
  return (
    <View style={[s.row, isMe && s.rowMe, p.rank <= 3 && s.rowTop]}>
      <View style={s.rankCol}><RankBadge rank={p.rank} /></View>
      <AvatarImg avatarId={p.avatarId} size={36} />
      <Text style={s.flagTxt}>{p.isBot ? '🤖' : flagEmoji(p.country)}</Text>
      <View style={s.nameCol}>
        <Text style={[s.name, isMe && s.nameMe]} numberOfLines={1}>{p.displayName}</Text>
        <Text style={s.subLine}>
          {Math.round(p.winRate * 100)}% wins · {p.matchesPlayed} played
        </Text>
      </View>
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
  const [tab,     setTab]     = useState('Global');

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

  const winPct     = myStats ? Math.round(myStats.winRate * 100) : 0;
  const eloFloor   = myStats ? Math.floor(myStats.elo / 100) * 100 : 1200;
  const eloProgress = myStats ? (myStats.elo - eloFloor) / 100 : 0;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.nav}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>‹ Back</Text>
        </Pressable>
        <Text style={s.navTitle}>Leaderboard</Text>
        <Pressable onPress={load} style={s.refreshBtn}>
          <Text style={s.refreshTxt}>↻</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.goldLight} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Your standing hero ── */}
          {myStats && (
            <>
              <View style={s.hero}>
                <View style={s.heroLeft}>
                  <Text style={s.heroRank}>#{myStats.rank}</Text>
                  <Text style={s.heroSub}>Top {myStats.topPercent}%</Text>
                </View>
                <AvatarImg avatarId={playerInfo?.avatarId} size={58} />
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

          {/* ── Filter tabs ── */}
          <View style={s.tabs}>
            {TABS.map(t => (
              <Pressable key={t} style={[s.tab, tab === t && s.tabActive]}
                onPress={() => {
                  if (t !== 'Global') { toastMsg(`${t} leaderboard coming soon`); return; }
                  setTab(t);
                }}>
                <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          {/* ── Ranked list (top 50) ── */}
          <View style={s.section}>
            {entries.slice(0, 50).map(p => (
              <PlayerRow key={p.playerId} p={p} isMe={p.playerId === myId} />
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
              <View style={s.section}>
                {neighborhood.map(p => (
                  <PlayerRow key={p.playerId} p={p} isMe={p.playerId === myId} />
                ))}
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#0b1420' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  backBtn:    { width: 60 },
  backTxt:    { color: colors.goldLight, fontSize: 17, fontWeight: '700' },
  navTitle:   { color: colors.white, fontSize: 17, fontWeight: '900' },
  refreshBtn: { width: 60, alignItems: 'flex-end' },
  refreshTxt: { color: '#5b6a7d', fontSize: 20 },

  // Hero
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: 'rgba(240,192,64,0.09)', borderWidth: 1, borderColor: 'rgba(240,192,64,0.25)',
    borderRadius: 20, padding: 18, marginTop: 16,
  },
  heroLeft:    { alignItems: 'center', minWidth: 52 },
  heroRank:    { color: colors.goldLight, fontSize: 32, fontWeight: '900', lineHeight: 36 },
  heroSub:     { color: '#8a98aa', fontSize: 10, fontWeight: '700', marginTop: 2 },
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

  tabs: {
    flexDirection: 'row', gap: 6, marginTop: 20, marginBottom: 2,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 4,
  },
  tab:          { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  tabActive:    { backgroundColor: 'rgba(240,192,64,0.15)' },
  tabTxt:       { color: '#5b6a7d', fontSize: 13, fontWeight: '800' },
  tabTxtActive: { color: colors.goldLight },

  section: { marginTop: 8, gap: 5 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 13,
    paddingVertical: 10, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowTop: { backgroundColor: 'rgba(212,160,23,0.07)', borderColor: 'rgba(212,160,23,0.18)' },
  rowMe:  {
    backgroundColor: 'rgba(240,192,64,0.13)', borderColor: 'rgba(240,192,64,0.4)', borderWidth: 1.5,
  },

  rankCol: { width: 32, alignItems: 'center' },
  medal:   { fontSize: 20 },
  rankNum: { color: '#5b6a7d', fontSize: 13, fontWeight: '800' },

  flagTxt: { fontSize: 16 },
  nameCol: { flex: 1, minWidth: 0 },
  name:    { color: colors.white, fontSize: 14, fontWeight: '800' },
  nameMe:  { color: colors.goldLight },
  subLine: { color: '#5b6a7d', fontSize: 11, fontWeight: '600', marginTop: 1 },
  eloTxt:  { color: '#8a98aa', fontSize: 14, fontWeight: '800', minWidth: 38, textAlign: 'right' },
  eloMe:   { color: colors.goldLight },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerTxt:  { color: '#5b6a7d', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
