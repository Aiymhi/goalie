// Shows exactly ONE clear next action derived from REAL progression state:
// resume the first incomplete lesson, start the mastery check, advance to the
// next level, or view the certificate preview when the track is complete.
// Never a fabricated action. Secondary links to Course path, Progress, Focus,
// Settings. Honest loading/empty/error states.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { Level, LevelId, Track } from '../../domain/content/catalog.types';
import { isLevelComplete, viewLevelProgress } from '../../domain/progression';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type NextAction =
  | { kind: 'lesson'; level: Level; lessonId: string; label: string }
  | { kind: 'mastery'; level: Level; label: string }
  | { kind: 'certificate'; label: string };

// Derive the single next action against real state. Returns null only if the
// track itself could not be resolved (handled by the caller).
function deriveNextAction(
  track: Track,
  progression: Parameters<typeof viewLevelProgress>[0],
): NextAction {
  for (const level of track.levels) {
    const view = viewLevelProgress(progression, level, track.id);
    // First incomplete lesson in this level.
    const nextLesson = level.lessons.find(
      (lesson) =>
        !progression.levels[`${track.id}/${level.id}`]?.completedLessonIds.includes(
          lesson.id,
        ),
    );
    if (nextLesson) {
      return {
        kind: 'lesson',
        level,
        lessonId: nextLesson.id,
        label: `Resume: ${nextLesson.title}`,
      };
    }
    // Both lessons done but mastery not yet passed.
    if (!view.masteryPassed) {
      return {
        kind: 'mastery',
        level,
        label: `Take the ${level.title} mastery check`,
      };
    }
    // This level complete — continue to the next level in the loop.
    if (!isLevelComplete(progression, level, track.id)) {
      // Defensive: lessons done + mastery passed should be complete.
      return {
        kind: 'mastery',
        level,
        label: `Take the ${level.title} mastery check`,
      };
    }
  }
  // All levels complete.
  return { kind: 'certificate', label: 'Track complete — view your certificate preview' };
}

export function HomeScreen({ navigation }: Props) {
  const { status, error, catalog, progression, displayName, selectedTrackId, reload } =
    useProgression();

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading your progress…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load your progress.'}
        onRetry={reload}
      />
    );
  }
  if (selectedTrackId === null) {
    return (
      <Screen
        status="empty"
        emptyTitle="Start your first lesson"
        emptyDetail="Choose a track to begin."
        emptyAction={
          <AppButton
            label="Choose a track"
            onPress={() => navigation.navigate('TrackSelect')}
          />
        }
      />
    );
  }

  const track = findTrack(catalog, selectedTrackId);
  if (track === null) {
    return (
      <Screen
        status="error"
        errorMessage={`Selected track "${selectedTrackId}" is no longer available.`}
        onRetry={() => navigation.navigate('TrackSelect')}
        retryLabel="Choose a track"
      />
    );
  }

  const action = deriveNextAction(track, progression);

  const runAction = () => {
    if (action.kind === 'lesson') {
      navigation.navigate('Lesson', {
        trackId: track.id,
        levelId: action.level.id as LevelId,
        lessonId: action.lessonId,
      });
    } else if (action.kind === 'mastery') {
      navigation.navigate('Mastery', {
        trackId: track.id,
        levelId: action.level.id as LevelId,
      });
    } else {
      navigation.navigate('Certificate', { trackId: track.id });
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>Goalie</Text>
      <Text style={styles.greeting}>
        {displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
      </Text>
      <Text style={styles.trackName}>{track.title}</Text>

      <Text style={styles.sectionLabel}>Your next step</Text>
      <AppButton label={action.label} onPress={runAction} />

      <View style={styles.links}>
        <AppButton
          label="Course path"
          variant="secondary"
          onPress={() => navigation.navigate('CoursePath', { trackId: track.id })}
        />
        <AppButton
          label="Progress"
          variant="secondary"
          onPress={() => navigation.navigate('Progress')}
        />
        <AppButton
          label="Focus"
          variant="secondary"
          onPress={() => navigation.navigate('Focus')}
        />
        <AppButton
          label="Settings"
          variant="secondary"
          onPress={() => navigation.navigate('Settings')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.display,
    color: colors.ink,
  },
  greeting: {
    ...typography.body,
    color: colors.inkMuted,
  },
  trackName: {
    ...typography.heading,
    color: colors.ink,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  links: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
});

export default HomeScreen;
