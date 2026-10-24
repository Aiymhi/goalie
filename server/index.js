// Optional, isolated Goalie AI coaching server. This is a STUB: it validates the
// request and returns a deterministic canned hint (or a 503 to exercise the
// mobile client's graceful fallback). It is NOT part of the mobile app and is
// never imported by the root package. It has its own package.json/lockfile.
//
// Hard rules enforced here:
//  - Any provider API key is read from process.env SERVER-SIDE ONLY. It is never
//    returned to, nor stored on, the device. (No real provider call is made in
//    this stub; see the TODO below.)
//  - studentText is UNTRUSTED input: it is validated as a string and re-truncated,
//    never executed/eval'd. If a real provider call is ever added, the student
//    text MUST be placed in a quoted data section of the prompt, never in the
//    instruction section.
//  - The response is ONLY `{ hint: string }`. The server NEVER returns a score,
//    XP, badge, or certificate.

const express = require('express');

// Mirror the mobile client's cap so the two agree on the maximum size.
const MAX_PRACTICE_TEXT = 2000;

// Set FORCE_503=1 in the environment to make the stub reject every request with
// a 503, which exercises the mobile client's local fallback path end to end.
const FORCE_503 = process.env.FORCE_503 === '1';

// Server-side only. Present in a real deployment; absent in this stub. Never
// sent to or stored on the device.
// eslint-disable-next-line no-unused-vars
const PROVIDER_API_KEY = process.env.AI_PROVIDER_API_KEY ?? null;

const app = express();
app.use(express.json({ limit: '64kb' }));

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

app.post('/coach/explain', (req, res) => {
  if (FORCE_503) {
    // Deterministic failure for testing the client fallback.
    res.status(503).json({ error: 'coaching temporarily unavailable' });
    return;
  }

  const body = req.body ?? {};
  const { lessonId, prompt, suggestedAnswer } = body;
  let { studentText } = body;

  // Re-validate types server-side (never trust the client).
  if (
    !isNonEmptyString(lessonId) ||
    !isNonEmptyString(prompt) ||
    !isNonEmptyString(suggestedAnswer) ||
    typeof studentText !== 'string'
  ) {
    res.status(400).json({ error: 'invalid request' });
    return;
  }

  // Re-truncate the untrusted student text (data only; never executed).
  studentText = studentText.slice(0, MAX_PRACTICE_TEXT);

  // TODO: wire a real provider here using PROVIDER_API_KEY (server-side only).
  // When doing so, place `studentText` in a QUOTED DATA SECTION of the prompt,
  // never in the instruction section, and keep the response shaped as
  // `{ hint: string }` — never add a score/XP/badge/certificate field.
  const hint =
    `Compare your response to the suggested answer: "${suggestedAnswer}". ` +
    `Focus on the part of the prompt that asks you to explain the key idea in your own words.`;

  res.status(200).json({ hint });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

// Only listen when run directly, so the handler can be imported in tests.
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`goalie coaching stub listening on :${PORT}`);
  });
}

module.exports = { app };
