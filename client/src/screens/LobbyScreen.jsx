import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Share, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { LobbyContext } from '../context/LobbyContext';
import { colors } from '../theme';
import { VERSION_DISPLAY, SERVER_URL } from '../config';
import { track } from '../utils/analytics';
import { flagEmoji } from '../utils/flag';
import { continentOf, regionEmoji, GLOBAL_EMOJI } from '../utils/regions';
import { AvatarBadge } from '../components/MatchFlowOverlays';
import SoundButton from '../components/SoundButton';
import AchievementGallery from '../components/AchievementGallery';
import { ACHIEVEMENTS, mergeAchievements } from '../data/achievements';

const INVITE_BASE = 'https://pokermonkey.app';

// One "Looking to play" row. States, in priority order:
//   incoming — they challenged me        → green, Accept
//   issued   — I challenged them         → green, Cancel
//   normal   — challengeable human       → gold VS button
// Players in a bot game are still listed (they're waiting for humans too).
function PlayerRow({ p, incoming, issued, onChallenge, onCancelChallenge, onAccept }) {
  // Bot-game players still read "Looking to play" — they only flip to
  // "Playing a bot" once they've refused (or ignored) a challenge there
  const status =
    incoming     ? 'Wants to play you!' :
    issued       ? 'Challenge issued'   :
    p.isBot      ? 'Always ready 🤖'    :
    p.botRefused ? 'Playing a bot 🤖'   : 'Looking to play';
  const green = incoming || issued;
  const onPress = incoming ? () => onAccept(p.id)
                : issued   ? () => onCancelChallenge(p.id)
                :             () => onChallenge(p.id);
  return (
    <Pressable style={[s.row, green && s.rowGreen]} onPress={onPress}>
      <AvatarBadge avatarId={p.avatarId} country={p.country} isBot={!!p.isBot} size={46} />
      <View style={s.rowWho}>
        <Text style={s.rowName} numberOfLines={1}>{p.name}</Text>
        <View style={s.rowMeta}>
          <View style={[s.dot, green ? s.dotGreen : s.dotGold]} />
          <Text style={[s.rowStatus, green && s.rowStatusGreen]} numberOfLines={1}>{status}</Text>
          {!green && <Text style={s.rowElo}> · {p.elo || 1200}</Text>}
        </View>
      </View>
      {incoming ? (
        <View style={[s.vsBtn, s.acceptBtn]} pointerEvents="none">
          <Text style={s.acceptBtnTxt}>Accept</Text>
        </View>
      ) : issued ? (
        <View style={s.cancelBtn} pointerEvents="none">
          <Text style={s.cancelBtnTxt}>Cancel</Text>
        </View>
      ) : (
        <View style={s.vsBtn} pointerEvents="none">
          <Text style={s.vsBtnTxt}>VS</Text>
        </View>
      )}
    </Pressable>
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [lbData, setLbData] = useState(null);
  const [achievements, setAchievements] = useState(() => mergeAchievements([]));
  const [lbTab, setLbTab]   = useState('global');   // 'global' | 'country'
  const copiedTimer = useRef(null);

  const myPlayerId = playerInfo?.playerId;

  // Native: OS share sheet. Web: browser share dialog where it exists (mobile
  // browsers), otherwise copy the link and confirm inline.
  const shareInvite = async () => {
    track('InviteFriends');
    const url = `${INVITE_BASE}/?ref=raf_${encodeURIComponent(myPlayerId || '')}`;
    const message = `Play me heads-up at Poker Monkey 🐵 ${url}`;
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title: 'Poker Monkey', text: message, url });
        } else {
          await navigator.clipboard?.writeText(url);
          setLinkCopied(true);
          clearTimeout(copiedTimer.current);
          copiedTimer.current = setTimeout(() => setLinkCopied(false), 2200);
        }
      } else {
        await Share.share({ message });
      }
    } catch {} // dismissed share sheet — not an error
  };
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Fetch achievements on focus
  const fetchAchievements = useCallback(() => {
    if (!myPlayerId) return;
    fetch(`${SERVER_URL}/api/player/${encodeURIComponent(myPlayerId)}/achievements`)
      .then(r => r.json())
      .then(data => setAchievements(mergeAchievements(data.achievements || [])))
      .catch(() => {});
  }, [myPlayerId]);
  useEffect(() => {
    fetchAchievements();
    const unsub = navigation.addListener('focus', fetchAchievements);
    return unsub;
  }, [fetchAchievements, navigation]);

  // Fetch leaderboard preview on focus
  const fetchLb = useCallback(() => {
    const url = myPlayerId
      ? `${SERVER_URL}/api/leaderboard?playerId=${encodeURIComponent(myPlayerId)}`
      : `${SERVER_URL}/api/leaderboard`;
    fetch(url).then(r => r.json()).then(setLbData).catch(() => {});
  }, [myPlayerId]);
  useEffect(() => {
    fetchLb();
    const unsub = navigation.addListener('focus', fetchLb);
    return unsub;
  }, [fetchLb, navigation]);

  const humans = (onlinePlayers || []).filter(p => !p.isBot);

  // Leaderboard card — Global vs My-country tabs, derived client-side from the full list
  const lbEntries = lbData?.entries || [];
  const myLbEntry = lbEntries.find(e => e.playerId === myPlayerId);
  const myCountry = myLbEntry?.country || playerInfo?.country || null;
  const myContinent = continentOf(myCountry);
  const lbCountry = myCountry ? lbEntries.filter(e => e.country === myCountry).map((e, i) => ({ ...e, rank: i + 1 })) : [];
  const lbRegion  = myContinent ? lbEntries.filter(e => continentOf(e.country) === myContinent).map((e, i) => ({ ...e, rank: i + 1 })) : [];
  const lbActive  = (lbTab === 'country' && myCountry)   ? lbCountry
                  : (lbTab === 'region'  && myContinent) ? lbRegion
                  : lbEntries;
  const lbTop5    = lbActive.slice(0, 5);
  const lbMyRow   = lbActive.find(e => e.playerId === myPlayerId);
  const lbMeInTop = lbTop5.some(p => p.playerId === myPlayerId);
  const lbAhead   = lbMyRow ? lbActive.find(e => e.rank === lbMyRow.rank - 1) : null;  // the player just above me

  // Everyone online is implicitly looking to play — challengeable unless in a
  // human match. Bot-game players stay listed (15s to answer a challenge).
  const looking = humans
    .filter(p => p.id !== myPlayerId && (!p.inMatch || p.inBotMatch))
    .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));

  // House bot — always listed so there's a game one tap away even in a dead
  // lobby. Challenging a bot id starts the match instantly server-side.
  const freeBot = (onlinePlayers || []).find(p => p.isBot && !p.inMatch) || null;

  const liveRows = (matchList || []).filter(m => !m.isBotMatch);

  const isIncoming = (id) => (incomingChallenges || []).some(c => c.fromId === id);
  const isIssued   = (id) => (outgoingChallenges || []).some(c => c.toId === id);

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safe}>

        {/* Header */}
        <View style={s.topbar}>
          <View style={s.who}>
            <Text style={s.hi} numberOfLines={1}>{(playerInfo?.name || '').slice(0, 10)}</Text>
            <View style={s.eloPill}>
              <Text style={s.eloLbl}>ELO </Text>
              <Text style={s.eloVal}>{myElo ?? 1200}</Text>
            </View>
          </View>
          <View style={s.topbarBtns}>
            <SoundButton style={s.ham} />
            <Pressable style={s.ham} onPress={() => setMenuOpen(o => !o)}>
              <Text style={s.hamTxt}>☰</Text>
            </Pressable>
          </View>
        </View>

        {/* Hamburger menu */}
        {menuOpen && (
          <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={s.menuPanel}>
              <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); navigationRef.navigate('Profile'); }}>
                <Text style={s.menuItemTxt}>👤 Profile</Text>
              </Pressable>
              <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); if (typeof window !== 'undefined') { const base = window.location.hostname === 'localhost' ? 'http://localhost:3843' : window.location.origin; window.open(base + '/admin/dialogs', '_blank'); } }}>
                <Text style={s.menuItemTxt}>✏️ Dialog Copy</Text>
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

            {/* Achievements */}
            <AchievementGallery achievements={achievements} />

            {/* Looking to play */}
            <View style={s.sec}>
              <Text style={s.secIcGold}>⚡</Text>
              <Text style={[s.secTitle, s.secTitleGold]}>Looking to play</Text>
              <View style={s.count}><Text style={s.countTxt}>{looking.length + (freeBot ? 1 : 0)}</Text></View>
            </View>
            {(looking.length || freeBot) ? (
              <>
                {looking.map(p => (
                  <PlayerRow key={p.id} p={p}
                    incoming={isIncoming(p.id)} issued={isIssued(p.id)}
                    onChallenge={onChallenge} onCancelChallenge={onWithdrawChallenge}
                    onAccept={onAcceptChallenge} />
                ))}
                {freeBot && (
                  <PlayerRow key={freeBot.id} p={freeBot}
                    onChallenge={onChallenge} />
                )}
                {/* Invite friends — action row, final slot of the list */}
                <Pressable style={s.inviteRow} onPress={shareInvite}>
                  <View style={s.inviteTile}><Text style={s.inviteTileTxt}>＋</Text></View>
                  <View style={s.rowWho}>
                    <Text style={s.rowName}>Invite friends</Text>
                    <Text style={s.inviteSub}>Bring a human to play</Text>
                  </View>
                  <View style={s.inviteBtn} pointerEvents="none">
                    <Text style={s.inviteBtnTxt}>Invite</Text>
                  </View>
                </Pressable>
              </>
            ) : (
              <View style={s.emptyPool}>
                <Text style={s.epIc}>🙈</Text>
                <Text style={s.epTitle}>Nobody's free right now</Text>
                <Text style={s.epSub}>Invite a friend to play — or tap <Text style={s.epGold}>Quick Match</Text> for a bot until a human arrives.</Text>
                <Pressable style={s.epInviteBtn} onPress={shareInvite}>
                  <Text style={s.epInviteTxt}>＋ Invite friends</Text>
                </Pressable>
              </View>
            )}
            {linkCopied && <Text style={s.copied}>🔗 Invite link copied</Text>}

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

            {/* Leaderboard preview card */}
            {lbData && (
              <>
                <View style={s.sec}>
                  <Text style={s.secIcGold}>🏆</Text>
                  <Text style={[s.secTitle, s.secTitleGold]}>Leaderboard</Text>
                </View>
                <View style={s.lbCard}>
                  {/* Global · my-continent · my-country tabs */}
                  <View style={s.lbTabs}>
                    <Pressable style={[s.lbTab, lbTab === 'global' && s.lbTabOn]} onPress={() => setLbTab('global')}>
                      <Text style={[s.lbTabTxt, lbTab === 'global' && s.lbTabTxtOn]} numberOfLines={1}>{GLOBAL_EMOJI} Global</Text>
                    </Pressable>
                    {myContinent && (
                      <Pressable style={[s.lbTab, lbTab === 'region' && s.lbTabOn]} onPress={() => setLbTab('region')}>
                        <Text style={[s.lbTabTxt, lbTab === 'region' && s.lbTabTxtOn]} numberOfLines={1}>{regionEmoji(myContinent)} {myContinent}</Text>
                      </Pressable>
                    )}
                    {myCountry && (
                      <Pressable style={[s.lbTab, lbTab === 'country' && s.lbTabOn]} onPress={() => setLbTab('country')}>
                        <Text style={[s.lbTabTxt, lbTab === 'country' && s.lbTabTxtOn]} numberOfLines={1}>{flagEmoji(myCountry)} {myCountry}</Text>
                      </Pressable>
                    )}
                  </View>

                  {lbTop5.map(p => {
                    const me = p.playerId === myPlayerId;
                    return (
                      <View key={p.playerId} style={[s.lbRow, me && s.lbRowMe]}>
                        <Text style={s.lbRank}>{p.rank}</Text>
                        <Text style={s.lbFlag}>{p.isBot ? '🤖' : flagEmoji(p.country)}</Text>
                        <Text style={[s.lbName, me && s.lbNameMe]} numberOfLines={1}>{me ? 'You' : p.displayName}</Text>
                        <Text style={[s.lbElo, me && s.lbEloMe]}>{p.elo}</Text>
                      </View>
                    );
                  })}

                  {/* My position + the player just ahead (when not already in the top 5) */}
                  {lbMyRow && !lbMeInTop && (
                    <>
                      <View style={s.lbSep} />
                      {lbAhead && (
                        <View style={s.lbRow}>
                          <Text style={s.lbRank}>{lbAhead.rank}</Text>
                          <Text style={s.lbFlag}>{lbAhead.isBot ? '🤖' : flagEmoji(lbAhead.country)}</Text>
                          <Text style={s.lbName} numberOfLines={1}>{lbAhead.displayName}</Text>
                          <Text style={s.lbElo}>{lbAhead.elo}</Text>
                        </View>
                      )}
                      <View style={[s.lbRow, s.lbRowMe]}>
                        <Text style={s.lbRank}>{lbMyRow.rank}</Text>
                        <Text style={s.lbFlag}>{flagEmoji(lbMyRow.country)}</Text>
                        <Text style={[s.lbName, s.lbNameMe]} numberOfLines={1}>You</Text>
                        <Text style={[s.lbElo, s.lbEloMe]}>{lbMyRow.elo}</Text>
                      </View>
                    </>
                  )}

                  <Pressable style={s.lbSeeAll} onPress={() => navigation.navigate('Leaderboard')}>
                    <Text style={s.lbSeeAllTxt}>See full leaderboard ›</Text>
                  </Pressable>
                </View>
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
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 },
  hi: { fontSize: 25, fontWeight: '900', color: colors.white, letterSpacing: -0.2, flexShrink: 1 },
  eloPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(240,192,64,0.12)', borderWidth: 1, borderColor: 'rgba(240,192,64,0.3)',
    borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9,
  },
  eloLbl: { color: '#8a98aa', fontSize: 12, fontWeight: '700' },
  eloVal: { color: colors.goldLight, fontSize: 12, fontWeight: '800' },
  topbarBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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

  inviteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9,
    backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)',
    borderStyle: 'dashed', borderRadius: 17, paddingVertical: 12, paddingHorizontal: 13,
  },
  inviteTile: {
    width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(240,192,64,0.45)',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  inviteTileTxt: { color: colors.goldLight, fontSize: 22, fontWeight: '800' },
  inviteSub: { color: '#8a98aa', fontSize: 12, fontWeight: '700', marginTop: 4 },
  inviteBtn: {
    height: 38, borderRadius: 11, paddingHorizontal: 16, backgroundColor: colors.goldLight,
    alignItems: 'center', justifyContent: 'center',
  },
  inviteBtnTxt: { color: '#0c151f', fontSize: 13, fontWeight: '900' },

  emptyPool: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)',
    borderStyle: 'dashed', borderRadius: 18, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center',
  },
  epInviteBtn: {
    alignSelf: 'stretch', marginTop: 16, backgroundColor: colors.goldLight, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  epInviteTxt: { color: '#0c151f', fontSize: 15, fontWeight: '900' },
  copied: { color: '#36d07f', fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 2 },
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

  lbCard: {
    backgroundColor: '#0f1c2e', borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(240,192,64,0.2)', overflow: 'hidden', marginBottom: 8,
  },
  lbTabs:    { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  lbTab:     { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  lbTabOn:   { backgroundColor: 'rgba(240,192,64,0.16)' },
  lbTabTxt:  { color: '#8a98aa', fontSize: 13, fontWeight: '800' },
  lbTabTxtOn:{ color: colors.goldLight },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  lbRowMe: { backgroundColor: 'rgba(240,192,64,0.1)' },
  lbRank:   { color: colors.goldLight, fontSize: 13, fontWeight: '900', width: 42, textAlign: 'center' },
  lbName:   { flex: 1, color: colors.white, fontSize: 14, fontWeight: '800' },
  lbNameMe: { color: colors.goldLight },
  lbFlag:   { fontSize: 15 },
  lbElo:    { color: '#8a98aa', fontSize: 13, fontWeight: '800', minWidth: 36, textAlign: 'right' },
  lbEloMe:  { color: colors.goldLight },
  lbSep:    { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 14 },
  lbSeeAll: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 12, alignItems: 'center',
  },
  lbSeeAllTxt: { color: colors.goldLight, fontSize: 13, fontWeight: '800' },

  version: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 24 },
});
