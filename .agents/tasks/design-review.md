# Design Review — Goalie Phase 1

Reviewed document: `/Users/Shared/goalie/.agents/tasks/design.md`
Reviewer: fresh design-review pass (no prior authoring context).
Method: every factual/version/API claim was independently verified against the npm registry, the installed toolchain, the `@expo/config-plugins` package surface, the preserved content file, and the existing validator. This is the design's third revision (it logs responses to two prior reviews in §10/§11); this review judges the current text on its own merits.

## Verdict inputs

Findings below are counted mechanically: any HIGH or MEDIUM ⇒ `CHANGES_REQUESTED`. This review records **2 MEDIUM** and **3 NIT**, so the verdict is **CHANGES_REQUESTED**.

The design is strong overall — the version matrix is accurate, the ordering invariant is correct and well-specified, the availability layer is honest, and the feasibility ceiling is stated plainly. The two MEDIUM findings are a genuine unaddressed feasibility gap (how extension targets are actually injected) and an unstated assumption that the verification command depends on (the Xcode scheme/workspace name). Neither is a rewrite; both are "name the mechanism / pin the value" fixes.

---

## Findings

### 1. MEDIUM — §5: the mechanism for injecting the DeviceActivityMonitor extension target is unspecified, and it is the single hardest step in the whole native build.

Where: §5 items 3 ("adds a DeviceActivityMonitor extension target with bundle id ... embedding `GoalieMonitor.swift` ... with the `com.apple.deviceactivity.monitor-extension` point and the Family Controls + App Groups entitlements").

Problem: the design states the config plugin "adds" a full iOS app-extension target as if that were a supported one-liner. It is not. I inspected `@expo/config-plugins` (packed `expo-config-plugins@58.0.10`): the public surface exported from `index.d.ts` is `withXcodeProject`, `withDangerousMod`, `withEntitlementsPlist`, `withInfoPlist`, `withPodfile`, etc. There is **no exported high-level helper to create a new `PBXNativeTarget`** with its own sources build phase, its own entitlements file, the extension point plist, and the "embed app extensions" copy-files phase into the host app. The only path is the escape hatch `withXcodeProject`, which hands you the raw project via the `xcode` npm library, and you then hand-build the target, build phases, build configurations, product reference, and embed phase yourself (or depend on a community package such as the `@config-plugins/*` family). This is the most fragile, least-documented part of the entire plugin and the brief explicitly demands the native path be real ("make it actually working"). Leaving the mechanism unnamed means the implementer hits the hardest wall with zero guidance, and "compile-only verification" (§7/§8) is exactly where a malformed pbxproj target surfaces — so this gates the one thing this phase *can* verify.

Note the entitlements injection in §5 item 1 is fine: `com.apple.developer.family-controls` and `com.apple.security.application-groups` go through the well-supported `withEntitlementsPlist`. The gap is specifically the *extension target creation*.

Concrete fix: name the mechanism and pin it in §5. Either:
- (a) State the plugin uses `withXcodeProject` + the `xcode` library directly and enumerate the required mutations: create the `PBXNativeTarget` (productType `com.apple.product-type.app-extension`), add a Sources build phase referencing `GoalieMonitor.swift`, add a dedicated `GoalieMonitor.entitlements` with Family Controls + App Groups, set `INFOPLIST_KEY`/`NSExtensionPointIdentifier = com.apple.deviceactivity.monitor-extension`, set the extension's deployment target to 16.0, and add an "Embed App Extensions" (or `PBXCopyFilesBuildPhase`, dstSubfolderSpec 13) phase to the main app target that copies the extension product. Or
- (b) Adopt a named community config-plugin helper for extension targets and pin its version in §2, with a one-line fallback note if it lags SDK 54.

Add a line to §7 acknowledging that pbxproj target injection is the highest-risk step even within the compile-only ceiling.

### 2. MEDIUM — §8: the `xcodebuild` verification command hardcodes `ios/Goalie.xcworkspace` and `-scheme Goalie`, but the design never pins the Expo app `name`/`slug` those names derive from.

Where: §8 row `xcodebuild -workspace ios/Goalie.xcworkspace -scheme Goalie ...`; §3 lists `app.config.ts` but specifies no `name`/`slug`.

Problem: `expo prebuild` derives the `.xcworkspace` filename and the Xcode scheme from the Expo config `name`. The design pins bundle ids (`com.goalie.app`) and the app group, but never pins `name`/`slug`. If the implementer sets `name: "goalie"` (lowercase, matching the repo and the git branch) or anything other than exactly `Goalie`, the §8 command fails with "workspace not found" / "scheme not found" — and since this `xcodebuild` invocation is the stated compile ceiling, the whole verification story breaks on an unstated assumption. This is the kind of self-consistency gap a fresh implementer cannot resolve without guessing.

