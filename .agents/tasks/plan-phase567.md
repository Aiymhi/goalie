# Implementation Plan — Goalie Phases 5, 6, 7 (Focus UX + Certificates/Sharing + Design/Accessibility)

Source of truth: the original task brief plus the APPROVED designs (`design.md` §4–§7 for the native focus layer, `design-phase2.md`, `design-phase34.md`). This plan sequences one efficient hackathon batch over the **actually-committed/working** codebase observed during exploration — it does not re-decide the Phase 1 native architecture.

Repo: `/Users/Shared/goalie`, branch `main`, local-only (no remote, no push, plain local commits, never `--amend`/force). Baseline confirmed green before planning: `npx tsc --noEmit` exit 0, `node scripts/validate-catalog.mjs` exit 0, `npx jest` 75/75 passing.

## Design decisions recorded (made here, grounded in the code I read)

- **Phase 5 builds on the existing native surface as-is.** `src/focus/GoalieFocus.ts` already exposes `presentActivityPicker()`, `getSelection()`, `startFocusSession(durationSeconds)` (which the Swift module implements schedule-BEFORE-shield, the §4.3 invariant), `stopFocusSession()` (idempotent emergency release), and `getActiveSession()` (app-group-persisted reconciliation source). I will NOT touch Swift. The JS session domain and UI layer on top of these are what Phase 5 adds. Rationale: the native layer is compile-only-verifiable here; reusing it keeps the honesty contract intact and avoids unverifiable churn.
- **Honest-unavailable is reused verbatim.** `getFocusAvailability()` is the single truth; the focus flow is gated on `available === true`. On the current environment (NotIOS/Simulator/ExpoGo/OSTooOld/NotAuthorized) the UI shows the existing `REASON_TEXT` copy and NEVER renders an active/blocked state or a JS-timer "shield". Rationale: matches `design.md` §6 and the existing `FocusScreen`/smoke-test contract.
- **The focus session domain is pure and clock-injected.** A new `src/domain/focus-session/index.ts` models session state (`idle | active | expired | released`) as pure functions over a serializable record + an injected `nowEpochMs`, mirroring the `rewards` `Clock` pattern. The deadline and release are the ONLY source of truth for the block; the timer never creates learning credit and learning completion never reads the timer. Rationale: lets every Phase-5 behavior (expiry, emergency release, recovery, clock-change, idempotency) be tested without a device.
- **Native session metadata is the reconciliation source; JS persists only a thin mirror.** The Swift module already persists `session.v1` in the app group and exposes it via `getActiveSession()`. The JS domain reconciles against that on relaunch; a local AsyncStorage mirror under the existing store is secondary and only used for honest display continuity. Rationale: avoids two competing sources of truth for "is a block active".
- **Phase 6 needs a completion timestamp that does not exist yet — add one honestly.** Neither `ProgressionState` nor `RewardsState` records when a level was completed (rewards stores only `streak.lastLocalDateYYYYMMDD`). I add a per-level completion timestamp recorded exactly on the real `false→true` edge of `isLevelComplete` (reusing `deriveCompletionEvents`), persisted in the store. The certificate derives its completion date from that recorded timestamp. For a level already complete BEFORE this feature shipped (no recorded timestamp), the certificate shows the completion date as **unavailable/unknown** rather than fabricating `Date.now()`. Rationale: the brief says "prefer a recorded completion timestamp … not now() unless that IS the recorded completion time"; fabricating now() for an old completion would be dishonest.
- **PDF stack pinned to the SDK 54 matrix.** `expo-print@~15.0.8`, `expo-sharing@~14.0.8`, `expo-file-system@~19.0.24` (exact SDK 54 bundledNativeModules values). Installed via `npx expo install` so the pin is the SDK-resolved one, matching the repo's existing `~`-pinned expo-module convention. Rationale: the brief mandates exact SDK 54 pins.
- **Certificate reference id is deterministic.** `goalie-<trackId>-<levelId>-<djb2hash(displayName||'')>` computed by a pure function, so regeneration yields the same id. It is explicitly a local reference, never identity proof, never a verification URL. Rationale: brief requires a "stable certificate reference id (deterministic …)".
- **Certificate generation is blocked for incomplete levels at the domain layer.** The pure builder throws / returns a blocked result for any level that does not pass `isLevelComplete`; the UI never offers generation for an incomplete level. Rationale: "NEVER generate a certificate for an INCOMPLETE level."
- **Phase 7 centralizes an original theme and reusable components, last in order.** A small `src/ui/theme/` module (calm neutral palette + ONE accent, type scale, spacing, touch-target constants, reduce-motion flag) plus shared `AppButton`/`Card`/`Screen` components. Existing screens are restyled to consume them; screens are NOT rebuilt. Rationale: ordering Phase 7 last means it restyles the Focus/Certificate screens that Phases 5/6 add, avoiding rework.
- **Accessibility is verified by a lightweight RN-test harness, not grep.** A test renders key journey screens and asserts `accessibilityLabel`/`accessibilityRole` presence on interactive elements and that touch-target styles meet the minimum (≥44pt). Rationale: brief counts this as Phase 7 a11y verification; grep is explicitly not verification.

