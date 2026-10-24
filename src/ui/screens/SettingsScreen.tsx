// Accessibility-friendly controls (large tap targets, labeled) and the
// local-data deletion action. Deletion shows a destructive confirm dialog,
// then calls the context's deleteAllData, which clears persistence, resets
// in-memory state, and routes back to TrackSelect. A failed delete surfaces an
// error and leaves state untouched (no partial wipe claimed as success).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useProgression } from '../context/ProgressionProvider';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { deleteAllData, displayName, selectedTrackId } = useProgression();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