Concrete fix: in §2 or §3, pin the Expo config `name` and `slug` explicitly, e.g. `name: "Goalie"`, `slug: "goalie"`, and state in §8 that the workspace/scheme names follow from `name` (so if `name` changes, the command's `Goalie.xcworkspace`/`-scheme Goalie` change with it). Alternatively, make the §8 command robust by deriving the scheme at runtime (`xcodebuild -list -workspace ios/*.xcworkspace`) rather than hardcoding `Goalie`.

### 3. NIT — §6 step 4: `Device.osVersion` is typed `string | null`, but the text treats it as always a string.

Where: §6 step 4 ("read from `Device.osVersion` ... which is a string like `"18.5"`").

Problem: I verified the shipped type in `expo-device@8.0.10` (`build/Device.d.ts`): `export declare const osVersion: string | null;`. The spec text asserts it is a string. Runtime behavior is actually safe — `parseInt(null, 10)` is `NaN`, and the documented fail-closed rule maps `NaN → OSTooOld` — so the code works, but the spec's stated type is wrong, which can mislead the implementer into skipping an explicit null guard or writing a type assertion that trips `strict` mode.

Concrete fix: change the text to "`Device.osVersion` is `string | null`; a `null` or malformed value yields `NaN` from `parseInt` and is treated as `OSTooOld` (fail-closed)." Add `null` to the §6/§8 worked examples ("`null` → OSTooOld").

### 4. NIT — §4.4: `selectionSummary` is persisted in the `session.v1` blob, but the write step in §4.3c does not say where its value comes from, and the picker (§4.3 step 2) is where the summary is first derived.

Where: §4.4 session key row (`{ id, deadlineEpochMs, selectionSummary }`); §4.3 step c ("store `{ id, deadlineEpochMs, selectionSummary }`").

Problem: `summary` is defined in §4.4 as derived from the *selection's* token counts (`"<n> apps, <m> categories"`). But `startFocusSession` (§4.3 step c) persists `selectionSummary` into the session without stating it recomputes it by decoding `selection.v1` at that point. It is inferable, but a fresh implementer could reasonably persist an empty/stale summary. Small ambiguity in an otherwise fully-pinned app-group contract.

Concrete fix: in §4.3 step c, state explicitly: "`selectionSummary` is recomputed here by decoding `selection.v1` and formatting `"<n> apps, <m> categories"` (same derivation as §4.4), so the session's summary always matches the selection used to build the shield."

### 5. NIT — §4.3 step 3.0 vs §4.1: the `E_SESSION_ACTIVE` concurrency guard keys off "the `session.v1` key exists," but a failed start (§4.3 step 3b) is defined to leave no session persisted — so a *stranded schedule with no session* is not detected by the start guard.

Where: §4.3 step 3.0 (reject `E_SESSION_ACTIVE` "if ... the `session.v1` key exists") and §4.3 step 3b rollback (which on a secondary `stopMonitoring` failure "may still [leave] a schedule live" but persists no session).

Problem: the design itself notes a failed step 3b can leave a live `DeviceActivity` schedule while persisting no `session.v1`. A subsequent `startFocusSession` then passes the step-3.0 guard (no session key present), proceeds to `startMonitoring` with the same activity name, and double-schedules against a possibly-still-live monitor. The design's own mitigation ("worst case self-heals at the deadline, and `stopFocusSession()` can force-clear") is reasonable, but the start path does not call that mitigation, so the self-heal relies on the caller having run `stopFocusSession()` first — which is not stated as a precondition of restart after a failed start.

Concrete fix: either (a) have step 3.0 (or step a) defensively call `stopMonitoring([activityName])` before `startMonitoring` to clear any orphaned schedule regardless of session state, or (b) document that after any `E_SHIELD_FAILED`/`E_SCHEDULE_FAILED` the caller MUST call `stopFocusSession()` before retrying, and reference that from §4.2's operation-failure contract.

---

## Verified Assumptions (independently checked, correct)

- **Toolchain.** `node v20.19.4`, `npm 11.7.0`, `Xcode 16.4 (16F6)` — all match §2/§8 exactly (`node -v`, `npm -v`, `xcodebuild -version`).
- **iOS SDK is 18.5, not 18.6.** `xcodebuild -showsdks` reports only `iphoneos18.5` / `iphonesimulator18.5`. §8's "iOS 18.5 in this environment" is correct, and the instruction to let `xcodebuild` select the installed runtime (no hardcoded patch) is sound.
- **`expo@54.0.38` is the real `sdk-54` dist-tag head.** `npm view expo dist-tags` confirms `sdk-54: 54.0.38`.
- **SDK tag characterization (§2/§9) is accurate.** Registry dist-tags: `sdk-55: 55.0.32`, `sdk-56: 56.0.24`, `sdk-57: 57.0.31` (all stable), `next: 58.0.11`, `latest: 58.0.17`, with a separate `canary`/`canary-sdk-55`/`canary-sdk-56` series. The design's statement that 55–57 are published stable lines, 58 is next/latest, and canary is a separate tag series is correct (this was the §11 finding-7 fix and it landed correctly).
- **Core RN/React pins.** `react-native@0.81.5`, `react@19.1.0` exist and match SDK 54's `bundledNativeModules.json` (verified by unpacking `expo@54.0.38` and reading the matrix: `react 19.1.0`, `react-native 0.81.5`).
- **Bundled-module pins all match the matrix.** `react-native-safe-area-context ~5.6.0`, `react-native-screens ~4.16.0`, `expo-device ~8.0.10`, `expo-constants ~18.0.14`, `expo-dev-client ~6.0.21`, `expo-build-properties ~1.0.10`, `jest-expo ~54.0.18`, and the noted-but-excluded `react-native-reanimated ~4.1.1` / `react-native-gesture-handler ~2.28.0`, plus the `expo-router ~6.0.24` alternative — every value in §2 matches `bundledNativeModules.json` exactly.
- **React Navigation pins exist and are the current heads.** `@react-navigation/native@7.5.1` and `@react-navigation/native-stack@7.21.0` both resolve and are the current `latest` for each — consistent with §2's "exact, no caret" instruction.
- **Tooling pins exist.** `typescript@5.9.3`, `jest@29.7.0`, `jest-expo@54.0.18`, `eslint-config-expo@10.0.0` all resolve.
- **jest-expo@54 is built against Jest 29.** Its dependencies include `@jest/globals ^29.2.1`, `babel-jest ^29.2.1`, `jest-environment-jsdom ^29.2.1`, `react-test-renderer 19.1.0` — so pinning `jest ~29.7.0` (§2) is consistent.
- **`expo-device` API used by §6 exists.** `Device.isDevice: boolean` and `Device.osVersion` are both present in `expo-device@8.0.10` type declarations.
- **Preserved content is intact and matches §3.1.** `content/tracks.json` is `schemaVersion: 1` with 3 tracks × 3 levels (`beginner/intermediate/advanced`, lessons `[]`), exactly as the parse contract and tests describe.
- **Existing validator matches §3.1's described invariants.** `scripts/validate-catalog.mjs` enforces schemaVersion===1, unique track ids, title/description present, levels equal to `beginner,intermediate,advanced` in order, level title/objective present, lessons array — and separately the three required starter tracks. The design's claim that the required-starter-tracks check is content policy that stays in the build-time validator (not the domain parser) is accurate.
- **No application code exists yet.** Workspace contains only `.agents/`, `.git/`, `content/`, `scripts/` — consistent with "no application code in this step," and the preserved files are present.

## Unverified / Wrong Assumptions

- **WRONG (minor): `Device.osVersion` type.** §6 step 4 calls it "a string"; the shipped type is `string | null` (Finding 3). Behavior is safe via fail-closed `NaN` handling, but the stated type is incorrect.
- **UNVERIFIED (structural, by design): all on-device Screen Time behavior.** Authorization, `FamilyActivityPicker` selection, `ManagedSettings` shield apply/remove, and `DeviceActivityMonitor` release-at-deadline cannot be exercised here — no device, no paid Apple Developer account, no Family Controls entitlement, simulator unsupported. The design states this explicitly (§7) and caps verification at compile-only; this is correctly scoped, not a defect.
- **UNVERIFIED (feasibility): config-plugin extension-target injection actually compiles.** I confirmed the public `@expo/config-plugins` API offers no high-level extension-target helper (only `withXcodeProject`/`withDangerousMod` escape hatches), which is the basis for Finding 1. Whether a hand-built pbxproj extension target prebuilds and compiles cleanly is the exact thing that must be proven in the compile-only step — and it cannot be assessed from the design text alone because the mechanism is unspecified.
- **UNVERIFIED (not run): the §8 command set.** `npm install`, `npm run typecheck/lint/test`, `expo prebuild`, and `xcodebuild` were not executed (no code exists yet). The commands are plausible and well-targeted; their success is the implementer's to demonstrate. Note Finding 2's scheme/workspace-name dependency affects the `xcodebuild` row.

---

## Summary

2 MEDIUM + 3 NIT ⇒ **CHANGES_REQUESTED**. The version matrix, ordering invariant, honest-availability design, and feasibility framing are all verified-correct and ready. To clear the gate: (1) specify *how* the config plugin creates the DeviceActivityMonitor extension target (raw `withXcodeProject`/`xcode` mutations or a named pinned helper) and flag it as the top compile-risk; (2) pin the Expo `name`/`slug` so the §8 `xcodebuild` workspace/scheme names are not an unstated assumption. The three NITs (osVersion nullability, session-summary derivation source, and the orphaned-schedule-vs-start-guard edge) are quick clarifications.