> Ordering: Phase 5 and Phase 6 are independent of each other; Phase 7 depends on both (it restyles their screens) and is sequenced last. Each item leaves the tree buildable and green.

---

## PHASE 5 — Real voluntary focus (UX over the Phase 1 native layer)

- [ ] 1. Create the pure, clock-injected focus-session domain.
      Add `src/domain/focus-session/index.ts` (pure TS, no react/rn/AsyncStorage imports, mirroring `src/domain/rewards`): types `FocusSessionRecord { id: string; deadlineEpochMs: number; selectionSummary: string }`, `FocusPhase = 'idle' | 'active' | 'expired' | 'released'`, a `FocusClock { nowEpochMs(): number }` port, domain bounds `MIN_DURATION_SECONDS = 60` / `MAX_DURATION_SECONDS = 86400`; pure fns: `validateDuration(seconds): { ok: true } | { ok: false; reason }` enforcing integer [60,86400]; `phaseOf(record | null, now): FocusPhase` (null→idle, now<deadline→active, now>=deadline→expired); `reconcile(local, native, now)` picking the native app-group record as authoritative when present and deriving phase, and treating a device clock moved past the deadline as `expired` (never extends a block); `remainingSeconds(record, now)` clamped at 0. A `FocusSessionError` named class like `ProgressionError`.
      Files: `src/domain/focus-session/index.ts`
      Verify: `npx tsc --noEmit` passes (no react/rn import added). Behavior asserted by step 2.

- [ ] 2. Add the focus-session domain unit tests.
      Add `__tests__/focus-session.test.ts` with a `FakeClock`: normal start→active→expiry across the injected deadline; `remainingSeconds` clamps at 0 after expiry; `validateDuration` rejects <60, >86400, non-integer, NaN and accepts the bounds; `reconcile` prefers the native record over a stale local one, returns `idle` when both absent, and yields `expired` when the clock is at/after the deadline including a clock jumped far forward (device-clock-change); concurrent/double start is modeled as idempotent at the domain level (a second start while a record exists is rejected, matching the native `E_SESSION_ACTIVE`).
      Files: `__tests__/focus-session.test.ts`
      Verify: `npx jest focus-session` passes.

- [ ] 3. Add a thin focus-session persistence mirror to the store (behind the existing single key).
      Modify `src/persistence/store.ts` to carry an optional `focusSession: FocusSessionRecord | null` inside the existing single-key document (extend the structural guard to accept `null` or a well-shaped record; a malformed record is dropped to `null` with a single `console.warn`). Do NOT change `STORAGE_KEY` or break existing load/migrate behavior. This mirror is display-continuity only; `getActiveSession()` from native remains authoritative via `reconcile`.
      Files: `src/persistence/store.ts`
      Verify: `npx tsc --noEmit` passes; behavior asserted by step 4 (store tests).

- [ ] 4. Extend store tests for the focus-session mirror.
      Add cases to `__tests__/store.test.ts`: round-trips a `focusSession` record; a document with a malformed `focusSession` loads with it dropped to `null` + one warn, authoritative fields preserved; absence defaults to `null`.
      Files: `__tests__/store.test.ts`
      Verify: `npx jest store` passes.

