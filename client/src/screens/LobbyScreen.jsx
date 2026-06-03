import React, { useContext, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';

export default function LobbyScreen() {
  const { onFindMatch, onCancelMatch, onObserve, onLogout,
          error, matchList, inQueue, myElo, playerInfo } = useContext(GameContext);

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ImageBackground source={require('../../assets/jungle.png')} style={s.bg} resizeMode="cover">
      <View style={s.overlay}>
        <SafeAreaView style={s.safe}>

          {/* Top bar */}
          <View style={s.topBar}>
            <View>
              <Text style={s.logo}>♠ Poker Monkey ♣</Text>
              <Text style={s.playerName}>
                {playerInfo?.name || ''}
                {myElo != null ? `  ·  ELO ${myElo}` : ''}
              </Text>
            </View>
            <Pressable style={s.hamburger} onPress={() => setMenuOpen(o => !o)}>
              <Text style={s.hamburgerTxt}>☰</Text>
            </Pressable>
          </View>

          {/* Hamburger menu */}
          {menuOpen && (
            <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
              <View style={s.menuPanel}>
                <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); onLogout(); }}>
                  <Text style={s.menuItemTxt}>🚪 Log Out</Text>
                </Pressable>
              </View>
            </Pressable>
          )}

          <ScrollView contentContainerStyle={s.scroll}>

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

            {/* Observer list */}
            {matchList.length > 0 && (
              <View style={s.observeSection}>
                <Text style={s.observeLabel}>Observe:</Text>
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
            )}

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
  playerName: { fontSize: 12, color: colors.gray, marginTop: 2 },
  hamburger: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  hamburgerTxt: { color: colors.white, fontSize: 18 },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  menuPanel: { position: 'absolute', top: 60, right: 16, width: 180, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  menuItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  playBtn: { backgroundColor: colors.gold, borderRadius: 20, paddingVertical: 22, paddingHorizontal: 60, alignItems: 'center', shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 16, elevation: 6 },
  playTxt: { color: '#000', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  queueBox: { alignItems: 'center', gap: 14 },
  queueTxt: { color: colors.white, fontSize: 18, fontWeight: '600' },
  cancelBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  cancelTxt: { color: colors.white, fontSize: 14 },
  observeSection: { width: '100%', maxWidth: 420, gap: 10 },
  observeLabel: { color: colors.gray, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  matchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, gap: 8 },
  matchInfo: { flex: 1 },
  matchNames: { color: colors.white, fontSize: 14, fontWeight: '700' },
  matchPhase: { color: colors.gray, fontSize: 11, marginTop: 2 },
  watchTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
});
