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
// source of the "You completed the <level> level." moment. Phase 7: a real
// level completion shows a restrained, reduce-motion-respecting Celebration.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fetchAiHint } from '../../ai/coachingClient';
import {
  CoachingFeedback,
  coachPractice,
  PriorPracticeAttempt,
} from '../../domain/coaching';
import { LevelId } from '../../domain/content/catalog.types';
import { RewardOutcome } from '../../domain/rewards';
import { useProgression } from '../context/ProgressionProvider';
import { AppButton } from '../components/AppButton';
import { Celebration } from '../components/Celebration';
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme';
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
    return <Screen status="loading" loadingLabel="Loading result…" />;
  }
  if (status === 'error' || catalog === null) {
    return (
      <Screen
        status="error"
        errorMessage={error?.message ?? 'Could not load the result.'}
        onRetry={reload}
      />
    );
  }
  if (track === null || level === null || lesson === null) {
    return (
      <Screen
        status="error"
        errorMessage="Result not found."
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
    <Screen>
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
        <View style={styles.rewardBlock}>
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
            <Celebration message={`You completed the ${level.title} level.`} />
          ) : null}
        </View>
      ) : saveStatus === 'failed' ? (
        <View style={styles.failRow}>
          <Text style={styles.failed}>
            Couldn&apos;t save your progress.
          </Text>
          <AppButton
            label="Retry"
            accessibilityLabel="Retry saving your progress"
            style={styles.retry}
            onPress={() => void markComplete()}
          />
        </View>
      ) : null}

      <AppButton
        label="Done"
        accessibilityLabel="Back to home"
        style={styles.cta}
        onPress={() => navigation.navigate('Home')}
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
  muted: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  coachBlock: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  rewardBlock: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  saving: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  saved: {
    ...typography.bodyStrong,
    color: colors.success,
    marginTop: spacing.sm,
  },
  xp: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  streak: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  failRow: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  failed: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  retry: {
    alignSelf: 'flex-start',
    minWidth: 120,
    borderRadius: radii.sm,
  },
  cta: {
    marginTop: spacing.lg,
  },
});

export default ResultScreen;
