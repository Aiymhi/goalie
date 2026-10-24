import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { Clock } from '../src/domain/rewards';
import { STORAGE_KEY } from '../src/persistence/store';
import { REASON_TEXT } from '../src/ui/focus/reasonText';
import { FocusUnavailableReason } from '../src/focus/types';
import {
  CompleteLessonOutcome,
  ProgressionProvider,
  useProgression,
} from '../src/ui/context/ProgressionProvider';
import { CoursePathScreen } from '../src/ui/screens/CoursePathScreen';
import { FocusScreen } from '../src/ui/screens/FocusScreen';
import { MasteryResultScreen } from '../src/ui/screens/MasteryResultScreen';
import { ProgressScreen } from '../src/ui/screens/ProgressScreen';
import { ResultScreen } from '../src/ui/screens/ResultScreen';
import type { RootStackParamList } from '../src/ui/navigation/RootNavigator';

// jest-expo does not auto-mock AsyncStorage: register the official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// This environment is not an iOS device, so getFocusAvailability() resolves to
// an honest "unavailable" verdict (NotIOS on the jest/node host). We assert the
// screen shows the honest unavailable copy, never a fabricated blocked/active
// state.

const Stack = createNativeStackNavigator<RootStackParamList>();

// A settable-date Clock for deterministic XP/streak in the smoke tests. Mirrors
// the FakeClock pattern from __tests__/rewards.test.ts.
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

// Collect every string rendered anywhere in the tree.
function collectText(node: unknown, out: string[]): void {
  if (node === null || node === undefined) {
    return;
  }
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out));
    return;
  }
  if (typeof node === 'object' && 'children' in (node as Record<string, unknown>)) {
    collectText((node as { children: unknown }).children, out);
  }
}

function renderedStrings(tree: ReactTestRenderer): string[] {
  const json = tree.toJSON();
  const out: string[] = [];
  collectText(json, out);
  return out;
}

// Join and collapse whitespace so assertions are not sensitive to how RN splits
// interpolated text into sibling nodes (e.g. `{title} complete`).
function renderedText(tree: ReactTestRenderer): string {
  return renderedStrings(tree).join(' ').replace(/\s+/g, ' ').trim();
}

interface MountOptions {
  clock?: Clock;
}

// Build a fresh provider tree rendering `routeName`. The optional `clock` is
// forwarded into <ProgressionProvider clock={clock}> (the §6.1 seam); when
// omitted the provider default (systemClock) is used, so existing call sites
// keep working. Because the provider loads the already-persisted goalie.v1
// document on mount, calling this after a previous mount persisted its state
// doubles as a "reopen simulation" — hence `remount` is an alias below.
async function mount(
  routeName: keyof RootStackParamList,
  params: object | undefined,
  options: MountOptions = {},
): Promise<ReactTestRenderer> {
  const { clock } = options;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ProgressionProvider clock={clock}>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen
              name={routeName as never}
              // The target screen is registered dynamically per test.
              component={ROUTE_COMPONENTS[routeName] as never}
              initialParams={params as never}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ProgressionProvider>,
    );
  });
  // Let the provider's async loadData() + focus availability settle, plus the
  // on-arrival completeLesson/recordMasteryResult write for the Result screens.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

// Reopen simulation: a fresh provider tree that loads the already-persisted
// goalie.v1 document. Identical to mount() — the provider always reads from
// AsyncStorage on mount — named distinctly to make the "reopen" intent explicit
// in the idempotency tests.
async function remount(
  routeName: keyof RootStackParamList,
  params: object | undefined,
  options: MountOptions = {},
): Promise<ReactTestRenderer> {
  return mount(routeName, params, options);
}

const ROUTE_COMPONENTS: Partial<
  Record<keyof RootStackParamList, React.ComponentType<object>>
