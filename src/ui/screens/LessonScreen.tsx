// Renders one lesson's objective, explanation, workedExample from content.
// Finance track: disclaimer banner at top. Defensive not-found guard for a bad
// lessonId (shows "lesson not found" + back, never crashes). CTA -> Practice.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text } from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { Screen } from '../components/Screen';
import { colors, spacing, typography } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLesson, findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Lesson'>;

export function LessonScreen({ route, navigation }: Props) {
  const { trackId, levelId, lessonId } = route.params;
  const { status, error, catalog, reload } = useProgression();

  if (status === 'loading') {
    return <Screen status="loading" loadingLabel="Loading lesson…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load the lesson.'}
        onRetry={reload}
      />
    );
  }

  const track = findTrack(catalog, trackId);
  const level = track ? findLevel(track, levelId) : null;
  const lesson = level ? findLesson(level, lessonId) : null;
  if (track === null || level === null || lesson === null) {
    return (
      <Screen
        status="error"
        errorMessage="Lesson not found."
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

      <Text style={styles.title}>{lesson.title}</Text>

      <Text style={styles.sectionLabel}>Objective</Text>
      <Text style={styles.body}>{lesson.objective}</Text>

      <Text style={styles.sectionLabel}>Explanation</Text>
      <Text style={styles.body}>{lesson.explanation}</Text>

      <Text style={styles.sectionLabel}>Worked example</Text>
      <Text style={styles.body}>{lesson.workedExample}</Text>

      <AppButton
        label="Practice this lesson"
        accessibilityLabel="Go to practice"
        onPress={() =>
          navigation.navigate('Practice', {
            trackId: track.id,
            levelId: level.id as LevelId,
            lessonId: lesson.id,
          })
        }
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.ink,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.inkMuted,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  body: {
    ...typography.body,
    color: colors.ink,
  },
  cta: {
    marginTop: spacing.lg,
  },
});

export default LessonScreen;
