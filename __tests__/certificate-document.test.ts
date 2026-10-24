import { MasteryResult } from '../src/domain/assessment';
import {
  buildCertificateData,
  buildCertificateHtml,
  buildCertificateReferenceId,
  buildSharePostText,
  CERTIFICATE_DISCLAIMER,
  CertificateError,
} from '../src/domain/certificates/document';
import { Level, LevelId, Track } from '../src/domain/content/catalog.types';
import {
  completeLesson,
  emptyProgression,
  ProgressionState,
  recordMasteryResult,
} from '../src/domain/progression';

const TRACK_ID = 'computer-science';

function makeLevel(id: LevelId): Level {
  return {
    id,
    title: `${id} level`,
    objective: `Understand ${id} fundamentals`,
    lessons: [
      {
        id: `${TRACK_ID}-${id}-1`,
        title: 'L1',
        objective: 'Read and trace simple code',
        explanation: 'e',
        workedExample: 'w',
        practice: { prompt: 'p', answer: 'a', answerExplanation: 'ae' },
        nextStep: 'n',
      },
      {
        id: `${TRACK_ID}-${id}-2`,
        title: 'L2',
        objective: 'Write a small function',
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

const beginner = makeLevel('beginner');
const track: Track = {
  id: TRACK_ID,
  title: 'Computer Science',
  description: 'd',
  levels: [beginner, makeLevel('intermediate'), makeLevel('advanced')],
};

function result(correctCount: number, passed: boolean): MasteryResult {
  return { perQuestion: [], correctCount, total: 5, passed };
}

function completeBeginner(state: ProgressionState): ProgressionState {
  let next = completeLesson(state, TRACK_ID, 'beginner', `${TRACK_ID}-beginner-1`);
  next = completeLesson(next, TRACK_ID, 'beginner', `${TRACK_ID}-beginner-2`);
  next = recordMasteryResult(next, TRACK_ID, 'beginner', result(5, true));
  return next;
}

const COMPLETE = completeBeginner(emptyProgression());
const RECORDED_MS = 1_700_000_000_000;
const COMPLETED = { [`${TRACK_ID}/beginner`]: RECORDED_MS };

describe('buildCertificateData', () => {
  it('throws CertificateError for an incomplete level (never a certificate)', () => {
    expect(() =>
      buildCertificateData(emptyProgression(), track, beginner, 'Ada', COMPLETED),
    ).toThrow(CertificateError);
  });

  it('uses the recorded completion timestamp when present', () => {
    const data = buildCertificateData(COMPLETE, track, beginner, 'Ada', COMPLETED);
    expect(data.completionDateEpochMs).toBe(RECORDED_MS);
    expect(data.completionDateUnknown).toBe(false);
  });

  it('reports unknown (null, not Date.now()) when no timestamp was recorded', () => {
    const before = Date.now();
    const data = buildCertificateData(COMPLETE, track, beginner, 'Ada', {});
    const after = Date.now();
    expect(data.completionDateEpochMs).toBeNull();
    expect(data.completionDateUnknown).toBe(true);
    // Guard explicitly against a fabricated now().
    const fabricated =
      data.completionDateEpochMs !== null &&
      (data.completionDateEpochMs as number) >= before &&
      (data.completionDateEpochMs as number) <= after;
    expect(fabricated).toBe(false);
  });

  it('derives skills from the real level + lesson objectives', () => {
    const data = buildCertificateData(COMPLETE, track, beginner, 'Ada', COMPLETED);
    expect(data.skills).toEqual([
      'Understand beginner fundamentals',
      'Read and trace simple code',
      'Write a small function',
    ]);
  });

  it('sets the exact disclaimer', () => {
    const data = buildCertificateData(COMPLETE, track, beginner, 'Ada', COMPLETED);
    expect(data.disclaimer).toBe(CERTIFICATE_DISCLAIMER);
  });
});

describe('buildCertificateReferenceId', () => {
  it('is identical across repeated calls for the same inputs', () => {
    const a = buildCertificateReferenceId(TRACK_ID, 'beginner', 'Ada');
    const b = buildCertificateReferenceId(TRACK_ID, 'beginner', 'Ada');
    expect(a).toBe(b);
  });

  it('differs when the display name differs', () => {
    const a = buildCertificateReferenceId(TRACK_ID, 'beginner', 'Ada');
    const b = buildCertificateReferenceId(TRACK_ID, 'beginner', 'Grace');
    expect(a).not.toBe(b);
  });

  it('contains no verification URL', () => {
    const id = buildCertificateReferenceId(TRACK_ID, 'beginner', 'Ada');
    expect(id).not.toContain('http');
  });
});

describe('buildCertificateHtml', () => {
  it('returns a non-empty document containing the disclaimer, titles, and reference id', () => {
    const data = buildCertificateData(COMPLETE, track, beginner, 'Ada', COMPLETED);
    const html = buildCertificateHtml(data);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain(CERTIFICATE_DISCLAIMER);
    expect(html).toContain('beginner level');
    expect(html).toContain('Computer Science');
    expect(html).toContain(data.referenceId);
  });

  it('contains no http or verification-URL wording', () => {
    const data = buildCertificateData(COMPLETE, track, beginner, 'Ada', COMPLETED);
    const html = buildCertificateHtml(data).toLowerCase();
    expect(html).not.toContain('http');
    expect(html).not.toContain('verify');
    expect(html).not.toContain('verification');
  });

  it('keeps a very long display name present (truncation is CSS, not data loss)', () => {
    const longName = 'Alexandria '.repeat(40).trim();
    const data = buildCertificateData(COMPLETE, track, beginner, longName, COMPLETED);
    const html = buildCertificateHtml(data);
    expect(html).toContain(longName);
  });
});

describe('buildSharePostText', () => {
  it('names the track and level and contains no URL', () => {
    const data = buildCertificateData(COMPLETE, track, beginner, 'Ada', COMPLETED);
    const post = buildSharePostText(data);
    expect(post).toContain('Computer Science');
    expect(post).toContain('beginner level');
    expect(post.toLowerCase()).not.toContain('http');
  });
});
