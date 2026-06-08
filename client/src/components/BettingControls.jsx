import React, { useState, useRef, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, PanResponder } from 'react-native';
import { colors } from '../theme';

const BAR_H = 160;

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

  const handleRaise = () => onAction(isAllin ? 'all-in' : 'raise', raiseAmount);

  const [raiseBtnWidth, setRaiseBtnWidth] = useState(100);
  const barWidth = Math.max(24, Math.round(raiseBtnWidth / 2));

  const fillRatio = maxRaise > effectiveMin
    ? (raiseAmount - effectiveMin) / (maxRaise - effectiveMin)
    : 1;
  const fillHeight = Math.round(fillRatio * BAR_H);

  // Use ref so PanResponder closure always reads latest game values
  const touchRef = useRef();
  touchRef.current = (y) => {
    const ratio  = 1 - Math.max(0, Math.min(1, y / BAR_H));
    const raw    = effectiveMin + ratio * (maxRaise - effectiveMin);
    const stepped = Math.round(raw / bigBlind) * bigBlind;
    onRaiseChange(Math.max(effectiveMin, Math.min(maxRaise, stepped)));
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (evt) => touchRef.current(evt.nativeEvent.locationY),
    onPanResponderMove:  (evt) => touchRef.current(evt.nativeEvent.locationY),
  }), []);

  const barColor = isAllin ? '#581c87' : '#78350f';

  return (
    <View style={s.wrap}>

      {canRaise && (
        <View
          style={[s.bar, { width: barWidth, bottom: 68, borderWidth: 5, borderColor: barColor, borderRadius: 6 }]}
          {...pan.panHandlers}
        >
          {/* Empty track */}
          <View style={[s.track, { backgroundColor: `${barColor}44` }]}>
            {/* Fill */}
            <View style={[s.fill, { height: fillHeight, backgroundColor: barColor }]} />
            {/* Amount — floats just above the fill */}
            <Text style={[s.barLabel, { bottom: fillHeight + 4 }]} numberOfLines={1}>
              {raiseAmount.toLocaleString()}
            </Text>
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
            style={[s.btn, isAllin ? s.btnAllin : s.btnRaise]}
            onPress={handleRaise}
            onLayout={(e) => { const w = e.nativeEvent.layout.width; setRaiseBtnWidth(w); }}
          >
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
  wrap: { width: '100%', maxWidth: 650, alignSelf: 'center' },

  bar: {
    position: 'absolute',
    right: 0,
    height: BAR_H,
    zIndex: 200,
    elevation: 30,
  },
  track: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
    borderRadius: 4,
  },
  barLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  btns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnTxt:   { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  btnFold:  { backgroundColor: '#7f1d1d' },
  btnCheck: { backgroundColor: '#14532d' },
  btnCall:  { backgroundColor: '#1e40af' },
  btnRaise: { backgroundColor: '#78350f' },
  btnAllin: { backgroundColor: '#581c87' },
});
