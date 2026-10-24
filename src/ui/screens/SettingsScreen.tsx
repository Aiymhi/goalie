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
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useProgression } from '../context/ProgressionProvider';
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Display name</Text>
        <Text style={styles.cardValue}>{displayName ?? '—'}</Text>
        <Text style={styles.cardLabel}>Selected track</Text>
        <Text style={styles.cardValue}>{selectedTrackId ?? '—'}</Text>
        <Pressable
          style={styles.secondary}
          onPress={() => navigation.navigate('TrackSelect')}
          accessibilityRole="button"
          accessibilityLabel="Change track or display name"
        >
          <Text style={styles.secondaryText}>Change track / name</Text>
        </Pressable>
      </View>

      <Text style={styles.aiSectionLabel}>AI coaching (optional)</Text>
      <View style={styles.card}>
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
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="AI coaching endpoint URL"
        />
        {aiError ? <Text style={styles.error}>{aiError}</Text> : null}
      </View>

      <Text style={styles.sectionLabel}>Danger zone</Text>
      <Pressable
        style={[styles.destructive, deleting && styles.destructiveDisabled]}
        onPress={confirmDelete}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel="Delete all local data"
        accessibilityState={{ disabled: deleting }}
      >
        <Text style={styles.destructiveText}>
          {deleting ? 'Deleting…' : 'Delete all local data'}
        </Text>
      </Pressable>
      {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
  cardLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b00020',
    marginTop: 16,
  },
  aiSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  disclosure: {
    fontSize: 13,
    color: '#444',
    lineHeight: 19,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 10,
    marginTop: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1f6feb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#1f6feb',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  ackText: {
    fontSize: 14,
    flexShrink: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginTop: 8,
  },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 6,
  },
  secondary: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 12,
  },
  secondaryText: {
    fontSize: 16,
    color: '#1f6feb',
    fontWeight: '600',
  },
  destructive: {
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#b00020',
    borderRadius: 10,
  },
  destructiveDisabled: {
    backgroundColor: '#d98b98',
  },
  destructiveText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  error: {
    color: '#b00020',
    fontSize: 14,
  },
});

export default SettingsScreen;
