// The ONLY module that imports AsyncStorage. It (de)serializes a single
// versioned document under STORAGE_KEY and exposes typed async functions.
// Not pure (it does IO); tested with the official AsyncStorage jest mock.
// All logic it wraps (progression transitions) lives in the pure domain layer.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PriorPracticeAttempt,
  PriorQuestionAttempt,
} from '../domain/coaching';
import { FocusSessionRecord } from '../domain/focus-session';
import {
  emptyProgression,
  ProgressionState,
} from '../domain/progression';
import { emptyRewards, RewardsState } from '../domain/rewards';

// Intentionally unchanged slot name: renaming the storage key would orphan
// existing data. The document's own `version` field drives migration.
export const STORAGE_KEY = 'goalie.v1';
export const PERSISTED_VERSION = 2;

// Retained for the v1->v2 migration's input typing (the pre-v2 document shape).
export interface PersistedDataV1 {
  version: 1;
  selectedTrackId: string | null;
  displayName: string | null;
  progression: ProgressionState;
}

// Persisted form of the optional AI-coaching user setting (§9.2, §9.4). Only
// the user-settable fields live in the store; timeoutMs is a runtime constant.
export interface PersistedAiCoaching {
  enabled: boolean; // whether the optional AI hint path is on (default false)
  endpointUrl: string | null; // the user-configured server URL (default null)
  disclosureAcknowledged: boolean; // the Settings disclosure was acknowledged
}

export interface PersistedData {
  version: 2;
  selectedTrackId: string | null;
  displayName: string | null;
  progression: ProgressionState; // unchanged domain state, stored verbatim
  rewards: RewardsState; // XP/streak/badge ledger (§3.2)
  // most-recent prior attempt per question/lesson id, for honest comparison (§4.4)
  attemptHistory: {
    questions: Record<string, PriorQuestionAttempt>;
    practice: Record<string, PriorPracticeAttempt>;
  };
  aiCoaching: PersistedAiCoaching; // optional AI-coaching setting (default off)
  // Local mirror of the most recent voluntary focus session (Phase 5). The
  // native app-group record is authoritative for reconciliation; this is a
  // non-authoritative cache so the UI can show a sensible state before the
  // native read returns. Null when no session has been started.
  focusSession: FocusSessionRecord | null;
}

