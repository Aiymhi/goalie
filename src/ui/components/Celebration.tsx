// A restrained celebration for a REAL level completion only. It is a single
// calm accent banner — not confetti, not a takeover. When reduce motion is on
// (useReduceMotion()), the entrance animation is short-circuited and the banner
// simply appears, fully opaque, with no movement. The message is honest: it is
// shown only when the caller has a genuine badge/level-completion edge.

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography, useReduceMotion } from '../theme';

export interface CelebrationProps {
  message: string;
  // Optional override for tests; defaults to the live accessibility signal.
  reduceMotionOverride?: boolean;
}

export function Celebration({ message, reduceMotionOverride }: CelebrationProps) {
  const liveReduceMotion = useReduceMotion();
  const reduceMotion = reduceMotionOverride ?? liveReduceMotion;

  // Start opaque when motion is reduced (no entrance), otherwise fade/rise in.
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 8)).current;

  useEffect(() => {
    if (reduceMotion) {
      // No animation: ensure the final resting values, no motion.
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, opacity, translateY]);

  return (
    <Animated.View
      style={[styles.banner, { opacity, transform: [{ translateY }] }]}
      accessibilityRole="text"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dot} />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  text: {
    ...typography.bodyStrong,
    color: colors.success,
    flexShrink: 1,
  },
});

export default Celebration;
