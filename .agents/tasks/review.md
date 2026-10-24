# Goalie Phase 1 — Semantic Code Review

Phase 1 scaffolds the Goalie learning app as an Expo SDK 54 custom-dev-build (React Native + TypeScript) with a real iOS focus-blocking native path. It delivers four things: the pinned SDK 54 dependency matrix + lockfile; a pure-TS content/domain layer (the only runtime-testable logic this phase) with an honest async availability layer; a real Swift Expo native module plus a DeviceActivityMonitor extension wired in by a config plugin that hand-builds the app-extension target through raw pbxproj mutation; and an operator doc that states plainly that on-device blocking is unverifiable here. The central constraint — no device, no paid Apple account, no Family Controls entitlement, and a simulator that cannot run Screen Time — means the native path is compile-only verifiable and is reported UNVERIFIED everywhere it matters.

Watch for: nothing blocking. I reproduced every real build/test command myself — typecheck, lint, the 21 jest tests (including the 5 named loadCatalog cases), the catalog validator, a clean `expo prebuild`, and the iPhone 16 simulator `xcodebuild` which reported **BUILD SUCCEEDED** with the `GoalieMonitor.appex` embedded in `Goalie.app/PlugIns`. Two non-blocking observations: the config plugin's `.js` shim depends on `sucrase` being transitively hoisted (not a direct dep), and `.kiro` is absent — but it never existed in this repo's history, so nothing was removed. (confirmed)

**Verdict**: APPROVED

## High-level view

The dependency matrix in `package.json` matches design §2 exactly — every pin, including the two no-caret React Navigation versions (`7.5.1` / `7.21.0`) that FEAT-001 recorded as resolving without drift. One devDependency beyond the design list, `babel-preset-expo ~54.0.12`, was added as a documented scaffolding fix (it was only reachable nested under `expo/node_modules`, which broke jest transform); it is within the SDK 54 matrix.

The content/domain layer is the real, testable logic. `loadCatalog(raw: unknown): Catalog` is pure (no react/react-native/Node-IO imports), re-validates fail-fast in the §3.1 order, and never returns a partial. The five named tests exist and pass against the real `tracks.json` and inline invalid fixtures. Placeholder modules each export a typed function that throws `NotImplementedError`.

The availability layer honors the §6 precedence NotIOS → Simulator → ExpoGo → OSTooOld → NotAuthorized, with steps 1–4 synchronous (no bridge call off-device) and only step 5 awaiting the native status, fail-closed on `NaN` OS version and on a rejected status call. The Home screen renders the verdict verbatim and can only show "available" when the function resolves `{available:true}` — impossible on the simulator, so no fake blocked state is reachable.

The Swift module enforces the schedule-before-shield invariant: validate with no side effects (reject `E_SESSION_ACTIVE` on a live session, duration bound `[60,86400]`, non-empty selection, approved auth), defensively clear any orphaned schedule, `startMonitoring` first (reject `E_SCHEDULE_FAILED` applying no shields on throw), then apply the shield, then persist `session.v1` with a `UUID().uuidString` id and a `selectionSummary` recomputed from the decoded selection. The whole `FamilyActivitySelection` is serialized to the app group as `Data`; only the count summary crosses the bridge. The extension clears the same named store at `intervalDidEnd`, both sides sourcing identical literals from one shared `GoalieFocusConstants.swift`.

The config plugin adds Family Controls + App Groups to the main app via `withEntitlementsPlist`, templates the extension sources + generated entitlements/Info.plist to disk, then uses the `withXcodeProject` escape hatch to create the app-extension `PBXNativeTarget`, its Sources phase, the Embed-App-Extensions copy phase (`dstSubfolderSpec 13`), and the build settings. The generated project compiles and embeds the `.appex`.

The doc leads with an unmissable UNVERIFIED/compile-only statement and its three reasons, plus the honest-unavailability note. `content/tracks.json` and `scripts/validate-catalog.mjs` are byte-for-byte unchanged since scaffold and the validator still passes.

<details>
<summary>Issues (2)</summary>

1. **Config-plugin shim depends on transitively-hoisted `sucrase`** — `modules/goalie-focus/app.plugin.js` does `require('sucrase/...')` but `sucrase` is not a direct dependency. It resolves today (prebuild succeeded) because it is hoisted under the SDK 54 tree; if a future dependency change de-hoists it, prebuild breaks. Non-blocking; consider adding `sucrase` as an explicit devDependency to harden the build. (confirmed)
2. **`.kiro` absent** — the task asks that `.kiro` stay intact, but it has never existed in this repo (no commit, not on disk, not gitignored). Nothing was removed by the implementation, so there is no regression; flagged only so the planner can confirm `.kiro` was never expected here. (confirmed)

</details>

<details>
<summary>Details</summary>

### Verification actually ran (not grep checks)

I ran the real commands from `/Users/Shared/goalie`, not a static scan:

- `node scripts/validate-catalog.mjs` → `Course catalog structure valid: 3 tracks, 3 levels each.`
- `npm run typecheck` (tsc --noEmit strict) → exit 0.
- `npm run lint` (eslint .) → exit 0, clean.
- `npm test` → 3 suites, 21 tests passed. `catalog.test.ts` contains all five named cases: valid-parse of the real `tracks.json` (3×3), wrong-schema, missing-level, duplicate-id, order.
- `npx expo prebuild --platform ios --clean` → regenerated `ios/` cleanly.
- `WS=$(ls -d ios/*.xcworkspace); SCHEME=…; xcodebuild -workspace "$WS" -scheme Goalie -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO build` → **BUILD SUCCEEDED**.

