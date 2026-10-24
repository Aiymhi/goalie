// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// The Phase 4 fair-rewards backbone: a deterministic, idempotent XP / streak /
// badge model over a serializable RewardsState. The domain NEVER calls Date() —
// the current instant and LOCAL calendar date are supplied by an injected Clock.
// XP is motivation, not evidence: XP never gates mastery/certificates and a badge
// appears only when a level's real completion criteria are met (via applyBadge).
// Phase 2's idempotent level-completed EVENT (deriveCompletionEvents) stays here
// and feeds applyBadge.

import { Level, LevelId } from '../content/catalog.types';
import { isLevelComplete, ProgressionState } from '../progression';

export const REWARDS_STATE_VERSION = 2; // matches PersistedData v2

// YYYYMMDD in the LOCAL calendar, e.g. "20250131". A string, not a Date, so the
// persisted value is stable, comparable, and timezone-frozen at capture time.
export type LocalDateYYYYMMDD = string;

export interface StreakState {
  count: number; // >= 0; 0 only before the first-ever credited completion
  lastLocalDateYYYYMMDD: LocalDateYYYYMMDD | null; // null before any credited completion
}

export interface RewardsState {
  version: 2;
  // Idempotency ledger. Keys are the exact ids the app already uses:
  //   lesson key:  lesson id verbatim (globally unique per Phase 2 content rules)
  //   mastery key: `mastery:${trackId}/${levelId}`  (level-scoped, not question-scoped)
  // The VALUE is the XP that key awarded (20 or 50). Presence of the key == already awarded.
  awardedXp: Record<string, number>;
  totalXp: number; // sum of awardedXp values; cached for O(1) display, re-derivable
  streak: StreakState;
  earnedBadges: string[]; // badge ids `${trackId}/${levelId}`, de-duplicated, append-only
}

export type RewardSource =
  | { kind: 'lesson-completed'; trackId: string; levelId: LevelId; lessonId: string }
  | { kind: 'mastery-passed'; trackId: string; levelId: LevelId };

export interface RewardOutcome {
  state: RewardsState; // the next state (input never mutated)
  xpAwarded: number; // 0, 20, or 50 — what THIS application added
  alreadyAwarded: boolean; // true when the key was already in the ledger (no-op award)
  streakIncreased: boolean; // true iff the streak count went up on this application
  streakReset: boolean; // true iff a gap reset the count to 1 on this application
  newStreakCount: number; // the resulting count (for display)
  badgeEarned: string | null; // badge id if THIS application earned a new badge, else null
}

export interface RewardsView {
  totalXp: number;
  streakCount: number;
  lastActivityDate: LocalDateYYYYMMDD | null;
  earnedBadgeCount: number;
  hasBadge(trackId: string, levelId: LevelId): boolean;
}

// Injected determinism port. The domain only ever sees this interface; the
// production implementation (UI layer) formats the local date from the device.
export interface Clock {
  nowEpochMs(): number;
  // The LOCAL calendar date at `nowEpochMs()`, formatted YYYYMMDD.
  localDateYYYYMMDD(): LocalDateYYYYMMDD;
}

export class RewardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RewardError';
  }
}

export interface LevelCompletedEvent {
  type: 'level-completed';
  trackId: string;
  levelId: LevelId;
}

// Pure diff: given the state BEFORE and AFTER a progression transition and the level,
// return a LevelCompletedEvent iff the level was NOT complete before and IS complete after.
// Idempotent by construction: re-running a transition that changes nothing yields [].
export function deriveCompletionEvents(
  before: ProgressionState,
  after: ProgressionState,
  level: Level,
  trackId: string,
): LevelCompletedEvent[] {
  const wasComplete = isLevelComplete(before, level, trackId);
  const isComplete = isLevelComplete(after, level, trackId);
  if (!wasComplete && isComplete) {
    return [{ type: 'level-completed', trackId, levelId: level.id }];
  }
  return [];
}

export function emptyRewards(): RewardsState {
  return {
    version: REWARDS_STATE_VERSION,
    awardedXp: {},
    totalXp: 0,
    streak: { count: 0, lastLocalDateYYYYMMDD: null },
    earnedBadges: [],
  };
}

function requireNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RewardError(`${name} must be a non-empty string`);
  }
}

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

// Parse an 8-digit YYYYMMDD into civil Y/M/D components. Throws only when the
// argument is not 8 parseable digits (the single malformed-date condition).
function parseLocalDate(value: LocalDateYYYYMMDD): CivilDate {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) {
    throw new RewardError('malformed local date');
  }
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(4, 6)),
    day: Number(value.slice(6, 8)),
  };
}

// Days from the civil epoch (1970-03-01 shifted) using Howard Hinnant's civil
// algorithm. Pure integer arithmetic — no timezone-bearing Date is constructed,
// so DST and timezone shifts cannot corrupt the count.
function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

