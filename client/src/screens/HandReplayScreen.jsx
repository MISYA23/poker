import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import { colors } from '../theme';
import { SERVER_URL } from '../config';

function describeEvent(ev) {
  const name = ev.playerName || 'Player';
  const amt  = ev.amount ? ` $${ev.amount.toLocaleString()}` : '';
  switch (ev.type) {
    case 'hand_start':   return `Hand started`;
    case 'deal':         return `${name} dealt hole cards`;
    case 'blind_small':  return `${name} posts small blind${amt}`;
    case 'blind_big':    return `${name} posts big blind${amt}`;
    case 'action': {
      const d = ev.data || {};
      switch (d.action || ev.type) {
        case 'fold':    return `${name} folds`;
        case 'check':   return `${name} checks`;
        case 'call':    return `${name} calls${amt}`;
        case 'bet':     return `${name} bets${amt}`;
        case 'raise':   return `${name} raises to${amt}`;
        case 'all-in':  return `${name} is all in`;
        default:        return `${name}: ${d.action || ev.type}${amt}`;
      }
    }
    case 'community': {
      const cards = ev.data?.cards || [];
      const phase = ev.phase || ev.data?.phase || '';
      return `${phase.charAt(0).toUpperCase() + phase.slice(1)}: ${cards.join(' ')}`;
    }
    case 'showdown':     return `Showdown`;
    default:             return ev.type;
  }
}

function parseCard(str) {
  if (!str || str.length < 2) return null;
  const rank = str.slice(0, -1);
  const suit = str.slice(-1).toLowerCase();
  return { rank, suit };
}

