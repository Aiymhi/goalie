// Optional AI coaching client adapter (mobile). NO API key, NO SDK, NO new
// dependency: it uses the RN-global `fetch` plus an `AbortController` timeout.
// It is OFF BY DEFAULT and SERVER-SIDE ONLY — the device knows only an optional
// server URL the user configured; the provider key lives solely in the server's
// environment.
//
// The adapter assists ONLY the free-text practice hint. On a fully-validated
// success it returns a single hint string; on ANY failure mode (feature off,
// missing config, timeout/abort, non-200, network throw, or a response that
// fails the client shape-check) it returns null so coaching falls back to the
// deterministic local hint. It NEVER returns (nor trusts) a score / XP / badge /
// certificate field — the shape-check strips the response down to the hint only.
//
// Student free text is UNTRUSTED: it is truncated to MAX_PRACTICE_TEXT and sent
// as a bounded JSON string field, never concatenated into instructions.

import { MAX_PRACTICE_TEXT } from '../domain/coaching';

// User-settable fields come from the persisted setting (PersistedData.aiCoaching);
// timeoutMs is a build/runtime constant, NOT persisted. Default: feature off.
export interface AiCoachingConfig {
  enabled: boolean;
  endpointUrl: string | null;
  timeoutMs: number;
}

export const DEFAULT_AI_COACHING_CONFIG: AiCoachingConfig = {
  enabled: false,
  endpointUrl: null,
  timeoutMs: 4000,
};

// Upper bound on an accepted hint so a hostile/broken server cannot return an
// unbounded blob the UI would then render.
const MAX_HINT_LENGTH = 2000;

export interface FetchAiHintInput {
  lessonId: string;
  prompt: string;
  suggestedAnswer: string;
  studentText: string;
}

// Returns the AI hint string ONLY on a fully-validated success; otherwise null
// (the caller uses the deterministic local hint).
export async function fetchAiHint(
  input: FetchAiHintInput,
  config: AiCoachingConfig,
): Promise<string | null> {
  // Feature off or no endpoint configured -> no network at all.
  if (!config.enabled || !config.endpointUrl) {
    return null;
  }

  const body = {
    lessonId: input.lessonId,
    prompt: input.prompt,
    suggestedAnswer: input.suggestedAnswer,
    // Untrusted student text: bound before transmission.
    studentText: input.studentText.slice(0, MAX_PRACTICE_TEXT),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const json: unknown = await response.json();
    return extractHint(json);
  } catch {
    // Timeout/abort, network throw, or JSON parse failure -> local fallback.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Client shape-check: accept ONLY `{ hint: string }` with a non-empty,
// length-bounded hint. Any other field (score/xp/badge/certificate/...) is
// ignored — nothing but the hint string is ever returned from this adapter.
function extractHint(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) {
    return null;
  }
  const hint = (json as Record<string, unknown>).hint;
  if (typeof hint !== 'string') {
    return null;
  }
  const trimmed = hint.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HINT_LENGTH) {
    return null;
  }
  return hint;
}
