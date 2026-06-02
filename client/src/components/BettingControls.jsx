import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../theme';

export default function BettingControls({ gameState, myId, onAction, raiseAmount, onRaiseChange }) {
  const me = gameState?.players?.find(p => p.id === myId);
  const isMyTurn = gameState?.currentPlayerId === myId &&
    !['waiting', 'showdown'].includes(gameState?.phase);

  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me?.chips || 0);
  const canCheck = myBet >= currentBet;
  const bigBlind = gameState?.bigBlind || 20;
  const minRaise = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const canRaise = (me?.chips || 0) > callAmount;
  const isOpeningWager = currentBet === 0;

  const handleRaise = () => {
    onAction(raiseAmount >= maxRaise ? 'all-in' : 'raise', raiseAmount);
  };

  const show = isMyTurn;
  const hasChips = (me?.chips || 0) > 0;
  // Calling matches the bet — but if it eats all the remaining chips, it's an all-in.
  const callIsAllIn = !canCheck && callAmount > 0 && callAmount >= (me?.chips || 0);

  return (
    <View style={styles.container}>
      {canRaise && (
        <View style={styles.raisePanel}>
          <Text style={styles.raiseLabel}>
            {raiseAmount >= maxRaise ? 'All In' : `$${raiseAmount.toLocaleString()}`}
          </Text>
          <Slider
            style={styles.slider}
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

      <View style={styles.buttons}>
        <Pressable style={[styles.btn, styles.btnFold]} onPress={() => onAction('fold')}>
          <Text style={styles.btnText}>Fold</Text>
        </Pressable>

        {canCheck ? (
          <Pressable style={[styles.btn, styles.btnCheck]} onPress={() => onAction('check')}>
            <Text style={styles.btnText}>Check</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.btn, styles.btnCall]} onPress={() => onAction('call')}>
            <Text style={styles.btnText}>
              Call{callAmount > 0 ? ` $${callAmount.toLocaleString()}` : ''}
            </Text>
          </Pressable>
        )}

        {canRaise ? (
          <Pressable style={[styles.btn, styles.btnRaise]} onPress={handleRaise}>
            <Text style={styles.btnText}>
              {raiseAmount >= maxRaise
                ? 'All In'
                : `${isOpeningWager ? 'Bet' : 'Raise'} $${raiseAmount.toLocaleString()}`}
            </Text>
          </Pressable>
        ) : (
          me?.chips > 0 && (
            <Pressable style={[styles.btn, styles.btnAllin]} onPress={() => onAction('all-in', 0)}>
              <Text style={styles.btnText}>All In</Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingHorizontal: 4,
  },
  raisePanel: {
    gap: 4,
  },
  raiseLabel: {
    color: colors.goldLight,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  slider: {
    width: '100%',
    height: 36,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  btnFold: { backgroundColor: '#7f1d1d' },
  btnCheck: { backgroundColor: '#14532d' },
  btnCall: { backgroundColor: '#1e40af' },
  btnRaise: { backgroundColor: '#78350f' },
  btnAllin: { backgroundColor: '#581c87' },
});
