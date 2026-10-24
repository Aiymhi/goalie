// Shows the correct answer, answerExplanation, and nextStep. On arrival it
// marks the lesson complete via the context (completeLesson) — this is the
// single place a lesson flips to complete (completion == reaching Result,
// an intentional choice given self-checked practice). The write is awaited;
// on failure we show "couldn't save — retry" and do NOT claim completion.
// After a successful write it derives completion events to surface a
// level-complete moment.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LevelId } from '../../domain/content/catalog.types';
import {
  completeLesson as completeLessonPure,
  isLevelComplete,
} from '../../domain/progression';
import { deriveCompletionEvents } from '../../domain/rewards';
import { useProgression } from '../context/ProgressionProvider';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLesson, findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

type SaveStatus = 'saving' | 'saved' | 'failed';

export function ResultScreen({ route, navigation }: Props) {
  const { trackId, levelId, lessonId } = route.params;
  const { status, error, catalog, progression, completeLesson, reload } =
    useProgression();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saving');
  const [justCompletedLevel, setJustCompletedLevel] = useState(false);

  const track = catalog ? findTrack(catalog, trackId) : null;
  const level = track ? findLevel(track, levelId) : null;
  const lesson = level ? findLesson(level, lessonId) : null;

  const markComplete = useCallback(async () => {
    if (!track || !level || !lesson) {
      return;
    }
    setSaveStatus('saving');
    // Compute the before/after around the same transition to honestly detect
    // whether this completion just finished the level.
    const before = progression;
    const after = completeLessonPure(before, track.id, level.id as LevelId, lesson.id);
    try {
      await completeLesson(track.id, level.id as LevelId, lesson.id);
      const events = deriveCompletionEvents(before, after, level, track.id);
      setJustCompletedLevel(
        events.length > 0 || isLevelComplete(after, level, track.id),
      );
      setSaveStatus('saved');
    } catch {
      setSaveStatus('failed');
    }
    // progression intentionally excluded: we capture it once per arrival so a
    // provider state change from the write does not re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, level, lesson, completeLesson]);

  useEffect(() => {
    void markComplete();
  }, [markComplete]);

  if (status === 'loading') {
    return <LoadingState label="Loading result…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load the result.'}
        onRetry={reload}
      />
    );
  }
  if (track === null || level === null || lesson === null) {
    return (
      <ErrorState
        message="Result not found."
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

      <Text style={styles.title}>How you did</Text>

      <Text style={styles.sectionLabel}>Suggested answer</Text>
      <Text style={styles.body}>{lesson.practice.answer}</Text>

      <Text style={styles.sectionLabel}>Why</Text>
      <Text style={styles.body}>{lesson.practice.answerExplanation}</Text>

      <Text style={styles.sectionLabel}>Next step</Text>
      <Text style={styles.body}>{lesson.nextStep}</Text>

      {saveStatus === 'saving' ? (
        <Text style={styles.saving}>Saving your progress…</Text>
      ) : saveStatus === 'saved' ? (
        <View>
          <Text style={styles.saved}>Progress saved.</Text>
          {justCompletedLevel ? (
            <Text style={styles.levelComplete}>
              You completed the {level.title} level.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.failRow}>
          <Text style={styles.failed}>
            Couldn&apos;t save your progress.
          </Text>
          <Pressable
            style={styles.retry}
            onPress={() => void markComplete()}
            accessibilityRole="button"
            accessibilityLabel="Retry saving your progress"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={styles.primary}
        onPress={() => navigation.navigate('Home')}
        accessibilityRole="button"
        accessibilityLabel="Back to home"
      >
        <Text style={styles.primaryText}>Done</Text>
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
  saving: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  saved: {
    fontSize: 14,
    color: '#0a7d28',
    marginTop: 8,
    fontWeight: '600',
  },
  levelComplete: {
    fontSize: 15,
    color: '#0a7d28',
    fontWeight: '700',
    marginTop: 4,
  },
  failRow: {
    marginTop: 8,
    gap: 8,
  },
  failed: {
    fontSize: 14,
    color: '#b00020',
    fontWeight: '600',
  },
  retry: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#1f6feb',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
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

export default ResultScreen;
