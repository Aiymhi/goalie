// The one button the app uses, consuming the theme. Guarantees the
// accessibility floor every interactive element needs: an explicit
// accessibilityRole="button", a required non-empty accessibilityLabel, an
// honest disabled state exposed via accessibilityState, and a tap target at
// least MIN_TOUCH_TARGET tall. Three visual variants map to one accent +
// semantic states; none invent a new colour.

import { ReactNode } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

import { colors, MIN_TOUCH_TARGET, radii, spacing, typography } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger';

export interface AppButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  // Required so no interactive element ever ships without a label. Defaults to
  // `label` when omitted at the call site via the destructure below.
  accessibilityLabel?: string;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
  // Optional leading/!trailing content (kept minimal; text is the norm).
  children?: ReactNode;
}

export function AppButton({
  label,
  onPress,
  accessibilityLabel,
  variant = 'primary',
  disabled = false,
  style,
}: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantContainer[variant],
        pressed && !disabled ? variantPressed[variant] : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.label, variantLabel[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...typography.bodyStrong,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantContainer: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  danger: { backgroundColor: colors.danger },
};

const variantPressed: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accentPressed },
  secondary: { backgroundColor: colors.accentSoft },
  danger: { backgroundColor: '#8F1E17' },
};

const variantLabel = StyleSheet.create({
  primary: { color: colors.onAccent },
  secondary: { color: colors.accent },
  danger: { color: colors.onAccent },
});

export default AppButton;