Environment matched the design's recorded facts: Node v20.19.4, Xcode 16.4 (16F6), only installed iOS SDK 18.5, and an exact `iPhone 16` simulator present. The recorded FEAT verification evidence is therefore accurate and reproducible. (confirmed)

### Compile ceiling — the pbxproj extension target actually builds and embeds

This was the top compile-only risk in the design (§7), so I verified it beyond "BUILD SUCCEEDED". The generated project carries the main-app entitlements (`com.apple.developer.family-controls = true` + the app group), a `GoalieMonitor` group with the monitor + shared constants + generated `GoalieMonitor.entitlements` and `GoalieMonitor-Info.plist` (`NSExtensionPointIdentifier = com.apple.deviceactivity.monitor-extension`), and a `GoalieMonitor.appex` wired into a Copy Files phase. After the build, `Goalie.app/PlugIns/GoalieMonitor.appex/GoalieMonitor` is a compiled binary — the extension target compiled and embedded, not just the main app. The `withXcodeProject` + `xcode@^4.0.0` `addTarget('app_extension', …)` path produces a structurally valid project. (confirmed)

### Schedule-before-shield invariant and token boundary

`startFocusSession` in `GoalieFocusModule.swift` follows §4.3 exactly: the `E_SESSION_ACTIVE` guard keys off `session.v1`; a defensive `stopMonitoring` inside `do/catch` runs before `startMonitoring` to kill any orphaned schedule a prior failed rollback left (closing the double-schedule gap §12 item 5 raised); `startMonitoring` precedes any shield assignment and a throw rejects `E_SCHEDULE_FAILED` with no shields applied; the `selectionSummary` persisted into `session.v1` is recomputed from the decoded selection, not carried from picker time. The implementation correctly observes that ManagedSettings shield assignment does not throw, and keeps the observable rollback (`rollbackShieldAndSchedule`) reachable on the persist-failure path, so the §4.3 step-b unwind semantics are preserved rather than dropped. The opaque `ApplicationToken`/`ActivityCategoryToken` values are encoded as `Data` into the app group and never serialized across the bridge — only `"<n> apps, <m> categories"` crosses. The extension's `intervalDidEnd(for:)` matches the same `DeviceActivityName` and clears the same named `ManagedSettingsStore`, both sides reading one shared `GoalieFocusConstants.swift`. (confirmed)

### Honest availability — no fake blocked state is reachable

`getFocusAvailability` resolves `{available:true}` only after passing all five guards, and guard 2 (`!Device.isDevice`) fail-closes on any simulator before a bridge call is ever made. The OS-version guard treats `null`/empty/malformed `Device.osVersion` as `NaN → OSTooOld`. A rejected `getAuthorizationStatus()` is caught and mapped to `NotAuthorized`. The Home screen's green "available" branch is gated on that same resolution, so in this environment it renders "Unavailable (simulator)" — never a fabricated blocked state, and no JS timer simulates shielding. The JS stub (when the native module is absent or platform ≠ iOS) rejects with `FocusUnavailableError(reason)` rather than an opaque module-not-found. (confirmed)

</details>

<details>
<summary>File map</summary>

- `package.json` — SDK 54 pins per §2 (+ documented `babel-preset-expo` scaffolding dep); scripts typecheck/test/lint/prebuild/validate-catalog.
- `app.config.ts` — name `Goalie` / slug `goalie`, bundle `com.goalie.app`, single `APP_GROUP_ID`, registers the focus plugin via the `.js` shim.
- `src/domain/content/{catalog.ts,catalog.types.ts}` — pure-TS `loadCatalog` + types.
- `src/domain/{assessment,rewards,progression,certificates}/index.ts` — typed placeholders throwing `NotImplementedError`.
- `src/focus/{types.ts,GoalieFocus.ts,availability.ts}` — typed API, honest stub, async §6 precedence.
- `src/ui/navigation/RootNavigator.tsx`, `src/ui/screens/HomeScreen.tsx` — native-stack shell + verdict-rendering Home.
- `modules/goalie-focus/ios/{GoalieFocusConstants.swift,GoalieFocusModule.swift,GoalieFocus.podspec}` — shared constants, main module, pod.
- `modules/goalie-focus/{expo-module.config.json,index.ts,package.json,app.plugin.js}` — module config, re-exports, autolink package, TS-plugin shim.
- `modules/goalie-focus/plugin/withGoalieFocus.ts` — entitlements + `withXcodeProject` pbxproj extension-target mutation.
- `ios-extensions/DeviceActivityMonitor/GoalieMonitor.swift` — shield release at interval end.
- `docs/ios-focus-setup.md` — wiring, signing, device-verify steps, UNVERIFIED/compile-only statement.
- `__tests__/{catalog,placeholders,availability}.test.ts` — 21 tests.
- `content/tracks.json`, `scripts/validate-catalog.mjs` — pre-existing, unchanged (verified via `git diff` vs scaffold).

Full diff: `git diff 413875a^..HEAD` is unavailable (413875a is the root commit); the whole tree on `main` is the change under review.

</details>