export default function HandReplayScreen({ navigation, route }) {
  const { matchId, matchLabel } = route.params || {};

  const [hands, setHands]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [handIdx, setHandIdx]   = useState(0);
  const [eventIdx, setEventIdx] = useState(0);

  useEffect(() => {
    if (!matchId) return;
    fetch(`${SERVER_URL}/api/match/${matchId}/replay`)
      .then(r => r.json())
      .then(data => { setHands(Array.isArray(data) ? data : []); })
      .catch(() => setHands([]))
      .finally(() => setLoading(false));
  }, [matchId]);

  const currentHand = hands?.[handIdx];
  const events      = currentHand?.events || [];
  const currentEvent = events[eventIdx];

  // Build visual state up to current event
  const state = useMemo(() => {
    if (!currentHand) return { communityCards: [], players: {}, pot: 0 };
    const communityCards = [];
    const players = {};
    let pot = 0;

    for (let i = 0; i <= eventIdx; i++) {
      const ev = events[i];
      if (!ev) break;
      const d = ev.data || {};

      if (ev.type === 'hand_start') {
        (d.players || []).forEach(p => {
          players[p.id] = { name: p.name, chips: p.chips, holeCards: [], lastAction: '' };
        });
      }
      if (ev.type === 'deal' && d.playerId) {
        if (!players[d.playerId]) players[d.playerId] = { name: d.playerName, chips: 0, holeCards: [], lastAction: '' };
        players[d.playerId].holeCards = (d.cards || []).map(parseCard).filter(Boolean);
      }
      if (ev.type === 'blind_small' || ev.type === 'blind_big') {
        pot += ev.amount || 0;
      }
      if (ev.type === 'action') {
        const action = d.action || '';
        if (ev.playerId && players[ev.playerId]) {
          players[ev.playerId].lastAction = action;
        }
        if (['call','raise','bet','all-in'].includes(action)) pot += ev.amount || 0;
      }
      if (ev.type === 'community') {
        (d.cards || []).forEach(c => communityCards.push(parseCard(c)));
      }
    }

    return { communityCards, players: Object.values(players), pot };
  }, [currentHand, eventIdx]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator color={colors.gold} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!hands?.length) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()}><Text style={s.back}>← Back</Text></Pressable>
          <Text style={s.title}>Hand History</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.center}><Text style={s.empty}>No hand history found for this match.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={s.back}>← Back</Text></Pressable>
        <Text style={s.title}>{matchLabel || 'Replay'}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Hand selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.handTabs}>
        {hands.map((h, i) => (
          <Pressable key={i} style={[s.handTab, handIdx === i && s.handTabActive]}
            onPress={() => { setHandIdx(i); setEventIdx(0); }}>
            <Text style={[s.handTabTxt, handIdx === i && s.handTabTxtActive]}>H{h.handNumber}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Table */}
      <View style={s.felt}>
        {/* Community cards */}
        <View style={s.communityRow}>
          {[0,1,2,3,4].map(i => {
            const card = state.communityCards[i];
            if (!card) return <View key={i} style={s.ccPlaceholder} />;
            return <Card key={i} card={card} size="md" faceDown={false} />;
          })}
        </View>
        {/* Pot */}
        {state.pot > 0 && (
          <Text style={s.pot}>Pot: ${state.pot.toLocaleString()}</Text>
        )}
      </View>

      {/* Event description */}
      <View style={s.eventBox}>
        <Text style={s.eventTxt}>
          {currentEvent ? describeEvent(currentEvent) : '—'}
        </Text>
        <Text style={s.eventCounter}>{eventIdx + 1} / {events.length}</Text>
      </View>

      {/* Players row */}
      <View style={s.playersRow}>
        {state.players.map((p, i) => (
          <View key={i} style={s.playerChip}>
            <Text style={s.playerChipName} numberOfLines={1}>{p.name}</Text>
            {p.holeCards?.length > 0 && (
              <View style={s.playerCards}>
                {p.holeCards.map((c, j) => <Card key={j} card={c} size="xs" faceDown={false} />)}
              </View>
            )}
            {p.lastAction ? <Text style={s.playerAction}>{p.lastAction}</Text> : null}
          </View>
        ))}
      </View>

      {/* Event log */}
      <ScrollView style={s.eventLog} contentContainerStyle={s.eventLogContent}>
        {events.map((ev, i) => (
          <Pressable key={i} style={[s.eventRow, i === eventIdx && s.eventRowActive]}
            onPress={() => setEventIdx(i)}>
            <Text style={s.eventRowNum}>{ev.seq || i + 1}</Text>
            <Text style={[s.eventRowTxt, i === eventIdx && s.eventRowTxtActive]} numberOfLines={1}>
              {describeEvent(ev)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Navigation controls */}
      <View style={s.controls}>
        <Pressable style={[s.navBtn, eventIdx === 0 && s.navBtnDim]}
          onPress={() => setEventIdx(0)} disabled={eventIdx === 0}>
          <Text style={s.navBtnTxt}>⏮</Text>
        </Pressable>
        <Pressable style={[s.navBtn, eventIdx === 0 && s.navBtnDim]}
          onPress={() => setEventIdx(i => Math.max(0, i - 1))} disabled={eventIdx === 0}>
          <Text style={s.navBtnTxt}>◀</Text>
        </Pressable>
        <Pressable style={[s.navBtn, eventIdx >= events.length - 1 && s.navBtnDim]}
          onPress={() => setEventIdx(i => Math.min(events.length - 1, i + 1))}
          disabled={eventIdx >= events.length - 1}>
          <Text style={s.navBtnTxt}>▶</Text>
        </Pressable>
        <Pressable style={[s.navBtn, eventIdx >= events.length - 1 && s.navBtnDim]}
          onPress={() => setEventIdx(events.length - 1)} disabled={eventIdx >= events.length - 1}>
          <Text style={s.navBtnTxt}>⏭</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a1628' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.gray, fontSize: 14, fontStyle: 'italic' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  back: { color: colors.goldLight, fontSize: 15 },
  title: { color: colors.white, fontSize: 16, fontWeight: '800' },

  handTabs: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  handTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  handTabActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  handTabTxt: { color: colors.gray, fontSize: 13, fontWeight: '700' },
  handTabTxtActive: { color: '#000' },

  felt: { marginHorizontal: 12, borderRadius: 60, backgroundColor: '#0d2148', borderWidth: 10, borderColor: '#2a1408', paddingVertical: 16, alignItems: 'center', gap: 8 },
  communityRow: { flexDirection: 'row', gap: 5 },
  ccPlaceholder: { width: 52, height: 56 },
  pot: { color: colors.goldLight, fontSize: 13, fontWeight: '700' },

  eventBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  eventTxt: { flex: 1, color: colors.white, fontSize: 14, fontWeight: '600' },
  eventCounter: { color: colors.gray, fontSize: 12 },

  playersRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  playerChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 8, alignItems: 'center', gap: 4 },
  playerChipName: { color: colors.white, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  playerCards: { flexDirection: 'row', gap: 2 },
  playerAction: { color: colors.orange, fontSize: 10, fontWeight: '700' },

  eventLog: { flex: 1 },
  eventLogContent: { paddingHorizontal: 12, paddingVertical: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, gap: 8 },
  eventRowActive: { backgroundColor: 'rgba(212,160,23,0.15)' },
  eventRowNum: { color: colors.gray, fontSize: 11, width: 24, textAlign: 'right' },
  eventRowTxt: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  eventRowTxtActive: { color: colors.white, fontWeight: '600' },

  controls: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  navBtn: { width: 56, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  navBtnDim: { opacity: 0.3 },
  navBtnTxt: { color: colors.white, fontSize: 18 },
});
