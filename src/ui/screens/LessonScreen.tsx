// Renders one lesson's objective, explanation, workedExample from content.
// Finance track: disclaimer banner at top. Defensive not-found guard for a bad
// lessonId (shows "lesson not found" + back, never crashes). CTA -> Practice.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';
import { useProgression } from '../context/ProgressionProvider';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLesson, findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Lesson'>;

export function LessonScreen({ route, navigation }: Props) {
  const { trackId, levelId, lessonId } = route.params;
  const { status, error, catalog, reload } = useProgression();

  if (status === 'loading') {
    return <LoadingState label="Loading lesson…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load the lesson.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  const level = track ? findLevel(track, levelId) : null;
  const lesson = level ? findLesson(level, lessonId) : null;
  if (track === null || level === null || lesson === null) {
    return (
      <ErrorState
        message="Lesson not found."
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {isFinanceTrack(track.id) && track.disclaimer ? (
        <FinanceDisclaimerBanner text={track.disclaimer} />
      ) : null}

      <Text style={styles.title}>{lesson.title}</Text>

      <Text style={styles.sectionLabel}>Objective</Text>
      <Text style={styles.body}>{lesson.objective}</Text>

      <Text style={styles.sectionLabel}>Explanation</Text>
      <Text style={styles.body}>{lesson.explanation}</Text>

      <Text style={styles.sectionLabel}>Worked example</Text>
      <Text style={styles.body}>{lesson.workedExample}</Text>

      <Pressable
        style={styles.primary}
        onPress={() =>
          navigation.navigate('Practice', {
            trackId: track.id,
            levelId: level.id as LevelId,
            lessonId: lesson.id,
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Go to practice"
      >
        <Text style={styles.primaryText}>Practice this lesson</Text>
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
    marginTop: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
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

export default LessonScreen;
