# Goalie Phase 2 — Semantic Code Review

Phase 2 turns the Phase 1 scaffold into a real learning experience: enriched content (2 lessons + one 5-question mastery per level across 9 levels), a pure tested domain layer replacing the four `NotImplementedError` placeholders, an AsyncStorage-backed persistence store, and a full typed navigation graph of honest screens. The through-line is honesty of state — every number a screen shows is derived from real persisted progression, focus continues to report its true Phase 1 availability, and certificates are a labeled preview rather than a generated artifact. The change spans 46 files (+5337/-225) and adds exactly one runtime dependency.

Watch for: nothing blocking. I reproduced all five verification gates from source — `validate-catalog` (9 levels / 18 lessons / 45 questions), `tsc --noEmit` strict (clean), `eslint` (0 errors, 2 mandated jest-mock warnings), and `jest` (8 suites / 56 tests, all passing) — and traced the honesty-critical paths by reading the code, not the FEAT summaries. One LOW, non-blocking observation: the runtime parser's non-empty-string check omits the `.trim()` the build-time validator uses, a harmless gate inconsistency that does not touch the authored content. (confirmed)

**Verdict**: APPROVED

## High-level view

The domain layer is pure as required. Every module under `src/domain/` imports only from other domain modules or the catalog types; a grep for react / react-native / AsyncStorage / Node IO returns only comment lines. AsyncStorage is imported in exactly one file, `src/persistence/store.ts`, and no screen imports it directly — the `ProgressionProvider` context is the single UI-to-persistence seam. (confirmed)

Mastery grading is deterministic and pins the boundary at the right place: `passed` is `correctCount >= 4`, so 3 fails and 4 passes, and the suite asserts exactly that at 3/4/5. An out-of-range selection grades as incorrect rather than throwing; only a length mismatch (a caller-invariant breach the Mastery screen prevents) throws. (confirmed)

Progression is monotonic by construction. `completeLesson` only ever adds a de-duplicated lesson id and returns the same reference on a no-op; `recordMasteryResult` ORs `masteryPassed` and maxes `bestCorrectCount`. There is no API that clears progress, so a failing retry after a pass cannot lower a completed level — tested directly. Level completion is derived (both lessons complete AND mastery passed) against the live lesson ids, never stored, so a stale completed id simply does not count. (confirmed)

Persistence stores one versioned document under `goalie.v1`. Loads fail safe: absent key returns defaults, corrupt/shape-invalid returns defaults plus a single warn, and only a native read rejection propagates to the root gate. The structural guard rejects dishonest values (`bestCorrectCount: 999`, `completedLessonIds: [null]`) before they can reach a view. Deletion removes the single key and the context resets memory only after the wipe succeeds, re-throwing on failure so no false "deleted" is claimed. (confirmed)

Content passes both gates. The validator was tightened to enforce exactly-2 lessons, a 5-question mastery with 4 non-empty options and an in-range `correctIndex`, global id uniqueness, and a required `personal-finance` disclaimer; the runtime parser mirrors the same invariants fail-fast. The published `passRule` copy matches the executable `>= 4` threshold. (confirmed)

The UI keeps its promises about honesty. Badges render only for levels that pass `isLevelComplete`, and best scores show "—" when there is no attempt. The Focus screen renders loading / unavailable / available strictly from the real `getFocusAvailability` verdict and never surfaces a blocked or active state. The certificate screen is labeled "Preview — not an official certificate" and lists only truly-earned levels. The finance disclaimer is a content field surfaced by an always-visible banner and required by both the validator and the parser. (confirmed)

The dependency surface is exactly one line: `@react-native-async-storage/async-storage` at `2.2.0`, no caret. (confirmed)

<details>
<summary>Issues (1)</summary>

1. **Validator/parser trim mismatch** — `scripts/validate-catalog.mjs` treats a whitespace-only string as empty (`.trim().length > 0`) but `src/domain/content/catalog.ts` does not (`value.length > 0`), so a whitespace-only field would fail the build gate yet pass the runtime parser. Non-blocking and does not affect the authored content; align the two helpers if byte-identical gates are wanted. (confirmed)

</details>

<details>
<summary>Details</summary>

### Verification actually ran (not FEAT grep)

