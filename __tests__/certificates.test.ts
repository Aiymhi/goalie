import { MasteryResult } from '../src/domain/assessment';
import { Level, LevelId, Track } from '../src/domain/content/catalog.types';
import {
  completeLesson,
  emptyProgression,
  ProgressionState,
  recordMasteryResult,
} from '../src/domain/progression';
import { buildCertificatePreview } from '../src/domain/certificates';

const TRACK_ID = 'computer-science';

function makeLevel(id: LevelId): Level {
  return {
    id,
    title: id,
    objective: 'o',
    lessons: [
      {
        id: `${TRACK_ID}-${id}-1`,
        title: 'L1',
        objective: 'o',
        explanation: 'e',
        workedExample: 'w',
        practice: { prompt: 'p', answer: 'a', answerExplanation: 'ae' },
        nextStep: 'n',
      },
      {
        id: `${TRACK_ID}-${id}-2`,
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
        id: `${id}-q${n}`,
        prompt: 'p',
        options: ['a', 'b', 'c', 'd'],
        correctIndex: 0,
      })),
    },
  };
}

const track: Track = {
  id: TRACK_ID,
  title: 'Computer Science',
  description: 'd',
  levels: [makeLevel('beginner'), makeLevel('intermediate'), makeLevel('advanced')],
};

function result(correctCount: number, passed: boolean): MasteryResult {
  return { perQuestion: [], correctCount, total: 5, passed };
}

// Completes the given level fully (both lessons + passed mastery).
function completeLevel(state: ProgressionState, id: LevelId): ProgressionState {
  let next = completeLesson(state, TRACK_ID, id, `${TRACK_ID}-${id}-1`);
  next = completeLesson(next, TRACK_ID, id, `${TRACK_ID}-${id}-2`);
  next = recordMasteryResult(next, TRACK_ID, id, result(5, true));
  return next;
}

describe('buildCertificatePreview', () => {
  it('lists only truly-complete levels and reflects trackComplete correctly', () => {
    const state = completeLevel(emptyProgression(), 'beginner');
    const preview = buildCertificatePreview(state, track, 'Ada', 1000);
    expect(preview.completedLevels).toEqual(['beginner']);
    expect(preview.trackComplete).toBe(false);
  });

  it('marks trackComplete when every level is complete', () => {
    let state = completeLevel(emptyProgression(), 'beginner');
    state = completeLevel(state, 'intermediate');
    state = completeLevel(state, 'advanced');
    const preview = buildCertificatePreview(state, track, 'Ada', 1000);
    expect(preview.completedLevels).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(preview.trackComplete).toBe(true);
  });

  it('produces deterministic output for a fixed nowEpochMs and passes displayName through', () => {
    const preview = buildCertificatePreview(emptyProgression(), track, 'Grace', 42);
    expect(preview).toEqual({
      trackId: TRACK_ID,
      trackTitle: 'Computer Science',
      displayName: 'Grace',
      completedLevels: [],
      trackComplete: false,
      generatedPreviewAtEpochMs: 42,
    });
  });

  it('passes a null displayName through unchanged', () => {
    const preview = buildCertificatePreview(emptyProgression(), track, null, 42);
    expect(preview.displayName).toBeNull();
  });
});
