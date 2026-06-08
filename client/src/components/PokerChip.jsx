import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

const CHIP_CONFIG = {
  10:  { color: '#EF2020' },
  25:  { color: '#22C55E' },
  50:  { color: '#3B82F6' },
  100: { color: '#374151' },
  500: { color: '#A855F7' },
};

export function Chip({ value, size = 40 }) {
  const cfg = CHIP_CONFIG[value] ?? CHIP_CONFIG[10];
  const c = size / 2;

  const whiteRimR    = c - 1;
  const bodyR        = c - 3;
  const insertR      = c - 6;
  const insertStroke = size * 0.13;
  const innerFillR   = c - 8.5;

  // 8 white inserts distributed evenly around the perimeter
  const circ = 2 * Math.PI * insertR;
  const seg  = circ / 8;
  const dash = seg * 0.46;
  const gap  = seg * 0.54;

  const fontSize = value >= 100 ? size * 0.27 : size * 0.32;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Layer 1: drop shadow */}
      <Circle cx={c} cy={c + size * 0.05} r={bodyR} fill="rgba(0,0,0,0.35)" />
      {/* Layer 2: colored body */}
      <Circle cx={c} cy={c} r={bodyR} fill={cfg.color} />
      {/* Layer 4: white edge inserts */}
      <Circle
        cx={c} cy={c} r={insertR}
        fill="none"
        stroke="white"
        strokeWidth={insertStroke}
        strokeDasharray={`${dash} ${gap}`}
      />
      {/* Layer 5: inner fill — covers center so inserts only show at the outer band */}
      <Circle cx={c} cy={c} r={innerFillR} fill={cfg.color} />
      {/* Layer 6: thin white inner ring */}
      <Circle
        cx={c} cy={c} r={innerFillR}
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth={Math.max(0.8, size * 0.022)}
      />
      {/* Layer 7: denomination text */}
      <SvgText
        x={c}
        y={c + fontSize * 0.37}
        textAnchor="middle"
        fill="white"
        fontSize={fontSize}
        fontWeight="900"
      >
        {value}
      </SvgText>
    </Svg>
  );
}

// Alias kept for internal ChipStack usage
export const PokerChip = Chip;

function chipsFor(amount) {
  const res = [];
  let rem = Math.max(0, Math.floor(amount));
  for (const d of [500, 100, 50, 25, 10]) {
    const n = Math.floor(rem / d);
    if (n > 0) res.push({ denom: d, count: n });
    rem -= n * d;
  }
  return res;
}

export function ChipStack({ amount, size = 28 }) {
  if (!amount || amount <= 0) return null;
  const chips = chipsFor(amount);
  if (!chips.length) return null;
  return (
    <View style={s.stack}>
      {chips.map(({ denom, count }) => (
        <View key={denom} style={s.group}>
          <Chip value={denom} size={size} />
          {count > 1 && <Text style={s.count}>×{count}</Text>}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  stack: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  count: { color: '#fafafa', fontSize: 11, fontWeight: '700' },
});
