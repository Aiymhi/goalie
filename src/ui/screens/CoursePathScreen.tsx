// For the selected track, lists its three levels with ACCURATE per-level
// progress from viewLevelProgress (completedLessons/2, mastery passed,
// complete). No fabricated percentages. Shows the published mastery passRule.
// Renders the finance disclaimer banner for the finance track.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';
import { viewLevelProgress } from '../../domain/progression';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { Screen } from '../components/Screen';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'CoursePath'>;

export function CoursePathScreen({ route, navigation }: Props) {
  const { trackId } = route.params;
  const { status, error, catalog, progression, reload } = useProgression();

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading course path…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load the course path.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  if (track === null) {
    return (
      <Screen
        status="error"
        errorMessage={`Track "${trackId}" not found.`}
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  return (
    <Screen>
      {isFinanceTrack(track.id) && track.disclaimer ? (
        <FinanceDisclaimerBanner text={track.disclaimer} />
      ) : null}

      <Text style={styles.title}>{track.title}</Text>

      {track.levels.map((level) => {
        const view = viewLevelProgress(progression, level, track.id);
        return (
          <Card key={level.id}>
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
                <AppButton
                  key={lesson.id}
                  label={lesson.title}
                  variant="secondary"
                  accessibilityLabel={`Open lesson ${lesson.title}`}
                  onPress={() =>
                    navigation.navigate('Lesson', {
                      trackId: track.id,
                      levelId: level.id as LevelId,
                      lessonId: lesson.id,
                    })
                  }
                />
              ))}
              <AppButton
                label="Mastery check"
                accessibilityLabel={`Open ${level.title} mastery check`}
                onPress={() =>
                  navigation.navigate('Mastery', {
                    trackId: track.id,
                    levelId: level.id as LevelId,
                  })
                }
              />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  complete: {
    ...typography.label,
    color: colors.success,
  },
  objective: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  progress: {
    ...typography.body,
    color: colors.ink,
  },
  passRule: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});

export default CoursePathScreen;
