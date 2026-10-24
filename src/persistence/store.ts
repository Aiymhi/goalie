// The ONLY module that imports AsyncStorage. It (de)serializes a single
// versioned document under STORAGE_KEY and exposes typed async functions.
// Not pure (it does IO); tested with the official AsyncStorage jest mock.
// All logic it wraps (progression transitions) lives in the pure domain layer.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  emptyProgression,
  ProgressionState,
} from '../domain/progression';

export const STORAGE_KEY = 'goalie.v1';

export interface PersistedData {
  version: 1;
  selectedTrackId: string | null;
  displayName: string | null;
  progression: ProgressionState; // the domain state, stored verbatim
}

export function defaultPersistedData(): PersistedData {
  return {
    version: 1,
    selectedTrackId: null,
    displayName: null,
    progression: emptyProgression(),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

// Lightweight structural guard (design 7.2) — NOT the full catalog parser.
// Returns true only for a document whose shape cannot surface dishonest values.
function isValidPersistedData(value: unknown): value is PersistedData {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value.version !== 1) {
    return false;
  }
  if (
    typeof value.selectedTrackId !== 'string' &&
    value.selectedTrackId !== null
  ) {
    return false;
  }
  if (typeof value.displayName !== 'string' && value.displayName !== null) {
    return false;
  }
  const progression = value.progression;
  if (!isPlainObject(progression)) {
    return false;
  }
  if (progression.version !== 1) {
    return false;
  }
  if (!isPlainObject(progression.levels)) {
    return false;
  }
  for (const levelProgress of Object.values(progression.levels)) {
    if (!isPlainObject(levelProgress)) {
      return false;
    }
    const { completedLessonIds, masteryPassed, bestCorrectCount } =
      levelProgress;
    if (!Array.isArray(completedLessonIds)) {
      return false;
    }
    if (
      !completedLessonIds.every(
        (id) => typeof id === 'string' && id.length > 0,
      )
    ) {
      return false;
    }
    if (typeof masteryPassed !== 'boolean') {
      return false;
    }
    if (
      !Number.isInteger(bestCorrectCount) ||
      (bestCorrectCount as number) < 0 ||
      (bestCorrectCount as number) > 5
    ) {
      return false;
    }
  }
  return true;
}

// Safe across reopen:
// - key absent -> defaults (normal empty state, not an error)
// - unparseable OR shape-invalid -> treat as corrupt: defaults + a single warn
// - a native read rejection propagates (the root gate handles it)
export async function loadData(): Promise<PersistedData> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return defaultPersistedData();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('goalie: discarding unreadable store');
    return defaultPersistedData();
  }
  if (!isValidPersistedData(parsed)) {
    console.warn('goalie: discarding unreadable store');
    return defaultPersistedData();
  }
  return parsed;
}

// Writes JSON under STORAGE_KEY. On write rejection the rejection propagates
// (logged at warn) and the caller keeps in-memory state — never a silent
// false claim of success.
export async function saveData(data: PersistedData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('goalie: failed to save store');
    throw error;
  }
}

// Deletion contract: all Goalie-owned state lives under the single STORAGE_KEY,
// so removing that one key wipes display name, selected track, and all
// progression at once — no orphaned keys.
export async function clearData(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
