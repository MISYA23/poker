import React from 'react';

const CHIP_CFG = {
  100: { fill: '#1a1a1a', notch: 'rgba(180,180,180,0.7)', text: '#d4a017' },
  25:  { fill: '#1e7a3a', notch: 'rgba(255,255,255,0.65)', text: '#fff' },
  10:  { fill: '#b91c1c', notch: 'rgba(255,255,255,0.65)', text: '#fff' },
};

export function PokerChip({ value, size = 32 }) {
  const cfg = CHIP_CFG[value] || CHIP_CFG[10];
  const c = size / 2;
  const outerR = c - 1.5;
  const notchR = c * 0.75;
  const innerR = c * 0.46;
  const circ = 2 * Math.PI * notchR;
  const seg = circ / 8;
  const dash = seg * 0.52;
  const gap = seg * 0.48;
  const notchW = size * 0.155;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={c} cy={c} r={outerR} fill={cfg.fill} stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" />
      <circle
        cx={c} cy={c} r={notchR}
        fill="none"
        stroke={cfg.notch}
        strokeWidth={notchW}
        strokeDasharray={`${dash} ${gap}`}
      />
      <circle cx={c} cy={c} r={innerR} fill={cfg.fill} stroke={cfg.notch} strokeWidth="0.8" strokeOpacity="0.4" />
      <text
        x={c} y={c + size * 0.115}
        textAnchor="middle"
        fill={cfg.text}
        fontSize={size * 0.295}
        fontWeight="800"
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
      >
        {value}
      </text>
    </svg>
  );
}

function chipsFor(amount) {
  const result = [];
  let rem = Math.max(0, Math.floor(amount));
  for (const denom of [100, 25, 10]) {
    const count = Math.floor(rem / denom);
    if (count > 0) result.push({ denom, count });
    rem -= count * denom;
  }
  return result;
}

export function ChipStack({ amount, size = 28 }) {
  if (!amount || amount <= 0) return null;
  const chips = chipsFor(amount);
  if (chips.length === 0) return null;

  return (
    <div className="chip-stack">
      {chips.map(({ denom, count }) => (
        <div key={denom} className="chip-group">
          <PokerChip value={denom} size={size} />
          {count > 1 && <span className="chip-count">×{count}</span>}
        </div>
      ))}
    </div>
  );
}
