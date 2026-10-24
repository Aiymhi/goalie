// Consistent loading / empty / error rendering so no screen invents its own
// ad-hoc blank. Loading is explicit (spinner + label). Error shows the
// underlying message and a recovery action. Empty is distinct from loading.
// Colours/spacing come from the shared theme so these primitives match the
// rest of the app.

import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import { AppButton } from './AppButton';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator accessibilityLabel="Loading" color={colors.accent} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Retry',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.detail}>{message}</Text>
      {onRetry ? (
        <AppButton
          label={retryLabel}
          onPress={onRetry}
          accessibilityLabel={retryLabel}
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  label: {
    ...typography.body,
    color: colors.inkMuted,
  },
  title: {
    ...typography.heading,
    color: colors.ink,
    textAlign: 'center',
  },
  errorTitle: {
    ...typography.heading,
    color: colors.danger,
    textAlign: 'center',
  },
  detail: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  button: {
    minWidth: 140,
    borderRadius: radii.sm,
  },
});
