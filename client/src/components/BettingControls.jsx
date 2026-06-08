import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../theme';

export default function BettingControls({ gameState, myId, onAction, raiseAmount, onRaiseChange }) {
  const me = gameState?.players?.find(p => p.id === myId);
  const isMyTurn = gameState?.currentPlayerId === myId &&
    !['waiting', 'showdown'].includes(gameState?.phase);

  if (!isMyTurn) return null;

  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me?.chips || 0);
  const canCheck = myBet >= currentBet;
  const bigBlind = gameState?.bigBlind || 20;
  const minRaise = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const canRaise = (me?.chips || 0) > callAmount;
  const hasChips = (me?.chips || 0) > 0;
  // Player can't fully cover the call: their call IS an all-in.
  const mustAllInToCall = !canCheck && hasChips && callAmount === (me?.chips || 0);
  const isOpening = currentBet === 0;

  const handleRaise = () => onAction(raiseAmount >= maxRaise ? 'all-in' : 'raise', raiseAmount);

  // Local text state for the editable input so the user can clear & retype
  // freely. While the input is focused we don't let external raiseAmount
  // changes overwrite the user's keystrokes.
  const [inputText, setInputText] = useState(String(raiseAmount));
  const [isInputFocused, setIsInputFocused] = useState(false);
  useEffect(() => {
    if (!isInputFocused) setInputText(String(raiseAmount));
  }, [raiseAmount, isInputFocused]);

  // Live commit as the user types: parse, clamp, push to parent. The
  // Raise button label and colour read from raiseAmount, so they reflect
  // the typed value instantly — including switching to "All In" + purple
  // background once the typed value reaches the player's stack.
  const handleInputChange = t => {
    const cleaned = t.replace(/[^0-9]/g, '');
    setInputText(cleaned);
    const n = parseInt(cleaned, 10);
    if (Number.isFinite(n)) {
      onRaiseChange(Math.max(effectiveMin, Math.min(maxRaise, n)));
    }
  };

  const commitInput = () => {
    const raw = parseInt(inputText.replace(/\D/g, ''), 10);
    const n = Number.isFinite(raw) ? raw : effectiveMin;
    const clamped = Math.max(effectiveMin, Math.min(maxRaise, n));
    onRaiseChange(clamped);
    setInputText(String(clamped));
  };

  // Slider also syncs the input so the two are always in lockstep.
  const handleSliderChange = v => {
    const n = Math.round(v);
    onRaiseChange(n);
    setInputText(String(n));
  };

  return (
    <View style={s.wrap}>
      {canRaise && (
        <View style={s.sliderRow}>
          <Slider
            style={s.sliderTrack}
            minimumValue={effectiveMin}
            maximumValue={maxRaise}
            step={bigBlind}
            value={raiseAmount}
            onValueChange={handleSliderChange}
            minimumTrackTintColor={colors.gold}
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor={colors.goldLight}
          />
          <TextInput
            style={[s.amountInput, raiseAmount >= maxRaise && s.amountInputAllin]}
            value={inputText}
            onChangeText={handleInputChange}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => { setIsInputFocused(false); commitInput(); }}
            onSubmitEditing={commitInput}
            keyboardType="numeric"
            returnKeyType="done"
            selectTextOnFocus
            maxLength={9}
            placeholder={String(effectiveMin)}
            placeholderTextColor="rgba(255,255,255,0.3)"
          />
        </View>
      )}
      <View style={s.btns}>
        <Pressable style={[s.btn, s.btnFold]} onPress={() => onAction('fold')}>
          <Text style={s.btnTxt}>Fold</Text>
        </Pressable>

        {canCheck ? (
          <Pressable style={[s.btn, s.btnCheck]} onPress={() => onAction('check')}>
            <Text style={s.btnTxt}>Check</Text>
          </Pressable>
        ) : mustAllInToCall ? (
          // Calling would consume all the player's remaining chips: relabel
          // the middle button and emit 'all-in' instead of 'call'.
          <Pressable style={[s.btn, s.btnAllin]} onPress={() => onAction('all-in', 0)}>
            <Text style={s.btnTxt}>All In</Text>
          </Pressable>
        ) : (
          <Pressable style={[s.btn, s.btnCall]} onPress={() => onAction('call')}>
            <Text style={s.btnTxt}>Call{callAmount > 0 ? ` ${callAmount.toLocaleString()}` : ''}</Text>
          </Pressable>
        )}

        {canRaise && (
          <Pressable
            style={[s.btn, raiseAmount >= maxRaise ? s.btnAllin : s.btnRaise]}
            onPress={handleRaise}
          >
            <Text style={s.btnTxt}>
              {raiseAmount >= maxRaise ? 'All In' : `${isOpening ? 'Bet' : 'Raise'} ${raiseAmount.toLocaleString()}`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  // Slider + numeric input on one row — slider takes remaining space,
  // input is fixed-width on the right so the user can type a value.
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderTrack: { flex: 1, height: 36 },
  amountInput: {
    width: 90, height: 38,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    color: colors.goldLight, fontSize: 15, fontWeight: '800',
    textAlign: 'center',
  },
  // Red text + red border when the typed amount means going all-in.
  amountInputAllin: { color: '#f87171', borderColor: 'rgba(248,113,113,0.55)' },
  btns: { flexDirection: 'row', gap: 8 },
  // Buttons taller for easier tapping (paddingVertical 14 → 18 → 23 → 29).
  btn: { flex: 1, paddingVertical: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  btnFold:  { backgroundColor: '#7f1d1d' },
  btnCheck: { backgroundColor: '#14532d' },
  btnCall:  { backgroundColor: '#1e40af' },
  btnRaise: { backgroundColor: '#78350f' },
  btnAllin: { backgroundColor: '#581c87' },
});
