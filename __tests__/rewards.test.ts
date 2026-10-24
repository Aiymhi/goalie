import { MasteryResult } from '../src/domain/assessment';
import { Level } from '../src/domain/content/catalog.types';
import {
  completeLesson,
  emptyProgression,
  ProgressionState,
  recordMasteryResult,
} from '../src/domain/progression';
import { deriveCompletionEvents } from '../src/domain/rewards';

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
