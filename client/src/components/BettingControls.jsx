import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../theme';

// Vertical slider geometry — slider is rendered horizontal then rotated -90°.
// VERT_H = visual height of the track (= horizontal width before rotation).
// VERT_W = visual width / thumb lane (= horizontal height before rotation).
const VERT_H = 160;
const VERT_W = 36;

export default function BettingControls({ gameState, myId, onAction, raiseAmount, onRaiseChange }) {
  const me = gameState?.players?.find(p => p.id === myId);

  const currentBet  = gameState?.currentBet || 0;
  const myBet       = me?.roundBet || 0;
  const callAmount  = Math.min(currentBet - myBet, me?.chips || 0);
  const canCheck    = myBet >= currentBet;
  const bigBlind    = gameState?.bigBlind || 20;
  const minRaise    = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise    = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const canRaise    = (me?.chips || 0) > callAmount;
  const hasChips    = (me?.chips || 0) > 0;
  const mustAllInToCall = !canCheck && hasChips && callAmount === (me?.chips || 0);
  const isOpening   = currentBet === 0;

  const handleRaise = () => onAction(raiseAmount >= maxRaise ? 'all-in' : 'raise', raiseAmount);

  const [inputText, setInputText]       = useState(String(raiseAmount));
  const [isInputFocused, setIsInputFocused] = useState(false);
  useEffect(() => {
    if (!isInputFocused) setInputText(String(raiseAmount));
  }, [raiseAmount, isInputFocused]);

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

  const handleSliderChange = v => {
    const n = Math.round(v);
    onRaiseChange(n);
    setInputText(String(n));
  };

  return (
    <View style={s.wrap}>

      {/* Vertical slider panel — floats above the Raise button */}
      {canRaise && (
        <View style={s.vertPanel}>
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
          {/* Clipping box matches post-rotation visual size */}
          <View style={s.vertBox}>
            <Slider
              style={s.vertSlider}
              minimumValue={effectiveMin}
              maximumValue={maxRaise}
              step={bigBlind}
              value={raiseAmount}
              onValueChange={handleSliderChange}
              minimumTrackTintColor={colors.gold}
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor={colors.goldLight}
            />
          </View>
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
  wrap: { width: '100%', maxWidth: 650, alignSelf: 'center' },

  // Vertical slider panel — absolutely positioned above the raise button (right edge)
  vertPanel: {
    position: 'absolute',
    bottom: 58,   // clears the button row (~54px tall + 4px gap)
    right: 0,
    width: 106,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(8,8,10,0.88)',
    borderRadius: 14,
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,220,160,0.25)',
    zIndex: 200,
    elevation: 30,
  },
  // Container sized to the POST-rotation visual dimensions (W wide, H tall)
  vertBox: {
    width: VERT_W,
    height: VERT_H,
  },
  // Slider rendered at (VERT_H × VERT_W) then translated + rotated into place
  vertSlider: {
    width: VERT_H,
    height: VERT_W,
    transform: [
      { translateX: (VERT_W - VERT_H) / 2 },  // = -62
      { translateY: (VERT_H - VERT_W) / 2 },  // = +62
      { rotate: '-90deg' },
    ],
  },

  amountInput: {
    width: 88, height: 36,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    color: colors.goldLight, fontSize: 15, fontWeight: '800',
    textAlign: 'center',
  },
  amountInputAllin: { color: '#f87171', borderColor: 'rgba(248,113,113,0.55)' },

  btns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  btnFold:  { backgroundColor: '#7f1d1d' },
  btnCheck: { backgroundColor: '#14532d' },
  btnCall:  { backgroundColor: '#1e40af' },
  btnRaise: { backgroundColor: '#78350f' },
  btnAllin: { backgroundColor: '#581c87' },
});
