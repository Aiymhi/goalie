// Grades the submitted answers with gradeMastery, shows correctCount/5,
// per-question correctness + coaching, and pass/fail against the published rule
// (>= 4). Records the result via the context (non-regression invariant applies).
//
// Phases 3+4: the recordMasteryResult wrapper now returns the reward outcome,
// the newly-earned badge (if any), and the PRE-WRITE per-question priors. This
// screen renders the honest +50 XP line (first pass only), a badge line, and
// per-question coaching from the returned pre-write priors (never live provider
// state). It no longer recomputes completion events locally — badgeEarned is
// the single source of the level-complete moment.

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import { FinanceDisclaimerBanner } from '../components/FinanceDisclaimerBanner';
import { ErrorState, LoadingState } from '../components/ScreenState';
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
  if (track === null || level === null || result === null) {
    return (
      <ErrorState
        message="Mastery result not found."
        onRetry={() => navigation.goBack()}
        retryLabel="Go back"
      />
    );
  }

  const questions = level.mastery.questions;

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
        <View>
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
            <View>
              <Text style={styles.levelComplete}>
                You earned the {level.title} badge.
              </Text>
              <Text style={styles.levelComplete}>
                You completed the {level.title} level.
              </Text>
            </View>
          ) : null}
        </View>
      ) : saveStatus === 'failed' ? (
        <View style={styles.failRow}>
          <Text style={styles.failed}>Couldn&apos;t save your result.</Text>
          <Pressable
            style={styles.retrySave}
            onPress={() => void save()}
            accessibilityRole="button"
            accessibilityLabel="Retry saving your result"
          >
            <Text style={styles.retrySaveText}>Retry save</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.note}>
        Retrying never lowers your best score, your earned XP, or a level you
        already completed.
      </Text>

      <Pressable
        style={styles.secondary}
        onPress={() =>
          navigation.navigate('Mastery', {
            trackId: track.id,
            levelId: level.id as LevelId,
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Retry the mastery check"
      >
        <Text style={styles.secondaryText}>Retry</Text>
      </Pressable>

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
  score: {
    fontSize: 20,
    fontWeight: '700',
  },
  verdict: {
    fontSize: 16,
    fontWeight: '600',
  },
  pass: {
    color: '#0a7d28',
  },
  fail: {
    color: '#b00020',
  },
  row: {
    paddingVertical: 4,
    gap: 2,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '600',
  },
  coachText: {
    fontSize: 14,
    lineHeight: 20,
  },
  coachMuted: {
    fontSize: 13,
    color: '#666',
    lineHeight: 19,
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
  retrySave: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#1f6feb',
    borderRadius: 8,
  },
  retrySaveText: {
    color: '#fff',
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  secondary: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 8,
  },
  secondaryText: {
    fontSize: 16,
    color: '#1f6feb',
    fontWeight: '600',
  },
  primary: {
    minHeight: 56,
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default MasteryResultScreen;
