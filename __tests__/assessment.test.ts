import {
  AssessmentError,
  gradeMastery,
  MASTERY_PASS_THRESHOLD,
  MASTERY_QUESTION_COUNT,
} from '../src/domain/assessment';
import { MasteryQuestion } from '../src/domain/content/catalog.types';

// Five single-correct questions whose correct answer is always index 0.
const questions: readonly MasteryQuestion[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `q${n}`,
  prompt: `prompt ${n}`,
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}));

describe('gradeMastery', () => {
  it('pins the rule constants', () => {
    expect(MASTERY_QUESTION_COUNT).toBe(5);
    expect(MASTERY_PASS_THRESHOLD).toBe(4);
  });

  it('fails at 3 correct (below the threshold)', () => {
    const result = gradeMastery(questions, [0, 0, 0, 1, 1]);
    expect(result.correctCount).toBe(3);
    expect(result.total).toBe(5);
    expect(result.passed).toBe(false);
  });

  it('passes at exactly 4 correct (boundary)', () => {
    const result = gradeMastery(questions, [0, 0, 0, 0, 1]);
    expect(result.correctCount).toBe(4);
    expect(result.passed).toBe(true);
  });

  it('passes at 5 correct', () => {
    const result = gradeMastery(questions, [0, 0, 0, 0, 0]);
    expect(result.correctCount).toBe(5);
    expect(result.passed).toBe(true);
  });

  it('throws AssessmentError when answers length does not match questions length', () => {
    expect(() => gradeMastery(questions, [0, 0, 0, 0])).toThrow(AssessmentError);
  });

  it('grades an out-of-range selectedIndex as incorrect, not an error', () => {
    const result = gradeMastery(questions, [0, 0, 0, 0, 9]);
    expect(result.correctCount).toBe(4);
    expect(result.passed).toBe(true);
    expect(result.perQuestion[4].correct).toBe(false);
    expect(result.perQuestion[4].selectedIndex).toBe(9);
  });

  it('does not mutate its inputs', () => {
    const answers = [0, 0, 0, 0, 0];
    const answersCopy = [...answers];
    const questionsSnapshot = JSON.stringify(questions);
    gradeMastery(questions, answers);
    expect(answers).toEqual(answersCopy);
    expect(JSON.stringify(questions)).toBe(questionsSnapshot);
  });
});
