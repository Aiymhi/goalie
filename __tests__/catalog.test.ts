import tracksJson from '../content/tracks.json';
import { loadCatalog } from '../src/domain/content/catalog';
import { CatalogError } from '../src/domain/content/catalog.types';

// Builds a valid, fully-formed lesson so negative fixtures isolate only the defect
// they name (not a lesson-count / mastery-shape failure). `key` keeps ids unique.
function lesson(key: string) {
  return {
    id: `lesson-${key}`,
    title: 'Lesson',
    objective: 'o',
    explanation: 'e',
    workedExample: 'w',
    practice: { prompt: 'p', answer: 'a', answerExplanation: 'ae' },
    nextStep: 'n',
  };
}

// Builds a valid 5-question single-correct mastery check. `key` keeps question ids unique.
function mastery(key: string) {
  return {
    passRule: 'Complete both lessons and answer at least 4 of 5 correctly.',
    questions: [1, 2, 3, 4, 5].map((n) => ({
      id: `q-${key}-${n}`,
      prompt: 'prompt',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    })),
  };
}

// A valid level carrying exactly 2 lessons and a valid mastery. `id` sets the level id;
// `key` namespaces lesson/question ids so fixtures with multiple levels stay unique.
function level(id: string, key: string) {
  return {
    id,
    title: id,
    objective: 'o',
    lessons: [lesson(`${key}-1`), lesson(`${key}-2`)],
    mastery: mastery(key),
  };
}

function validTrack(trackId: string) {
  return {
    id: trackId,
    title: trackId,
    description: 'd',
    levels: [
      level('beginner', `${trackId}-b`),
      level('intermediate', `${trackId}-i`),
      level('advanced', `${trackId}-a`),
    ],
  };
}

describe('loadCatalog', () => {
  // valid-parse
  it('parses the real tracks.json into a Catalog of 3 tracks x 3 levels', () => {
    const catalog = loadCatalog(tracksJson);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.tracks).toHaveLength(3);
    for (const track of catalog.tracks) {
      expect(track.levels).toHaveLength(3);
      expect(track.levels.map((l) => l.id)).toEqual([
        'beginner',
        'intermediate',
        'advanced',
      ]);
    }
  });

  // enriched-valid-parse: the real content carries 2 lessons + a 5-question mastery per level,
  // and the personal-finance track carries a non-empty disclaimer.
  it('parses the enriched lessons, mastery, and finance disclaimer', () => {
    const catalog = loadCatalog(tracksJson);
    for (const track of catalog.tracks) {
      for (const lvl of track.levels) {
        expect(lvl.lessons).toHaveLength(2);
        expect(lvl.mastery.questions).toHaveLength(5);
        for (const question of lvl.mastery.questions) {
          expect(question.options).toHaveLength(4);
          expect(question.correctIndex).toBeGreaterThanOrEqual(0);
          expect(question.correctIndex).toBeLessThanOrEqual(3);
        }
      }
    }
    const finance = catalog.tracks.find((t) => t.id === 'personal-finance');
    expect(finance?.disclaimer).toEqual(expect.any(String));
    expect((finance?.disclaimer ?? '').length).toBeGreaterThan(0);
  });

  // wrong-schema
  it('rejects a fixture with schemaVersion 2', () => {
    const raw = { schemaVersion: 2, tracks: [validTrack('t1')] };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // missing-level
  it('rejects a track missing its intermediate level', () => {
    const raw = {
      schemaVersion: 1,
      tracks: [
        {
          id: 't1',
          title: 'T1',
          description: 'd',
          levels: [level('beginner', 't1-b'), level('advanced', 't1-a')],
        },
      ],
    };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // duplicate-id
  it('rejects a fixture with two tracks sharing an id', () => {
    // Distinct lesson/question ids per track so the ONLY defect is the duplicate track id.
    const raw = {
      schemaVersion: 1,
      tracks: [validTrack('dup'), { ...validTrack('dup2'), id: 'dup' }],
    };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // order
  it('rejects levels out of order (advanced before beginner)', () => {
    const raw = {
      schemaVersion: 1,
      tracks: [
        {
          id: 't1',
          title: 'T1',
          description: 'd',
          levels: [
            level('advanced', 't1-a'),
            level('intermediate', 't1-i'),
            level('beginner', 't1-b'),
          ],
        },
      ],
    };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // reject-wrong-lesson-count
  it('rejects a level that does not have exactly 2 lessons', () => {
    const bad = validTrack('t1');
    bad.levels[0].lessons = [lesson('t1-b-1')];
    const raw = { schemaVersion: 1, tracks: [bad] };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // reject-wrong-mastery-count
  it('rejects a level whose mastery does not have exactly 5 questions', () => {
    const bad = validTrack('t1');
    bad.levels[0].mastery.questions = bad.levels[0].mastery.questions.slice(0, 4);
    const raw = { schemaVersion: 1, tracks: [bad] };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // reject-correctIndex-out-of-range
  it('rejects a mastery question with a correctIndex out of range', () => {
    const bad = validTrack('t1');
    bad.levels[0].mastery.questions[0].correctIndex = 4;
    const raw = { schemaVersion: 1, tracks: [bad] };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // reject-finance-missing-disclaimer
  it('rejects the personal-finance track when it lacks a disclaimer', () => {
    const raw = { schemaVersion: 1, tracks: [validTrack('personal-finance')] };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });
});
