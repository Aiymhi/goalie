// Shows level-completion badges that appear ONLY when isLevelComplete is true
// (no fake/greyed "almost" badges). Shows bestCorrectCount per attempted level
// as honest history. Links to the Certificate preview. Empty state when no
// badges are earned yet.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { isLevelComplete, viewLevelProgress } from '../../domain/progression';
import { useProgression } from '../context/ProgressionProvider';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Progress'>;

export function ProgressScreen({ navigation }: Props) {
  const { status, error, catalog, progression, selectedTrackId, reload } =
    useProgression();

  if (status === 'loading') {
    return <LoadingState label="Loading progress…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load your progress.'}
        onRetry={reload}
      />
    );
  }

  const track = selectedTrackId ? findTrack(catalog, selectedTrackId) : null;
  if (track === null) {
    return (
      <EmptyState
        title="No track selected"
        detail="Choose a track to start earning badges."
        action={
          <Pressable
            style={styles.primary}
            onPress={() => navigation.navigate('TrackSelect')}
            accessibilityRole="button"
            accessibilityLabel="Choose a track"
          >
            <Text style={styles.primaryText}>Choose a track</Text>
          </Pressable>
        }
      />
    );
  }

  const earnedBadges = track.levels.filter((level) =>
    isLevelComplete(progression, level, track.id),
  );
  const anyAttempt = track.levels.some((level) => {
    const view = viewLevelProgress(progression, level, track.id);
    return (
      view.completedLessons > 0 || view.bestCorrectCount > 0 || view.masteryPassed
    );
  });

  if (earnedBadges.length === 0 && !anyAttempt) {
    return (
      <EmptyState
        title="No badges yet"
        detail="Complete a level to earn one."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{track.title} progress</Text>

      <Text style={styles.sectionLabel}>Badges</Text>
      {earnedBadges.length === 0 ? (
        <Text style={styles.muted}>No badges yet — complete a level to earn one.</Text>
      ) : (
        earnedBadges.map((level) => (
          <View key={level.id} style={styles.badge} accessibilityLabel={`Badge: ${level.title} complete`}>
            <Text style={styles.badgeText}>{level.title} complete</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionLabel}>Best mastery scores</Text>
      {track.levels.map((level) => {
        const view = viewLevelProgress(progression, level, track.id);
        return (
          <View key={level.id} style={styles.row}>
            <Text style={styles.rowText}>{level.title}</Text>
            <Text style={styles.rowValue}>
              {view.bestCorrectCount > 0 ? `${view.bestCorrectCount}/5` : '—'}
            </Text>
          </View>
        );
      })}

      <Pressable
        style={styles.primary}
        onPress={() => navigation.navigate('Certificate', { trackId: track.id })}
        accessibilityRole="button"
        accessibilityLabel="View certificate preview"
      >
        <Text style={styles.primaryText}>View certificate preview</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  muted: {
    fontSize: 14,
    color: '#666',
  },
  badge: {
    backgroundColor: '#e7f6ec',
    borderColor: '#0a7d28',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  badgeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0a7d28',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowText: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  primary: {
    minHeight: 56,
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default ProgressScreen;
