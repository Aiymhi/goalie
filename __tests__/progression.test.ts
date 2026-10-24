import { MasteryResult } from '../src/domain/assessment';
import { Level } from '../src/domain/content/catalog.types';
import {
  completeLesson,
  emptyProgression,
  isLevelComplete,
  ProgressionError,
  PROGRESSION_STATE_VERSION,
  recordMasteryResult,
  viewLevelProgress,
} from '../src/domain/progression';

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

describe('progression', () => {
  it('emptyProgression is a versioned empty state', () => {
    const state = emptyProgression();
    expect(state.version).toBe(PROGRESSION_STATE_VERSION);
    expect(state.levels).toEqual({});
  });

  it('completing the same lesson twice is idempotent (identical state)', () => {
    const once = completeLesson(
      emptyProgression(),
      TRACK_ID,
      'beginner',
      'computer-science-beginner-1',
    );
    const twice = completeLesson(
      once,
      TRACK_ID,
      'beginner',
      'computer-science-beginner-1',
    );
    expect(twice).toBe(once); // no-op returns the same reference
    expect(twice.levels[`${TRACK_ID}/beginner`].completedLessonIds).toEqual([
      'computer-science-beginner-1',
    ]);
  });

  it('never mutates the input state', () => {
    const before = emptyProgression();
    const snapshot = JSON.stringify(before);
    completeLesson(before, TRACK_ID, 'beginner', 'computer-science-beginner-1');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('non-regression: a pass then a 2/5 retry keeps masteryPassed and max bestCorrectCount', () => {
    let state = recordMasteryResult(emptyProgression(), TRACK_ID, 'beginner', result(4, true));
    state = recordMasteryResult(state, TRACK_ID, 'beginner', result(2, false));
    const bucket = state.levels[`${TRACK_ID}/beginner`];
    expect(bucket.masteryPassed).toBe(true);
    expect(bucket.bestCorrectCount).toBe(4);
  });

  it('isLevelComplete is true only when both lessons complete AND mastery passed', () => {
    let state = emptyProgression();
    expect(isLevelComplete(state, level, TRACK_ID)).toBe(false);

    state = completeLesson(state, TRACK_ID, 'beginner', 'computer-science-beginner-1');
    expect(isLevelComplete(state, level, TRACK_ID)).toBe(false);

    state = completeLesson(state, TRACK_ID, 'beginner', 'computer-science-beginner-2');
    // both lessons done, mastery not yet passed
    expect(isLevelComplete(state, level, TRACK_ID)).toBe(false);

    state = recordMasteryResult(state, TRACK_ID, 'beginner', result(5, true));
    expect(isLevelComplete(state, level, TRACK_ID)).toBe(true);
  });

  it('a failing retry after completion keeps the level complete (non-regression)', () => {
    let state = emptyProgression();
    state = completeLesson(state, TRACK_ID, 'beginner', 'computer-science-beginner-1');
    state = completeLesson(state, TRACK_ID, 'beginner', 'computer-science-beginner-2');
    state = recordMasteryResult(state, TRACK_ID, 'beginner', result(5, true));
    expect(isLevelComplete(state, level, TRACK_ID)).toBe(true);

    state = recordMasteryResult(state, TRACK_ID, 'beginner', result(1, false));
    expect(isLevelComplete(state, level, TRACK_ID)).toBe(true);
  });

  it('write with levelId "beginner" reads back through a Level{id:"beginner"} (key match)', () => {
    let state = completeLesson(
      emptyProgression(),
      TRACK_ID,
      'beginner',
      'computer-science-beginner-1',
    );
    state = completeLesson(state, TRACK_ID, 'beginner', 'computer-science-beginner-2');
    state = recordMasteryResult(state, TRACK_ID, 'beginner', result(4, true));
    // The derived read takes a Level and computes the same `${trackId}/${level.id}` key.
    expect(isLevelComplete(state, level, TRACK_ID)).toBe(true);
    const view = viewLevelProgress(state, level, TRACK_ID);
    expect(view.complete).toBe(true);
  });

  it('viewLevelProgress reports accurate counts, not a hardcoded percent', () => {
    const empty = viewLevelProgress(emptyProgression(), level, TRACK_ID);
    expect(empty).toEqual({
      completedLessons: 0,
      totalLessons: 2,
      masteryPassed: false,
      bestCorrectCount: 0,
      complete: false,
    });

    let state = completeLesson(
      emptyProgression(),
      TRACK_ID,
      'beginner',
      'computer-science-beginner-1',
    );
    state = recordMasteryResult(state, TRACK_ID, 'beginner', result(3, false));
    const partial = viewLevelProgress(state, level, TRACK_ID);
    expect(partial.completedLessons).toBe(1);
    expect(partial.totalLessons).toBe(2);
    expect(partial.masteryPassed).toBe(false);
    expect(partial.bestCorrectCount).toBe(3);
    expect(partial.complete).toBe(false);
  });

  it('throws ProgressionError on empty ids', () => {
    expect(() => completeLesson(emptyProgression(), '', 'beginner', 'x')).toThrow(
      ProgressionError,
    );
    expect(() => completeLesson(emptyProgression(), TRACK_ID, 'beginner', '')).toThrow(
      ProgressionError,
    );
  });
});
