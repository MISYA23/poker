import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const RING_R = 30;
const RING_CIRC = 2 * Math.PI * RING_R;

export default function TimerRing({ turnDeadline, turnDurationMs }) {
  const [dashOffset, setDashOffset] = useState(RING_CIRC);
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!turnDeadline || !turnDurationMs) {
      setDashOffset(RING_CIRC);
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, turnDeadline - Date.now());
      const elapsed = turnDurationMs - remaining;
      setDashOffset((elapsed / turnDurationMs) * RING_CIRC);
      setTimeLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [turnDeadline]);

  if (!turnDeadline) return null;

  const color = timeLeft !== null && timeLeft <= 5
    ? '#c0392b'
    : timeLeft !== null && timeLeft <= 10
    ? '#e67e22'
    : '#d4a017';

  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" style={StyleSheet.absoluteFillObject}>
      <Circle cx="32" cy="32" r={RING_R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={4} />
      <Circle
        cx="32" cy="32" r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={RING_CIRC}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90, 32, 32)"
      />
    </Svg>
  );
}
