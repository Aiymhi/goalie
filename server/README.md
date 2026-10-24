# Goalie optional AI coaching server

This is an **optional, isolated** service that powers the app's AI practice-hint
feature. It is **not** part of the mobile app: it has its own `package.json` and
lockfile and is never referenced by the root `package.json`. The root app builds,
tests, and runs with zero knowledge of this directory.

The feature in the app is **off by default**. Nothing is sent from the device
until a user acknowledges the in-app disclosure, turns the feature on, and
configures an endpoint URL that points at a deployment of this server. See
[`../docs/ai-coaching.md`](../docs/ai-coaching.md) for exactly what data leaves
the device.

## Endpoint

`POST /coach/explain`

Request body (all strings):

```json
{
  "lessonId": "computer-science-beginner-1",
  "prompt": "Describe a variable in your own words.",
  "suggestedAnswer": "A named container for a value.",
  "studentText": "a box that holds a value"
}
```

Success response (`200`):

```json
{ "hint": "..." }
```

Any error returns a non-200 status (e.g. `400` for an invalid request, `503`
when unavailable). The mobile client treats any non-200, timeout, or
shape-invalid response as a failure and falls back to the deterministic local
hint. **The server never returns a score, XP, badge, or certificate** — only a
`hint` string.

## This is a stub

The handler ships **without** calling any external AI provider. It returns a
deterministic canned hint so the server is runnable and testable locally with no
key and no network. Set `FORCE_503=1` to make it return `503` on every request,
which is useful for exercising the client's fallback.

- **TODO (server-side only):** wire a real provider call in the
  `POST /coach/explain` handler, reading the provider key from
  `process.env.AI_PROVIDER_API_KEY`.

## Key handling (server-side only)

The provider API key is read from `process.env` **on the server only**. It is
**never** sent to or stored on the device — the device knows only the endpoint
URL the user configured. Do not add the key to the response, logs, or any
client-visible surface.

## Input safety

`studentText` is **untrusted** input. The handler validates its type and
re-truncates it to 2000 characters; it never executes or `eval`s it. If you add
a real provider call, place the student text in a **quoted data section** of the
prompt, never in the instruction section.

## Running locally

```sh
cd server
npm install        # writes server/package-lock.json (isolated from the root)
npm start          # listens on :8787 (override with PORT)
```
