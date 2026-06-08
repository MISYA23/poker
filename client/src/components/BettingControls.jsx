import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function BettingControls({ gameState, myId, onAction, raiseAmount, onRaiseChange }) {
  const me = gameState?.players?.find(p => p.id === myId);

  const currentBet      = gameState?.currentBet || 0;
  const myBet           = me?.roundBet || 0;
  const callAmount      = Math.min(currentBet - myBet, me?.chips || 0);
  const canCheck        = myBet >= currentBet;
  const bigBlind        = gameState?.bigBlind || 20;
  const minRaise        = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise        = myBet + (me?.chips || 0);
  const effectiveMin    = Math.min(minRaise, maxRaise);
  const canRaise        = (me?.chips || 0) > callAmount;
  const hasChips        = (me?.chips || 0) > 0;
  const mustAllInToCall = !canCheck && hasChips && callAmount === (me?.chips || 0);
  const isOpening       = currentBet === 0;
  const isAllin         = raiseAmount >= maxRaise;
  const pot             = gameState?.pot || 0;

  const handleRaise = () => onAction(isAllin ? 'all-in' : 'raise', raiseAmount);
  const nudge = dir => onRaiseChange(Math.max(effectiveMin, Math.min(maxRaise, raiseAmount + dir * bigBlind)));

  const snap = v => Math.max(effectiveMin, Math.min(maxRaise, Math.round(v / bigBlind) * bigBlind));

  const presets = useMemo(() => {
    const candidates = [
      { label: '½P',  value: snap(pot * 0.5) },
      { label: 'Pot', value: snap(pot) },
      { label: '2×',  value: snap(pot * 2) },
      { label: 'Max', value: maxRaise },
    ];
    const seen = new Set();
    return candidates.filter(({ value }) => {
      if (value < effectiveMin || value > maxRaise || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }, [pot, effectiveMin, maxRaise, bigBlind]);

  return (
    <View style={s.wrap}>

      {/* Preset amounts — only shown when raise is available */}
      {canRaise && (
        <View style={s.presetRow}>
          {presets.map(({ label, value }) => (
            <Pressable
              key={label}
              style={[s.preset, raiseAmount === value && s.presetActive]}
              onPress={() => onRaiseChange(value)}
            >
              <Text style={[s.presetTxt, raiseAmount === value && s.presetTxtActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Nudge row */}
      {canRaise && (
        <View style={s.nudgeRow}>
          <Pressable style={s.nudgeBtn} onPress={() => nudge(-1)}>
            <Text style={s.nudgeTxt}>−</Text>
          </Pressable>
          <Text style={s.nudgeAmt}>{raiseAmount.toLocaleString()}</Text>
          <Pressable style={s.nudgeBtn} onPress={() => nudge(1)}>
            <Text style={s.nudgeTxt}>+</Text>
          </Pressable>
        </View>
      )}

      {/* Action buttons */}
      <View style={s.btns}>
        <Pressable style={[s.btn, s.btnFold]} onPress={() => onAction('fold')}>
          <Text style={s.btnTxt}>Fold</Text>
        </Pressable>

        {canCheck ? (
          <Pressable style={[s.btn, s.btnCheck]} onPress={() => onAction('check')}>
            <Text style={s.btnTxt}>Check</Text>
          </Pressable>
        ) : mustAllInToCall ? (
          <Pressable style={[s.btn, s.btnAllin]} onPress={() => onAction('all-in', 0)}>
            <Text style={s.btnTxt}>All In</Text>
          </Pressable>
        ) : (
          <Pressable style={[s.btn, s.btnCall]} onPress={() => onAction('call')}>
            <Text style={s.btnTxt}>Call{callAmount > 0 ? ` ${callAmount.toLocaleString()}` : ''}</Text>
          </Pressable>
        )}

        {canRaise && (
          <Pressable style={[s.btn, isAllin ? s.btnAllin : s.btnRaise]} onPress={handleRaise}>
            <Text style={s.btnTxt}>
              {isAllin ? 'All In' : `${isOpening ? 'Bet' : 'Raise'} ${raiseAmount.toLocaleString()}`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 650, alignSelf: 'center', gap: 5 },

  presetRow: { flexDirection: 'row', gap: 6 },
  preset: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 7,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  presetActive:    { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  presetTxt:       { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  presetTxtActive: { color: '#000' },

  nudgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  nudgeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  nudgeTxt: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 26 },
  nudgeAmt: { color: '#fff', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },

  btns:     { flexDirection: 'row', gap: 8 },
  btn:      { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnTxt:   { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  btnFold:  { backgroundColor: '#7f1d1d' },
  btnCheck: { backgroundColor: '#14532d' },
  btnCall:  { backgroundColor: '#1e40af' },
  btnRaise: { backgroundColor: '#78350f' },
  btnAllin: { backgroundColor: '#581c87' },
});
