import { MasteryResult } from '../src/domain/assessment';
import { Level } from '../src/domain/content/catalog.types';
import {
  completeLesson,
  emptyProgression,
  ProgressionState,
  recordMasteryResult,
} from '../src/domain/progression';
import {
  applyBadge,
  applyReward,
  Clock,
  daysBetweenLocalDates,
  deriveCompletionEvents,
  emptyRewards,
  LevelCompletedEvent,
  RewardError,
  RewardsState,
  RewardSource,
  viewRewards,
} from '../src/domain/rewards';

const TRACK_ID = 'computer-science';

const level: Level = {
  id: 'beginner',
  title: 'Beginner',
  objective: 'o',
  lessons: [
    {
      id: 'computer-science-beginner-1',
      title: 'L1',
      objective: 'o',
      explanation: 'e',
      workedExample: 'w',
      practice: { prompt: 'p', answer: 'a', answerExplanation: 'ae' },
      nextStep: 'n',
    },
    {
      id: 'computer-science-beginner-2',
      title: 'L2',
      objective: 'o',
      explanation: 'e',
      workedExample: 'w',
      practice: { prompt: 'p', answer: 'a', answerExplanation: 'ae' },
      nextStep: 'n',
    },
  ],
  mastery: {
    passRule: 'r',
    questions: [1, 2, 3, 4, 5].map((n) => ({
      id: `q${n}`,
      prompt: 'p',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    })),
  },
};

function result(correctCount: number, passed: boolean): MasteryResult {
  return { perQuestion: [], correctCount, total: 5, passed };
}

// Drives a state to a fully-complete level.
function makeComplete(): ProgressionState {
  let state = completeLesson(
    emptyProgression(),
    TRACK_ID,
    'beginner',
    'computer-science-beginner-1',
  );
  state = completeLesson(state, TRACK_ID, 'beginner', 'computer-science-beginner-2');
  state = recordMasteryResult(state, TRACK_ID, 'beginner', result(5, true));
  return state;
}

// Settable-date Clock for deterministic streak tests. Advance the date between
// applyReward calls to exercise the civil-day branches.
class FakeClock implements Clock {
  private date: string;
  private epoch: number;

  constructor(date: string, epoch = 0) {
    this.date = date;
    this.epoch = epoch;
  }

  nowEpochMs(): number {
    return this.epoch;
  }

  localDateYYYYMMDD(): string {
    return this.date;
  }

  set(date: string, epoch?: number): void {
    this.date = date;
    if (epoch !== undefined) {
      this.epoch = epoch;
    }
  }
}

const lessonSource = (lessonId: string): RewardSource => ({
  kind: 'lesson-completed',
  trackId: TRACK_ID,
  levelId: 'beginner',
  lessonId,
});

const masterySource: RewardSource = {
  kind: 'mastery-passed',
  trackId: TRACK_ID,
  levelId: 'beginner',
};

function sumAwarded(state: RewardsState): number {
  return Object.values(state.awardedXp).reduce((a, b) => a + b, 0);
}

describe('deriveCompletionEvents', () => {
  it('emits exactly one event when the level first becomes complete', () => {
    const before = completeLesson(
      completeLesson(emptyProgression(), TRACK_ID, 'beginner', 'computer-science-beginner-1'),
      TRACK_ID,
      'beginner',
      'computer-science-beginner-2',
    );
    const after = recordMasteryResult(before, TRACK_ID, 'beginner', result(5, true));
    const events = deriveCompletionEvents(before, after, level, TRACK_ID);
    expect(events).toEqual([
      { type: 'level-completed', trackId: TRACK_ID, levelId: 'beginner' },
    ]);
  });

  it('emits nothing for a replayed no-op transition (idempotent)', () => {
    const complete = makeComplete();
    const events = deriveCompletionEvents(complete, complete, level, TRACK_ID);
    expect(events).toEqual([]);
  });

  it('emits nothing for a failing retry after the level is already complete', () => {
    const before = makeComplete();
    const after = recordMasteryResult(before, TRACK_ID, 'beginner', result(1, false));
    const events = deriveCompletionEvents(before, after, level, TRACK_ID);
    expect(events).toEqual([]);
  });
});

// §8.1 — first lesson completion awards 20 XP, keys the ledger, totalXp === 20.
describe('applyReward — lesson XP', () => {
  it('awards 20 XP for a first lesson completion and keys the ledger', () => {
    const clock = new FakeClock('20250131');
    const outcome = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    expect(outcome.xpAwarded).toBe(20);
    expect(outcome.alreadyAwarded).toBe(false);
    expect(outcome.state.awardedXp['computer-science-beginner-1']).toBe(20);
    expect(outcome.state.totalXp).toBe(20);
  });

  // §8.2 — repeat lesson awards 0, alreadyAwarded, same state by reference, totalXp unchanged.
  it('awards 0 on a repeat and returns the prior state by reference', () => {
    const clock = new FakeClock('20250131');
    const first = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    const repeat = applyReward(first.state, lessonSource('computer-science-beginner-1'), clock);
    expect(repeat.xpAwarded).toBe(0);
    expect(repeat.alreadyAwarded).toBe(true);
    expect(repeat.state).toBe(first.state); // by reference
    expect(repeat.state.totalXp).toBe(20); // unchanged
    expect(repeat.streakIncreased).toBe(false);
    expect(repeat.streakReset).toBe(false);
  });
});

