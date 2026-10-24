# Design Fix Review — `design-phase34.md` (third-review-round fixes)

Scope: verify ONLY that the 5 mandated fixes from the third review round were correctly applied and are internally consistent. The already-approved core design (idempotent ledger, local-day streak, badge-on-completeness, XP/mastery separation, v1→v2 migration, injected clock, improvement-honesty, AI-never-awards) is NOT re-litigated here.

Method: read the revised design in full, then verify each fix claim against the actual repo source it touches (`screens.smoke.test.tsx`, `store.test.ts`, `ResultScreen.tsx`, `MasteryResultScreen.tsx`, `ProgressionProvider.tsx`, `RootNavigator.tsx`) rather than taking the doc's word for the starting state.

---

## Fix-by-fix verification

### Fix 1 — Outcome return types defined; mutator return types changed (not just fields added)

CORRECTLY APPLIED.

- §6.1 defines both return shapes concretely:
  `CompleteLessonOutcome { outcome: RewardOutcome; badgeEarned: string | null; priorPracticeAttempt: PriorPracticeAttempt | null }`
  and `MasteryOutcome { outcome: RewardOutcome; badgeEarned: string | null; priorByQuestionId: Record<string, PriorQuestionAttempt | null> }`.
- The two context signatures are pinned exactly as required:
  `completeLesson: (trackId, levelId, lessonId, practiceAnswer?) => Promise<CompleteLessonOutcome>` and
  `recordMasteryResult: (trackId, levelId, result) => Promise<MasteryOutcome>`.
- The doc is explicit that this is a RETURN-TYPE change, not a field addition: §6.1 ("changes these two members' RETURN TYPES ... it is not merely widened with extra fields") and the §10 provider entry repeat it ("changes the RETURN TYPES ... not merely adds fields ... from `Promise<void>`").
- `completeLesson` gains the optional `practiceAnswer?: string` param, and the wrapper pseudocode in §6.1 threads it through to `hadText` and (via §6.2) to `coachPractice`.

Verified against source: `src/ui/context/ProgressionProvider.tsx` today declares both members as `=> Promise<void>` and `completeLesson` currently takes only `(trackId, levelId, lessonId)` — so the doc's described starting state and the required change are accurate, and the screens genuinely could not read `badgeEarned`/`priorPracticeAttempt` off a `void` under TS strict without this change.

### Fix 2 — Smoke-test harness extensions specified

CORRECTLY APPLIED. All four sub-requirements are present in the §8 "Harness extensions" binding note:

1. `mount(routeName, params, { clock })` forwarding a `FakeClock` into `<ProgressionProvider clock={clock}>`, with the omitted-clock case falling back to `systemClock` so existing call sites stay valid.
2. `Result` and `MasteryResult` registered in `ROUTE_COMPONENTS` so the completion flows (tests 26/27/29a) can run through those screens.
3. A re-mount-from-saved-AsyncStorage-doc helper (`remount(...)`) providing the reopen simulation that tests 26 and 29a depend on.
4. The `comparison.improved` honesty assertion is split per the offered option: the smoke test (§8.29a) asserts the **rendered** "improved"/"last time" comparison copy, while the raw `comparison.improved === true` boolean assertion lives in the pure `coaching.test.ts` §8.14. §8.29a is reworded consistently, and the rationale (`renderedText` observes only rendered strings) is stated.

Verified against source: `__tests__/screens.smoke.test.tsx` currently defines `mount(routeName, params)` with no options object, hard-codes `<ProgressionProvider>` with no `clock` prop, and `ROUTE_COMPONENTS` registers only `Focus`/`CoursePath`/`Progress`. The harness gaps the fix describes are real, and the extensions named are exactly what tests 26/29a/29b/29c need.

### Fix 3 — v1-shaped `store.test.ts` cases rewritten to v2 via `defaultPersistedData()`

CORRECTLY APPLIED.

- §5.3 states the pre-existing v1 round-trip and the two deletion tests are rewritten to the v2 shape via `defaultPersistedData()` (build inputs from the full v2 default, not a v1 literal), and explains WHY they would otherwise break (a loaded v1 doc returns a v2 doc, failing `expect(loaded).toEqual(data)` and `expect(warn).not.toHaveBeenCalled()`).
- The former v1 round-trip explicitly becomes the migrate-and-write-back case §8.18 ("This is the rewritten former v1 round-trip case").
- The deletion cases become §8.25, saving v2 docs so `clearData` → load equals `defaultPersistedData()`.
- §8's persistence header repeats the same mapping, keeping the two sections consistent.

Verified against source: `__tests__/store.test.ts` currently contains exactly the at-risk cases — a `version: 1` round-trip asserting `expect(loaded).toEqual(data)` + `expect(warn).not.toHaveBeenCalled()`, and two `version: 1` deletion tests. The fix targets real tests that would indeed go red post-migration, and the rewrite destination (§8.18 / §8.25) is specified.

### Fix 4 — Dead recompute + import removed from both screens; completion copy driven by `badgeEarned !== null`

CORRECTLY APPLIED.

- §6.2 states both `ResultScreen` and `MasteryResultScreen` drive the existing "You completed the `<level>` level." copy from `badgeEarned !== null` (the same `false→true` completeness edge the local recompute used), and REMOVE the now-dead local `deriveCompletionEvents`/`isLevelComplete` recompute AND its `import { deriveCompletionEvents } from '../../domain/rewards'` (noting eslint would otherwise flag the unused import).
- The §10 entries for both screen files record the removal, so files-touched and the narrative agree.

