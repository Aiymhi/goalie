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

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from '../../domain/focus-session';
import { REASON_TEXT } from '../focus/reasonText';
import { useFocusSession } from '../focus/useFocusSession';

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
      <View style={styles.container}>
        <Text style={styles.title}>Focus protection</Text>
        <View style={styles.statusRow}>
          <ActivityIndicator accessibilityLabel="Checking focus availability" />
          <Text style={styles.status}>Checking…</Text>
        </View>
      </View>
    );
  }

  if (!availability.available) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Focus protection</Text>
        <Text style={[styles.status, styles.unavailable]}>
          Focus protection unavailable ({availability.reason})
        </Text>
        <Text style={styles.detail}>{REASON_TEXT[availability.reason]}</Text>
      </View>
    );
  }

  // --- available path ---
  const isActive = phase === 'active';
  const canStart = selectionSummary !== null && !isActive;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Focus protection</Text>

      <Text style={styles.ceiling}>
        This is real native code, but on-device blocking is not runtime-verified
        in this build (compile-only). It is not an unbreakable block.
      </Text>

      {isActive && record !== null ? (
        <View style={styles.activeCard}>
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
          <Pressable
            accessibilityRole="button"
            style={[styles.button, styles.releaseButton]}
            onPress={() => {
              emergencyRelease();
            }}
          >
            <Text style={styles.buttonText}>Emergency release</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.setupCard}>
          <Text style={styles.sectionHeading}>1. Pick apps to restrict</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => {
              presentPicker();
            }}
          >
            <Text style={styles.buttonText}>
              {selectionSummary === null ? 'Choose apps' : 'Change selection'}
            </Text>
          </Pressable>
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
          <View style={styles.disclosure}>
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
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canStart }}
            disabled={!canStart}
            style={[styles.button, !canStart && styles.buttonDisabled]}
            onPress={() => {
              start(selectedSeconds);
            }}
          >
            <Text style={styles.buttonText}>Start focus</Text>
          </Pressable>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  content: {
    gap: 12,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  ceiling: {
    fontSize: 13,
    color: '#8a5a00',
    backgroundColor: '#fff6e0',
    padding: 10,
    borderRadius: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  status: {
    fontSize: 16,
  },
  unavailable: {
    color: '#b00020',
    fontWeight: '600',
  },
  error: {
    color: '#b00020',
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
  },
  setupCard: {
    gap: 8,
  },
  activeCard: {
    gap: 10,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#eef4ff',
  },
  activeHeading: {
    fontSize: 18,
    fontWeight: '700',
  },
  remaining: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9bb0d6',
  },
  durationChipSelected: {
    backgroundColor: '#2f5bd6',
    borderColor: '#2f5bd6',
  },
  durationChipText: {
    fontSize: 14,
    color: '#2f5bd6',
    fontWeight: '600',
  },
  durationChipTextSelected: {
    color: '#fff',
  },
  disclosure: {
    gap: 6,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fafafa',
  },
  disclosureText: {
    fontSize: 14,
    color: '#333',
  },
  button: {
    backgroundColor: '#2f5bd6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9bb0d6',
  },
  releaseButton: {
    backgroundColor: '#b00020',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default FocusScreen;
