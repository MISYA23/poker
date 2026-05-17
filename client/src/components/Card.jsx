import React from 'react';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS_REGULAR  = { s: '#1a1a1a', h: '#c81e1e', d: '#c81e1e', c: '#1a1a1a' };
const SUIT_COLORS_FOUR     = { s: '#1a1a1a', h: '#c81e1e', d: '#1f63b0', c: '#1e7a3a' };

export default function Card({ card, size = 'md', faceDown = false, className = '', deckStyle = 'regular' }) {
  const palette = deckStyle === 'four-color' ? SUIT_COLORS_FOUR : SUIT_COLORS_REGULAR;
  const sizes = {
    xs: { width: 32, height: 29, font: 13 },
    sm: { width: 42, height: 36, font: 18 },
    md: { width: 56, height: 60, font: 24 },
    lg: { width: 72, height: 60, font: 32 },
    xl: { width: 78, height: 75, font: 36 },
  };

  const s = sizes[size] || sizes.md;

  if (faceDown || !card || card.hidden) {
    return (
      <div className={`card card-back ${className}`} style={{ width: s.width, height: s.height }}>
        <div className="card-back-pattern" />
      </div>
    );
  }

  const symbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const color = palette[card.suit] || '#1a1a1a';
  const rank = card.rank;
  const rankFont = rank === '10' ? s.font * 0.82 : s.font;

  return (
    <div className={`card card-face ${className}`} style={{ width: s.width, height: s.height, color }}>
      <span className="card-rank" style={{ fontSize: rankFont }}>{rank}</span>
      <span className="card-suit" style={{ fontSize: s.font }}>{symbol}</span>
    </div>
  );
}
