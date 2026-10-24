// Accessibility-friendly controls (large tap targets, labeled) and the
// local-data deletion action. Deletion shows a destructive confirm dialog,
// then calls the context's deleteAllData, which clears persistence, resets
// in-memory state, and routes back to TrackSelect. A failed delete surfaces an
// error and leaves state untouched (no partial wipe claimed as success).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme';
import { PersistedAiCoaching } from '../../persistence/store';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const {
    deleteAllData,
    displayName,
    selectedTrackId,
    aiCoaching,
    setAiCoaching,
  } = useProgression();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Local draft of the endpoint entry; committed on blur so a partial URL does
  // not thrash persistence while typing.
  const [endpointDraft, setEndpointDraft] = useState<string>(
    aiCoaching.endpointUrl ?? '',
  );
  const [aiError, setAiError] = useState<string | null>(null);

  // Persist an AI-coaching change through the single-key provider path. The
  // store additionally coerces enabled->false without acknowledgement as a
  // defense-in-depth guard, but the UI enforces it here too.
  const persistAi = async (next: PersistedAiCoaching) => {
    setAiError(null);
    try {
      await setAiCoaching(next);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Could not save AI settings.',
      );
    }
  };

  const onAcknowledge = () =>
    void persistAi({
      ...aiCoaching,
      disclosureAcknowledged: !aiCoaching.disclosureAcknowledged,
      // Turning the acknowledgement off also turns the feature off.
      enabled: aiCoaching.disclosureAcknowledged ? false : aiCoaching.enabled,
    });

  const onToggleEnabled = (value: boolean) => {
    // Can only enable once the disclosure is acknowledged.
    if (value && !aiCoaching.disclosureAcknowledged) {
      return;
    }
    void persistAi({ ...aiCoaching, enabled: value });
  };

  const onEndpointBlur = () => {
    const trimmed = endpointDraft.trim();
    void persistAi({
      ...aiCoaching,
      endpointUrl: trimmed.length > 0 ? trimmed : null,
    });
  };

  const runDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAllData();
      navigation.reset({ index: 0, routes: [{ name: 'TrackSelect' }] });
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Could not delete your data.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete all local data?',
      'This permanently removes your selected track, display name, and all progress on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void runDelete(),
        },
      ],
    );
  };

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      <Card>
        <Text style={styles.cardLabel}>Display name</Text>
        <Text style={styles.cardValue}>{displayName ?? '—'}</Text>
        <Text style={styles.cardLabel}>Selected track</Text>
        <Text style={styles.cardValue}>{selectedTrackId ?? '—'}</Text>
        <AppButton
          label="Change track / name"
          variant="secondary"
          accessibilityLabel="Change track or display name"
          style={styles.secondary}
          onPress={() => navigation.navigate('TrackSelect')}
        />
      </Card>

      <Text style={styles.aiSectionLabel}>AI coaching (optional)</Text>
      <Card>
        <Text style={styles.disclosure}>
          AI coaching is off by default. When you turn it on and set an endpoint,
          the app sends only this lesson&apos;s id, the practice prompt, the
          suggested answer, and your truncated practice text to the endpoint you
          configure. It never sends your name, your progress, your XP, or any
          device identifier. Nothing is sent while this feature is off. See
          docs/ai-coaching.md for details.
        </Text>

        <Pressable
          style={styles.ackRow}
          onPress={onAcknowledge}
          accessibilityRole="checkbox"
          accessibilityLabel="Acknowledge the AI coaching data disclosure"
          accessibilityState={{ checked: aiCoaching.disclosureAcknowledged }}
        >
          <View
            style={[
              styles.checkbox,
              aiCoaching.disclosureAcknowledged && styles.checkboxChecked,
            ]}
          >
            {aiCoaching.disclosureAcknowledged ? (
              <Text style={styles.checkboxMark}>✓</Text>
            ) : null}
          </View>
          <Text style={styles.ackText}>
            I understand what data leaves my device.
          </Text>
        </Pressable>

        <View style={styles.toggleRow}>
          <Text style={styles.cardValue}>Enable AI hints</Text>
          <Switch
            value={aiCoaching.enabled}
            onValueChange={onToggleEnabled}
            disabled={!aiCoaching.disclosureAcknowledged}
            accessibilityLabel="Enable AI coaching hints"
            accessibilityState={{
              disabled: !aiCoaching.disclosureAcknowledged,
              checked: aiCoaching.enabled,
            }}
          />
        </View>
        {!aiCoaching.disclosureAcknowledged ? (
          <Text style={styles.cardLabel}>
            Acknowledge the disclosure above to enable.
          </Text>
        ) : null}

        <Text style={styles.cardLabel}>Coaching endpoint URL</Text>
        <TextInput
          style={styles.input}
          value={endpointDraft}
          onChangeText={setEndpointDraft}
          onBlur={onEndpointBlur}
          placeholder="https://your-server.example/coach/explain"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="AI coaching endpoint URL"
        />
        {aiError ? <Text style={styles.error}>{aiError}</Text> : null}
      </Card>

      <Text style={styles.sectionLabel}>Danger zone</Text>
      <AppButton
        label={deleting ? 'Deleting…' : 'Delete all local data'}
        variant="danger"
        disabled={deleting}
        accessibilityLabel="Delete all local data"
        onPress={confirmDelete}
      />
      {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  cardLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  cardValue: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.danger,
    marginTop: spacing.lg,
  },
  aiSectionLabel: {
    ...typography.label,
    color: colors.ink,
    marginTop: spacing.lg,
  },
  disclosure: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
  },
  checkboxMark: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  ackText: {
    ...typography.caption,
    color: colors.ink,
    flexShrink: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginTop: spacing.sm,
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
  secondary: {
    marginTop: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});

export default SettingsScreen;