export function defaultPersistedData(): PersistedData {
  return {
    version: 2,
    selectedTrackId: null,
    displayName: null,
    progression: emptyProgression(),
    rewards: emptyRewards(),
    attemptHistory: { questions: {}, practice: {} },
    aiCoaching: {
      enabled: false,
      endpointUrl: null,
      disclosureAcknowledged: false,
    },
    focusSession: null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

// The Phase 2 progression predicate — unchanged. Validates only the shape that
// could surface dishonest progress; not the full catalog parser.
function isValidProgression(progression: unknown): boolean {
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

// Guard for a declared-v1 document (migration input). Same shape as Phase 2.
function isValidPersistedDataV1(value: unknown): value is PersistedDataV1 {
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
  return isValidProgression(value.progression);
}

// Outcome of the authoritative v2 structural guard. When the document is
// structurally acceptable, `data` carries the (possibly repaired) document and
// `warnings` lists the at-most-once repair warns to emit. Non-authoritative
// data (attempt history, aiCoaching, a disagreeing totalXp) is repaired rather
// than rejected; authoritative data (version, progression, rewards shape)
// rejects the whole store.
interface GuardResult {
  data: PersistedData | null; // null => reject the whole store (corrupt)
  warnings: string[];
}

const REWARD_XP_VALUES = new Set([20, 50]);

// Validates + repairs a declared-v2 document per design 5.2. Authoritative
// mismatches (bad version/progression/rewards shape) return { data: null }.
function guardV2(value: unknown): GuardResult {
  const warnings: string[] = [];
  if (!isPlainObject(value)) {
    return { data: null, warnings };
  }
  if (value.version !== 2) {
    return { data: null, warnings };
  }
  if (
    typeof value.selectedTrackId !== 'string' &&
    value.selectedTrackId !== null
  ) {
    return { data: null, warnings };
  }
  if (typeof value.displayName !== 'string' && value.displayName !== null) {
    return { data: null, warnings };
  }
  if (!isValidProgression(value.progression)) {
    return { data: null, warnings };
  }

  // --- rewards (authoritative) ---
  const rewards = value.rewards;
  if (!isPlainObject(rewards)) {
    return { data: null, warnings };
  }
  if (rewards.version !== 2) {
    return { data: null, warnings };
  }
  if (!isPlainObject(rewards.awardedXp)) {
    return { data: null, warnings };
  }
  let ledgerSum = 0;
  for (const xp of Object.values(rewards.awardedXp)) {
    if (typeof xp !== 'number' || !REWARD_XP_VALUES.has(xp)) {
      return { data: null, warnings };
    }
    ledgerSum += xp;
  }
  if (
    typeof rewards.totalXp !== 'number' ||
    !Number.isInteger(rewards.totalXp) ||
    rewards.totalXp < 0
  ) {
    return { data: null, warnings };
  }
  const streak = rewards.streak;
  if (!isPlainObject(streak)) {
    return { data: null, warnings };
  }
  if (
    !Number.isInteger(streak.count) ||
    (streak.count as number) < 0
  ) {
    return { data: null, warnings };
  }
  const lastDate = streak.lastLocalDateYYYYMMDD;
  if (
    lastDate !== null &&
    !(typeof lastDate === 'string' && /^\d{8}$/.test(lastDate))
  ) {
    return { data: null, warnings };
  }
  if (!Array.isArray(rewards.earnedBadges)) {
    return { data: null, warnings };
  }
  if (
    !rewards.earnedBadges.every(
      (id) => typeof id === 'string' && id.length > 0,
    )
  ) {
    return { data: null, warnings };
  }

  // Repair: re-derive a disagreeing totalXp from the ledger (source of truth).
  let totalXp = rewards.totalXp;
  if (totalXp !== ledgerSum) {
    totalXp = ledgerSum;
    warnings.push('goalie: recomputed xp total');
  }
  // De-duplicate earnedBadges on load (append-only, order preserved).
  const earnedBadges = Array.from(
    new Set(rewards.earnedBadges as string[]),
  );
  const repairedRewards: RewardsState = {
    version: 2,
    awardedXp: { ...(rewards.awardedXp as Record<string, number>) },
    totalXp,
    streak: {
      count: streak.count as number,
      lastLocalDateYYYYMMDD: lastDate as string | null,
    },
    earnedBadges,
  };

  // --- attemptHistory (non-authoritative: drop malformed records) ---
  const attemptHistory = value.attemptHistory;
  if (!isPlainObject(attemptHistory)) {
    return { data: null, warnings };
  }
  const rawQuestions = attemptHistory.questions;
  const rawPractice = attemptHistory.practice;
  if (!isPlainObject(rawQuestions) || !isPlainObject(rawPractice)) {
    return { data: null, warnings };
  }
  let droppedHistory = false;
  const questions: Record<string, PriorQuestionAttempt> = {};
  for (const [key, record] of Object.entries(rawQuestions)) {
    if (
      isPlainObject(record) &&
      Number.isInteger(record.selectedIndex) &&
      typeof record.correct === 'boolean' &&
      Number.isInteger(record.atEpochMs)
    ) {
      questions[key] = {
        selectedIndex: record.selectedIndex as number,
        correct: record.correct as boolean,
        atEpochMs: record.atEpochMs as number,
      };
    } else {
      droppedHistory = true;
    }
  }
  const practice: Record<string, PriorPracticeAttempt> = {};
  for (const [key, record] of Object.entries(rawPractice)) {
    if (
      isPlainObject(record) &&
      typeof record.hadText === 'boolean' &&
      Number.isInteger(record.atEpochMs)
    ) {
      practice[key] = {
        hadText: record.hadText as boolean,
        atEpochMs: record.atEpochMs as number,
      };
    } else {
      droppedHistory = true;
    }
  }
  if (droppedHistory) {
    warnings.push('goalie: dropped malformed attempt history');
  }

  // --- aiCoaching (non-authoritative preference: reset malformed to default) ---
  const rawAi = value.aiCoaching;
  let aiCoaching: PersistedAiCoaching;
  if (
    isPlainObject(rawAi) &&
    typeof rawAi.enabled === 'boolean' &&
    typeof rawAi.disclosureAcknowledged === 'boolean' &&
    (rawAi.endpointUrl === null || typeof rawAi.endpointUrl === 'string')
  ) {
    // Safety coercion (silent): enabled may be true only with an acknowledged
    // disclosure, so the AI path can never run without consent.
    const enabled =
      rawAi.enabled && rawAi.disclosureAcknowledged === true;
    aiCoaching = {
      enabled,
      endpointUrl: rawAi.endpointUrl as string | null,
      disclosureAcknowledged: rawAi.disclosureAcknowledged,
    };
  } else {
    aiCoaching = {
      enabled: false,
      endpointUrl: null,
      disclosureAcknowledged: false,
    };
    warnings.push('goalie: reset ai-coaching setting');
  }

  return {
    data: {
      version: 2,
      selectedTrackId: value.selectedTrackId,
      displayName: value.displayName,
      progression: value.progression as ProgressionState,
      rewards: repairedRewards,
      attemptHistory: { questions, practice },
      aiCoaching,
    },
    warnings,
  };
}

// Migrate a validated v1 document to v2: carry selectedTrackId/displayName/
// progression verbatim, initialize the new fields to their defaults. NO
// retroactive XP (there is no trustworthy per-id completion timestamp in v1).
function migrateV1toV2(v1: PersistedDataV1): PersistedData {
  const base = defaultPersistedData();
  return {
    ...base,
    selectedTrackId: v1.selectedTrackId,
    displayName: v1.displayName,
    progression: v1.progression,
  };
}

// Safe across reopen:
// - key absent -> defaults (normal empty state, not an error)
// - version 2 passing the v2 guard -> return (with any silent/at-most-once repairs)
// - version 1 passing the v1 guard -> migrate, write back once, return
// - unparseable OR shape-invalid at its declared version OR unknown/future
//   version -> treat as corrupt: defaults + a single discard warn
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

  const version = isPlainObject(parsed) ? parsed.version : undefined;

  if (version === 2) {
    const result = guardV2(parsed);
    if (result.data === null) {
      console.warn('goalie: discarding unreadable store');
      return defaultPersistedData();
    }
    for (const warning of result.warnings) {
      console.warn(warning);
    }
    return result.data;
  }

  if (version === 1) {
    if (!isValidPersistedDataV1(parsed)) {
      console.warn('goalie: discarding unreadable store');
      return defaultPersistedData();
    }
    const migrated = migrateV1toV2(parsed);
    // Persist the upgraded shape once so the migration runs a single time.
    await saveData(migrated);
    return migrated;
  }

  // Unparseable-shaped, shape-invalid, or unknown/future version.
  console.warn('goalie: discarding unreadable store');
  return defaultPersistedData();
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
// so removing that one key wipes display name, selected track, progression,
// XP, streak, badges, and attempt history at once — no orphaned keys.
export async function clearData(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
