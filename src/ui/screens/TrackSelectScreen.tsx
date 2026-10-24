// Lists the three catalog tracks + an optional display-name input. On confirm,
// persists { selectedTrackId, displayName } via the context and navigates Home.
// Honest states: error if the catalog failed to parse (never a blank list).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { useProgression } from '../context/ProgressionProvider';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TrackSelect'>;

export function TrackSelectScreen({ navigation }: Props) {
  const { status, error, catalog, displayName, selectedTrackId, reload, setSelection } =
    useProgression();
  const [name, setName] = useState(displayName ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading tracks…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load the course catalog.'}
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
    <Screen>
      <Text style={styles.title}>Pick a track to start learning</Text>

      <Text style={styles.label} nativeID="displayNameLabel">
        Your name (optional)
      </Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Ada"
        placeholderTextColor={colors.inkFaint}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  label: {
    ...typography.label,
    color: colors.ink,
  },
  input: {
    minHeight: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  cardDesc: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  current: {
    ...typography.label,
    color: colors.accent,
  },
  saveError: {
    ...typography.caption,
    color: colors.danger,
  },
});

export default TrackSelectScreen;