- [ ] 5. Add a production FocusClock and a focus-session UI controller hook.
      Add `src/ui/focus/focusClock.ts` (`focusClock: FocusClock = { nowEpochMs: () => Date.now() }`) and `src/ui/focus/useFocusSession.ts`: a hook that (a) calls `getFocusAvailability()` once and exposes the honest verdict; (b) when available, exposes `presentPicker()` (maps `FocusCancelledError` to a clean no-op), `selectionSummary`, `start(durationSeconds)` (calls the native `startFocusSession`; on reject surfaces the native error code honestly and does NOT enter an active UI state — mirrors "if scheduling fails do not start protection"), `emergencyRelease()` (calls `stopFocusSession`, always available while active), and a derived `phase`/`remainingSeconds` computed from `reconcile(localMirror, await getActiveSession(), focusClock.nowEpochMs())`; (c) persists/clears the local mirror via the provider. No JS interval drives the block; a display-only ticking of `remainingSeconds` is allowed but is never the source of release.
      Files: `src/ui/focus/focusClock.ts`, `src/ui/focus/useFocusSession.ts`
      Verify: `npx tsc --noEmit` passes.

- [ ] 6. Rebuild FocusScreen into the honest session flow.
      Modify `src/ui/screens/FocusScreen.tsx` to use `useFocusSession`: when unavailable, render the existing `REASON_TEXT` copy and NOTHING resembling active/blocked (keep the smoke-test contract); when available, render the flow — pick apps (FamilyActivityPicker via native), choose duration within [60s,86400s] with validation, an explicit **disclosure block** stating exactly what will be blocked and that the block releases automatically at the deadline regardless of lesson/quiz state and can be ended anytime with emergency release, then an explicit **Start focus** button; while active show the honest native status, `remainingSeconds`, and an always-visible **Emergency release**; on relaunch reconcile via the hook. Never claim unbreakable blocking; state the compile-only limitation inline.
      Files: `src/ui/screens/FocusScreen.tsx`
      Verify: `npx jest screens.smoke` still passes (honest-unavailable assertions hold on the jest host); `npx tsc --noEmit` passes.

- [ ] 7. Add a FocusScreen smoke test for the available path via a mocked native surface.
      Extend `__tests__/screens.smoke.test.tsx` (or a new `__tests__/focus-screen.test.tsx`) mocking `getFocusAvailability` → available and `GoalieFocus`/`getActiveSession` to assert: the disclosure text renders before any Start affordance; starting is gated on a valid selection + duration; a native `startFocusSession` rejection leaves the UI in a non-active state with an honest error; an active reconciled session shows remaining time + emergency release; emergency release calls `stopFocusSession` and returns to idle. Never asserts a fabricated block on the real host path.
      Files: `__tests__/screens.smoke.test.tsx` (or new test file)
      Verify: `npx jest` (full suite) passes.

---

## PHASE 6 — Certificates & sharing (derived from real completed-progress data)

- [ ] 8. Record a per-level completion timestamp at the real completion edge.
      Add `completedLevels: Record<string, number>` (key `${trackId}/${levelId}` → epoch ms) to the persisted document in `src/persistence/store.ts` (guarded: integer ms values only; malformed dropped with one warn; default `{}`). In `src/ui/context/ProgressionProvider.tsx`, inside the existing `completeLesson`/`recordMasteryResult` transactions, after computing the next progression use `deriveCompletionEvents(before, after, level, trackId)` (already in `src/domain/rewards`) and, for each emitted `level-completed` event with no existing timestamp, record `clock.nowEpochMs()` once (monotonic, never overwritten). Expose `completedLevels` on the context. Rationale recorded above: honest completion date, no retroactive fabrication.
      Files: `src/persistence/store.ts`, `src/ui/context/ProgressionProvider.tsx`
      Verify: `npx tsc --noEmit` passes; behavior asserted by steps 9 and 13.

