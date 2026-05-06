import React from 'react';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS = { s: '#1a1a2e', h: '#c0392b', d: '#c0392b', c: '#1a1a2e' };

export default function Card({ card, size = 'md', faceDown = false, className = '' }) {
  const sizes = {
    xs: { width: 32, height: 46, fontSize: 10, suitSize: 14 },
    sm: { width: 42, height: 60, fontSize: 12, suitSize: 18 },
    md: { width: 56, height: 80, fontSize: 16, suitSize: 24 },
    lg: { width: 72, height: 104, fontSize: 20, suitSize: 32 },
  };

  const s = sizes[size] || sizes.md;

  if (faceDown || !card || card.hidden) {
    return (
      <div
        className={`card card-back ${className}`}
        style={{ width: s.width, height: s.height }}
      >
        <div className="card-back-pattern" />
      </div>
    );
  }

  const symbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const color = SUIT_COLORS[card.suit] || '#1a1a2e';

  return (
    <div
      className={`card card-face ${className}`}
      style={{ width: s.width, height: s.height, color }}
    >
      <div className="card-corner card-corner-top" style={{ fontSize: s.fontSize }}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
      <div className="card-center" style={{ fontSize: s.suitSize }}>{symbol}</div>
      <div className="card-corner card-corner-bottom" style={{ fontSize: s.fontSize }}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
    </div>
  );
}
