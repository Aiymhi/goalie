// Pure TS. No react / react-native / Node-IO imports.
// loadCatalog re-validates the already-parsed JSON value fail-fast and never
// returns a partial catalog. The caller does the import/readFile + JSON.parse.
// Its invariants MIRROR scripts/validate-catalog.mjs (keep the two in sync).

import {
  Catalog,
  CatalogError,
  Lesson,
  Level,
  LevelId,
  MasteryCheck,
  MasteryQuestion,
  Track,
} from './catalog.types';

const LEVEL_ORDER: readonly LevelId[] = ['beginner', 'intermediate', 'advanced'];

const LESSONS_PER_LEVEL = 2;
const MASTERY_QUESTION_COUNT = 5;
const OPTIONS_PER_QUESTION = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseLesson(
  raw: unknown,
  trackId: string,
  levelId: string,
  lessonIds: Set<string>,
): Lesson {
  if (!isRecord(raw)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson must be an object`);
  }
  if (!isNonEmptyString(raw.id)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson id must be a non-empty string`);
  }
  if (lessonIds.has(raw.id)) {
    throw new CatalogError(`duplicate lesson id "${raw.id}"`);
  }
  lessonIds.add(raw.id);
  if (!isNonEmptyString(raw.title)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" title must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.objective)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" objective must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.explanation)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" explanation must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.workedExample)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" workedExample must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.nextStep)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" nextStep must be a non-empty string`);
  }
  if (!isRecord(raw.practice)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" practice must be an object`);
  }
  if (!isNonEmptyString(raw.practice.prompt)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" practice prompt must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.practice.answer)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" practice answer must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.practice.answerExplanation)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" practice answerExplanation must be a non-empty string`);
  }
  return {
    id: raw.id,
    title: raw.title,
    objective: raw.objective,
    explanation: raw.explanation,
    workedExample: raw.workedExample,
    practice: {
      prompt: raw.practice.prompt,
      answer: raw.practice.answer,
      answerExplanation: raw.practice.answerExplanation,
    },
    nextStep: raw.nextStep,
  };
}

function parseMasteryQuestion(
  raw: unknown,
  trackId: string,
  levelId: string,
  questionIds: Set<string>,
): MasteryQuestion {
  if (!isRecord(raw)) {
    throw new CatalogError(`${trackId}/${levelId}: mastery question must be an object`);
  }
  if (!isNonEmptyString(raw.id)) {
    throw new CatalogError(`${trackId}/${levelId}: mastery question id must be a non-empty string`);
  }
  if (questionIds.has(raw.id)) {
    throw new CatalogError(`duplicate mastery question id "${raw.id}"`);
  }
  questionIds.add(raw.id);
  if (!isNonEmptyString(raw.prompt)) {
    throw new CatalogError(`${trackId}/${levelId}: mastery question "${raw.id}" prompt must be a non-empty string`);
  }
  if (!Array.isArray(raw.options) || raw.options.length !== OPTIONS_PER_QUESTION) {
    throw new CatalogError(`${trackId}/${levelId}: mastery question "${raw.id}" must have exactly ${OPTIONS_PER_QUESTION} options`);
  }
  if (!raw.options.every((option) => isNonEmptyString(option))) {
    throw new CatalogError(`${trackId}/${levelId}: mastery question "${raw.id}" options must all be non-empty strings`);
  }
  if (
    !Number.isInteger(raw.correctIndex) ||
    (raw.correctIndex as number) < 0 ||
    (raw.correctIndex as number) > OPTIONS_PER_QUESTION - 1
  ) {
    throw new CatalogError(
      `${trackId}/${levelId}: mastery question "${raw.id}" correctIndex must be an integer in 0..${OPTIONS_PER_QUESTION - 1}`,
    );
  }
  return {
    id: raw.id,
    prompt: raw.prompt,
    options: raw.options as string[],
    correctIndex: raw.correctIndex as number,
  };
}

