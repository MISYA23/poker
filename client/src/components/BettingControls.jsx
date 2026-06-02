import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
  const isOpening = currentBet === 0;

  const handleRaise = () => onAction(raiseAmount >= maxRaise ? 'all-in' : 'raise', raiseAmount);

  return (
    <View style={s.wrap}>
      {canRaise && (
        <View style={s.slider}>
          <Text style={s.sliderLabel}>
            {raiseAmount >= maxRaise ? 'All In' : `$${raiseAmount.toLocaleString()}`}
          </Text>
          <Slider
            style={s.sliderTrack}
            minimumValue={effectiveMin}
            maximumValue={maxRaise}
            step={bigBlind}
            value={raiseAmount}
            onValueChange={onRaiseChange}
            minimumTrackTintColor={colors.gold}
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor={colors.goldLight}
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
        ) : (
          <Pressable style={[s.btn, s.btnCall]} onPress={() => onAction('call')}>
            <Text style={s.btnTxt}>Call{callAmount > 0 ? ` $${callAmount.toLocaleString()}` : ''}</Text>
          </Pressable>
        )}

        {canRaise ? (
          <Pressable style={[s.btn, s.btnRaise]} onPress={handleRaise}>
            <Text style={s.btnTxt}>
              {raiseAmount >= maxRaise ? 'All In' : `${isOpening ? 'Bet' : 'Raise'} $${raiseAmount.toLocaleString()}`}
            </Text>
          </Pressable>
        ) : (
          me?.chips > 0 && (
            <Pressable style={[s.btn, s.btnAllin]} onPress={() => onAction('all-in', 0)}>
              <Text style={s.btnTxt}>All In</Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  slider: { gap: 2 },
  sliderLabel: { color: colors.goldLight, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  sliderTrack: { width: '100%', height: 36 },
  btns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  btnFold:  { backgroundColor: '#7f1d1d' },
  btnCheck: { backgroundColor: '#14532d' },
  btnCall:  { backgroundColor: '#1e40af' },
  btnRaise: { backgroundColor: '#78350f' },
  btnAllin: { backgroundColor: '#581c87' },
});