// §8.3 — first mastery pass awards 50 under mastery:track/level; a fail awards 0 (no key).
describe('applyReward — mastery XP', () => {
  it('awards 50 XP for a first mastery pass under the mastery key', () => {
    const clock = new FakeClock('20250131');
    const outcome = applyReward(emptyRewards(), masterySource, clock);
    expect(outcome.xpAwarded).toBe(50);
    expect(outcome.state.awardedXp[`mastery:${TRACK_ID}/beginner`]).toBe(50);
    expect(outcome.state.totalXp).toBe(50);
  });

  // §8.4 — a repeat mastery pass awards 0.
  it('awards 0 on a repeat mastery pass', () => {
    const clock = new FakeClock('20250131');
    const first = applyReward(emptyRewards(), masterySource, clock);
    const repeat = applyReward(first.state, masterySource, clock);
    expect(repeat.xpAwarded).toBe(0);
    expect(repeat.alreadyAwarded).toBe(true);
    expect(repeat.state).toBe(first.state);
  });
});

// §8.5 — totalXp === sum(values(awardedXp)) after each kind of transition.
describe('applyReward — totalXp invariant', () => {
  it('keeps totalXp equal to the sum of ledger values', () => {
    const clock = new FakeClock('20250131');
    let state = emptyRewards();
    expect(state.totalXp).toBe(sumAwarded(state));

    state = applyReward(state, lessonSource('computer-science-beginner-1'), clock).state;
    expect(state.totalXp).toBe(sumAwarded(state));

    state = applyReward(state, lessonSource('computer-science-beginner-2'), clock).state;
    expect(state.totalXp).toBe(sumAwarded(state));

    state = applyReward(state, masterySource, clock).state;
    expect(state.totalXp).toBe(sumAwarded(state));
    expect(state.totalXp).toBe(90);

    // repeat does not change the invariant
    state = applyReward(state, masterySource, clock).state;
    expect(state.totalXp).toBe(sumAwarded(state));
  });
});

// §8.6 — streak first/same-day/consecutive/gap with correct flags + the invariant.
describe('applyReward — streak', () => {
  it('starts the streak at 1 on the first credited completion', () => {
    const clock = new FakeClock('20250131');
    const outcome = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    expect(outcome.newStreakCount).toBe(1);
    expect(outcome.streakIncreased).toBe(true);
    expect(outcome.streakReset).toBe(false);
    expect(outcome.state.streak.lastLocalDateYYYYMMDD).toBe('20250131');
    // invariant: lastDate !== null => count >= 1
    expect(outcome.state.streak.count).toBeGreaterThanOrEqual(1);
  });

  it('does not move the streak for a same-day credited completion', () => {
    const clock = new FakeClock('20250131');
    const first = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    const same = applyReward(first.state, lessonSource('computer-science-beginner-2'), clock);
    expect(same.newStreakCount).toBe(1);
    expect(same.streakIncreased).toBe(false);
    expect(same.streakReset).toBe(false);
    expect(same.state.streak.lastLocalDateYYYYMMDD).toBe('20250131');
  });

  it('increments the streak to 2 on a consecutive day', () => {
    const clock = new FakeClock('20250131');
    const first = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    clock.set('20250201');
    const next = applyReward(first.state, lessonSource('computer-science-beginner-2'), clock);
    expect(next.newStreakCount).toBe(2);
    expect(next.streakIncreased).toBe(true);
    expect(next.streakReset).toBe(false);
    expect(next.state.streak.lastLocalDateYYYYMMDD).toBe('20250201');
    // invariant after a consecutive credit
    expect(next.state.streak.count).toBeGreaterThanOrEqual(1);
  });

  it('resets the streak to 1 after a gap of two or more days', () => {
    const clock = new FakeClock('20250131');
    const first = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    clock.set('20250210');
    const next = applyReward(first.state, lessonSource('computer-science-beginner-2'), clock);
    expect(next.newStreakCount).toBe(1);
    expect(next.streakReset).toBe(true);
    expect(next.streakIncreased).toBe(true);
    expect(next.state.streak.lastLocalDateYYYYMMDD).toBe('20250210');
  });

  // §8.7 — streak is unmoved on a repeat (already-credited work).
  it('leaves the streak untouched on a repeat', () => {
    const clock = new FakeClock('20250131');
    const first = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    clock.set('20250205');
    const repeat = applyReward(first.state, lessonSource('computer-science-beginner-1'), clock);
    expect(repeat.newStreakCount).toBe(1);
    expect(repeat.streakIncreased).toBe(false);
    expect(repeat.streakReset).toBe(false);
    expect(repeat.state.streak.lastLocalDateYYYYMMDD).toBe('20250131');
  });

  // §8.8 — backwards clock: no streak change but XP is still awarded.
  it('awards XP but does not move the streak when the clock moves backwards', () => {
    const clock = new FakeClock('20250210');
    const first = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock);
    clock.set('20250201');
    const back = applyReward(first.state, lessonSource('computer-science-beginner-2'), clock);
    expect(back.xpAwarded).toBe(20);
    expect(back.streakIncreased).toBe(false);
    expect(back.streakReset).toBe(false);
    expect(back.newStreakCount).toBe(1);
    expect(back.state.streak.lastLocalDateYYYYMMDD).toBe('20250210'); // unchanged
    expect(back.state.totalXp).toBe(40);
  });
});