function parseMastery(
  raw: unknown,
  trackId: string,
  levelId: string,
  questionIds: Set<string>,
): MasteryCheck {
  if (!isRecord(raw)) {
    throw new CatalogError(`${trackId}/${levelId}: mastery must be an object`);
  }
  if (!isNonEmptyString(raw.passRule)) {
    throw new CatalogError(`${trackId}/${levelId}: mastery passRule must be a non-empty string`);
  }
  if (!Array.isArray(raw.questions) || raw.questions.length !== MASTERY_QUESTION_COUNT) {
    throw new CatalogError(`${trackId}/${levelId}: mastery must have exactly ${MASTERY_QUESTION_COUNT} questions`);
  }
  const questions = raw.questions.map((question) =>
    parseMasteryQuestion(question, trackId, levelId, questionIds),
  );
  return { passRule: raw.passRule, questions };
}

function parseLevel(
  raw: unknown,
  trackId: string,
  index: number,
  lessonIds: Set<string>,
  questionIds: Set<string>,
): Level {
  if (!isRecord(raw)) {
    throw new CatalogError(`${trackId}: level at position ${index} must be an object`);
  }
  const expectedId = LEVEL_ORDER[index];
  if (raw.id !== expectedId) {
    throw new CatalogError(
      `${trackId}: levels must be beginner, intermediate, advanced in order`,
    );
  }
  const levelId = expectedId;
  if (!isNonEmptyString(raw.title)) {
    throw new CatalogError(`${trackId}/${levelId}: title must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.objective)) {
    throw new CatalogError(`${trackId}/${levelId}: objective must be a non-empty string`);
  }
  if (!Array.isArray(raw.lessons) || raw.lessons.length !== LESSONS_PER_LEVEL) {
    throw new CatalogError(`${trackId}/${levelId}: must have exactly ${LESSONS_PER_LEVEL} lessons`);
  }
  const lessons = raw.lessons.map((lesson) =>
    parseLesson(lesson, trackId, levelId, lessonIds),
  );
  const mastery = parseMastery(raw.mastery, trackId, levelId, questionIds);
  return { id: levelId, title: raw.title, objective: raw.objective, lessons, mastery };
}

function parseTrack(
  raw: unknown,
  seenIds: Set<string>,
  lessonIds: Set<string>,
  questionIds: Set<string>,
): Track {
  if (!isRecord(raw)) {
    throw new CatalogError('track must be an object');
  }
  if (!isNonEmptyString(raw.id)) {
    throw new CatalogError('track id must be a non-empty string');
  }
  const id = raw.id;
  if (seenIds.has(id)) {
    throw new CatalogError(`duplicate track id "${id}"`);
  }
  seenIds.add(id);
  if (!isNonEmptyString(raw.title)) {
    throw new CatalogError(`${id}: title must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.description)) {
    throw new CatalogError(`${id}: description must be a non-empty string`);
  }
  if (!Array.isArray(raw.levels) || raw.levels.length !== LEVEL_ORDER.length) {
    throw new CatalogError(
      `${id}: levels must be beginner, intermediate, advanced in order`,
    );
  }
  const levels = raw.levels.map((level, index) =>
    parseLevel(level, id, index, lessonIds, questionIds),
  );
  const track: Track = { id, title: raw.title, description: raw.description, levels };
  if (id === 'personal-finance') {
    if (!isNonEmptyString(raw.disclaimer)) {
      throw new CatalogError(`${id}: disclaimer must be a non-empty string`);
    }
    track.disclaimer = raw.disclaimer;
  } else if (raw.disclaimer !== undefined) {
    if (!isNonEmptyString(raw.disclaimer)) {
      throw new CatalogError(`${id}: disclaimer, if present, must be a non-empty string`);
    }
    track.disclaimer = raw.disclaimer;
  }
  return track;
}

export function loadCatalog(raw: unknown): Catalog {
  if (!isRecord(raw)) {
    throw new CatalogError('catalog must be an object');
  }
  if (raw.schemaVersion !== 1) {
    throw new CatalogError('unsupported schemaVersion');
  }
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) {
    throw new CatalogError('tracks must be a non-empty array');
  }
  const seenIds = new Set<string>();
  const lessonIds = new Set<string>();
  const questionIds = new Set<string>();
  const tracks = raw.tracks.map((track) =>
    parseTrack(track, seenIds, lessonIds, questionIds),
  );
  return { schemaVersion: 1, tracks };
}
