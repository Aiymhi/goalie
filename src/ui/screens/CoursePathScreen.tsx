// For the selected track, lists its three levels with ACCURATE per-level
// progress from viewLevelProgress (completedLessons/2, mastery passed,
// complete). No fabricated percentages. Shows the published mastery passRule.
// Renders the finance disclaimer banner for the finance track.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';
import { viewLevelProgress } from '../../domain/progression';
import { useProgression } from '../context/ProgressionProvider';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'CoursePath'>;

export function CoursePathScreen({ route, navigation }: Props) {
  const { trackId } = route.params;
  const { status, error, catalog, progression, reload } = useProgression();

  if (status === 'loading') {
    return <LoadingState label="Loading course path…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load the course path.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  if (track === null) {
    return (
      <ErrorState
        message={`Track "${trackId}" not found.`}
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

      <Text style={styles.title}>{track.title}</Text>

      {track.levels.map((level) => {
        const view = viewLevelProgress(progression, level, track.id);
        return (
          <View key={level.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.levelTitle}>{level.title}</Text>
              {view.complete ? (
                <Text style={styles.complete}>Complete</Text>
              ) : null}
            </View>
            <Text style={styles.objective}>{level.objective}</Text>
            <Text style={styles.progress}>
              {view.completedLessons} of {view.totalLessons} lessons
            </Text>
            <Text style={styles.progress}>
              Mastery: {view.masteryPassed ? 'passed' : 'not yet passed'}
              {view.bestCorrectCount > 0
                ? ` (best ${view.bestCorrectCount}/5)`
                : ''}
            </Text>
            <Text style={styles.passRule}>{level.mastery.passRule}</Text>

            <View style={styles.actions}>
              {level.lessons.map((lesson) => (
                <Pressable
                  key={lesson.id}
                  style={styles.lessonLink}
                  onPress={() =>
                    navigation.navigate('Lesson', {
                      trackId: track.id,
                      levelId: level.id as LevelId,
                      lessonId: lesson.id,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open lesson ${lesson.title}`}
                >
                  <Text style={styles.lessonLinkText}>{lesson.title}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.masteryLink}
                onPress={() =>
                  navigation.navigate('Mastery', {
                    trackId: track.id,
                    levelId: level.id as LevelId,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Open ${level.title} mastery check`}
              >
                <Text style={styles.masteryLinkText}>Mastery check</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
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
  card: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  complete: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0a7d28',
  },
  objective: {
    fontSize: 14,
    color: '#444',
  },
  progress: {
    fontSize: 14,
  },
  passRule: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actions: {
    marginTop: 8,
    gap: 8,
  },
  lessonLink: {
    minHeight: 44,
    justifyContent: 'center',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  lessonLinkText: {
    fontSize: 15,
  },
  masteryLink: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#eef4ff',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  masteryLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f6feb',
  },
});

export default CoursePathScreen;
