import React, { useContext, useState, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ImageBackground,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { VERSION, SERVER_URL } from '../config';

const AVATAR_IMAGES = {
  dk:    require('../../assets/dk.png'),
  diddy: require('../../assets/diddy.webp'),
  alfie: require('../../assets/alfie.png'),
  jazz:  require('../../assets/jazz.png'),
};

const TABS = ['Recent', 'Friends', 'Leaderboard'];

function RecentTab({ matches, navigationRef }) {
  if (!matches?.length) return <Text style={s.tabEmpty}>No matches yet — play your first game!</Text>;
  return (
    <View style={s.tabContent}>
      {matches.map((m, i) => (
        <Pressable key={i} style={s.recentRow}
          onPress={() => navigationRef.navigate('HandReplay', { matchId: m.matchId, matchLabel: `vs ${m.opponentName}` })}>
          <View style={[s.resultDot, m.won ? s.dotWin : s.dotLoss]} />
          <Text style={s.recentOpp} numberOfLines={1}>vs {m.opponentName}</Text>
          <Text style={[s.recentElo, m.eloChange >= 0 ? s.eloPos : s.eloNeg]}>
            {m.eloChange >= 0 ? '+' : ''}{m.eloChange}
          </Text>
          <Text style={s.replayArrow}>▶</Text>
        </Pressable>
      ))}
    </View>
  );
}

function FriendsTab() {
  return <Text style={s.tabEmpty}>Friends coming soon</Text>;
}

function LeaderboardTab({ navigationRef }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/leaderboard`)
      .then(r => r.json())
      .then(d => setData(Array.isArray(d) ? d.slice(0, 5) : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator color={colors.gold} style={{ marginTop: 8 }} />;
  if (!data?.length) return <Text style={s.tabEmpty}>No players yet</Text>;

  return (
    <View style={s.tabContent}>
      {data.map(p => (
        <View key={p.playerId} style={s.lbRow}>
          <Text style={[s.lbRank, p.rank <= 3 && { color: ['#FFD700','#C0C0C0','#CD7F32'][p.rank-1] }]}>
            {p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank-1] : p.rank}
          </Text>
          <Image source={AVATAR_IMAGES[p.avatarId] || AVATAR_IMAGES.dk} style={s.lbAvatar} />
          <Text style={s.lbName} numberOfLines={1}>{p.displayName}</Text>
          <Text style={s.lbElo}>{p.elo}</Text>
        </View>
      ))}
      <Pressable onPress={() => navigationRef.navigate('Leaderboard')}>
        <Text style={s.lbMore}>View full leaderboard →</Text>
      </Pressable>
    </View>
  );
}

export default function LobbyScreen() {
  const { onFindMatch, onCancelMatch, onObserve, onLogout,
          error, matchList, onlinePlayers, inQueue, myElo, playerInfo, navigationRef,
          myRecentMatches } = useContext(GameContext);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  return (
    <ImageBackground source={require('../../assets/jungle.png')} style={s.bg} resizeMode="cover">
      <View style={s.overlay}>
        <SafeAreaView style={s.safe}>

          {/* Top bar */}
          <View style={s.topBar}>
            <Text style={s.logo}>♠ Poker Monkey ♣ <Text style={s.logoVersion}>{VERSION}</Text></Text>
            <Pressable style={s.hamburger} onPress={() => setMenuOpen(o => !o)}>
              <Text style={s.hamburgerTxt}>☰</Text>
            </Pressable>
          </View>

          {/* Hamburger menu */}
          {menuOpen && (
            <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
              <View style={s.menuPanel}>
                <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); navigationRef.navigate('Profile'); }}>
                  <Text style={s.menuItemTxt}>👤 Profile</Text>
                </Pressable>
                <Pressable style={[s.menuItem, { borderBottomWidth: 0 }]} onPress={() => { setMenuOpen(false); onLogout(); }}>
                  <Text style={s.menuItemTxt}>🚪 Log Out</Text>
                </Pressable>
              </View>
            </Pressable>
          )}

          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            {/* Greeting */}
            <View style={s.greeting}>
              <Text style={s.hi}>Hi {playerInfo?.name || ''}!</Text>
              {myElo != null && <Text style={s.elo}>ELO {myElo}</Text>}
            </View>

            {error && <Text style={s.error}>{error}</Text>}

            {/* PLAY button */}
            {inQueue ? (
              <View style={s.queueBox}>
                <Text style={s.queueTxt}>Finding opponent…</Text>
                <Pressable style={s.cancelBtn} onPress={onCancelMatch}>
                  <Text style={s.cancelTxt}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={s.playBtn} onPress={() => onFindMatch(playerInfo.name, playerInfo.avatarId, playerInfo.playerId)}>
                <Text style={s.playTxt}>PLAY!</Text>
              </Pressable>
            )}

            {/* Dashboard tabs */}
            <View style={s.tabsContainer}>
              <View style={s.tabBar}>
                {TABS.map((tab, i) => (
                  <Pressable key={i} style={[s.tabBtn, activeTab === i && s.tabBtnActive]}
                    onPress={() => setActiveTab(i)}>
                    <Text style={[s.tabLabel, activeTab === i && s.tabLabelActive]}>{tab}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.tabPanel}>
                {activeTab === 0 && <RecentTab matches={myRecentMatches} navigationRef={navigationRef} />}
                {activeTab === 1 && <FriendsTab />}
                {activeTab === 2 && <LeaderboardTab navigationRef={navigationRef} />}
              </View>
            </View>

            {/* Active tables */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Active Tables:</Text>
              {matchList.map(m => (
                <Pressable key={m.id} style={s.matchRow} onPress={() => onObserve(m.id)}>
                  <View style={s.matchInfo}>
                    <Text style={s.matchNames}>{m.player1} vs {m.player2}</Text>
                    <Text style={s.matchPhase}>
                      {m.phase === 'waiting' ? 'Starting…' : `Hand ${m.handCount} · ${m.phase}`}
                    </Text>
                  </View>
                  <Text style={s.watchTxt}>Watch →</Text>
                </Pressable>
              ))}
            </View>

            {/* Players online */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Players Online Now:</Text>
              {onlinePlayers.map(p => (
                <View key={p.id} style={s.playerRow}>
                  <Text style={s.playerName}>{p.name}</Text>
                </View>
              ))}
            </View>

          </ScrollView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  logo: { fontSize: 20, fontWeight: '900', color: colors.goldLight, letterSpacing: 1 },
  logoVersion: { fontSize: 14, fontWeight: '900', color: colors.goldLight },
  hamburger: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  hamburgerTxt: { color: colors.white, fontSize: 18 },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  menuPanel: { position: 'absolute', top: 60, right: 16, width: 180, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  menuItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  scroll: { flexGrow: 1, alignItems: 'center', padding: 24, gap: 24, paddingTop: 16 },
  greeting: { alignItems: 'center', gap: 4 },
  hi: { fontSize: 36, fontWeight: '900', color: colors.white, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  elo: { fontSize: 14, color: colors.gray, fontWeight: '600' },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  playBtn: { backgroundColor: colors.gold, borderRadius: 20, paddingVertical: 22, paddingHorizontal: 60, alignItems: 'center', shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 16, elevation: 6 },
  playTxt: { color: '#000', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  queueBox: { alignItems: 'center', gap: 14 },
  queueTxt: { color: colors.white, fontSize: 18, fontWeight: '600' },
  cancelBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  cancelTxt: { color: colors.white, fontSize: 14 },

  // Tabs
  tabsContainer: { width: '100%', maxWidth: 420, gap: 0 },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  tabLabel: { color: colors.gray, fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: colors.white, fontWeight: '800' },
  tabPanel: { backgroundColor: 'rgba(255,255,255,0.04)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(255,255,255,0.08)', minHeight: 80, padding: 14 },
  tabContent: { gap: 8 },
  tabEmpty: { color: colors.gray, fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },

  // Recent tab
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dotWin: { backgroundColor: '#4ade80' },
  dotLoss: { backgroundColor: '#f87171' },
  recentOpp: { flex: 1, color: colors.white, fontSize: 13, fontWeight: '600' },
  recentElo: { fontSize: 13, fontWeight: '700' },
  replayArrow: { color: colors.gold, fontSize: 11 },
  eloPos: { color: '#4ade80' },
  eloNeg: { color: '#f87171' },

  // Leaderboard tab
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lbRank: { width: 28, textAlign: 'center', fontSize: 14, color: colors.gray, fontWeight: '700' },
  lbAvatar: { width: 24, height: 24, borderRadius: 12 },
  lbName: { flex: 1, color: colors.white, fontSize: 13, fontWeight: '600' },
  lbElo: { color: colors.goldLight, fontSize: 13, fontWeight: '800' },
  lbMore: { color: colors.gold, fontSize: 12, textAlign: 'center', marginTop: 4 },

  section: { width: '100%', maxWidth: 420, gap: 10 },
  sectionLabel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  playerRow: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  playerName: { color: colors.white, fontSize: 14, fontWeight: '600' },
  matchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, gap: 8 },
  matchInfo: { flex: 1 },
  matchNames: { color: colors.white, fontSize: 14, fontWeight: '700' },
  matchPhase: { color: colors.gray, fontSize: 11, marginTop: 2 },
  watchTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
});
