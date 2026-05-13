import React from 'react';

export default function Avatar({ size = 22 }) {
  return (
    <span className="avatar-frame" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#141414" />
        <circle cx="16" cy="13" r="4.8" fill="#3a3a3a" />
        <path d="M5 30 Q5 20.5 16 20.5 Q27 20.5 27 30 Z" fill="#3a3a3a" />
      </svg>
    </span>
  );
}
