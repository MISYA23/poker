import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';

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
  const snap = v => Math.max(effectiveMin, Math.min(maxRaise, Math.round(v / bigBlind) * bigBlind));
  const clampBet = n => Math.max(effectiveMin, Math.min(maxRaise, n));

  // Custom amount box — LIVE: typing updates the Bet/Raise button in real time
  // (flips to All In at max). Too big → box capped at max; too small/empty → min on commit.
  const [betText, setBetText] = useState(String(raiseAmount));
  const [editing, setEditing] = useState(false);
  // Re-sync the box from the amount when the user isn't editing (presets, +/−, new hand)
  useEffect(() => { if (!editing) setBetText(String(raiseAmount)); }, [raiseAmount, editing]);

  const setAmount = (v) => { const c = clampBet(v); onRaiseChange(c); setBetText(String(c)); };
  const nudge = dir => setAmount(raiseAmount + dir * bigBlind);

  const onBetTextChange = (txt) => {
    const raw = txt.replace(/[^0-9]/g, '');
    if (raw === '') { setBetText(''); return; }          // allow clearing the field
    const n = parseInt(raw, 10);
    onRaiseChange(clampBet(n));                           // button updates live (→ All In at max)
    setBetText(n > maxRaise ? String(maxRaise) : raw);   // too big → cap box at max; else keep typed
  };

  const commitBet = () => {
    setEditing(false);
    const n = parseInt((betText || '').replace(/[^0-9]/g, ''), 10);
    onRaiseChange(clampBet(Number.isNaN(n) ? raiseAmount : n));  // too small/empty → min via clamp; box re-syncs
  };

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

      {/* Presets + custom amount input — one row, only when raise is available */}
      {canRaise && (
        <View style={s.presetRow}>
          {presets.map(({ label, value }) => (
            <Pressable
              key={label}
              style={[s.preset, raiseAmount === value && s.presetActive]}
              onPress={() => setAmount(value)}
            >
              <Text style={[s.presetTxt, raiseAmount === value && s.presetTxtActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
          <View style={s.betGroup}>
            <Pressable style={s.nudgeBtn} onPress={() => nudge(-1)}>
              <Text style={s.nudgeTxt}>−</Text>
            </Pressable>
            <TextInput
              style={[s.preset, s.betInput]}
              value={betText}
              onChangeText={onBetTextChange}
              onFocus={() => setEditing(true)}
              onEndEditing={commitBet}
              onSubmitEditing={commitBet}
              onBlur={commitBet}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              placeholder="Amount"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
            <Pressable style={s.nudgeBtn} onPress={() => nudge(1)}>
              <Text style={s.nudgeTxt}>+</Text>
            </Pressable>
          </View>
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
  wrap: { width: '100%', maxWidth: 650, alignSelf: 'center', gap: 10 },

  presetRow: { flexDirection: 'row', gap: 6, width: '100%' },
  preset: {
    flex: 1,
    minWidth: 0,            // allow shrinking so the row never exceeds its width
    paddingVertical: 8,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  presetActive:    { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  presetTxt:       { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  presetTxtActive: { color: '#000' },

  // Custom amount cluster — [−] [input] [+] on the same row as the presets.
  betGroup: { flex: 2.4, minWidth: 0, flexDirection: 'row', gap: 4, alignItems: 'stretch' },
  nudgeBtn: {
    width: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  nudgeTxt: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  betInput: {
    flex: 1,
    minWidth: 0,
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    borderColor: 'rgba(245,158,11,0.7)',
    backgroundColor: 'rgba(245,158,11,0.10)',
  },

  btns:     { flexDirection: 'row', gap: 8 },
  btn:      { flex: 1, paddingVertical: 23, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnTxt:   { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  btnFold:  { backgroundColor: '#7f1d1d' },
  btnCheck: { backgroundColor: '#14532d' },
  btnCall:  { backgroundColor: '#1e40af' },
  btnRaise: { backgroundColor: '#78350f' },
  btnAllin: { backgroundColor: '#581c87' },
});
