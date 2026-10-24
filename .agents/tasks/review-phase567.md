# Goalie Phases 5/6/7 — voluntary focus, honest certificates, original design system

Phases 5, 6, and 7 land as one batch over three commits (`503793b` FEAT-001 focus session UX + domain, `92d9f70` FEAT-002 certificates + sharing, `9aeaa5e` FEAT-003 design system + accessibility). Phase 5 layers a real voluntary focus flow on the existing Phase 1 native module with a pure clock-injected session domain; Phase 6 derives certificates entirely from real completion state with a newly-recorded per-level completion timestamp; Phase 7 centralizes an original theme + reusable components and adds an accessibility test, all polish-only. Every must-hold holds and the full verification matrix is green.

Watch for: nothing blocking. The only runtime limitation is the native focus feature's compile-only ceiling, which the UI states honestly inline and the availability layer reports as unavailable on every non-device host (confirmed). The recurring benign `console.warn` in the full suite is the documented FakeClock epoch-0 case, correctly dropped by the positive-integer guard (confirmed).

**Verdict**: APPROVED

## High-level view

The focus feature never fabricates protection. `getFocusAvailability()` is the single honesty truth, the native `GoalieFocus` surface is the only thing that applies a real block, and on the jest host it resolves to the honest rejecting stub so the screen shows only `REASON_TEXT` copy with no "blocked"/"blocking"/"session active" string. The session domain is pure, clock-injected, and tested for the device-clock-jump ("never extends") and second-start (`E_SESSION_ACTIVE`) cases. A native `startFocusSession` rejection leaves the UI non-active with "Protection was not started", honoring "if scheduling fails, do not start protection". Emergency release calls the idempotent `stopFocusSession` and is always visible while active. The display-only 1s tick re-derives `remainingSeconds` but never ends the block, and no focus path touches progression or rewards, so the timer never creates learning credit.

Certificates are produced only for a truly-complete level: `buildCertificateData` throws `CertificateError` unless `isLevelComplete`, and the detail route renders that as an honest error rather than a certificate. The completion date comes from a per-level timestamp recorded once on the real `false->true` edge of completion (monotonic, never overwritten) and is shown as "Completion date not recorded" when absent — never `Date.now()`. The reference id is a deterministic local djb2 fingerprint with no verification URL, the HTML/post contain no http claim and no auto-posting, and the SDK 54 pins are exact (`expo-print@~15.0.8`, `expo-sharing@~14.0.8`, `expo-file-system@~19.0.24`). Share is offered only when `Sharing.isAvailableAsync()` is true, else an honest unavailable note.

The design system is a single original theme (one grounded-teal accent, 4pt spacing, type scale, `MIN_TOUCH_TARGET=44`) with reusable `AppButton`/`Card`/`Screen` consumed across the journey. `AppButton` enforces `accessibilityRole="button"`, a required label, and a >=44pt target. The accessibility test asserts non-empty label + role on every interactive node across Home/Focus/CertificateDetail/Settings, the 44pt floor on `AppButton`, and that reduce motion short-circuits the `Celebration` to its resting opacity/transform. The restrained celebration fires only on a real completion edge (`badgeEarned !== null`), not a timer.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking issues. All must-holds verified against source and tests; full matrix green.

</details>

<details>
<summary>Details</summary>

### Focus honesty: availability truth + native-only blocking

`src/focus/GoalieFocus.ts` resolves to the real native module only on iOS when present; otherwise `makeUnavailableStub()` rejects every call with `FocusUnavailableError`. On the jest/node host this means `getFocusAvailability()` reports unavailable, and `FocusScreen` renders only the `Focus protection unavailable (<reason>)` header plus the shared `REASON_TEXT` copy. `screens.smoke.test.tsx` asserts the text contains "unavailable" and a `REASON_TEXT` string and does NOT contain "blocked"/"blocking"/"session active" (confirmed). Nothing simulates a shield with a JS timer: the hook's 1s interval only calls `setTick` to re-render `remainingSeconds`, and the comments and code make the deadline/native release the sole source of the block ending (confirmed).

### Focus session domain: pure, clock-injected, never extends

`src/domain/focus-session/index.ts` has no react/react-native/AsyncStorage/expo imports (grep confirmed), injects `FocusClock`, mirrors native bounds `[60,86400]` in `validateDuration`, and derives phase purely from the record + now. `reconcile` prefers the native app-group record as authoritative and yields `expired` at/after the deadline even on a far-future clock jump. `assertCanStart` models `E_SESSION_ACTIVE`. `focus-session.test.ts` covers all of these including the year-forward clock jump and the second-start rejection (confirmed).

### Schedule-before-shield and fail-closed start

The schedule-before-shield invariant lives in the native contract (`startFocusSession` schedules expiry before applying shields); the JS respects it by treating the native call as the only thing that starts protection. In `useFocusSession.start`, a native reject sets `startError` and does NOT enter an active state; `FocusScreen` renders "Could not start focus: …. Protection was not started." `focus-screen.test.tsx` drives a `startFocusSession` rejection and asserts the UI is non-active with that honest copy (confirmed). Emergency release calls the idempotent `stopFocusSession` unconditionally, is always rendered while active, and `focus-screen.test.tsx` asserts it calls stop once and returns to idle (confirmed).

### Timer creates no learning credit

No focus path (`useFocusSession`, `FocusScreen`, the domain) imports or calls progression/rewards. The disclosure copy states the block "never grants learning credit," and completion credit flows only through `completeLesson`/`recordMasteryResult` in the provider (confirmed).