Verified against source: both `ResultScreen.tsx` and `MasteryResultScreen.tsx` today `import { deriveCompletionEvents } from '../../domain/rewards'`, import `isLevelComplete` from `../../domain/progression`, compute `const events = deriveCompletionEvents(before, after, level, track.id)`, set `justCompletedLevel` from `events.length > 0 || isLevelComplete(...)`, and gate the "You completed the {level.title} level." text on `justCompletedLevel`. The import path named in the fix (`../../domain/rewards`) matches the actual import line exactly, and the copy string matches. The fix is precise and correct. (Note `isLevelComplete` is imported from `../../domain/progression`, not rewards — the fix text says to remove the rewards-path `deriveCompletionEvents` import specifically and the dead `isLevelComplete` recompute usage; it does not misstate the import path for the removed import.)

### Fix 5 — Mastery wrapper return type named `MasteryOutcome` to avoid collision

CORRECTLY APPLIED.

- §6.1 names the mastery wrapper's return type `MasteryOutcome`, explicitly distinct from the domain `MasteryResult` type (`src/domain/assessment`) and the `RootStackParamList.MasteryResult` route param the provider module already references, "so the provider module carries no third same-named symbol and no shadow."
- `CompleteLessonOutcome` is likewise distinct from the domain types.
- The §10 provider entry notes the same naming choice.

Verified against source: `src/ui/navigation/RootNavigator.tsx` defines `MasteryResult: { trackId; levelId; answers: number[] }` as a route param, and `ProgressionProvider.tsx` already imports/uses the domain `MasteryResult` (via the `recordMasteryResult` signature). So two `MasteryResult` symbols already exist in the provider's reference graph; naming the wrapper return `MasteryOutcome` genuinely avoids a third collision. The rationale is sound and the naming is consistent everywhere it appears (§6.1, §6.2, §10, §12.2 Fix 5).

---

## Cross-consistency checks (no new blocking contradictions introduced by the fixes)

- The `CompleteLessonOutcome`/`MasteryOutcome` shapes in §6.1 match how the wrappers return them in the §6.1 pseudocode (`return { outcome, badgeEarned, priorPracticeAttempt }` / `{ outcome, badgeEarned, priorByQuestionId }`) and how §6.2 screens consume them (reading `badgeEarned`, `priorPracticeAttempt`, `priorByQuestionId`). Consistent.
- §8.29a (rendered copy) and §8.14 (raw boolean) do not overlap or contradict — they cover different layers of the same honesty rule. Consistent with Fix 2's split.
- The `badgeEarned !== null` completion-copy driver (Fix 4) matches the badge semantics elsewhere (`applyBadge` fires once on the `false→true` edge, §3.6), so replacing the local recompute with `badgeEarned` is behavior-preserving, not a semantic change. Consistent.
- Fix 1's `practiceAnswer?` param is consistent with §6.2 (ResultScreen passes `route.params.practiceAnswer ?? ''` to `coachPractice`), §6.4 (`practiceAnswer` population + `hadText` rule), and the §10 RootNavigator entry (`Result` gains optional `practiceAnswer?: string`). Consistent.
- Fix 2's `remount` helper is referenced consistently by tests 26 and 29a; the clock seam it forwards matches the §6.1 provider prop `clock = systemClock`. Consistent.

No new ambiguity, no unverified assumption, no conflicting section, and no feasibility gap was found in the five fixes. All five are also grounded in the actual current source, which I read rather than trusting the doc's characterization.

---

## Verified Assumptions

- The provider currently declares `completeLesson`/`recordMasteryResult` as `Promise<void>` and `completeLesson` takes only `(trackId, levelId, lessonId)` — confirmed in `src/ui/context/ProgressionProvider.tsx`. (Supports Fix 1.)
- The smoke-test harness currently has `mount(routeName, params)` with no clock/options and `ROUTE_COMPONENTS = { Focus, CoursePath, Progress }` only — confirmed in `__tests__/screens.smoke.test.tsx`. (Supports Fix 2.)
- `store.test.ts` currently has v1-shaped (`version: 1`) round-trip and deletion tests asserting `toEqual(data)` and `warn not called` — confirmed in `__tests__/store.test.ts`. (Supports Fix 3.)
- Both `ResultScreen.tsx` and `MasteryResultScreen.tsx` currently `import { deriveCompletionEvents } from '../../domain/rewards'`, recompute `events`, derive `justCompletedLevel`, and render "You completed the {level.title} level." from it — confirmed via grep of both files. (Supports Fix 4.)
- `RootStackParamList.MasteryResult` is a route param and the domain `MasteryResult` type is referenced by the provider — confirmed in `RootNavigator.tsx` and `ProgressionProvider.tsx`. (Supports Fix 5's collision rationale.)

## Unverified / Wrong Assumptions

- None. Every fix claim was checkable against the repo source and matched. No design claim about existing code was found to be inaccurate.

---

## Verdict

All 5 mandated fixes are present, specified concretely, internally consistent, and accurately grounded in the actual current source. No new blocking contradiction was introduced.

HIGH findings: 0
MEDIUM findings: 0
NIT findings: 0

Mechanical verdict (HIGH + MEDIUM == 0): **APPROVED**.