> = {
  Focus: FocusScreen as React.ComponentType<object>,
  CoursePath: CoursePathScreen as React.ComponentType<object>,
  Progress: ProgressScreen as React.ComponentType<object>,
  Result: ResultScreen as React.ComponentType<object>,
  MasteryResult: MasteryResultScreen as React.ComponentType<object>,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('Focus screen (honest availability)', () => {
  it('renders without throwing and shows the honest unavailable verdict', async () => {
    const tree = await mount('Focus', undefined);
    const text = renderedText(tree);

    // The host is not a real iOS device, so getFocusAvailability() reports an
    // honest "unavailable" verdict. Whatever the reason, the screen must show
    // the matching shared REASON_TEXT copy (never a fabricated verdict). At
    // least one unavailable reason's copy is present.
    const anyReasonShown = Object.values(FocusUnavailableReason).some(
      (reason) => text.includes(REASON_TEXT[reason]),
    );
    expect(anyReasonShown).toBe(true);
    expect(text).toContain('unavailable');
    // Never a fabricated "blocked"/"active"/"blocking" state.
    expect(text.toLowerCase()).not.toContain('blocked');
    expect(text.toLowerCase()).not.toContain('blocking');
    expect(text.toLowerCase()).not.toContain('session active');

    await act(async () => {
      tree.unmount();
    });
  });
});

describe('finance screen (disclaimer banner)', () => {
  it('renders the FinanceDisclaimerBanner text from the disclaimer content field', async () => {
    // Select the finance track so the course path renders its disclaimer.
    const tree = await mount('CoursePath', { trackId: 'personal-finance' });
    const strings = renderedStrings(tree).join(' ');

    expect(strings).toContain('Educational content only.');

    await act(async () => {
      tree.unmount();
    });
  });
});

// A valid v2 PersistedData document helper for seeding AsyncStorage directly.
function v2Doc(
  overrides: Partial<{
    selectedTrackId: string | null;
    displayName: string | null;
    progression: unknown;
    rewards: unknown;
    attemptHistory: unknown;
    aiCoaching: unknown;
    focusSession: unknown;
  }> = {},
): string {
  return JSON.stringify({
    version: 2,
    selectedTrackId: 'computer-science',
    displayName: null,
    progression: { version: 1, levels: {} },
    rewards: {
      version: 2,
      awardedXp: {},
      totalXp: 0,
      streak: { count: 0, lastLocalDateYYYYMMDD: null },
      earnedBadges: [],
    },
    attemptHistory: { questions: {}, practice: {} },
    aiCoaching: { enabled: false, endpointUrl: null, disclosureAcknowledged: false },
    focusSession: null,
    ...overrides,
  });
}

describe('Progress screen (badge only when a level is complete)', () => {
  it('shows no completion badge for empty rewards (no earned badges)', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, v2Doc());

    const tree = await mount('Progress', undefined);
    const text = renderedText(tree);

    // Nothing earned and nothing attempted -> honest empty state, no badge.
    expect(text).not.toContain('Beginner complete');
    expect(text).toContain('No badges yet');

    await act(async () => {
      tree.unmount();
    });
  });

  it('shows a completion badge only when hasBadge is true', async () => {
    // Both beginner lessons complete AND mastery passed -> level complete, and
    // the rewards ledger carries the earned badge.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      v2Doc({
        progression: {
          version: 1,
          levels: {
            'computer-science/beginner': {
              completedLessonIds: [
                'computer-science-beginner-1',
                'computer-science-beginner-2',
              ],
              masteryPassed: true,
              bestCorrectCount: 5,
            },
          },
        },
        rewards: {
          version: 2,
          awardedXp: {
            'computer-science-beginner-1': 20,
            'computer-science-beginner-2': 20,
            'mastery:computer-science/beginner': 50,
          },
          totalXp: 90,
          streak: { count: 1, lastLocalDateYYYYMMDD: '20250131' },
          earnedBadges: ['computer-science/beginner'],
        },
      }),
    );

    const tree = await mount('Progress', undefined);
    const text = renderedText(tree);

    expect(text).toContain('Beginner complete');

    await act(async () => {
      tree.unmount();
    });
  });
});

