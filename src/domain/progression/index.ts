// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// A reducer over a serializable ProgressionState. Pure transformations that
// never mutate input and never regress earned progress (monotonic invariant).

import { MasteryResult } from '../assessment';
import { Level, LevelId } from '../content/catalog.types';

export const PROGRESSION_STATE_VERSION = 1;

export class ProgressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgressionError';
  }
}

export interface LevelProgress {
  completedLessonIds: string[]; // subset of that level's lesson ids, de-duplicated
  masteryPassed: boolean; // monotonic: once true, stays true
  bestCorrectCount: number; // 0..5, monotonic max across retries (for display only)
}

export interface ProgressionState {
  version: 1;
  // key is `${trackId}/${levelId}`
  levels: Record<string, LevelProgress>;
}

export interface LevelProgressView {
  completedLessons: number; // 0..2
  totalLessons: number; // 2
  masteryPassed: boolean;
  bestCorrectCount: number; // 0..5
  complete: boolean; // === isLevelComplete
}

export function emptyProgression(): ProgressionState {
  return { version: PROGRESSION_STATE_VERSION, levels: {} };
}

function requireNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProgressionError(`${name} must be a non-empty string`);
  }
}

function levelKey(trackId: string, levelId: string): string {
  return `${trackId}/${levelId}`;
}

function bucketFor(
  state: ProgressionState,
  key: string,
): LevelProgress {
  const existing = state.levels[key];
  if (existing) {
    return existing;
  }
  return { completedLessonIds: [], masteryPassed: false, bestCorrectCount: 0 };
}

// Mark a lesson complete. Idempotent: completing an already-complete lesson is a no-op.
// Never mutates the input state.
export function completeLesson(
  state: ProgressionState,
  trackId: string,
  levelId: LevelId,
  lessonId: string,
): ProgressionState {
  requireNonEmpty(trackId, 'trackId');
  requireNonEmpty(levelId, 'levelId');
  requireNonEmpty(lessonId, 'lessonId');
  const key = levelKey(trackId, levelId);
  const prev = bucketFor(state, key);
  if (prev.completedLessonIds.includes(lessonId)) {
    return state; // idempotent no-op
  }
  const next: LevelProgress = {
    ...prev,
    completedLessonIds: [...prev.completedLessonIds, lessonId],
  };
  return { ...state, levels: { ...state.levels, [key]: next } };
}

// Record a mastery attempt result. Non-regression: masteryPassed is OR'd (never cleared),
// bestCorrectCount is max'd. A failing retry after a pass leaves masteryPassed true.
// Never mutates the input state.
export function recordMasteryResult(
  state: ProgressionState,
  trackId: string,
  levelId: LevelId,
  result: MasteryResult,
): ProgressionState {
  requireNonEmpty(trackId, 'trackId');
  requireNonEmpty(levelId, 'levelId');
  const key = levelKey(trackId, levelId);
  const prev = bucketFor(state, key);
  const next: LevelProgress = {
    ...prev,
    masteryPassed: prev.masteryPassed || result.passed,
    bestCorrectCount: Math.max(prev.bestCorrectCount, result.correctCount),
  };
  return { ...state, levels: { ...state.levels, [key]: next } };
}

// Derived, never stored: a level is complete iff BOTH lessons complete AND mastery passed.
// Computes the lookup key as `${trackId}/${level.id}` — the same key the writers used.
// Intersects completed ids against the level's real lesson ids, so a stale completed id for
// a lesson that no longer exists does not count toward completion.
export function isLevelComplete(
  state: ProgressionState,
  level: Level,
  trackId: string,
): boolean {
  requireNonEmpty(trackId, 'trackId');
  const key = levelKey(trackId, level.id);
  const bucket = state.levels[key];
  if (!bucket) {
    return false;
  }
  const completed = new Set(bucket.completedLessonIds);
  const allLessonsComplete = level.lessons.every((lesson) => completed.has(lesson.id));
  return allLessonsComplete && bucket.masteryPassed;
}

// Derived progress for the Course path (accurate, never fabricated).
export function viewLevelProgress(
  state: ProgressionState,
  level: Level,
  trackId: string,
): LevelProgressView {
  requireNonEmpty(trackId, 'trackId');
  const key = levelKey(trackId, level.id);
  const bucket = state.levels[key];
  const totalLessons = level.lessons.length;
  if (!bucket) {
    return {
      completedLessons: 0,
      totalLessons,
      masteryPassed: false,
      bestCorrectCount: 0,
      complete: false,
    };
  }
  const completed = new Set(bucket.completedLessonIds);
  const completedLessons = level.lessons.filter((lesson) =>
    completed.has(lesson.id),
  ).length;
  return {
    completedLessons,
    totalLessons,
    masteryPassed: bucket.masteryPassed,
    bestCorrectCount: bucket.bestCorrectCount,
    complete: isLevelComplete(state, level, trackId),
  };
}
