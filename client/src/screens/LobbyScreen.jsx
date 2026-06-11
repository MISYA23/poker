import React, { useContext, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { LobbyContext } from '../context/LobbyContext';
import { colors } from '../theme';
import { VERSION_DISPLAY } from '../config';
import { AvatarBadge } from '../components/MatchFlowOverlays';

// One "Looking to play" row. States, in priority order:
//   incoming — they challenged me        → green, Accept
//   issued   — I challenged them         → green, Cancel
//   normal   — challengeable human       → gold VS button
// Players in a bot game are still listed (they're waiting for humans too).
function PlayerRow({ p, incoming, issued, onChallenge, onCancelChallenge, onAccept }) {
  const status =
    incoming     ? 'Wants to play you!' :
    issued       ? 'Challenge issued'   :
    p.inBotMatch ? 'Playing a bot 🤖'   : 'Looking to play';
  const green = incoming || issued;
  return (
    <View style={[s.row, green && s.rowGreen]}>
      <AvatarBadge avatarId={p.avatarId} country={p.country} size={46} />
      <View style={s.rowWho}>
        <Text style={s.rowName} numberOfLines={1}>{p.name}</Text>
        <View style={s.rowMeta}>
          <View style={[s.dot, green ? s.dotGreen : s.dotGold]} />
          <Text style={[s.rowStatus, green && s.rowStatusGreen]} numberOfLines={1}>{status}</Text>
          {!green && <Text style={s.rowElo}> · {p.elo || 1200}</Text>}
        </View>
      </View>
      {incoming ? (
        <Pressable style={[s.vsBtn, s.acceptBtn]} onPress={() => onAccept(p.id)}>
          <Text style={s.acceptBtnTxt}>Accept</Text>
        </Pressable>
      ) : issued ? (
        <Pressable style={s.cancelBtn} onPress={() => onCancelChallenge(p.id)}>
          <Text style={s.cancelBtnTxt}>Cancel</Text>
        </Pressable>
      ) : (
        <Pressable style={s.vsBtn} onPress={() => onChallenge(p.id)}>
          <Text style={s.vsBtnTxt}>VS</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function LobbyScreen({ navigation }) {
  const { onLogout, playerInfo, navigationRef, emit } = useContext(GameContext);
  const { onFindMatch, onObserve, error, matchList, onlinePlayers, myElo,
          incomingChallenges, outgoingChallenges,
          onChallenge, onAcceptChallenge, onWithdrawChallenge } = useContext(LobbyContext);

  useEffect(() => {
    if (Platform.OS === 'web' && !playerInfo) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, []);

  // Lobby and table are mutually exclusive: announce lobby presence on every
  // focus so the server can close out any match this player walked away from.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (playerInfo?.playerId) emit('enter-lobby', { playerId: playerInfo.playerId });
    });
    return unsub;
  }, [navigation, playerInfo?.playerId, emit]);

  const [menuOpen, setMenuOpen] = useState(false);

  const myPlayerId = playerInfo?.playerId;
  const humans = (onlinePlayers || []).filter(p => !p.isBot);

  // Everyone online is implicitly looking to play — challengeable unless in a
  // human match. Bot-game players stay listed (15s to answer a challenge).
  const looking = humans
    .filter(p => p.id !== myPlayerId && (!p.inMatch || p.inBotMatch))
    .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));

  // Live now: human-vs-human matches only. If there are none, show just the
  // match of the highest-ELO player currently playing (presumably vs a bot).
  const maxElo = (m) => Math.max(m.player1Elo || 1200, m.player2Elo || 1200);
  let liveRows = (matchList || []).filter(m => !m.isBotMatch);
  if (!liveRows.length && matchList?.length) {
    liveRows = [matchList.reduce((best, m) => (maxElo(m) > maxElo(best) ? m : best), matchList[0])];
  }

  const isIncoming = (id) => (incomingChallenges || []).some(c => c.fromId === id);
  const isIssued   = (id) => (outgoingChallenges || []).some(c => c.toId === id);

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safe}>

        {/* Header */}
        <View style={s.topbar}>
          <View>
            <Text style={s.hi} numberOfLines={1}>Hi {playerInfo?.name || ''}!</Text>
            <View style={s.eloPill}>
              <Text style={s.eloLbl}>ELO </Text>
              <Text style={s.eloVal}>{myElo ?? 1200}</Text>
            </View>
          </View>
          <Pressable style={s.ham} onPress={() => setMenuOpen(o => !o)}>
            <Text style={s.hamTxt}>☰</Text>
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
          <View style={s.col}>

            {/* Presence chip — only when MORE THAN 3 humans online */}
            {humans.length > 3 && (
              <View style={s.presence}>
                <View style={s.blob} />
                <Text style={s.presenceTxt}>
                  <Text style={s.presenceB}>{humans.length} humans</Text> online ·{' '}
                  <Text style={s.presenceLook}>{looking.length} looking to play</Text>
                </Text>
              </View>
            )}

            {error && <Text style={s.error}>{error}</Text>}

            {/* QUICK MATCH */}
            <Pressable style={({ pressed }) => [s.hero, pressed && { transform: [{ scale: 0.985 }] }]}
              onPress={() => onFindMatch(myPlayerId)}>
              <View style={s.heroBolt}><Text style={s.heroBoltTxt}>⚡</Text></View>
              <Text style={s.heroTxt}>QUICK MATCH</Text>
              <Text style={s.heroChev}>›</Text>
            </Pressable>

            {/* Looking to play */}
            <View style={s.sec}>
              <Text style={s.secIcGold}>⚡</Text>
              <Text style={[s.secTitle, s.secTitleGold]}>Looking to play</Text>
              <View style={s.count}><Text style={s.countTxt}>{looking.length}</Text></View>
            </View>
            {looking.length ? looking.map(p => (
              <PlayerRow key={p.id} p={p}
                incoming={isIncoming(p.id)} issued={isIssued(p.id)}
                onChallenge={onChallenge} onCancelChallenge={onWithdrawChallenge}
                onAccept={onAcceptChallenge} />
            )) : (
              <View style={s.emptyPool}>
                <Text style={s.epIc}>🙈</Text>
                <Text style={s.epTitle}>Nobody's free right now</Text>
                <Text style={s.epSub}>Tap <Text style={s.epGold}>Quick Match</Text> — play a bot until a human arrives.</Text>
              </View>
            )}

            {/* Live now */}
            {liveRows.length > 0 && (
              <>
                <View style={s.sec}>
                  <View style={s.liveDotHead} />
                  <Text style={s.secTitle}>Live now</Text>
                  <View style={s.count}><Text style={s.countTxt}>{liveRows.length}</Text></View>
                </View>
                {liveRows.map(m => (
                  <Pressable key={m.id} style={s.liveRow} onPress={() => onObserve(m.id)}>
                    <View style={s.liveRec}>
                      <View style={s.liveDot} />
                      <Text style={s.liveRecTxt}>LIVE</Text>
                    </View>
                    <Text style={s.liveVs} numberOfLines={1}>
                      {m.player1} <Text style={s.liveX}>vs</Text> {m.player2}
                    </Text>
                    <View style={s.watch}><Text style={s.watchTxt}>WATCH</Text></View>
                  </Pressable>
                ))}
              </>
            )}

            <Text style={s.version}>{VERSION_DISPLAY}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1420' },
  safe: { flex: 1 },

  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4,
    width: '100%', maxWidth: 460, alignSelf: 'center',
  },
  hi: { fontSize: 25, fontWeight: '900', color: colors.white, letterSpacing: -0.2, maxWidth: 290 },
  eloPill: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', marginTop: 7,
    backgroundColor: 'rgba(240,192,64,0.12)', borderWidth: 1, borderColor: 'rgba(240,192,64,0.3)',
    borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9,
  },
  eloLbl: { color: '#8a98aa', fontSize: 12, fontWeight: '700' },
  eloVal: { color: colors.goldLight, fontSize: 12, fontWeight: '800' },
  ham: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center',
  },
  hamTxt: { color: colors.white, fontSize: 18 },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  menuPanel: {
    position: 'absolute', top: 64, right: 16, width: 180, backgroundColor: '#111',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', elevation: 8,
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  menuItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },

  scroll: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 40 },
  col: { width: '100%', maxWidth: 460, alignSelf: 'center' },

  presence: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 13, paddingVertical: 10, paddingHorizontal: 13, marginTop: 14,
  },
  blob: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#36d07f' },
  presenceTxt: { fontSize: 13, color: '#8a98aa', fontWeight: '700' },
  presenceB: { color: colors.white },
  presenceLook: { color: colors.goldLight },

  error: { color: '#f87171', fontSize: 13, textAlign: 'center', marginTop: 10 },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16, marginBottom: 8,
    backgroundColor: colors.goldLight, borderRadius: 22, paddingVertical: 20, paddingHorizontal: 22,
    shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  heroBolt: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(12,21,31,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBoltTxt: { fontSize: 24 },
  heroTxt: { color: '#0c151f', fontSize: 23, fontWeight: '900', letterSpacing: 0.3 },
  heroChev: { marginLeft: 'auto', color: 'rgba(12,21,31,0.5)', fontSize: 26, fontWeight: '900' },

  sec: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 11, paddingHorizontal: 2 },
  secIcGold: { fontSize: 14 },
  secTitle: { color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  secTitleGold: { color: colors.goldLight },
  count: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9 },
  countTxt: { color: '#5b6a7d', fontSize: 12, fontWeight: '800' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9,
    backgroundColor: 'rgba(240,192,64,0.07)', borderWidth: 1, borderColor: 'rgba(240,192,64,0.35)',
    borderRadius: 17, paddingVertical: 12, paddingHorizontal: 13,
  },
  rowGreen: { backgroundColor: 'rgba(70,194,133,0.08)', borderColor: 'rgba(70,194,133,0.45)' },
  rowWho: { flex: 1, minWidth: 0 },
  rowName: { color: colors.white, fontSize: 16, fontWeight: '800' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGold: { backgroundColor: colors.goldLight },
  dotGreen: { backgroundColor: '#36d07f' },
  rowStatus: { color: colors.goldLight, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  rowStatusGreen: { color: '#36d07f', fontWeight: '800' },
  rowElo: { color: '#8a98aa', fontSize: 12, fontWeight: '700' },
  vsBtn: {
    width: 52, height: 38, borderRadius: 11, backgroundColor: colors.goldLight,
    alignItems: 'center', justifyContent: 'center',
  },
  vsBtnTxt: { color: '#0c151f', fontSize: 15, fontWeight: '900' },
  acceptBtn: { width: 76, backgroundColor: '#36d07f' },
  acceptBtnTxt: { color: '#0c151f', fontSize: 13, fontWeight: '900' },
  cancelBtn: {
    height: 38, borderRadius: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cancelBtnTxt: { color: '#8a98aa', fontSize: 12, fontWeight: '800' },

  emptyPool: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)',
    borderStyle: 'dashed', borderRadius: 18, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center',
  },
  epIc: { fontSize: 38, marginBottom: 8 },
  epTitle: { color: colors.white, fontSize: 16, fontWeight: '900', marginBottom: 7 },
  epSub: { color: '#8a98aa', fontSize: 13, fontWeight: '700', lineHeight: 19, textAlign: 'center', maxWidth: 280 },
  epGold: { color: colors.goldLight },

  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9,
    backgroundColor: '#15212f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 17, padding: 13,
  },
  liveRec: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef5d52' },
  liveDotHead: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#ef5d52' },
  liveRecTxt: { color: '#ef5d52', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  liveVs: { flex: 1, textAlign: 'center', color: colors.white, fontSize: 13, fontWeight: '800' },
  liveX: { color: '#5b6a7d', fontSize: 11 },
  watch: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10 },
  watchTxt: { color: '#8a98aa', fontSize: 11, fontWeight: '900' },

  version: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 24 },
});