// §8.9 — applyBadge appends once / replay no-op / two levels two badges / empty events.
describe('applyBadge', () => {
  const eventFor = (levelId: 'beginner' | 'intermediate'): LevelCompletedEvent => ({
    type: 'level-completed',
    trackId: TRACK_ID,
    levelId,
  });

  it('appends a newly-earned badge once', () => {
    const { state, badgeEarned } = applyBadge(emptyRewards(), [eventFor('beginner')]);
    expect(badgeEarned).toBe(`${TRACK_ID}/beginner`);
    expect(state.earnedBadges).toEqual([`${TRACK_ID}/beginner`]);
  });

  it('is a no-op when replaying an already-earned badge', () => {
    const first = applyBadge(emptyRewards(), [eventFor('beginner')]);
    const replay = applyBadge(first.state, [eventFor('beginner')]);
    expect(replay.badgeEarned).toBeNull();
    expect(replay.state).toBe(first.state); // unchanged by reference
    expect(replay.state.earnedBadges).toEqual([`${TRACK_ID}/beginner`]);
  });

  it('earns two badges for two distinct levels', () => {
    const { state } = applyBadge(emptyRewards(), [
      eventFor('beginner'),
      eventFor('intermediate'),
    ]);
    expect(state.earnedBadges).toEqual([
      `${TRACK_ID}/beginner`,
      `${TRACK_ID}/intermediate`,
    ]);
  });

  it('earns no badge for empty events', () => {
    const { state, badgeEarned } = applyBadge(emptyRewards(), []);
    expect(badgeEarned).toBeNull();
    expect(state.earnedBadges).toEqual([]);
  });
});

// §8.10 — RewardError on malformed date and empty-id source.
describe('reward errors', () => {
  it('throws on a malformed local date', () => {
    expect(() => daysBetweenLocalDates('2025013', '20250201')).toThrow(RewardError);
    expect(() => daysBetweenLocalDates('20250131', 'bad')).toThrow('malformed local date');
  });

  it('returns a signed delta without throwing for a valid earlier date', () => {
    expect(daysBetweenLocalDates('20250201', '20250131')).toBe(-1);
    expect(daysBetweenLocalDates('20250131', '20250201')).toBe(1);
    expect(daysBetweenLocalDates('20250131', '20250131')).toBe(0);
    expect(daysBetweenLocalDates('20250131', '20250210')).toBe(10);
  });

  it('throws on an empty-id source', () => {
    const clock = new FakeClock('20250131');
    const badSource: RewardSource = {
      kind: 'lesson-completed',
      trackId: TRACK_ID,
      levelId: 'beginner',
      lessonId: '',
    };
    expect(() => applyReward(emptyRewards(), badSource, clock)).toThrow(RewardError);
    expect(() => applyReward(emptyRewards(), badSource, clock)).toThrow(
      'lessonId must be a non-empty string',
    );
  });
});

// §8.11 — viewRewards totals/streak/badge-count/hasBadge.
describe('viewRewards', () => {
  it('projects totals, streak, badge count and hasBadge', () => {
    const clock = new FakeClock('20250131');
    let state = applyReward(emptyRewards(), lessonSource('computer-science-beginner-1'), clock).state;
    state = applyReward(state, masterySource, clock).state;
    state = applyBadge(state, [
      { type: 'level-completed', trackId: TRACK_ID, levelId: 'beginner' },
    ]).state;

    const view = viewRewards(state);
    expect(view.totalXp).toBe(70);
    expect(view.streakCount).toBe(1);
    expect(view.lastActivityDate).toBe('20250131');
    expect(view.earnedBadgeCount).toBe(1);
    expect(view.hasBadge(TRACK_ID, 'beginner')).toBe(true);
    expect(view.hasBadge(TRACK_ID, 'intermediate')).toBe(false);
  });
});