// Pure. Returns the SIGNED civil-day delta (to - from): positive when `to` is
// later, 0 when equal, negative when `to` is earlier. Throws
// RewardError('malformed local date') ONLY when an argument is not 8 digits.
export function daysBetweenLocalDates(
  from: LocalDateYYYYMMDD,
  to: LocalDateYYYYMMDD,
): number {
  return daysFromCivil(parseLocalDate(to)) - daysFromCivil(parseLocalDate(from));
}

function ledgerKey(source: RewardSource): string {
  switch (source.kind) {
    case 'lesson-completed':
      requireNonEmpty(source.trackId, 'trackId');
      requireNonEmpty(source.levelId, 'levelId');
      requireNonEmpty(source.lessonId, 'lessonId');
      return source.lessonId;
    case 'mastery-passed':
      requireNonEmpty(source.trackId, 'trackId');
      requireNonEmpty(source.levelId, 'levelId');
      return `mastery:${source.trackId}/${source.levelId}`;
    default: {
      // Defensive: the discriminated union makes this unreachable, but a future
      // added kind must not silently award 0 and move on.
      throw new RewardError('unknown reward source');
    }
  }
}

// Pure. Never mutates `prev`. A day's streak is credited ONLY when this
// application awarded first-time XP (a repeat moves no streak).
export function applyReward(
  prev: RewardsState,
  source: RewardSource,
  clock: Clock,
): RewardOutcome {
  const key = ledgerKey(source);

  // Repeat: the key is already in the ledger. Return `prev` BY REFERENCE (it was
  // never mutated), so a redundant call is a true no-op even on object identity.
  if (Object.prototype.hasOwnProperty.call(prev.awardedXp, key)) {
    return {
      state: prev,
      xpAwarded: 0,
      alreadyAwarded: true,
      streakIncreased: false,
      streakReset: false,
      newStreakCount: prev.streak.count,
      badgeEarned: null,
    };
  }

  // First-time award.
  const xp = source.kind === 'lesson-completed' ? 20 : 50;
  const awardedXp = { ...prev.awardedXp, [key]: xp };
  const totalXp = prev.totalXp + xp;

  const today = clock.localDateYYYYMMDD();
  const last = prev.streak.lastLocalDateYYYYMMDD;

  let nextStreak: StreakState;
  let streakIncreased: boolean;
  let streakReset: boolean;

  // Branches evaluated in EXACTLY this order (delta < 0 before the gap arm).
  if (last === null) {
    // (a) first-ever credited completion
    nextStreak = { count: 1, lastLocalDateYYYYMMDD: today };
    streakIncreased = true;
    streakReset = false;
  } else {
    const delta = daysBetweenLocalDates(last, today);
    if (delta < 0) {
      // (b) clock moved backwards — do not move the streak, still award XP
      nextStreak = prev.streak;
      streakIncreased = false;
      streakReset = false;
    } else if (delta === 0) {
      // (c) same day, already credited
      nextStreak = prev.streak;
      streakIncreased = false;
      streakReset = false;
    } else if (delta === 1) {
      // (d) consecutive day
      nextStreak = { count: prev.streak.count + 1, lastLocalDateYYYYMMDD: today };
      streakIncreased = true;
      streakReset = false;
    } else {
      // (e) delta >= 2 — gap/reset
      nextStreak = { count: 1, lastLocalDateYYYYMMDD: today };
      streakIncreased = true;
      streakReset = true;
    }
  }

  const state: RewardsState = {
    version: REWARDS_STATE_VERSION,
    awardedXp,
    totalXp,
    streak: nextStreak,
    earnedBadges: prev.earnedBadges,
  };

  return {
    state,
    xpAwarded: xp,
    alreadyAwarded: false,
    streakIncreased,
    streakReset,
    newStreakCount: nextStreak.count,
    badgeEarned: null, // badges are applied by applyBadge
  };
}

// Pure. Append any newly-earned badge ids (de-duplicated, append-only). Idempotent:
// an event for an already-earned badge yields no change. Returns the (possibly
// unchanged) state and the single newly-earned badge id (or null).
export function applyBadge(
  prev: RewardsState,
  events: LevelCompletedEvent[],
): { state: RewardsState; badgeEarned: string | null } {
  const seen = new Set(prev.earnedBadges);
  const added: string[] = [];
  for (const event of events) {
    const badgeId = `${event.trackId}/${event.levelId}`;
    if (!seen.has(badgeId)) {
      seen.add(badgeId);
      added.push(badgeId);
    }
  }

  if (added.length === 0) {
    return { state: prev, badgeEarned: null };
  }
  return {
    state: { ...prev, earnedBadges: [...prev.earnedBadges, ...added] },
    badgeEarned: added[0],
  };
}

export function viewRewards(state: RewardsState): RewardsView {
  return {
    totalXp: state.totalXp,
    streakCount: state.streak.count,
    lastActivityDate: state.streak.lastLocalDateYYYYMMDD,
    earnedBadgeCount: state.earnedBadges.length,
    hasBadge(trackId: string, levelId: LevelId): boolean {
      return state.earnedBadges.includes(`${trackId}/${levelId}`);
    },
  };
}