### Certificate: complete-only, honest date, local reference

`src/domain/certificates/document.ts` is pure (grep confirmed) and `buildCertificateData` throws `CertificateError` unless `isLevelComplete(state, level, track.id)`. `completionDateEpochMs` is read from `completedLevels[`${trackId}/${levelId}`]` and is `null` + `completionDateUnknown:true` when absent — `certificate-document.test.ts` explicitly asserts it is never `Date.now()` (confirmed). The reference id is `goalie-<trackId>-<levelId>-<djb2hex(name)>`, deterministic and URL-free; the HTML and share post contain no http/verification claim and no auto-posting; HTML escaping guards injection and long names wrap via CSS. `CertificateDetailScreen` renders the incomplete case as an honest error (confirmed via screens.smoke "INCOMPLETE level … detail refuses generation").

### Completion timestamp: recorded once on the real edge

`ProgressionProvider.recordCompletions` writes `clock.nowEpochMs()` only for `deriveCompletionEvents` keys not already present — monotonic, never overwritten — folded into the same single-key persisted transaction as progression/rewards in both `completeLesson` and `recordMasteryResult`. The store guard accepts only finite positive-integer timestamps (epoch 0 dropped), and the v1->v2 migration carries no retroactive timestamps, so a pre-feature level shows an unknown date rather than a fabricated one (confirmed).

### Sharing + pins

`src/ui/certificates/pdf.ts` keeps native effects out of the domain: `generateCertificatePdf` (expo-print), `savePdf` (expo-file-system SDK 54 File/Paths), and `sharePdf` guarded by `Sharing.isAvailableAsync()` throwing `SharingUnavailableError` when false (honest, not faked; user cancel is a clean no-op). `CertificateDetailScreen` offers Share only when the probe is strictly true, else "Sharing is unavailable on this device." `package.json` pins `expo-print@~15.0.8`, `expo-sharing@~14.0.8`, `expo-file-system@~19.0.24` (grep confirmed).

### Design system + accessibility, polish-only

`src/ui/theme/index.ts` is the single source of visual truth: one original grounded-teal accent, 4pt spacing, radii, a dynamic-type-friendly type scale, `MIN_TOUCH_TARGET=44`, and `useReduceMotion()` defaulting motion-reduced-safe. `AppButton` enforces role/label/44pt and three variants over the one accent. `accessibility.test.tsx` asserts every interactive node across Home/Focus/CertificateDetail/Settings has a non-empty label + role, that `AppButton`'s flattened `minHeight >= MIN_TOUCH_TARGET`, and that reduce motion short-circuits `Celebration` to resting opacity/transform while still showing the message. `Celebration` fires only on `badgeEarned !== null` (a real completion edge, not a timer) in Result and MasteryResult. No honest state or behavior changed: Focus still honest-unavailable, certificates still complete-only, no fabricated percentages (confirmed).

### Verification matrix (run in this review)

- `npx tsc --noEmit` — exit 0.
- `npm run lint` — 0 errors, 4 pre-existing `require()` warnings in test files (the established AsyncStorage-mock harness pattern).
- `npx jest` — 14 suites, 167/167 passing. The single `console.warn goalie: dropped malformed completed level` is the documented benign FakeClock epoch-0 reopen case, correctly dropped by the positive-integer guard.
- `node scripts/validate-catalog.mjs` — valid (3 tracks, 9 levels, 18 lessons, 45 mastery questions).

No Swift under `modules/goalie-focus` was modified; no `expo prebuild`/`xcodebuild` was run (respecting the compile-only native ceiling).

</details>

<details>
<summary>File map</summary>

- `src/domain/focus-session/index.ts` — pure clock-injected session domain (validate/phase/remaining/reconcile/assertCanStart).
- `src/ui/focus/useFocusSession.ts`, `focusClock.ts` — hook + clock; honest start/reconcile/emergency-release, display-only tick.
- `src/ui/screens/FocusScreen.tsx` — honest unavailable + full pick/duration/disclosure/start/active flow.
- `src/domain/certificates/document.ts` — pure certificate data/HTML/share copy; complete-only, no fabricated date, no URL.
- `src/ui/certificates/pdf.ts` — native PDF/save/share effects with honest sharing guard.
- `src/ui/screens/CertificateScreen.tsx`, `CertificateDetailScreen.tsx` — complete-only list + honest detail.
- `src/persistence/store.ts` — v2 doc gains `focusSession` + `completedLevels` with non-authoritative guards; STORAGE_KEY unchanged.
- `src/ui/context/ProgressionProvider.tsx` — monotonic completion-timestamp recording folded into the single-key transaction; focus mirror setter.
- `src/ui/theme/index.ts`, `components/AppButton.tsx`, `Card.tsx`, `Screen.tsx`, `Celebration.tsx`, `ScreenState.tsx` — original theme + reusable components.
- Restyled screens: Home, TrackSelect, CoursePath, Lesson, Practice, Result, Mastery, MasteryResult, Progress, Focus, Certificate, CertificateDetail, Settings.
- Tests: `__tests__/focus-session.test.ts`, `focus-screen.test.tsx`, `certificate-document.test.ts`, `accessibility.test.tsx`, plus store + screens.smoke additions.
- `package.json` — exact SDK 54 pins for expo-print/expo-sharing/expo-file-system.

Full diff: `git diff 503793b^ 9aeaa5e` (FEAT-001/002/003 commits).

</details>
