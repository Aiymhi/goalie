// Grades the submitted answers with gradeMastery, shows correctCount/5,
// per-question correctness + coaching, and pass/fail against the published rule
// (>= 4). Records the result via the context (non-regression invariant applies).
//
// Phases 3+4: the recordMasteryResult wrapper now returns the reward outcome,
// the newly-earned badge (if any), and the PRE-WRITE per-question priors. This
// screen renders the honest +50 XP line (first pass only), a badge line, and
// per-question coaching from the returned pre-write priors (never live provider
// state). It no longer recomputes completion events locally — badgeEarned is
// the single source of the level-complete moment. Phase 7: the completion line
// uses a restrained, reduce-motion-respecting Celebration.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  gradeMastery,
  MASTERY_PASS_THRESHOLD,
  MasteryResult,
} from '../../domain/assessment';
import {
  coachMasteryQuestion,
  PriorQuestionAttempt,
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
import { findLevel, findTrack, isFinanceTrack } from './catalogLookup';

type Props = NativeStackScreenProps<RootStackParamList, 'MasteryResult'>;

type SaveStatus = 'saving' | 'saved' | 'failed';

export function MasteryResultScreen({ route, navigation }: Props) {
  const { trackId, levelId, answers } = route.params;
  const { status, error, catalog, recordMasteryResult, reload } =
    useProgression();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saving');
  const [outcome, setOutcome] = useState<RewardOutcome | null>(null);
  const [badgeEarned, setBadgeEarned] = useState<string | null>(null);
  const [priorByQuestionId, setPriorByQuestionId] = useState<
    Record<string, PriorQuestionAttempt | null>
  >({});
  // Guard so the on-arrival record write runs exactly once per mount (see the
  // ResultScreen note). The Retry-save button calls save() directly.
  const didRun = useRef(false);

  const track = catalog ? findTrack(catalog, trackId) : null;
  const level = track ? findLevel(track, levelId) : null;

  // gradeMastery is pure; all five are answered (the Mastery screen guards the
  // length), so this never throws here.
  const result: MasteryResult | null = level
    ? gradeMastery(level.mastery.questions, answers)
    : null;

  const save = useCallback(async () => {
    if (!track || !level || !result) {
      return;
    }
    setSaveStatus('saving');
    try {
      const r = await recordMasteryResult(track.id, level.id as LevelId, result);
      setOutcome(r.outcome);
      setBadgeEarned(r.badgeEarned);
      setPriorByQuestionId(r.priorByQuestionId);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('failed');
    }
  }, [track, level, result, recordMasteryResult]);

  useEffect(() => {
    if (didRun.current) {
      return;
    }
    if (status !== 'ready' || !track || !level || !result) {
      return;
    }
    didRun.current = true;
    void save();
    // save is intentionally excluded: it is recreated on every data change and
    // we must run the write exactly once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, track, level, result]);

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
  if (track === null || level === null || result === null) {
    return (
      <Screen
        status="error"
        errorMessage="Mastery result not found."
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  const questions = level.mastery.questions;

  return (
    <Screen>
      {isFinanceTrack(track.id) && track.disclaimer ? (
        <FinanceDisclaimerBanner text={track.disclaimer} />
      ) : null}

      <Text style={styles.title}>Mastery result</Text>
      <Text style={styles.score}>
        {result.correctCount} / {result.total} correct
      </Text>
      <Text style={[styles.verdict, result.passed ? styles.pass : styles.fail]}>
        {result.passed
          ? `Passed (needed ${MASTERY_PASS_THRESHOLD} of ${result.total})`
          : `Not passed yet (needed ${MASTERY_PASS_THRESHOLD} of ${result.total})`}
      </Text>

      {result.perQuestion.map((graded, i) => {
        const question = questions[i];
        const coaching = coachMasteryQuestion(
          question,
          graded,
          priorByQuestionId[graded.questionId] ?? null,
        );
        return (
          <View key={graded.questionId} style={styles.row}>
            <Text style={styles.rowText}>
              {i + 1}. {graded.correct ? 'Correct' : 'Incorrect'}
            </Text>
            <Text style={styles.coachText}>{coaching.strength}</Text>
            <Text style={styles.coachText}>{coaching.improvement}</Text>
            <Text style={styles.coachText}>{coaching.hint}</Text>
            {coaching.comparison !== null ? (
              <Text style={styles.coachMuted}>
                {coaching.comparison.improved
                  ? 'You improved: '
                  : 'Compared to last time: '}
                {coaching.comparison.difference}
              </Text>
            ) : null}
          </View>
        );
      })}

      {saveStatus === 'saving' ? (
        <Text style={styles.saving}>Saving your result…</Text>
      ) : saveStatus === 'saved' && outcome !== null ? (
        <View style={styles.rewardBlock}>
          <Text style={styles.saved}>Result saved.</Text>
          {result.passed ? (
            outcome.alreadyAwarded ? (
              <Text style={styles.xp}>
                You&apos;ve already earned XP for this level.
              </Text>
            ) : (
              <Text style={styles.xp}>You earned {outcome.xpAwarded} XP.</Text>
            )
          ) : null}
          {outcome.streakIncreased ? (
            <Text style={styles.streak}>
              Streak: {outcome.newStreakCount}{' '}
              {outcome.newStreakCount === 1 ? 'day' : 'days'}.
            </Text>
          ) : null}
          {badgeEarned !== null ? (
            <View style={styles.rewardBlock}>
              <Text style={styles.badgeLine}>
                You earned the {level.title} badge.
              </Text>
              <Celebration message={`You completed the ${level.title} level.`} />
            </View>
          ) : null}
        </View>
      ) : saveStatus === 'failed' ? (
        <View style={styles.failRow}>
          <Text style={styles.failed}>Couldn&apos;t save your result.</Text>
          <AppButton
            label="Retry save"
            accessibilityLabel="Retry saving your result"
            style={styles.retrySave}
            onPress={() => void save()}
          />
        </View>
      ) : null}

      <Text style={styles.note}>
        Retrying never lowers your best score, your earned XP, or a level you
        already completed.
      </Text>

      <AppButton
        label="Retry"
        variant="secondary"
        accessibilityLabel="Retry the mastery check"
        style={styles.secondary}
        onPress={() =>
          navigation.navigate('Mastery', {
            trackId: track.id,
            levelId: level.id as LevelId,
          })
        }
      />

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
  score: {
    ...typography.title,
    color: colors.ink,
  },
  verdict: {
    ...typography.bodyStrong,
  },
  pass: {
    color: colors.success,
  },
  fail: {
    color: colors.danger,
  },
  row: {
    paddingVertical: spacing.xs,
    gap: 2,
  },
  rowText: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  coachText: {
    ...typography.body,
    color: colors.ink,
  },
  coachMuted: {
    ...typography.caption,
    color: colors.inkMuted,
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
  rewardBlock: {
    gap: spacing.xs,
  },
  badgeLine: {
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
  retrySave: {
    alignSelf: 'flex-start',
    minWidth: 120,
    borderRadius: radii.sm,
  },
  note: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  secondary: {
    marginTop: spacing.sm,
  },
  cta: {
    marginTop: spacing.sm,
  },
});

export default MasteryResultScreen;
