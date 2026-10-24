// Lists the three catalog tracks + an optional display-name input. On confirm,
// persists { selectedTrackId, displayName } via the context and navigates Home.
// Honest states: error if the catalog failed to parse (never a blank list).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { useProgression } from '../context/ProgressionProvider';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TrackSelect'>;

export function TrackSelectScreen({ navigation }: Props) {
  const { status, error, catalog, displayName, selectedTrackId, reload, setSelection } =
    useProgression();
  const [name, setName] = useState(displayName ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  if (status === 'loading') {
    return <LoadingState label="Loading tracks…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load the course catalog.'}
        onRetry={reload}
      />
    );
  }

  const choose = async (trackId: string) => {
    setSaveError(null);
    const trimmed = name.trim();
    try {
      await setSelection(trackId, trimmed.length > 0 ? trimmed : null);
      navigation.navigate('Home');
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not save your selection.',
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Pick a track to start learning</Text>

      <Text style={styles.label} nativeID="displayNameLabel">
        Your name (optional)
      </Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Ada"
        accessibilityLabel="Your display name, optional"
        accessibilityLabelledBy="displayNameLabel"
        autoCapitalize="words"
      />

      {catalog.tracks.map((track) => (
        <Pressable
          key={track.id}
          style={styles.card}
          onPress={() => choose(track.id)}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${track.title}`}
        >
          <Text style={styles.cardTitle}>{track.title}</Text>
          <Text style={styles.cardDesc}>{track.description}</Text>
          {track.id === selectedTrackId ? (
            <Text style={styles.current}>Current track</Text>
          ) : null}
        </Pressable>
      ))}

      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 48,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  card: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cardDesc: {
    fontSize: 14,
    color: '#444',
  },
  current: {
    fontSize: 12,
    color: '#1f6feb',
    fontWeight: '600',
  },
  saveError: {
    color: '#b00020',
    fontSize: 14,
  },
});

export default TrackSelectScreen;