- [ ] 9. Build the pure certificate-document domain.
      Add `src/domain/certificates/document.ts` (pure TS): `CertificateReferenceId` builder `buildCertificateReferenceId(trackId, levelId, displayName)` = `goalie-<trackId>-<levelId>-<djb2hex(displayName||'')>` (deterministic, stable); `CertificateData { referenceId; studentDisplayName: string | null; trackTitle; levelTitle; levelId; completionDateEpochMs: number | null; completionDateUnknown: boolean; skills: string[] (from the level objective + lesson objectives); disclaimer: 'Completion certificate — not academic credit or an accredited professional credential.' }`; `buildCertificateData(state, track, level, displayName, completedLevels)` that THROWS `CertificateError` unless `isLevelComplete(state, level, track.id)`, sets `completionDateEpochMs` from `completedLevels[`${track.id}/${level.id}`]` (null + `completionDateUnknown:true` when absent), and derives `skills` from real content. Keep the existing `buildCertificatePreview` for the list view. Also add a pure `buildCertificateHtml(data, { nowForRenderEpochMs })` returning a one-page self-contained HTML string (original Goalie branding only, no imitation; long `studentDisplayName` handled with CSS truncation/wrap) and `buildSharePostText(data)` returning editable LinkedIn/social copy with NO fake verification URL.
      Files: `src/domain/certificates/document.ts`
      Verify: `npx tsc --noEmit` passes. Behavior asserted by step 10.

- [ ] 10. Add certificate-document domain tests.
      Add `__tests__/certificate-document.test.ts`: incomplete level → `buildCertificateData` throws `CertificateError` (no certificate); reference id is identical across repeated calls (stable/deterministic) and differs by display name; completion date comes from `completedLevels` when present and is `null`+`completionDateUnknown` when absent (never `now()`); `buildCertificateHtml` is a non-empty one-page string containing the exact disclaimer text, the level/track titles, and the reference id, and does not contain any `http`/verification-URL claim; a very long display name still produces valid HTML (assert it is included, truncation is CSS not data loss); `buildSharePostText` contains the track/level and no URL.
      Files: `__tests__/certificate-document.test.ts`
      Verify: `npx jest certificate-document` passes.

- [ ] 11. Pin and wire the PDF/sharing native modules.
      Install exact SDK 54 pins: `npx expo install expo-print expo-sharing expo-file-system` (resolves `expo-print@~15.0.8`, `expo-sharing@~14.0.8`, `expo-file-system@~19.0.24`). Confirm they land in `package.json` dependencies with those versions. Add `src/ui/certificates/pdf.ts`: `generateCertificatePdf(html): Promise<string>` (`expo-print` `printToFileAsync`), `savePdf(uri): Promise<string>` (move into a stable app documents location via `expo-file-system`), `sharePdf(uri): Promise<void>` guarded by `Sharing.isAvailableAsync()` (honest "sharing unavailable" when false; user cancellation is a clean no-op, not an error). All effects live in the UI layer; the domain stays pure.
      Files: `package.json`, `package-lock.json`, `src/ui/certificates/pdf.ts`
      Verify: `npx tsc --noEmit` passes; `npx expo install --check` reports the pins satisfied (or note if the CLI is unavailable in-env and fall back to asserting the exact versions in `package.json`).

- [ ] 12. Upgrade the certificate screens for PDF preview, save, share, and copyable post.
      Modify `src/ui/screens/CertificateScreen.tsx` (and add a focused `CertificateDetailScreen` + a `Certificate` → detail route param `{ trackId; levelId }` in `src/ui/navigation/RootNavigator.tsx`) so the list continues to show ONLY truly-complete levels; selecting a complete level opens the detail view which: builds `buildCertificateData` (guarded — incomplete is unreachable from the UI and also blocked in the domain), renders the honest completion date (or "completion date not recorded" when unknown), previews the generated PDF/HTML, offers **Save** and **Share** (native share sheet via `sharePdf`, honest-unavailable when `Sharing` is not available), and shows an **editable, copyable** LinkedIn/social post from `buildSharePostText` with NO auto-posting, NO public profile, NO verification URL. Offline generation works (all local). Cancellation of save/share is handled silently.
      Files: `src/ui/screens/CertificateScreen.tsx`, `src/ui/screens/CertificateDetailScreen.tsx`, `src/ui/navigation/RootNavigator.tsx`
      Verify: `npx tsc --noEmit` passes; `npx jest screens.smoke` passes.