const CS = 'computer-science';
const BEGINNER = 'beginner' as const;
const LESSON_1 = 'computer-science-beginner-1';
const LESSON_2 = 'computer-science-beginner-2';
// The beginner mastery answer key (from content/tracks.json): a full pass.
const PASS_ANSWERS = [0, 1, 2, 1, 0];
// Only question 2 (index 1) correct -> 1/5, fails the >= 4 rule.
const FAIL_ANSWERS = [1, 1, 1, 1, 1];

// Seed a v2 doc with the CS track selected and both beginner lessons complete,
// so a mastery pass flips the level to complete (earning the badge).
function bothLessonsCompleteDoc(): string {
  return v2Doc({
    progression: {
      version: 1,
      levels: {
        'computer-science/beginner': {
          completedLessonIds: [LESSON_1, LESSON_2],
          masteryPassed: false,
          bestCorrectCount: 0,
        },
      },
    },
  });
}

describe('rewards wiring (XP/streak/badge exactly once, surviving reopen)', () => {
  // 26
  it('awards 20 XP once for a lesson and no additional XP on reopen', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, v2Doc());

    const first = await mount(
      'Result',
      { trackId: CS, levelId: BEGINNER, lessonId: LESSON_1 },
      { clock: new FakeClock('20250131') },
    );
    expect(renderedText(first)).toContain('You earned 20 XP');
    await act(async () => {
      first.unmount();
    });

    // The ledger was persisted. Confirm the total is 20.
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw as string).rewards.totalXp).toBe(20);

    // Reopen from the saved doc and revisit Result for the same lesson.
    const second = await remount(
      'Result',
      { trackId: CS, levelId: BEGINNER, lessonId: LESSON_1 },
      { clock: new FakeClock('20250131') },
    );
    const text = renderedText(second);
    expect(text).toContain('already earned XP');
    expect(text).not.toContain('You earned 20 XP');
    await act(async () => {
      second.unmount();
    });

    // Still 20 — no double award.
    const raw2 = await AsyncStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw2 as string).rewards.totalXp).toBe(20);
  });

  // 27
  it('mastery pass awards 50 + badge once; a later failing retry keeps the badge and XP', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, bothLessonsCompleteDoc());

    const pass = await mount(
      'MasteryResult',
      { trackId: CS, levelId: BEGINNER, answers: PASS_ANSWERS },
      { clock: new FakeClock('20250131') },
    );
    const passText = renderedText(pass);
    expect(passText).toContain('You earned 50 XP');
    expect(passText).toContain('You completed the');
    await act(async () => {
      pass.unmount();
    });

    const afterPass = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(afterPass.rewards.totalXp).toBe(50);
    expect(afterPass.rewards.earnedBadges).toContain('computer-science/beginner');

    // A failing retry afterwards must not change XP and must keep the badge.
    const fail = await remount(
      'MasteryResult',
      { trackId: CS, levelId: BEGINNER, answers: FAIL_ANSWERS },
      { clock: new FakeClock('20250131') },
    );
    await act(async () => {
      fail.unmount();
    });

    const afterFail = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(afterFail.rewards.totalXp).toBe(50);
    expect(afterFail.rewards.earnedBadges).toContain('computer-science/beginner');
  });

  // 28
  it('ProgressScreen shows XP/streak under the effort label and 0 mastered for high XP / no mastery', async () => {
    // XP earned but no mastery pass and no earned badge.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      v2Doc({
        rewards: {
          version: 2,
          awardedXp: { [LESSON_1]: 20, [LESSON_2]: 20 },
          totalXp: 40,
          streak: { count: 3, lastLocalDateYYYYMMDD: '20250131' },
          earnedBadges: [],
        },
        progression: {
          version: 1,
          levels: {
            'computer-science/beginner': {
              completedLessonIds: [LESSON_1, LESSON_2],
              masteryPassed: false,
              bestCorrectCount: 0,
            },
          },
        },
      }),
    );

    const tree = await mount('Progress', undefined);
    const text = renderedText(tree);
    expect(text).toContain('Your effort');
    expect(text).toContain('40 XP');
    expect(text).toContain('3 days');
    expect(text).toContain('0 levels mastered');
    expect(text).not.toContain('Beginner complete');

    await act(async () => {
      tree.unmount();
    });
  });

  // 29
  it('the Focus screen moves no streak', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      v2Doc({
        rewards: {
          version: 2,
          awardedXp: { [LESSON_1]: 20 },
          totalXp: 20,
          streak: { count: 1, lastLocalDateYYYYMMDD: '20250131' },
          earnedBadges: [],
        },
      }),
    );

    const tree = await mount('Focus', undefined, {
      clock: new FakeClock('20250205'),
    });
    await act(async () => {
      tree.unmount();
    });

    // Opening Focus must not touch rewards at all.
    const after = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(after.rewards.streak.count).toBe(1);
    expect(after.rewards.streak.lastLocalDateYYYYMMDD).toBe('20250131');
    expect(after.rewards.totalXp).toBe(20);
  });

  // 29a
  it('renders the improved comparison copy across an incorrect-then-correct remount, and none on a first attempt', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, bothLessonsCompleteDoc());

    // First attempt: a fail (question 1 incorrect). No prior -> no comparison copy.
    const firstTry = await mount(
      'MasteryResult',
      { trackId: CS, levelId: BEGINNER, answers: FAIL_ANSWERS },
      { clock: new FakeClock('20250131') },
    );
    const firstText = renderedText(firstTry);
    expect(firstText).not.toContain('You improved');
    expect(firstText).not.toContain('Compared to last time');
    await act(async () => {
      firstTry.unmount();
    });

    // Reopen and answer the SAME questions correctly: question 1 goes
    // incorrect->correct, which must render the "improved" copy from the
    // wrapper's returned pre-write prior.
    const secondTry = await remount(
      'MasteryResult',
      { trackId: CS, levelId: BEGINNER, answers: PASS_ANSWERS },
      { clock: new FakeClock('20250131') },
    );
    const secondText = renderedText(secondTry);
    expect(secondText).toContain('You improved');
    await act(async () => {
      secondTry.unmount();
    });
  });

  // 29b
  it('credits a consecutive-day streak (count 2) when the fake clock advances a day', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, v2Doc());
    const clock = new FakeClock('20250131');

    const day1 = await mount(
      'Result',
      { trackId: CS, levelId: BEGINNER, lessonId: LESSON_1 },
      { clock },
    );
    await act(async () => {
      day1.unmount();
    });
    expect(
      JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string).rewards.streak
        .count,
    ).toBe(1);

    // Advance to the next calendar day and complete another lesson.
    clock.set('20250201');
    const day2 = await remount(
      'Result',
      { trackId: CS, levelId: BEGINNER, lessonId: LESSON_2 },
      { clock },
    );
    const day2Text = renderedText(day2);
    expect(day2Text).toContain('Streak: 2 days');
    await act(async () => {
      day2.unmount();
    });
    expect(
      JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string).rewards.streak
        .count,
    ).toBe(2);
  });

  // 29c
  it('wrapper applies XP/streak and returns badgeEarned:null without throwing on a stale id', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, v2Doc());

    // Call the provider wrapper directly via a probe component. A stale
    // track/lesson id does not resolve in the catalog, so the badge step is
    // skipped (events = []) while XP/streak still apply, and nothing throws.
    let result: CompleteLessonOutcome | null = null;
    let threw = false;

    function Probe() {
      const { status, completeLesson } = useProgression();
      const didRun = useRef(false);
      useEffect(() => {
        if (didRun.current || status !== 'ready') {
          return;
        }
        didRun.current = true;
        void (async () => {
          try {
            result = await completeLesson(
              'no-such-track',
              BEGINNER,
              'no-such-lesson',
            );
          } catch {
            threw = true;
          }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [status]);
      return null;
    }

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <ProgressionProvider clock={new FakeClock('20250131')}>
          <Probe />
        </ProgressionProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    expect((result as unknown as CompleteLessonOutcome).badgeEarned).toBeNull();
    expect(
      (result as unknown as CompleteLessonOutcome).outcome.xpAwarded,
    ).toBe(20);

    await act(async () => {
      tree.unmount();
    });

    const after = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(after.rewards.totalXp).toBe(20);
    expect(after.rewards.earnedBadges).toEqual([]);
  });
});
