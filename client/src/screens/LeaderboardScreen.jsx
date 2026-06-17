import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL } from '../config';
import { flagEmoji } from '../utils/flag';
import { REGION_ORDER, continentOf, regionEmoji, GLOBAL_EMOJI } from '../utils/regions';

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

// Compact, locale-safe "DD/MM HH:MM" (Hermes Intl support is patchy)
const fmtUpdated = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function PlayerRow({ p, isMe }) {
  const pct = Math.round((p.winRate ?? 0) * 100);
  return (
    <View style={[s.row, isMe && s.rowMe]}>
      <Text style={[s.colRank, s.rankNum, p.rank <= 3 && s.rankNumGold]}>{p.rank}</Text>
      <View style={[s.colPlayer, s.playerCell]}>
        <View style={s.avatarWrap}>
          <Image source={AVATAR_IMAGES[p.avatarId] || AVATAR_IMAGES.captain} style={s.avatar} />
          <Text style={s.flagOverlay}>{p.isBot ? '🤖' : flagEmoji(p.country)}</Text>
        </View>
        <Text style={[s.name, isMe && s.nameMe]} numberOfLines={1}>
          {isMe ? `${p.displayName} (You)` : p.displayName}
        </Text>
      </View>
      <Text style={[s.colElo, s.eloTxt, isMe && s.eloMe]} numberOfLines={1}>{p.elo}</Text>
      <Text style={[s.colRec, s.recTxt]} numberOfLines={1}>{p.wins}–{p.losses}</Text>
      <Text style={[s.colWin, s.winTxt]} numberOfLines={1}>{pct}%</Text>
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

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [fetchedAt, setFetchedAt] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const url = myId
      ? `${SERVER_URL}/api/leaderboard?playerId=${encodeURIComponent(myId)}`
      : `${SERVER_URL}/api/leaderboard`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setFetchedAt(new Date()); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [myId]);

  useEffect(() => { load(); }, [load]);

  const entries      = data?.entries      || [];
  const myStats      = data?.myStats      || null;

  // Filter: { type: 'all' | 'region' | 'country', value }
  const [filter, setFilter] = useState({ type: 'all' });
  const isAll = filter.type === 'all';

  // Country chips — sorted by player count (count not displayed)
  const countryOpts = useMemo(() => {
    const counts = {};
    for (const e of entries) {
      if (!e.country || e.isBot) continue;
      counts[e.country] = (counts[e.country] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cc]) => cc);
  }, [entries]);

  // Region chips — only continents that actually have players, in fixed order
  const regionOpts = useMemo(() => {
    const counts = {};
    for (const e of entries) {
      if (e.isBot) continue;
      const r = continentOf(e.country);
      if (r) counts[r] = (counts[r] || 0) + 1;
    }
    return REGION_ORDER.filter(r => counts[r]);
  }, [entries]);

  // The displayed list, re-ranked 1..N within the chosen scope.
  const rankedList = useMemo(() => {
    if (filter.type === 'all') return entries;
    const pred = filter.type === 'region'
      ? (e) => continentOf(e.country) === filter.value
      : (e) => e.country === filter.value;
    return entries.filter(pred).map((e, i) => ({ ...e, rank: i + 1 }));
  }, [entries, filter]);

  const filterLabel = filter.type === 'all' ? 'Global' : filter.value;

  // Top 50 shown; if I qualify for this scope but rank below 50, I'm appended
  // at the bottom so I'm always visible (and jumpable).
  const shownList  = rankedList.slice(0, 50);
  const myFullRow  = rankedList.find(p => p.playerId === myId);   // my row in this scope (may be rank > 50)
  const myInShown  = shownList.some(p => p.playerId === myId);
  const scrollRef = useRef(null);
  const meRowRef  = useRef(null);
  const jumpToMe = () => {
    const sv = scrollRef.current, row = meRowRef.current;
    if (!sv || !row) return;
    const node = sv.getInnerViewNode ? sv.getInnerViewNode() : sv;
    try { row.measureLayout(node, (x, y) => sv.scrollTo({ y: Math.max(0, y - 90), animated: true }), () => {}); } catch (_) {}
  };

  const winPct      = myStats ? Math.round(myStats.winRate * 100) : 0;
  const eloFloor    = myStats ? Math.floor(myStats.elo / 100) * 100 : 1200;
  const eloProgress = myStats ? (myStats.elo - eloFloor) / 100 : 0;

  return (
   <View style={s.root}>
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
        <ScrollView ref={scrollRef} style={s.scrollV} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
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
                  <View style={s.heroMid}>
                    <Text style={s.heroName} numberOfLines={1}>{playerInfo?.name}</Text>
                    <Text style={s.heroWinRate}>{winPct}% win rate</Text>
                    <Text style={s.heroWinRate}>{myStats.wins}W - {myStats.losses}L</Text>
                  </View>
                  <View style={s.heroEloWrap}>
                    <Text style={s.heroEloLbl}>ELO</Text>
                    <Text style={s.heroEloBig}>{myStats.elo}</Text>
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

            {/* ── Filter chips: row 1 = Global + regions, row 2 = countries ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={s.chipScroll} contentContainerStyle={s.chipRow}>
              <Pressable style={[s.chip, isAll && s.chipOn]} onPress={() => setFilter({ type: 'all' })}>
                <Text style={[s.chipTxt, isAll && s.chipTxtOn]}>{GLOBAL_EMOJI} Global</Text>
              </Pressable>
              {regionOpts.map(r => {
                const on = filter.type === 'region' && filter.value === r;
                return (
                  <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => setFilter({ type: 'region', value: r })}>
                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{regionEmoji(r)} {r}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {countryOpts.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={s.chipScroll2} contentContainerStyle={s.chipRow}>
                {countryOpts.map(cc => {
                  const on = filter.type === 'country' && filter.value === cc;
                  return (
                    <Pressable key={cc} style={[s.chip, on && s.chipOn]} onPress={() => setFilter({ type: 'country', value: cc })}>
                      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{flagEmoji(cc)} {cc}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* ── Ranked list ── */}
            {myFullRow && (
              <Pressable style={s.jumpLink} onPress={jumpToMe} hitSlop={8}>
                <Text style={s.jumpLinkTxt}>Jump to my rank (#{myFullRow.rank}) ↓</Text>
              </Pressable>
            )}
            {/* Column headers */}
            <View style={s.headRow}>
              <Text style={[s.colRank, s.headTxt]}>#</Text>
              <Text style={[s.colPlayer, s.headTxt]}>Player</Text>
              <Text style={[s.colElo, s.headTxt]}>ELO</Text>
              <Text style={[s.colRec, s.headTxt]}>W-L</Text>
              <Text style={[s.colWin, s.headTxt]}>Win %</Text>
            </View>
            <View style={s.list}>
              {shownList.map((p, i) => {
                const isMe = p.playerId === myId;
                return (
                  <View key={p.playerId} ref={isMe && myInShown ? meRowRef : undefined}>
                    {i > 0 && <View style={s.sep} />}
                    <PlayerRow p={p} isMe={isMe} />
                  </View>
                );
              })}
              {/* My row pinned at the bottom when I rank below the shown 50 */}
              {myFullRow && !myInShown && (
                <View ref={meRowRef}>
                  <View style={s.gapRow}><Text style={s.gapDots}>⋯</Text></View>
                  <PlayerRow p={myFullRow} isMe={true} />
                </View>
              )}
              {rankedList.length === 0 && (
                <Text style={s.emptyTxt}>No ranked players here yet.</Text>
              )}
            </View>

            {/* ── Footer: count + last updated ── */}
            <View style={s.footer}>
              <Text style={s.footerCount}>
                {rankedList.length > 50
                  ? `Showing 50 of ${rankedList.length} players`
                  : `${rankedList.length} player${rankedList.length === 1 ? '' : 's'}`}
                {` · ${filterLabel}`}
              </Text>
              {fetchedAt && <Text style={s.footerTime}>Updated {fmtUpdated(fetchedAt)}</Text>}
            </View>

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
   </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0b1420' },
  safe:   { flex: 1 },
  jumpLink:    { alignSelf: 'flex-start', marginTop: 14, marginBottom: -6, paddingVertical: 4, paddingHorizontal: 4 },
  jumpLinkTxt: { color: colors.goldLight, fontSize: 12, fontWeight: '700', opacity: 0.9 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  scrollV: { flex: 1, minHeight: 0 },   // bounds the scroll area so it scrolls on web
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(240,192,64,0.09)', borderWidth: 1, borderColor: 'rgba(240,192,64,0.25)',
    borderRadius: 20, padding: 18, marginTop: 16,
  },
  heroLeft:    { alignItems: 'center', minWidth: 48 },
  heroRank:    { color: colors.goldLight, fontSize: 30, fontWeight: '900', lineHeight: 34 },
  heroSub:     { color: '#8a98aa', fontSize: 10, fontWeight: '700', marginTop: 2 },
  heroAvatar:  { width: 56, height: 56, borderRadius: 14 },
  heroMid:     { flex: 1, minWidth: 0 },
  heroName:    { color: colors.white, fontSize: 17, fontWeight: '900' },
  heroWinRate: { color: '#8a98aa', fontSize: 12, fontWeight: '700', marginTop: 2 },
  heroEloWrap: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(240,192,64,0.30)',
    paddingHorizontal: 14, paddingVertical: 8, minWidth: 78,
  },
  heroEloLbl:  { color: '#b9a25a', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  heroEloBig:  { color: colors.goldLight, fontSize: 30, fontWeight: '900', lineHeight: 34 },

  progressWrap:  { marginTop: 10, paddingHorizontal: 4 },
  progressBar:   { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, backgroundColor: colors.goldLight, borderRadius: 3 },
  progressLabel: { color: '#5b6a7d', fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'right' },

  targetRow: { marginTop: 8, paddingHorizontal: 4 },
  targetTxt: { color: '#8a98aa', fontSize: 12, fontWeight: '700' },
  targetElo: { color: '#4ade80', fontWeight: '900' },

  // Country filter chips
  chipScroll:  { marginTop: 18, marginHorizontal: -16 },
  chipScroll2: { marginTop: 8, marginHorizontal: -16 },
  chipRow:    { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#111c2d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chipOn:    { backgroundColor: 'rgba(240,192,64,0.16)', borderColor: 'rgba(240,192,64,0.5)' },
  chipTxt:   { color: '#8a98aa', fontSize: 13, fontWeight: '800' },
  chipTxtOn: { color: colors.goldLight },
  chipCount: { color: '#5b6a7d', fontSize: 11, fontWeight: '700' },
  listLabel: { color: colors.goldLight, fontSize: 13, fontWeight: '800', marginTop: 16, marginLeft: 4 },
  emptyTxt:  { color: '#8a98aa', fontSize: 13, textAlign: 'center', padding: 24, fontStyle: 'italic' },

  // Ranked list
  list: {
    marginTop: 12,
    backgroundColor: '#111c2d', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden',
  },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 14 },
  gapRow:  { alignItems: 'center', paddingTop: 6, paddingBottom: 2 },
  gapDots: { color: '#5b6a7d', fontSize: 20, fontWeight: '900', lineHeight: 20, letterSpacing: 2 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  rowMe: { backgroundColor: 'rgba(240,192,64,0.08)' },

  // Column layout (shared by header + rows)
  colRank:   { width: 38, textAlign: 'center' },
  colPlayer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  colElo:    { width: 48, textAlign: 'center' },
  colRec:    { width: 66, textAlign: 'center' },
  colWin:    { width: 50, textAlign: 'center' },

  // Header
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6, marginTop: 14 },
  headTxt: { color: '#8a98aa', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  // Value cells
  rankNum:     { color: '#5b6a7d', fontSize: 15, fontWeight: '800' },
  rankNumGold: { color: colors.goldLight },
  playerCell:  {},
  avatarWrap:  { position: 'relative', width: 42, height: 42 },
  avatar:      { width: 42, height: 42, borderRadius: 11, backgroundColor: '#1a2a3d' },
  flagOverlay: { position: 'absolute', bottom: -2, right: -4, fontSize: 14, lineHeight: 18 },
  name:        { flex: 1, color: colors.white, fontSize: 15, fontWeight: '800' },
  nameMe:      { color: colors.goldLight },
  eloTxt:      { color: colors.goldLight, fontSize: 15, fontWeight: '900' },
  eloMe:       { color: colors.goldLight },
  recTxt:      { color: '#8a98aa', fontSize: 13, fontWeight: '700' },
  winTxt:      { color: '#cbd5e1', fontSize: 13, fontWeight: '800' },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerTxt:  { color: '#5b6a7d', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  footer:      { marginTop: 20, alignItems: 'center', gap: 3 },
  footerCount: { color: '#8a98aa', fontSize: 12, fontWeight: '700' },
  footerTime:  { color: '#5b6a7d', fontSize: 11, fontWeight: '600' },
});