- [ ] 13. Add certificate flow + completion-timestamp smoke/provider tests.
      Extend `__tests__/screens.smoke.test.tsx`: completing a level records a `completedLevels` timestamp that survives reopen; the certificate detail for a complete level renders the recorded date, the exact disclaimer, and the copyable post, and offers share only when `Sharing.isAvailableAsync()` resolves true (mock both branches); an INCOMPLETE level never reaches generation (the list omits it / the detail refuses). Mock `expo-print`/`expo-sharing`/`expo-file-system` so no real native call is made.
      Files: `__tests__/screens.smoke.test.tsx`
      Verify: `npx jest` (full suite) passes.

---

## PHASE 7 — Design & accessibility (polish existing screens, do not rebuild)

- [ ] 14. Create the original theme module and reusable components.
      Add `src/ui/theme/index.ts`: a calm neutral palette + ONE confident accent, a type scale, spacing scale, radius, and `MIN_TOUCH_TARGET = 44`, plus a `useReduceMotion()` helper wrapping RN `AccessibilityInfo.isReduceMotionEnabled` (reduced motion respected). Add `src/ui/components/AppButton.tsx` (role=button, min height 48, accessibilityLabel passthrough, disabled state), `Card.tsx`, and `Screen.tsx` (safe-area padded container with consistent loading/offline/empty/error/permission states that reuse `ScreenState`). Original identity only — no imitation of any other app.
      Files: `src/ui/theme/index.ts`, `src/ui/components/AppButton.tsx`, `src/ui/components/Card.tsx`, `src/ui/components/Screen.tsx`
      Verify: `npx tsc --noEmit` passes.

- [ ] 15. Restyle the main-journey screens onto the theme + components.
      Apply the theme and shared components across `HomeScreen`, `TrackSelectScreen`, `CoursePathScreen`, `LessonScreen`, `PracticeScreen`, `ResultScreen`, `MasteryScreen`, `MasteryResultScreen`, `ProgressScreen`, `FocusScreen`, `CertificateScreen`(+detail), `SettingsScreen`: calm backgrounds, one accent, readable spacing/typography, large touch targets, warm copy, honest progress indicators (no fabricated percentages), restrained reduce-motion-respecting celebration on real level completion only. Same-pattern edit across many files — do not change behavior or honest states.
      Files: all screens under `src/ui/screens/*.tsx`
      Verify: `npx tsc --noEmit` passes; `npx jest screens.smoke` passes (copy/honesty assertions still hold — adjust assertions only if copy intentionally changed, never to hide a regression).

- [ ] 16. Add the accessibility check test on key journey screens.
      Add `__tests__/accessibility.test.tsx`: render Home, Focus, Certificate detail, Settings (via the smoke harness) and assert every interactive element exposes a non-empty `accessibilityLabel` and an `accessibilityRole`, and that button styles resolve to a min height ≥ `MIN_TOUCH_TARGET`. Assert focus order is sensible (elements render in logical order) and that reduce-motion short-circuits the celebration animation. This is the Phase 7 a11y verification.
      Files: `__tests__/accessibility.test.tsx`
      Verify: `npx jest accessibility` passes.

- [ ] 17. Full-suite green gate.
      Run the whole verification matrix and fix any regressions before done.
      Files: (none — verification only)
      Verify: `npx tsc --noEmit` exit 0; `npm run lint` clean; `npx jest` full suite passes; `node scripts/validate-catalog.mjs` valid.

---

## Honesty guardrails (must hold at every step)

- Focus protection shows a specific "unavailable" reason on web/Android/Expo Go/simulator/unauthorized and NEVER fakes a blocked/active state or simulates shields with a JS timer. On-device blocking remains compile-only-verified; the UI and docs state this plainly.
- A certificate is generated ONLY for a level that passes `isLevelComplete`; the completion date comes from recorded completion data (or is shown as unknown), never fabricated; the reference id is a local, deterministic, non-identity-proof string with no verification URL and no auto-posting.
- Progress indicators are derived from real state; no fabricated percentages.
