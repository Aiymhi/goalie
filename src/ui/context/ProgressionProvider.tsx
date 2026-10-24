// UI-layer React context (NOT domain). The single place the UI touches
// persistence: screens read loaded Catalog + ProgressionState + displayName +
// selectedTrackId + rewards + aiCoaching from here and call completeLesson/
// recordMasteryResult/setSelection/setAiCoaching/deleteAllData, which call the
// PURE domain functions and then persist via saveData/clearData. Screens never
// import AsyncStorage.
//
// Phases 3+4: completeLesson/recordMasteryResult now apply XP/streak/badges in
// a SINGLE persisted transaction alongside progression, capture-and-return the
// pre-write prior attempt(s) for honest coaching comparison, and inject a Clock
// via an optional prop (default systemClock) so the domain stays clock-free.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import tracksJson from '../../../content/tracks.json';
import { MasteryResult } from '../../domain/assessment';
import {
  PriorPracticeAttempt,
  PriorQuestionAttempt,
} from '../../domain/coaching';
import { FocusSessionRecord } from '../../domain/focus-session';
import { loadCatalog } from '../../domain/content/catalog';
import { Catalog, Level, LevelId } from '../../domain/content/catalog.types';
import {
  completeLesson as completeLessonPure,
  ProgressionState,
  recordMasteryResult as recordMasteryResultPure,
} from '../../domain/progression';
import {
  applyBadge,
  applyReward,
  Clock,
  deriveCompletionEvents,
  RewardOutcome,
  RewardsState,
  RewardsView,
  viewRewards,
} from '../../domain/rewards';
import {
  clearData,
  defaultPersistedData,
  loadData,
  PersistedAiCoaching,
  PersistedData,
  saveData,
} from '../../persistence/store';
import { findLevel, findTrack } from '../screens/catalogLookup';
import { systemClock } from '../rewards/systemClock';

export type RootGateStatus = 'loading' | 'ready' | 'error';

// Returned by the completeLesson wrapper so the ResultScreen can render honest
// XP/streak/badge copy and practice coaching from the PRE-WRITE prior attempt.
export interface CompleteLessonOutcome {
  outcome: RewardOutcome;
  badgeEarned: string | null;
  priorPracticeAttempt: PriorPracticeAttempt | null;
}

// Returned by the recordMasteryResult wrapper. Named distinctly from the domain
// MasteryResult type and the MasteryResult route param so there is no shadow.
export interface MasteryOutcome {
  outcome: RewardOutcome;
  badgeEarned: string | null;
  priorByQuestionId: Record<string, PriorQuestionAttempt | null>;
}

export interface ProgressionContextValue {
  status: RootGateStatus;
  error: Error | null;
  catalog: Catalog | null;
  progression: ProgressionState;
  displayName: string | null;
  selectedTrackId: string | null;
  // Reward ledger state + its honest view selector, exposed for the screens.
  rewards: RewardsState;
  viewRewards: RewardsView;
  // Persisted AI-coaching setting (off by default); surfaced for Settings + the
  // optional AI path.
  aiCoaching: PersistedAiCoaching;
  // Local mirror of the most recent voluntary focus session (Phase 5). The
  // native app-group record is authoritative; this is a non-authoritative cache.
  focusSession: FocusSessionRecord | null;
  // Persist the focus-session local mirror (Phase 5). Never creates learning
  // credit — it does not touch progression/rewards.
  setFocusSession: (next: FocusSessionRecord | null) => Promise<void>;
  // Re-run the async root load (used by the error-retry affordance).
  reload: () => void;
  // Persist a track selection (and optional display name) then expose it.
  setSelection: (trackId: string, displayName: string | null) => Promise<void>;
  // Mark a lesson complete via the pure domain fn, apply XP/streak/badge, record
  // the practice attempt, all in ONE persisted write; return the outcome + the
  // pre-write prior practice attempt for honest coaching.
  completeLesson: (
    trackId: string,
    levelId: LevelId,
    lessonId: string,
    practiceAnswer?: string,
  ) => Promise<CompleteLessonOutcome>;
  // Record a mastery result via the pure domain fn, apply mastery XP (pass only)
  // + badge, record per-question attempts, all in ONE persisted write; return
  // the outcome + the pre-write per-question priors.
  recordMasteryResult: (
    trackId: string,
    levelId: LevelId,
    result: MasteryResult,
  ) => Promise<MasteryOutcome>;
  // Persist the AI-coaching setting (same single-key saveData path).
  setAiCoaching: (next: PersistedAiCoaching) => Promise<void>;
  // Clear all local data, reset in-memory to defaults; on failure leave state
  // untouched and re-throw so the caller can surface an error.
  deleteAllData: () => Promise<void>;
}

