import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from './Card';
import { colors } from '../theme';
import { SERVER_URL } from '../config';
import { describeEvent, buildReplayState } from '../utils/handReplay';

// Half-screen bottom sheet that replays the previous (most recently completed)
// hand of the current match. Hands come from GET /api/match/:uuid/replay —
// the in-progress hand isn't flushed to Postgres until it ends, so the last
// flushed hand below the current hand number is "the previous hand".
export default function PreviousHandDialog({ visible, matchId, currentHandNumber, deckStyle, onClose }) {
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [hands, setHands]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [eventIdx, setEventIdx] = useState(0);

  useEffect(() => {
    if (!visible || !matchId) return;
    let alive = true;
    setLoading(true);
    setHands(null);
    setEventIdx(0);
    fetch(`${SERVER_URL}/api/match/${matchId}/replay`)
      .then(r => r.json())
      .then(data => { if (alive) setHands(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setHands([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, matchId]);

  const hand = useMemo(() => {
    if (!hands?.length) return null;
    const done = currentHandNumber
      ? hands.filter(h => h.handNumber < currentHandNumber)
      : hands;
    return (done.length ? done : hands)[Math.max(0, (done.length ? done : hands).length - 1)];
  }, [hands, currentHandNumber]);

  const events       = hand?.events || [];
  const currentEvent = events[eventIdx];
  const state = useMemo(
    () => (hand ? buildReplayState(events, eventIdx) : { communityCards: [], players: [], pot: 0 }),
    [hand, eventIdx]
  );

  if (!visible) return null;

  return (
    <Pressable style={s.scrim} onPress={onClose}>
      <Pressable style={[s.sheet, { height: Math.round(winH * 0.5), paddingBottom: insets.bottom + 8 }]}
        onPress={() => {}}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>
            {hand ? `Previous Hand · H${hand.handNumber}` : 'Previous Hand'}
          </Text>
          <Pressable style={s.closeBtn} onPress={onClose} hitSlop={8}>
            <Text style={s.closeTxt}>✕</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={colors.gold} size="large" /></View>
        ) : !hand ? (
          <View style={s.center}>
            <Text style={s.empty}>No completed hands yet — finish a hand first.</Text>
          </View>
        ) : (
          <>
            {/* Board + pot */}
            <View style={s.boardRow}>
              <View style={s.communityRow}>
                {[0,1,2,3,4].map(i => {
                  const card = state.communityCards[i];
                  if (!card) return <View key={i} style={s.ccPlaceholder} />;
                  return <Card key={i} card={card} size="md" deckStyle={deckStyle} faceDown={false} />;
                })}
              </View>
              {state.pot > 0 && <Text style={s.pot}>Pot: ${state.pot.toLocaleString()}</Text>}
            </View>

            {/* Players */}
            <View style={s.playersRow}>
              {state.players.map((p, i) => (
                <View key={i} style={s.playerChip}>
                  <Text style={s.playerChipName} numberOfLines={1}>{p.name}</Text>
                  {p.holeCards?.length > 0 && (
                    <View style={s.playerCards}>
                      {p.holeCards.map((c, j) => (
                        <Card key={j} card={c} size="xs" deckStyle={deckStyle} faceDown={false} />
                      ))}
                    </View>
                  )}
                  {p.lastAction ? <Text style={s.playerAction}>{p.lastAction}</Text> : null}
                </View>
              ))}
            </View>

            {/* Current event */}
            <View style={s.eventBox}>
              <Text style={s.eventTxt} numberOfLines={1}>
                {currentEvent ? describeEvent(currentEvent) : '—'}
              </Text>
              <Text style={s.eventCounter}>{eventIdx + 1} / {events.length}</Text>
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

            {/* Step controls */}
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
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  scrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', zIndex: 60,
  },
  sheet: {
    backgroundColor: '#0d1626',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.15)',
    paddingTop: 10,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  empty:  { color: colors.gray, fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title:    { color: colors.white, fontSize: 16, fontWeight: '800' },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700' },

  boardRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  communityRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  ccPlaceholder:{ width: 54, height: 64 },
  pot:          { color: colors.goldLight, fontSize: 13, fontWeight: '700' },

  playersRow:     { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  playerChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  playerChipName: { color: colors.white, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  playerCards:    { flexDirection: 'row', gap: 2 },
  playerAction:   { color: colors.orange, fontSize: 10, fontWeight: '700' },

  eventBox:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginTop: 8 },
  eventTxt:     { flex: 1, color: colors.white, fontSize: 13, fontWeight: '600' },
  eventCounter: { color: colors.gray, fontSize: 11 },

  eventLog:        { flex: 1 },
  eventLogContent: { paddingHorizontal: 12, paddingVertical: 4 },
  eventRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, gap: 8 },
  eventRowActive:  { backgroundColor: 'rgba(212,160,23,0.15)' },
  eventRowNum:     { color: colors.gray, fontSize: 10, width: 22, textAlign: 'right' },
  eventRowTxt:     { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  eventRowTxtActive: { color: colors.white, fontWeight: '600' },

  controls:  { flexDirection: 'row', gap: 10, justifyContent: 'center', paddingTop: 8, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  navBtn:    { width: 52, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  navBtnDim: { opacity: 0.3 },
  navBtnTxt: { color: colors.white, fontSize: 16 },
});
