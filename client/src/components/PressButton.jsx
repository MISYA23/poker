import React, { useRef, useState, useEffect } from 'react';
import { Animated, Pressable, Platform, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// A translucent white overlay lightens the button colour: subtle on hover,
// stronger while pressed, nothing at rest. Opacity is native-driver friendly,
// so it stays smooth. Pressed wins over hover; both clear back to 0.
const HOVER_LIGHT = 0.14;
const PRESS_LIGHT = 0.30;

export default function PressButton({ onPress, onPressIn, onPressOut, style, children, disabled, ...rest }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const to = disabled ? 0 : pressed ? PRESS_LIGHT : hovered ? HOVER_LIGHT : 0;
    Animated.timing(overlay, { toValue: to, duration: 110, useNativeDriver: true }).start();
  }, [hovered, pressed, disabled]);

  const handlePressIn = (e) => {
    setPressed(true);
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e) => {
    setPressed(false);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={disabled ? undefined : () => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[style, { overflow: 'hidden' }, { transform: [{ scale }] }]}
      {...rest}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: overlay }]}
      />
      {children}
    </AnimatedPressable>
  );
}
