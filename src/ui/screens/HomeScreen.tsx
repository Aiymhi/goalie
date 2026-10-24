// Shows exactly ONE clear next action derived from REAL progression state:
// resume the first incomplete lesson, start the mastery check, advance to the
// next level, or view the certificate preview when the track is complete.
// Never a fabricated action. Secondary links to Course path, Progress, Focus,
// Settings. Honest loading/empty/error states.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Level, LevelId, Track } from '../../domain/content/catalog.types';
import { isLevelComplete, viewLevelProgress } from '../../domain/progression';
import { useProgression } from '../context/ProgressionProvider';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
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
    return <LoadingState label="Loading your progress…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load your progress.'}
        onRetry={reload}
      />
    );
  }
  if (selectedTrackId === null) {
    return (
      <EmptyState
        title="Start your first lesson"
        detail="Choose a track to begin."
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

  const track = findTrack(catalog, selectedTrackId);
  if (track === null) {
    return (
      <ErrorState
        message={`Selected track "${selectedTrackId}" is no longer available.`}
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Goalie</Text>
      <Text style={styles.greeting}>
        {displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
      </Text>
      <Text style={styles.trackName}>{track.title}</Text>

      <Text style={styles.sectionLabel}>Your next step</Text>
      <Pressable
        style={styles.primary}
        onPress={runAction}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <Text style={styles.primaryText}>{action.label}</Text>
      </Pressable>

      <View style={styles.links}>
        <SecondaryLink
          label="Course path"
          onPress={() => navigation.navigate('CoursePath', { trackId: track.id })}
        />
        <SecondaryLink label="Progress" onPress={() => navigation.navigate('Progress')} />
        <SecondaryLink label="Focus" onPress={() => navigation.navigate('Focus')} />
        <SecondaryLink label="Settings" onPress={() => navigation.navigate('Settings')} />
      </View>
    </ScrollView>
  );
}

function SecondaryLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={styles.link}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  greeting: {
    fontSize: 16,
    color: '#444',
  },
  trackName: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    color: '#666',
  },
  primary: {
    minHeight: 56,
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  links: {
    marginTop: 20,
    gap: 10,
  },
  link: {
    minHeight: 48,
    justifyContent: 'center',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  linkText: {
    fontSize: 16,
  },
});

export default HomeScreen;