From `/Users/Shared/goalie` against `HEAD` (Phase 2 = commits `e9879aa..63886ed` on top of Phase 1's `3cc198e`):

- `node scripts/validate-catalog.mjs` → `Course catalog structure valid: 3 tracks, 9 levels, 18 lessons, 45 mastery questions checked.`
- `npm run typecheck` (tsc --noEmit strict) → exit 0, clean.
- `npm run lint` → 0 errors, 2 warnings (the mandated `require()`-in-`jest.mock` official-AsyncStorage-mock registrations in `store.test.ts` and `screens.smoke.test.tsx`).
- `npm test` → 8 suites, 56 tests, all passing.

The FEAT files and `verification-phase2.md` match what I reproduced. The native build is correctly not re-run — Phase 2 touches no native code (the diff is domain / persistence / UI / content / tests only). (confirmed)

### Pure domain, single persistence seam

`grep -rn "^import" src/domain/` shows every domain module importing only from `../content/catalog.types`, `../progression`, or `../assessment`. The react/react-native/AsyncStorage matches in that tree are the header comments, not imports. `grep -rln async-storage src/` returns only `src/persistence/store.ts`; `src/ui/` has zero AsyncStorage importers. The `ProgressionProvider` is the one place the UI calls `loadData`/`saveData`/`clearData`, and screens read catalog + progression + displayName + selectedTrackId from its context. This matches design §5 / §7.1 exactly. (confirmed)

### Grading boundary and progression invariant

`gradeMastery` (`src/domain/assessment/index.ts`) computes `correct = answers[i] === questions[i].correctIndex`, counts them, and sets `passed = correctCount >= MASTERY_PASS_THRESHOLD` where the constant is `4`. `assessment.test.ts` asserts 3 → `passed:false`, 4 → `passed:true`, 5 → `passed:true`, length-mismatch → `AssessmentError`, an out-of-range `selectedIndex` graded incorrect (not thrown), and no input mutation.

`progression/index.ts` keys buckets by `${trackId}/${levelId}` on write and recomputes the identical `${trackId}/${level.id}` on the derived reads, so there is no read/write key drift (tested). `completeLesson` returns `state` unchanged on a duplicate id; `recordMasteryResult` uses `prev.masteryPassed || result.passed` and `Math.max(prev.bestCorrectCount, result.correctCount)`. `progression.test.ts` covers idempotency (same reference), non-regression (pass then 2/5 retry keeps `masteryPassed` true and `bestCorrectCount` 4), level completion requiring both lessons AND mastery, the key-match read, accurate `viewLevelProgress` counts (no hardcoded percent), and a failing retry after completion leaving the level complete. (confirmed)

### Persistence: fail-safe loads, honest saves, full-clear deletion

`store.ts` `loadData` returns defaults on an absent key, defaults + one `console.warn('goalie: discarding unreadable store')` on unparseable JSON or a failed structural guard, and propagates a native read rejection. The guard checks outer and inner `version === 1`, a plain-object `levels`, `completedLessonIds` as an array of non-empty strings, `masteryPassed` boolean, and `bestCorrectCount` an integer in `[0,5]` — so `999` or `[null]` is rejected before reaching `viewLevelProgress`. `saveData` re-throws on write failure after a warn (never a silent success). `clearData` removes the single `STORAGE_KEY`. `store.test.ts` covers absent→defaults, bad-JSON→defaults+1 warn, `999`→defaults+1 warn, `[null]`→defaults+1 warn, save→load round-trip (no warn), and the required clear→defaults deletion plus a reopen confirming the key is null. The provider's `deleteAllData` awaits `clearData()` first and only then resets memory, re-throwing on failure so `SettingsScreen` surfaces the error and leaves state untouched. (confirmed)

### Enriched content through the tightened validator and mirrored parser

`tracks.json` carries 9 levels × (2 lessons + one 5-question mastery), schemaVersion still 1, with a `personal-finance` disclaimer ("Educational content only. This is general information, not personalized investment, tax, legal, credit, or debt advice."). The validator was tightened per design §3.3 (exactly-2 lessons, per-lesson non-empty fields incl. `practice`, mastery object with non-empty `passRule` + exactly 5 questions, 4 non-empty options, integer `correctIndex` 0..3, global lesson/question id uniqueness, required finance disclaimer) and prints counts computed from the walk. `catalog.ts` mirrors every one of those invariants and rejects with a specific `CatalogError` rather than returning a partial. `catalog.test.ts` keeps the positive parse of the real file and adds the named negatives (wrong-lesson-count, wrong-mastery-count, correctIndex-out-of-range, finance-missing-disclaimer); the four pre-existing negative fixtures were enriched so each still isolates its named defect under the tightened parser.

The one gap between the two gates is cosmetic: the validator's `isNonEmptyString` trims before checking length, the parser's does not. Authored content has no whitespace-only fields, so both agree today; the mismatch would only matter for a future whitespace-only value, which the validator would catch at build time anyway. LOW. (confirmed)

### Honest UI states

`ProgressScreen` renders a badge only for levels where `isLevelComplete` is true and shows `bestCorrectCount` as `n/5` or `—`; the smoke test confirms no "Beginner complete" badge for empty progression and the badge present only when both lessons + mastery are recorded. `FocusScreen` renders strictly from the resolved `getFocusAvailability()` verdict: a loading "Checking…", an unavailable branch with the reason plus the shared `REASON_TEXT` copy, and an available branch reachable only if the API truly says so — the smoke test asserts the honest unavailable copy appears and the strings "blocked"/"blocking"/"session active" do not. `CertificateScreen` is headed "Preview — not an official certificate; full PDF in a later release." and maps only `preview.completedLevels` (which come from `isLevelComplete`). `MasteryResultScreen` shows the real `correctCount / total`, pass/fail against `MASTERY_PASS_THRESHOLD`, per-question correctness, and a note that retrying never lowers progress. `ResultScreen` marks a lesson complete on arrival, awaits the write, and on failure shows "Couldn't save your progress" without claiming completion. `MasteryScreen` blocks submit until all five are answered, so `gradeMastery` never hits its length throw from the UI. The `FinanceDisclaimerBanner` reads the track's `disclaimer` content field and is rendered on the finance Lesson/Practice/Result/Mastery/MasteryResult/CoursePath screens. (confirmed)

One honest tradeoff worth naming (not a defect): `ProgressionProvider.persist` sets in-memory state before the async write, so on a write failure the learner sees the new progress in memory while the Result/MasteryResult screen simultaneously reports "couldn't save" and offers retry. The comment documents this deliberately; unsaved progress is lost on the next reopen, which is the honest cost and is consistent with the retry affordance. (confirmed)

### Dependency surface and placeholder cleanup

`git diff` on `package.json` is a single added line: `"@react-native-async-storage/async-storage": "2.2.0"` with no caret. `__tests__/placeholders.test.ts` is deleted and a repo-wide grep finds no remaining reference to `NotImplementedError`, `evaluateAssessment`, `grantReward`, `advanceProgress`, or `issueCertificate`. (confirmed)

</details>

<details>
<summary>File map</summary>

- `content/tracks.json` — enriched: 2 lessons + one 5-question mastery per level across 9 levels; `personal-finance` disclaimer added.
- `scripts/validate-catalog.mjs` — tightened to enforce the enriched schema; success line computes counts from the walk.
- `content/CONTENT-REVIEW.md` — semantic review record for every lesson and mastery check.
- `src/domain/content/catalog.types.ts` / `catalog.ts` — enriched readonly types; parser mirrors the validator fail-fast.
- `src/domain/assessment/index.ts` — `gradeMastery` with the `>= 4` boundary; `AssessmentError`.
- `src/domain/progression/index.ts` — monotonic reducer; derived `isLevelComplete` / `viewLevelProgress`.
- `src/domain/rewards/index.ts` — idempotent `deriveCompletionEvents`; `grantReward`/`Reward` removed.
- `src/domain/certificates/index.ts` — `buildCertificatePreview` (clock injected); `issueCertificate` removed.
- `src/persistence/store.ts` — the only AsyncStorage consumer; safe load, honest save, full-clear deletion.
- `src/ui/context/ProgressionProvider.tsx` — the single UI-to-persistence seam.
- `src/ui/components/{FinanceDisclaimerBanner,ScreenState}.tsx` — content-driven banner; loading/empty/error wrapper.
- `src/ui/focus/reasonText.ts` — shared `REASON_TEXT`, extracted from the old HomeScreen.
- `src/ui/navigation/RootNavigator.tsx` — full typed 12-route stack.
- `src/ui/screens/*` — TrackSelect, Home, CoursePath, Lesson, Practice, Result, Mastery, MasteryResult, Progress, Focus, Certificate, Settings + `catalogLookup.ts`.
- `App.tsx` — `ProgressionProvider` + async root gate computing `initialRouteName`.
- `__tests__/{assessment,progression,rewards,certificates,store,catalog}.test.ts`, `screens.smoke.test.tsx` — new/updated suites; `placeholders.test.ts` deleted.
- `package.json` / `package-lock.json` — single new pin `@react-native-async-storage/async-storage@2.2.0`.
- `tsconfig.json` / `types/react-test-renderer.d.ts` — ambient types so strict typecheck passes without adding matrix-external deps.

Full diff: `git diff 3cc198e..HEAD`.

</details>
