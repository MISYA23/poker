import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  withTiming,
  Easing,
  useAnimatedProps,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_R = 30;
const RING_CIRC = 2 * Math.PI * RING_R;
const TURN_DURATION_MS = 20000;

export default function TimerRing({ turnDeadline }) {
  const dashOffset = useSharedValue(RING_CIRC);
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!turnDeadline) {
      dashOffset.value = RING_CIRC;
      setTimeLeft(null);
      return;
    }
    const remaining = Math.max(0, turnDeadline - Date.now());
    const elapsed = TURN_DURATION_MS - remaining;
    dashOffset.value = (elapsed / TURN_DURATION_MS) * RING_CIRC;
    dashOffset.value = withTiming(RING_CIRC, { duration: remaining, easing: Easing.linear });

    const update = () => setTimeLeft(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [turnDeadline]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  if (!turnDeadline) return null;

  const ringColor = timeLeft !== null && timeLeft <= 5
    ? '#c0392b'
    : timeLeft !== null && timeLeft <= 10
    ? '#e67e22'
    : '#d4a017';

  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" style={StyleSheet.absoluteFillObject}>
      <Circle
        cx="32" cy="32" r={RING_R}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={4}
      />
      <AnimatedCircle
        cx="32" cy="32" r={RING_R}
        fill="none"
        stroke={ringColor}
        strokeWidth={4}
        strokeDasharray={RING_CIRC}
        strokeLinecap="round"
        transform="rotate(-90, 32, 32)"
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
