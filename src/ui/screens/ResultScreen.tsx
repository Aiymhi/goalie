// Shows the correct answer, answerExplanation, and nextStep. On arrival it
// marks the lesson complete via the context (completeLesson) — this is the
// single place a lesson flips to complete (completion == reaching Result,
// an intentional choice given self-checked practice). The write is awaited;
// on failure we show "couldn't save — retry" and do NOT claim completion.
//
// Phases 3+4: the completeLesson wrapper now returns the reward outcome, the
// newly-earned badge (if any), and the PRE-WRITE prior practice attempt. This
// screen renders honest XP/streak/badge copy from the outcome and practice
// coaching from the returned pre-write prior (never live provider state). It no
// longer recomputes completion events locally — badgeEarned is the single
// source of the "You completed the <level> level." moment.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchAiHint } from '../../ai/coachingClient';
import {
  CoachingFeedback,
  coachPractice,
  PriorPracticeAttempt,
} from '../../domain/coaching';
import { LevelId } from '../../domain/content/catalog.types';
import { RewardOutcome } from '../../domain/rewards';
import { useProgression } from '../context/ProgressionProvider';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { RootStackParamList } from '../navigation/RootNavigator';
import { findLesson, findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

type SaveStatus = 'saving' | 'saved' | 'failed';

export function ResultScreen({ route, navigation }: Props) {
  const { trackId, levelId, lessonId, practiceAnswer } = route.params;
  const { status, error, catalog, completeLesson, reload, aiCoaching } =
    useProgression();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saving');
  const [outcome, setOutcome] = useState<RewardOutcome | null>(null);
  const [badgeEarned, setBadgeEarned] = useState<string | null>(null);
  const [priorPractice, setPriorPractice] =
    useState<PriorPracticeAttempt | null>(null);
  // Optional AI hint. Null until (and unless) a fully-validated AI response
  // replaces the local practice hint. The feature is off by default; the UI
  // never blocks on the network and never surfaces a raw error for this path.
  const [aiHint, setAiHint] = useState<string | null>(null);
  // Guard so the on-arrival completion write runs exactly once per mount. The
  // completeLesson callback is recreated on every persisted data change; without
  // this guard the effect would re-fire in a loop (completeLesson -> persist ->
  // new data -> new callback -> effect). The Retry button calls markComplete
  // directly, bypassing the guard.
  const didRun = useRef(false);

  const track = catalog ? findTrack(catalog, trackId) : null;
  const level = track ? findLevel(track, levelId) : null;
  const lesson = level ? findLesson(level, lessonId) : null;

  const markComplete = useCallback(async () => {
    if (!track || !level || !lesson) {
      return;
    }
    setSaveStatus('saving');
    try {
      const result = await completeLesson(
        track.id,
        level.id as LevelId,
        lesson.id,
        practiceAnswer,
      );
      setOutcome(result.outcome);
      setBadgeEarned(result.badgeEarned);
      setPriorPractice(result.priorPracticeAttempt);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('failed');
    }
  }, [track, level, lesson, completeLesson, practiceAnswer]);

  useEffect(() => {
    if (didRun.current) {
      return;
    }
    // Only fire once the provider is ready and the route resolves; otherwise
    // wait (the catalog loads asynchronously).
    if (status !== 'ready' || !track || !level || !lesson) {
      return;
    }
    didRun.current = true;
    void markComplete();
    // markComplete is intentionally excluded: it is recreated on every data
    // change and we must run the write exactly once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, track, level, lesson]);

  // Optional AI practice-hint path (off by default). Runs only after a
  // successful save, never blocks the UI, and falls back silently to the local
  // hint on any failure. It replaces ONLY the practice hint — never the score,
  // XP, badge, streak, or certificate (those are deterministic domain code the
  // AI path cannot reach).
  useEffect(() => {
    if (saveStatus !== 'saved' || lesson === null) {
      return;
    }
    if (!aiCoaching.enabled || !aiCoaching.endpointUrl) {
      return;
    }
    let active = true;
    void (async () => {
      const hint = await fetchAiHint(
        {
          lessonId: lesson.id,
          prompt: lesson.practice.prompt,
          suggestedAnswer: lesson.practice.answer,
          studentText: practiceAnswer ?? '',
        },
        {
          enabled: aiCoaching.enabled,
          endpointUrl: aiCoaching.endpointUrl,
          timeoutMs: 4000,
        },
      );
      if (active && hint !== null) {
        setAiHint(hint);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    saveStatus,
    lesson,
    aiCoaching.enabled,
    aiCoaching.endpointUrl,
    practiceAnswer,
  ]);

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

  // Build practice coaching from the RETURNED pre-write prior (never the live
  // provider attemptHistory, which already reflects this visit's write). The
  // currentAnswerText is exactly what Practice forwarded, so coaching and
  // hadText are grounded in the same value.
  const localCoaching = coachPractice(lesson, practiceAnswer ?? '', priorPractice);
  // A validated AI hint replaces ONLY the hint and flips source to 'ai';
  // strength/improvement/comparison stay deterministic. Null -> local hint.
  const coaching: CoachingFeedback =
    aiHint !== null
      ? { ...localCoaching, hint: aiHint, source: 'ai' }
      : localCoaching;

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

      {saveStatus === 'saved' ? (
        <View style={styles.coachBlock}>
          <Text style={styles.sectionLabel}>Coaching</Text>
          <Text style={styles.body}>{coaching.strength}</Text>
          <Text style={styles.body}>{coaching.improvement}</Text>
          <Text style={styles.body}>{coaching.hint}</Text>
          {coaching.comparison !== null ? (
            <View>
              <Text style={styles.body}>{coaching.comparison.difference}</Text>
              <Text style={styles.muted}>
                Last time: {coaching.comparison.previousSummary}. This time:{' '}
                {coaching.comparison.currentSummary}.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {saveStatus === 'saving' ? (
        <Text style={styles.saving}>Saving your progress…</Text>
      ) : saveStatus === 'saved' && outcome !== null ? (
        <View>
          <Text style={styles.saved}>Progress saved.</Text>
          {outcome.alreadyAwarded ? (
            <Text style={styles.xp}>
              You&apos;ve already earned XP for this lesson.
            </Text>
          ) : (
            <Text style={styles.xp}>You earned {outcome.xpAwarded} XP.</Text>
          )}
          {outcome.streakIncreased ? (
            <Text style={styles.streak}>
              Streak: {outcome.newStreakCount}{' '}
              {outcome.newStreakCount === 1 ? 'day' : 'days'}.
            </Text>
          ) : null}
          {badgeEarned !== null ? (
            <Text style={styles.levelComplete}>
              You completed the {level.title} level.
            </Text>
          ) : null}
        </View>
      ) : saveStatus === 'failed' ? (
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
      ) : null}

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
  muted: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  coachBlock: {
    gap: 4,
    marginTop: 8,
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
  xp: {
    fontSize: 15,
    color: '#0a7d28',
    fontWeight: '600',
    marginTop: 2,
  },
  streak: {
    fontSize: 15,
    color: '#0a7d28',
    fontWeight: '600',
    marginTop: 2,
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
