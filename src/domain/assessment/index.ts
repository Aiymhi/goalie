// Pure TS. No react / react-native / AsyncStorage / Node-IO imports.
// Deterministic grading of a 5-question single-correct mastery check.

import { MasteryQuestion } from '../content/catalog.types';

export const MASTERY_QUESTION_COUNT = 5;
export const MASTERY_PASS_THRESHOLD = 4; // correctCount >= 4 ; the single source of the rule

export class AssessmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssessmentError';
  }
}

export interface GradedQuestion {
  questionId: string;
  selectedIndex: number; // what the learner chose
  correctIndex: number; // from content
  correct: boolean;
}

export interface MasteryResult {
  perQuestion: GradedQuestion[];
  correctCount: number; // 0..5
  total: number; // always equals questions.length
  passed: boolean; // correctCount >= MASTERY_PASS_THRESHOLD
}

// answers: selectedIndex per question, in question order (length must equal questions.length).
// A question is correct iff answers[i] === questions[i].correctIndex. An out-of-range or
// non-integer selectedIndex grades as incorrect (not an error) — it simply is not a valid
// choice. A length mismatch is a programmer-invariant breach and throws AssessmentError.
export function gradeMastery(
  questions: readonly MasteryQuestion[],
  answers: readonly number[],
): MasteryResult {
  if (answers.length !== questions.length) {
    throw new AssessmentError(
      `answers length ${answers.length} does not match questions length ${questions.length}`,
    );
  }
  const perQuestion: GradedQuestion[] = questions.map((question, i) => {
    const selectedIndex = answers[i];
    const correct = selectedIndex === question.correctIndex;
    return {
      questionId: question.id,
      selectedIndex,
      correctIndex: question.correctIndex,
      correct,
    };
  });
  const correctCount = perQuestion.reduce((n, q) => (q.correct ? n + 1 : n), 0);
  return {
    perQuestion,
    correctCount,
    total: questions.length,
    passed: correctCount >= MASTERY_PASS_THRESHOLD,
  };
}
