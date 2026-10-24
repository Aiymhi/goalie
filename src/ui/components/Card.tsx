// A calm surface block consuming the theme. Groups related content on the
// warm canvas with a soft border and consistent padding/radius, so no screen
// hand-rolls its own card styling.

import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radii, spacing } from '../theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  // 'muted' uses the subtle fill instead of a bordered surface — for secondary
  // groupings that should recede.
  tone?: 'surface' | 'muted' | 'accent';
}

export function Card({ children, style, tone = 'surface' }: CardProps) {
  return <View style={[styles.base, toneStyle[tone], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});

const toneStyle = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
  },
  accent: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
});

export default Card;
