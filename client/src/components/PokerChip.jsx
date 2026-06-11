import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
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

// ── Four colored chips — red 5 · green 25 · black 100 · purple 500 ──
// Same chip shape; chips pile tight so a stack reads as thickness (taller = more)
// without counting individual chips.
const CHIP_AR = 256 / 255;   // chip art is ~square (width / height)
const STEP    = 0.15;        // fraction of chip height each stacked chip reveals
const DENOMS = [
  { v: 500, img: require('../../assets/chip-purple.png') },
  { v: 100, img: require('../../assets/chip-black.png')  },
  { v: 25,  img: require('../../assets/chip-green.png')  },
  { v: 5,   img: require('../../assets/chip-red.png')    },
];

function decompose(amount) {
  const res = [];
  let rem = Math.round(Math.max(0, amount) / 5) * 5;   // snap to nearest 5 (smallest chip)
  for (const d of DENOMS) {
    const n = Math.floor(rem / d.v);
    if (n > 0) res.push({ d, count: n });
    rem -= n * d.v;
  }
  return res;
}

// Renders a list of chip images as one vertical pile (index 0 at the bottom).
// Height is capped: past `maxH` the chips just overlap tighter instead of growing
// taller, so a pile can never sprawl off the felt no matter how large the bet.
function Pile({ imgs, w, h, step, maxH }) {
  const n   = imgs.length;
  const cap = (n > 1 && h + (n - 1) * step > maxH) ? (maxH - h) / (n - 1) : step;
  const colH = h + (n - 1) * cap;
  return (
    <View style={{ width: w, height: colH }}>
      {imgs.map((img, i) => (
        <Image
          key={i}
          source={img}
          resizeMode="contain"
          style={{ position: 'absolute', bottom: i * cap, left: 0, width: w, height: h }}
        />
      ))}
    </View>
  );
}

// Greedy chip piles. Two looks, varied by amount so the table doesn't always read
// the same: either separate colored stacks side-by-side (high value → low), or one
// mixed pile with the largest-value chips at the bottom and smaller ones on top.
export function ChipStack({ amount, size = 28 }) {
  if (!amount || amount <= 0) return null;
  const groups = decompose(amount);
  if (!groups.length) return null;
  const w    = size;
  const h    = w / CHIP_AR;
  const step = h * STEP;
  const maxH = h * 1.85;   // tallest a single pile may grow → stays on the felt

  // Deterministic per amount → stable across re-renders, but differs between bets.
  const mixed = Math.round(amount / 5) % 2 === 1;

  if (mixed) {
    // one stack: highest value at the bottom, lowest on top
    const imgs = [];
    for (const { d, count } of groups) for (let i = 0; i < count; i++) imgs.push(d.img);
    return <View style={s.row}><Pile imgs={imgs} w={w} h={h} step={step} maxH={maxH} /></View>;
  }

  // separate colored stacks, side by side
  return (
    <View style={s.row}>
      {groups.map(({ d, count }) => (
        <Pile key={d.v} imgs={Array(count).fill(d.img)} w={w} h={h} step={step} maxH={maxH} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
});
