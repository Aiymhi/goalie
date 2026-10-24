import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../content/tracks.json', import.meta.url), 'utf8'));
const expectedTracks = ['computer-science', 'economics', 'personal-finance'];
const expectedLevels = ['beginner', 'intermediate', 'advanced'];
const errors = [];
const seen = new Set();
const lessonIds = new Set();
const questionIds = new Set();
let levelCount = 0;
let lessonCount = 0;
let questionCount = 0;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

if (catalog.schemaVersion !== 1) errors.push('schemaVersion must be 1');
if (!Array.isArray(catalog.tracks)) errors.push('tracks must be an array');

for (const track of catalog.tracks ?? []) {
  if (!track.id || seen.has(track.id)) errors.push('track IDs must be present and unique');
  seen.add(track.id);
  if (!track.title?.trim() || !track.description?.trim()) errors.push(track.id + ': title and description are required');
  if (track.id === 'personal-finance' && !isNonEmptyString(track.disclaimer)) {
    errors.push(track.id + ': personal-finance track requires a non-empty disclaimer string');
  }
  const ids = (track.levels ?? []).map(level => level.id);
  if (ids.join(',') !== expectedLevels.join(',')) errors.push(track.id + ': expected Beginner, Intermediate, Advanced in order');
  for (const level of track.levels ?? []) {
    levelCount += 1;
    const where = track.id + '/' + level.id;
    if (!level.title?.trim() || !level.objective?.trim()) errors.push(where + ': title and objective are required');

    const lessons = level.lessons ?? [];
    if (!Array.isArray(level.lessons) || level.lessons.length !== 2) {
      errors.push(where + ': must have exactly 2 lessons');
    }
    for (const lesson of lessons) {
      lessonCount += 1;
      if (!isNonEmptyString(lesson?.id) || !isNonEmptyString(lesson?.title) || !isNonEmptyString(lesson?.objective)) {
        errors.push(where + ': lesson needs non-empty id, title, objective');
      }
      if (!isNonEmptyString(lesson?.explanation) || !isNonEmptyString(lesson?.workedExample) || !isNonEmptyString(lesson?.nextStep)) {
        errors.push(where + ': lesson needs non-empty explanation, workedExample, nextStep');
      }
      const practice = lesson?.practice;
      if (!practice || typeof practice !== 'object' || !isNonEmptyString(practice.prompt) || !isNonEmptyString(practice.answer) || !isNonEmptyString(practice.answerExplanation)) {
        errors.push(where + ': lesson practice needs non-empty prompt, answer, answerExplanation');
      }
      if (isNonEmptyString(lesson?.id)) {
        if (lessonIds.has(lesson.id)) errors.push(where + ': duplicate lesson id "' + lesson.id + '"');
        lessonIds.add(lesson.id);
      }
    }

    const mastery = level.mastery;
    if (!mastery || typeof mastery !== 'object' || Array.isArray(mastery)) {
      errors.push(where + ': mastery must be an object');
    } else {
      if (!isNonEmptyString(mastery.passRule)) errors.push(where + ': mastery needs a non-empty passRule');
      const questions = mastery.questions;
      if (!Array.isArray(questions) || questions.length !== 5) {
        errors.push(where + ': mastery must have exactly 5 questions');
      }
      for (const question of Array.isArray(questions) ? questions : []) {
        questionCount += 1;
        if (!isNonEmptyString(question?.id) || !isNonEmptyString(question?.prompt)) {
          errors.push(where + ': mastery question needs a non-empty id and prompt');
        }
        if (!Array.isArray(question?.options) || question.options.length !== 4 || !question.options.every(isNonEmptyString)) {
          errors.push(where + ': mastery question needs exactly 4 non-empty options');
        }
        if (!Number.isInteger(question?.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
          errors.push(where + ': mastery question correctIndex must be an integer in 0..3');
        }
        if (isNonEmptyString(question?.id)) {
          if (questionIds.has(question.id)) errors.push(where + ': duplicate mastery question id "' + question.id + '"');
          questionIds.add(question.id);
        }
      }
    }
  }
}
for (const id of expectedTracks) if (!seen.has(id)) errors.push('missing required starter track: ' + id);

if (errors.length) {
  console.error(errors.map(error => '- ' + error).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Course catalog structure valid: ' + catalog.tracks.length + ' tracks, ' + levelCount + ' levels, ' + lessonCount + ' lessons, ' + questionCount + ' mastery questions checked.');
}