const ProgressionContext = createContext<ProgressionContextValue | null>(null);

// Parse the bundled catalog once. loadCatalog throws CatalogError on bad
// content; that surfaces as the root gate's error state.
function parseCatalog(): Catalog {
  return loadCatalog(tracksJson);
}

export function ProgressionProvider({
  children,
  clock = systemClock,
}: {
  children: ReactNode;
  clock?: Clock;
}) {
  const [status, setStatus] = useState<RootGateStatus>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [data, setData] = useState<PersistedData>(defaultPersistedData());

  const load = useCallback(() => {
    let active = true;
    setStatus('loading');
    setError(null);
    (async () => {
      try {
        const parsed = parseCatalog();
        const persisted = await loadData();
        if (!active) {
          return;
        }
        setCatalog(parsed);
        setData(persisted);
        setStatus('ready');
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const reload = useCallback(() => {
    load();
  }, [load]);

  const persist = useCallback(async (next: PersistedData) => {
    // Optimistically hold the new in-memory state, then write. On write
    // failure the domain state is already updated in memory (honest: the
    // learner sees their progress) but we re-throw so the caller can warn
    // "couldn't save — retry".
    setData(next);
    await saveData(next);
  }, []);

  // Resolve the Level object from the loaded catalog. Returns null on a null
  // catalog or a stale/unknown id — the wrappers then apply XP/streak only
  // (events = []) and never throw.
  const resolveLevel = useCallback(
    (trackId: string, levelId: LevelId): Level | null => {
      if (catalog === null) {
        return null;
      }
      const track = findTrack(catalog, trackId);
      if (track === null) {
        return null;
      }
      return findLevel(track, levelId);
    },
    [catalog],
  );

  const setSelection = useCallback(
    async (trackId: string, displayName: string | null) => {
      const next: PersistedData = {
        ...data,
        selectedTrackId: trackId,
        displayName,
      };
      await persist(next);
    },
    [data, persist],
  );

  const completeLesson = useCallback(
    async (
      trackId: string,
      levelId: LevelId,
      lessonId: string,
      practiceAnswer?: string,
    ): Promise<CompleteLessonOutcome> => {
      const before = data.progression;
      // 1) capture the prior practice attempt BEFORE any write (honest compare).
      const priorPracticeAttempt =
        data.attemptHistory.practice[lessonId] ?? null;
      // 2) progression (Phase 2, idempotent).
      const nextProg = completeLessonPure(before, trackId, levelId, lessonId);
      // 3) XP/streak (idempotent via the id-keyed ledger).
      const outcome = applyReward(
        data.rewards,
        { kind: 'lesson-completed', trackId, levelId, lessonId },
        clock,
      );
      // 4) badge: only when the level resolves; else XP/streak-only.
      const level = resolveLevel(trackId, levelId);
      const events = level
        ? deriveCompletionEvents(before, nextProg, level, trackId)
        : [];
      const badge = applyBadge(outcome.state, events);
      // 5) record THIS attempt as the new prior (hadText from the forwarded text).
      const hadText =
        practiceAnswer != null && practiceAnswer.trim().length > 0;
      const nextHistory = {
        ...data.attemptHistory,
        practice: {
          ...data.attemptHistory.practice,
          [lessonId]: { hadText, atEpochMs: clock.nowEpochMs() },
        },
      };
      // 6) single persisted transaction.
      await persist({
        ...data,
        progression: nextProg,
        rewards: badge.state,
        attemptHistory: nextHistory,
      });
      // 7) return outcome + badge + the PRE-WRITE prior for coaching.
      return { outcome, badgeEarned: badge.badgeEarned, priorPracticeAttempt };
    },
    [data, persist, resolveLevel, clock],
  );

  const recordMasteryResult = useCallback(
    async (
      trackId: string,
      levelId: LevelId,
      result: MasteryResult,
    ): Promise<MasteryOutcome> => {
      const before = data.progression;
      // 1) capture prior per-question attempts BEFORE any write, keyed by id.
      const priorByQuestionId: Record<string, PriorQuestionAttempt | null> = {};
      for (const graded of result.perQuestion) {
        priorByQuestionId[graded.questionId] =
          data.attemptHistory.questions[graded.questionId] ?? null;
      }
      // 2) progression (Phase 2, monotonic).
      const nextProg = recordMasteryResultPure(
        before,
        trackId,
        levelId,
        result,
      );
      // 3) mastery XP ONLY on a pass; a fail never awards mastery XP.
      const masteryOutcome = result.passed
        ? applyReward(data.rewards, { kind: 'mastery-passed', trackId, levelId }, clock)
        : null;
      const rewardsAfterXp = masteryOutcome ? masteryOutcome.state : data.rewards;
      // 4) badge: only when the level resolves; else XP/streak-only.
      const level = resolveLevel(trackId, levelId);
      const events = level
        ? deriveCompletionEvents(before, nextProg, level, trackId)
        : [];
      const badge = applyBadge(rewardsAfterXp, events);
      // 5) record THIS attempt as the new prior for every graded question.
      const nextQuestions = { ...data.attemptHistory.questions };
      for (const graded of result.perQuestion) {
        nextQuestions[graded.questionId] = {
          selectedIndex: graded.selectedIndex,
          correct: graded.correct,
          atEpochMs: clock.nowEpochMs(),
        };
      }
      const nextHistory = { ...data.attemptHistory, questions: nextQuestions };
      // 6) single persisted transaction.
      await persist({
        ...data,
        progression: nextProg,
        rewards: badge.state,
        attemptHistory: nextHistory,
      });
      // 7) synthetic "no XP" outcome on a fail so the screen renders without
      // special-casing null.
      const outcome: RewardOutcome =
        masteryOutcome ?? {
          state: data.rewards,
          xpAwarded: 0,
          alreadyAwarded: false,
          streakIncreased: false,
          streakReset: false,
          newStreakCount: data.rewards.streak.count,
          badgeEarned: null,
        };
      // 8) return outcome + badge + the PRE-WRITE priors for per-question coaching.
      return { outcome, badgeEarned: badge.badgeEarned, priorByQuestionId };
    },
    [data, persist, resolveLevel, clock],
  );

  const setAiCoaching = useCallback(
    async (next: PersistedAiCoaching) => {
      await persist({ ...data, aiCoaching: next });
    },
    [data, persist],
  );

  const setFocusSession = useCallback(
    async (next: FocusSessionRecord | null) => {
      await persist({ ...data, focusSession: next });
    },
    [data, persist],
  );

  const deleteAllData = useCallback(async () => {
    // Clear persistence first; only reset memory if the wipe succeeded.
    await clearData();
    setData(defaultPersistedData());
  }, []);

  const value = useMemo<ProgressionContextValue>(
    () => ({
      status,
      error,
      catalog,
      progression: data.progression,
      displayName: data.displayName,
      selectedTrackId: data.selectedTrackId,
      rewards: data.rewards,
      viewRewards: viewRewards(data.rewards),
      aiCoaching: data.aiCoaching,
      focusSession: data.focusSession,
      reload,
      setSelection,
      completeLesson,
      recordMasteryResult,
      setAiCoaching,
      setFocusSession,
      deleteAllData,
    }),
    [
      status,
      error,
      catalog,
      data.progression,
      data.displayName,
      data.selectedTrackId,
      data.rewards,
      data.aiCoaching,
      data.focusSession,
      reload,
      setSelection,
      completeLesson,
      recordMasteryResult,
      setAiCoaching,
      setFocusSession,
      deleteAllData,
    ],
  );

  return (
    <ProgressionContext.Provider value={value}>
      {children}
    </ProgressionContext.Provider>
  );
}

export function useProgression(): ProgressionContextValue {
  const ctx = useContext(ProgressionContext);
  if (ctx === null) {
    throw new Error('useProgression must be used within a ProgressionProvider');
  }
  return ctx;
}
