import React from 'react';

export const AVATARS = [
  { id: 'fox',     label: 'Fox',     emoji: '🦊' },
  { id: 'frog',    label: 'Frog',    emoji: '🐸' },
  { id: 'lion',    label: 'Lion',    emoji: '🦁' },
  { id: 'penguin', label: 'Penguin', emoji: '🐧' },
  { id: 'shark',   label: 'Shark',   emoji: '🦈' },
  { id: 'tiger',   label: 'Tiger',   emoji: '🐯' },
  { id: 'octopus', label: 'Octopus', emoji: '🐙' },
  { id: 'unicorn', label: 'Unicorn', emoji: '🦄' },
];

export default function Avatar({ size = 22, avatarId = null }) {
  const av = AVATARS.find(a => a.id === avatarId) ?? AVATARS[0];

  return (
    <span
      style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}
      aria-label={av.label}
      role="img"
    >
      {av.emoji}
    </span>
  );
}
