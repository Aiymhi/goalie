// Phase 5 voluntary focus-session UX, layered on the Phase 1 native module via
// useFocusSession. HONESTY RULES this screen upholds:
//   - getFocusAvailability() is the single truth. When unavailable it shows the
//     shared REASON_TEXT copy and NOTHING resembling an active/blocked state
//     (the screens.smoke contract: contains 'unavailable', shows a REASON_TEXT
//     string, and does NOT contain 'blocked'/'blocking'/'session active' as a
//     fabricated state).
//   - When available it renders the real flow: pick apps -> choose a validated
//     duration -> an explicit disclosure of exactly what will be blocked, that
//     the block releases automatically at the disclosed deadline regardless of
//     lesson/quiz state, and that it can be ended anytime via emergency release
//     -> an explicit Start button. While active it shows the honest native
//     status, remaining time, and an always-visible Emergency release.
//   - It never claims unbreakable blocking; the compile-only verification
//     ceiling is stated inline.
// Phase 7: restyled onto the shared theme + AppButton/Card. Behaviour, copy,
// and honest states are unchanged.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from '../../domain/focus-session';
import { REASON_TEXT } from '../focus/reasonText';
import { useFocusSession } from '../focus/useFocusSession';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme';

// Preset durations (seconds), all inside the enforced [60, 86400] bounds.
const DURATION_OPTIONS: { label: string; seconds: number }[] = [
  { label: '1 min', seconds: 60 },
  { label: '15 min', seconds: 15 * 60 },
  { label: '25 min', seconds: 25 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
];

function formatRemaining(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function FocusScreen() {
  const {
    availability,
    selectionSummary,
    phase,
    remainingSeconds,
    record,
    startError,
    presentPicker,
    start,
    emergencyRelease,
    reconcileNow,
  } = useFocusSession();

  const [selectedSeconds, setSelectedSeconds] = useState<number>(25 * 60);

  // Reconcile the authoritative native session on mount (the hook also does an
  // initial reconcile; this is explicit per the Phase 5 contract).
  useEffect(() => {
    reconcileNow();
  }, [reconcileNow]);

  if (availability === null) {
    return (
      <Screen>
        <Text style={styles.title}>Focus protection</Text>
        <View style={styles.statusRow}>
          <ActivityIndicator
            accessibilityLabel="Checking focus availability"
            color={colors.accent}
          />
          <Text style={styles.status}>Checking…</Text>
        </View>
      </Screen>
    );
  }

  if (!availability.available) {
    return (
      <Screen>
        <Text style={styles.title}>Focus protection</Text>
        <Text style={[styles.status, styles.unavailable]}>
          Focus protection unavailable ({availability.reason})
        </Text>
        <Text style={styles.detail}>{REASON_TEXT[availability.reason]}</Text>
      </Screen>
    );
  }

  // --- available path ---
  const isActive = phase === 'active';
  const canStart = selectionSummary !== null && !isActive;

  return (
    <Screen>
      <Text style={styles.title}>Focus protection</Text>

      <Text style={styles.ceiling}>
        This is real native code, but on-device blocking is not runtime-verified
        in this build (compile-only). It is not an unbreakable block.
      </Text>

      {isActive && record !== null ? (
        <Card tone="accent">
          <Text style={styles.activeHeading}>Focus is on</Text>
          <Text style={styles.detail}>
            Restricting: {record.selectionSummary}
          </Text>
          <Text style={styles.remaining} accessibilityLabel="Time remaining">
            {formatRemaining(remainingSeconds)} remaining
          </Text>
          <Text style={styles.detail}>
            Releases automatically at the deadline, whatever your lesson or quiz
            state. This countdown is display-only — the device release ends it.
          </Text>
          <AppButton
            label="Emergency release"
            variant="danger"
            onPress={() => {
              emergencyRelease();
            }}
          />
        </Card>
      ) : (
        <View style={styles.setupCard}>
          <Text style={styles.sectionHeading}>1. Pick apps to restrict</Text>
          <AppButton
            label={selectionSummary === null ? 'Choose apps' : 'Change selection'}
            onPress={() => {
              presentPicker();
            }}
          />
          <Text style={styles.detail}>
            {selectionSummary === null
              ? 'No apps selected yet.'
              : `Selected: ${selectionSummary}`}
          </Text>

          <Text style={styles.sectionHeading}>2. Choose a duration</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((option) => {
              const selected = option.seconds === selectedSeconds;
              return (
                <Pressable
                  key={option.seconds}
                  accessibilityRole="button"
                  accessibilityLabel={`Set duration ${option.label}`}
                  accessibilityState={{ selected }}
                  style={[
                    styles.durationChip,
                    selected && styles.durationChipSelected,
                  ]}
                  onPress={() => setSelectedSeconds(option.seconds)}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      selected && styles.durationChipTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.detail}>
            Duration must be between {MIN_DURATION_SECONDS} seconds and{' '}
            {MAX_DURATION_SECONDS} seconds.
          </Text>

          <Text style={styles.sectionHeading}>3. What will happen</Text>
          <Card tone="muted">
            <Text style={styles.disclosureText}>
              When you start, the apps you picked ({selectionSummary ?? 'none yet'})
              will be blocked on this device for the chosen duration.
            </Text>
            <Text style={styles.disclosureText}>
              The block releases automatically at the deadline, regardless of
              your lesson or quiz state — finishing a lesson does not end it, and
              it never grants learning credit.
            </Text>
            <Text style={styles.disclosureText}>
              You can end it at any time with Emergency release. Nothing here is
              permanent or unbreakable.
            </Text>
          </Card>

          <AppButton
            label="Start focus"
            disabled={!canStart}
            onPress={() => {
              start(selectedSeconds);
            }}
          />
          {!canStart ? (
            <Text style={styles.detail}>
              Pick at least one app before starting.
            </Text>
          ) : null}

          {startError !== null ? (
            <Text style={[styles.status, styles.error]}>
              Could not start focus: {startError}. Protection was not started.
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  ceiling: {
    ...typography.caption,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  status: {
    ...typography.body,
    color: colors.ink,
  },
  unavailable: {
    color: colors.danger,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    fontWeight: '600',
  },
  detail: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  setupCard: {
    gap: spacing.sm,
  },
  activeHeading: {
    ...typography.heading,
    color: colors.ink,
  },
  remaining: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  sectionHeading: {
    ...typography.bodyStrong,
    color: colors.ink,
    marginTop: spacing.md,
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  durationChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  durationChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  durationChipText: {
    ...typography.label,
    color: colors.accent,
  },
  durationChipTextSelected: {
    color: colors.onAccent,
  },
  disclosureText: {
    ...typography.caption,
    color: colors.ink,
  },
});

export default FocusScreen;
