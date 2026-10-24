// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// Phase 3 supportive-coaching domain: deterministic, evidence-based feedback for
// practice and mastery answers. It NEVER changes a score, XP value, badge, or
// certificate — it only describes an answer the deterministic assessment already
// produced (mastery) or the self-checked practice answer (practice). Works with no
// network. Student free text is treated as UNTRUSTED data: it is only measured
// (length / presence), never interpolated into executable context, never stored.

import { GradedQuestion } from '../assessment';
import { Lesson, MasteryQuestion } from '../content/catalog.types';

// Hard cap on practice text we ever look at. Longer input is truncated before any
// use (display/transmission); it is never an error.
export const MAX_PRACTICE_TEXT = 2000;

export class CoachingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoachingError';
  }
}

export interface ImprovementComparison {
  improved: boolean; // true ONLY when a comparable prior AND current answer support it
  previousSummary: string; // what the earlier attempt did
  currentSummary: string; // what this attempt did
  difference: string; // the SPECIFIC difference shown, never a vague "you improved"
}

export interface CoachingFeedback {
  strength: string; // one evidence-based strength
  improvement: string; // one important next step / improvement
  hint: string; // a hint or brief explanation grounded in the content
  comparison: ImprovementComparison | null; // only present when honestly earned
  // Where the feedback came from. The deterministic builders here ALWAYS return
  // 'local'; the optional AI path (a later feature) is the only producer of 'ai'.
  source: 'local' | 'ai';
}

// History records consumed by the builders. The domain does not store them — the
// persistence/provider layer passes in the most-recent prior attempt per key.
export interface PriorQuestionAttempt {
  selectedIndex: number;
  correct: boolean;
  atEpochMs: number;
}

export interface PriorPracticeAttempt {
  hadText: boolean;
  atEpochMs: number;
}

// Literal rendered when a chosen index is not a valid index into the options array
// (out of range or non-integer). gradeMastery grades such an index as incorrect
// without erroring, so the builder stays total and never interpolates `undefined`.
const NO_VALID_OPTION = 'no valid option';

function isValidOptionIndex(index: number, optionCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < optionCount;
}

function optionText(options: readonly string[], index: number): string {
  return isValidOptionIndex(index, options.length) ? options[index] : NO_VALID_OPTION;
}

// MASTERY (structured, single-correct MCQ). Uses the DETERMINISTIC GradedQuestion
// from assessment — AI is never consulted for structured grading.
export function coachMasteryQuestion(
  question: MasteryQuestion,
  graded: GradedQuestion,
  priorAttempt: PriorQuestionAttempt | null,
): CoachingFeedback {
  if (graded.questionId !== question.id) {
    throw new CoachingError('graded question id does not match question');
  }

  const chosenText = optionText(question.options, graded.selectedIndex);
  const correctText = optionText(question.options, graded.correctIndex);

  let strength: string;
  let improvement: string;
  if (graded.correct) {
    strength = `You correctly identified '${chosenText}' as the answer.`;
    improvement = `Try explaining in your own words why '${correctText}' is right, to lock it in.`;
  } else if (chosenText === NO_VALID_OPTION) {
    strength = 'You engaged with the question but did not select a valid option.';
    improvement = `The expected answer was '${correctText}'. Review why that fits the prompt.`;
  } else {
    strength = `You engaged with the question and selected '${chosenText}'.`;
    improvement = `The expected answer was '${correctText}'. Review why that fits the prompt.`;
  }

  // Mastery questions carry no explanation field; the hint is a deterministic
  // restatement pointing at the correct option and the question's own prompt.
  const hint = `For "${question.prompt}", the correct option is '${correctText}'.`;

  const comparison = compareMastery(question, graded, priorAttempt);

  return { strength, improvement, hint, comparison, source: 'local' };
}

function compareMastery(
  question: MasteryQuestion,
  graded: GradedQuestion,
  priorAttempt: PriorQuestionAttempt | null,
): ImprovementComparison | null {
  if (priorAttempt === null) {
    return null;
  }

  const priorText = optionText(question.options, priorAttempt.selectedIndex);
  const currentText = optionText(question.options, graded.selectedIndex);
  const previousSummary = `chose '${priorText}' (${priorAttempt.correct ? 'correct' : 'incorrect'})`;
  const currentSummary = `chose '${currentText}' (${graded.correct ? 'correct' : 'incorrect'})`;

  let improved: boolean;
  let difference: string;
  if (!priorAttempt.correct && graded.correct) {
    improved = true;
    difference = 'Last time this question was answered incorrectly; this time it is correct.';
  } else if (priorAttempt.correct && !graded.correct) {
    improved = false;
    difference = 'Last time this question was answered correctly; this time it is incorrect.';
  } else if (priorAttempt.correct && graded.correct) {
    improved = false;
    difference = 'Answered correctly both times.';
  } else {
    improved = false;
    difference = 'Answered incorrectly both times; review the expected answer above.';
  }

  return { improved, previousSummary, currentSummary, difference };
}

// PRACTICE (self-checked free text). We do NOT grade the text; feedback is about
// the task, the suggested answer, and the explanation. The current answer text is
// UNTRUSTED input, treated as data only: truncated to MAX_PRACTICE_TEXT, measured
// for presence, never interpolated into feedback and never stored.
export function coachPractice(
  lesson: Lesson,
  currentAnswerText: string,
  priorAttempt: PriorPracticeAttempt | null,
): CoachingFeedback {
  const bounded = currentAnswerText.slice(0, MAX_PRACTICE_TEXT);
  const hasText = bounded.trim().length > 0;

  let strength: string;
  let improvement: string;
  if (hasText) {
    strength = 'You wrote a response and can compare it to the suggested answer below.';
    improvement = lesson.nextStep;
  } else {
    strength = 'You reached the practice reflection for this lesson.';
    improvement = `Write an attempt first, then compare it to the suggested answer. ${lesson.nextStep}`;
  }

  const hint = lesson.practice.answerExplanation;

  // Because text is not graded, `improved` is never asserted from text quality.
  // A prior attempt yields only a factual "you revisited this" note.
  const comparison: ImprovementComparison | null =
    priorAttempt === null
      ? null
      : {
          improved: false,
          previousSummary: priorAttempt.hadText
            ? 'You previously wrote a response here.'
            : 'You previously reached this practice without writing a response.',
          currentSummary: hasText
            ? 'This time you wrote a response.'
            : 'This time you have not written a response yet.',
          difference: 'You revisited this practice; your earlier response is on record.',
        };

  return { strength, improvement, hint, comparison, source: 'local' };
}
