// Optional AI coaching adapter tests (design §8 items 30-33). The client adapter
// is exercised directly with a mocked global `fetch`; the server is a stub and
// is not run here. Every assertion protects the hard rules: off by default means
// no network and a local source; every failure mode falls back to local without
// throwing; a well-formed response replaces ONLY the hint and sets source:'ai';
// and the adapter never returns a score/XP/badge/certificate field.

import { fetchAiHint, AiCoachingConfig } from '../src/ai/coachingClient';
import { coachPractice } from '../src/domain/coaching';
import { Lesson } from '../src/domain/content/catalog.types';

const lesson: Lesson = {
  id: 'computer-science-beginner-1',
  title: 'Variables',
  objective: 'Understand variables',
  explanation: 'A variable names a value.',
  workedExample: 'let x = 1',
  practice: {
    prompt: 'Describe a variable in your own words.',
    answer: 'A named container for a value.',
    answerExplanation: 'A variable binds a name to a value you can read and change.',
  },
  nextStep: 'Move on to functions.',
};

const input = {
  lessonId: lesson.id,
  prompt: lesson.practice.prompt,
  suggestedAnswer: lesson.practice.answer,
  studentText: 'a box that holds a value',
};

const OFF: AiCoachingConfig = { enabled: false, endpointUrl: null, timeoutMs: 4000 };
const ON: AiCoachingConfig = {
  enabled: true,
  endpointUrl: 'https://example.test/coach/explain',
  timeoutMs: 4000,
};

function okResponse(json: unknown) {
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
}
function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'nope' }),
  } as unknown as Response;
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

// 8.30 — feature flag off (default) => adapter never calls the network; the
// deterministic builder yields source:'local'.
describe('fetchAiHint — feature off (default)', () => {
  it('performs no network call and returns null; coaching source stays local', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const hint = await fetchAiHint(input, OFF);

    expect(hint).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    // Integration: with no AI hint, the practice feedback is the local one.
    const feedback = coachPractice(lesson, input.studentText, null);
    expect(feedback.source).toBe('local');
    expect(feedback.hint).toBe(lesson.practice.answerExplanation);
  });

  it('returns null without a network call when enabled but no endpoint is set', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const hint = await fetchAiHint(input, { enabled: true, endpointUrl: null, timeoutMs: 4000 });

    expect(hint).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// 8.31 — timeout / non-200 / missing-config => fall back to local, no throw.
describe('fetchAiHint — failure modes fall back to local', () => {
  it('non-200 response returns null (no throw)', async () => {
    global.fetch = jest.fn(async () => errorResponse(503)) as unknown as typeof fetch;
    await expect(fetchAiHint(input, ON)).resolves.toBeNull();
  });

  it('a network throw returns null (no throw to the UI)', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(fetchAiHint(input, ON)).resolves.toBeNull();
  });

  it('an abort/timeout returns null (no throw)', async () => {
    global.fetch = jest.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    await expect(fetchAiHint(input, ON)).resolves.toBeNull();
  });

  it('falls back to the local hint on failure (integration)', async () => {
    global.fetch = jest.fn(async () => errorResponse(500)) as unknown as typeof fetch;
    const aiHint = await fetchAiHint(input, ON);
    expect(aiHint).toBeNull();
    const feedback =
      aiHint !== null
        ? { ...coachPractice(lesson, input.studentText, null), hint: aiHint, source: 'ai' as const }
        : coachPractice(lesson, input.studentText, null);
    expect(feedback.source).toBe('local');
    expect(feedback.hint).toBe(lesson.practice.answerExplanation);
  });
});

// 8.32 — a well-formed { hint } replaces ONLY the hint and sets source:'ai';
// a malformed/shape-invalid response is rejected and falls back to local.
describe('fetchAiHint — well-formed vs malformed responses', () => {
  it('a well-formed { hint } response is returned and replaces only the practice hint', async () => {
    global.fetch = jest.fn(async () =>
      okResponse({ hint: 'A richer explanation of the suggested answer.' }),
    ) as unknown as typeof fetch;

    const aiHint = await fetchAiHint(input, ON);
    expect(aiHint).toBe('A richer explanation of the suggested answer.');

    const local = coachPractice(lesson, input.studentText, null);
    const merged =
      aiHint !== null ? { ...local, hint: aiHint, source: 'ai' as const } : local;

    // ONLY the hint changed; everything else is the deterministic local output.
    expect(merged.source).toBe('ai');
    expect(merged.hint).toBe('A richer explanation of the suggested answer.');
    expect(merged.strength).toBe(local.strength);
    expect(merged.improvement).toBe(local.improvement);
    expect(merged.comparison).toBe(local.comparison);
  });

  it('a malformed response (no hint field) is rejected and falls back to local', async () => {
    global.fetch = jest.fn(async () =>
      okResponse({ notAHint: 'x' }),
    ) as unknown as typeof fetch;
    await expect(fetchAiHint(input, ON)).resolves.toBeNull();
  });

  it('a non-string hint is rejected', async () => {
    global.fetch = jest.fn(async () => okResponse({ hint: 42 })) as unknown as typeof fetch;
    await expect(fetchAiHint(input, ON)).resolves.toBeNull();
  });

  it('an empty/whitespace hint is rejected', async () => {
    global.fetch = jest.fn(async () => okResponse({ hint: '   ' })) as unknown as typeof fetch;
    await expect(fetchAiHint(input, ON)).resolves.toBeNull();
  });

  it('a non-object JSON body is rejected', async () => {
    global.fetch = jest.fn(async () => okResponse('just a string')) as unknown as typeof fetch;
    await expect(fetchAiHint(input, ON)).resolves.toBeNull();
  });
});

// 8.33 — the adapter never surfaces a score/XP/badge/certificate field; a
// response that tries to include one is stripped to the hint only.
describe('fetchAiHint — only a hint is ever returned', () => {
  it('ignores score/xp/badge/certificate fields and returns only the hint string', async () => {
    global.fetch = jest.fn(async () =>
      okResponse({
        hint: 'Here is a hint.',
        score: 100,
        xp: 999,
        badge: 'computer-science/beginner',
        certificate: 'granted',
        passed: true,
      }),
    ) as unknown as typeof fetch;

    const result = await fetchAiHint(input, ON);

    // The return type is `string | null` — there is no structural surface for a
    // score/XP/badge/certificate to ride along on.
    expect(typeof result).toBe('string');
    expect(result).toBe('Here is a hint.');
  });

  it('truncates the untrusted student text to the cap before sending', async () => {
    const fetchMock = jest.fn(async () => okResponse({ hint: 'ok' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const longText = 'y'.repeat(5000);
    await fetchAiHint({ ...input, studentText: longText }, ON);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const sent = JSON.parse(call[1].body) as { studentText: string };
    expect(sent.studentText.length).toBe(2000);
  });
});
