# Design Fix Re-Review — Goalie Phase 1

Scope: focused re-review of the FIVE targeted fixes recorded in §12 of
`/Users/Shared/goalie/.agents/tasks/design.md`. Already-approved parts of the
design are not re-litigated. The design also contains a §13 that responds to a
prior fix re-review (which had corrected the config-plugins version
attribution); that correction is folded into fix 1 below and re-verified against
the npm registry.

Verification was performed against live package sources (no local
`node_modules`/`package.json` exist yet — this is still the design phase), by
packing the exact pinned packages from npm and inspecting their type
declarations and build output, plus `node` checks of the runtime claims.

## Fix-by-fix assessment

### Fix 1 — config-plugin extension-target mechanism (§5 item 3 / §5.1 / §7 / §12.1 / §13.1)
Satisfied. The design routes extension-target creation through the
`withXcodeProject` escape hatch driving raw `pbxproj` mutation via the `xcode`
library, and enumerates the concrete mutations: app-extension `PBXNativeTarget`
(`com.apple.product-type.app-extension`), a `PBXSourcesBuildPhase` compiling
`GoalieMonitor.swift` + shared `GoalieFocusConstants.swift`, dedicated extension
entitlements (Family Controls + App Groups), the extension `Info.plist`
(`NSExtensionPointIdentifier = com.apple.deviceactivity.monitor-extension`),
`IPHONEOS_DEPLOYMENT_TARGET = 16.0`, and a `PBXCopyFilesBuildPhase` with
`dstSubfolderSpec = 13` ("Embed App Extensions") plus a `PBXTargetDependency` on
the main app. `withEntitlementsPlist` is correctly kept separate for the main-app
entitlements (§5 item 1).

Version attribution verified against the npm registry this pass:
- `@expo/config-plugins` `sdk-54` dist-tag = `54.0.6` (confirmed).
- `expo@54.0.38` depends on `@expo/config-plugins ~54.0.6` (confirmed), so it is
  a transitive dep and correctly kept out of the §2 pin table.
- `@expo/config-plugins@54.0.6` depends on `xcode ^4.0.0` (confirmed).
- `withXcodeProject` IS exported by `@expo/config-plugins@54.0.6`
  (`build/plugins/ios-plugins.js` line 165/179; also in `build/index.js` and the
  `.d.ts`). `withEntitlementsPlist` is exported from the same module, matching the
  design's claim that it is a separate helper.

The earlier wrong `58.0.10` attribution flagged in the prior re-review is fully
removed from the current document; no residual `58.0.10` reference remains in the
plugin mechanism. `58.0.10` is correctly identified as the `latest`/SDK-58 line
(registry confirms `latest: 58.0.10`).

### Fix 2 — pinned Expo name 'Goalie' / slug 'goalie' + runtime scheme derivation (§2 / §3 / §8)
Satisfied. §2 adds an "Expo app identity (PINNED)" note fixing `name: "Goalie"`,
`slug: "goalie"` in `app.config.ts`, and explains that `expo prebuild` derives
`ios/Goalie.xcworkspace` and the `Goalie` scheme from `name`. §3's layout header
matches. The §8 compile command does NOT hardcode the names: it resolves the
workspace via `ios/*.xcworkspace` and the scheme at runtime via
`xcodebuild -list`, so a later rename cannot silently break verification. Bundle
ids / app group are correctly stated to be independent of `name`. Internally
consistent.

### Fix 3 — Device.osVersion typed `string | null` → OSTooOld (§6 step 4 / §8)
Satisfied and verified against source. `expo-device@8.0.10`'s
`build/Device.d.ts` declares `export declare const osVersion: string | null;` —
exactly the type the design now states (previously mischaracterized as `string`).
The fail-closed handling is correct: `parseInt(Device.osVersion ?? '', 10)` with
`null`/empty/malformed → `NaN` → treated as `OSTooOld`. Confirmed at runtime:
`parseInt(null,10)` and `parseInt('',10)` are both `NaN`; `"18.5"`→18, `"16.0"`→16
(eligible), `"15.7"`→15 (OSTooOld). The `?? ''` is necessary because
`parseInt(null, 10)` would not type-check under strict TS against a `string | null`
value — the design handles this correctly. The `null → OSTooOld` example is
present in §6 and in the §8 parse-rule test list. `Device.isDevice: boolean`
(used by §6 step 2 Simulator) also confirmed.

### Fix 4 — selectionSummary recomputed from decoded selection.v1 (§4.3 step c)
Satisfied. Step c now states `selectionSummary` is "recomputed from the same
decoded `selection.v1` used to build the shield in step b" — decode the persisted
`FamilyActivitySelection` and format `"<n> apps, <m> categories"` with
`n = applicationTokens.count`, `m = categoryTokens.count`, identical to the §4.4
derivation. It is explicitly NOT carried over from picker time, closing the
stale/empty-summary drift. Consistent with §4.1 (`getActiveSession` returns the
persisted summary) and §4.4 (same count formula). No conflict introduced.

### Fix 5 — defensive stopMonitoring before startMonitoring (§4.3 step a)
Satisfied. Step a now calls `DeviceActivityCenter().stopMonitoring([activityName])`
inside a `do/catch` BEFORE `startMonitoring`, "regardless of session state," to
clear an orphaned schedule left by a prior failed start whose rollback
`stopMonitoring` itself threw. The design correctly explains why the
`E_SESSION_ACTIVE` guard (keyed only off `session.v1`) does not cover this case,
so the defensive clear is the right fix. This is ordering-safe: the defensive
clear precedes the `startMonitoring`, and the schedule-before-shield invariant
(shield only applied after a successful `startMonitoring`) is preserved. No new
conflict with step 3.0 (which still rejects a genuine concurrent start when
`session.v1` exists) or step 4 (`stopFocusSession` idempotency).

## Check for new blocking gaps introduced by the fixes
None found. The five changes are localized and internally consistent with the
surrounding already-approved flow (§4.1 surface, §4.4 constants/serialization, §6
precedence, §8 verification). The §8 scheme selection
(`schemes.find(x => x === "Goalie") ?? schemes[0]`) was verified to behave
correctly even when an extension-related scheme sorts first, and the rationale
(extension app-extension targets emit no shared scheme) is sound.

## Verified Assumptions
- `@expo/config-plugins` `sdk-54` dist-tag is `54.0.6`. (npm registry)
- `expo@54.0.38` depends on `@expo/config-plugins ~54.0.6`. (npm registry)
- `@expo/config-plugins@54.0.6` depends on `xcode ^4.0.0`. (npm registry)
- `@expo/config-plugins@54.0.6` exports `withXcodeProject` and
  `withEntitlementsPlist`. (packed tarball `build/plugins/ios-plugins.js`)
- `expo-device@8.0.10` declares `osVersion: string | null` and
  `isDevice: boolean`. (packed tarball `build/Device.d.ts`)
- `58.0.10` is the `latest`/SDK-58 config-plugins line, not SDK 54. (npm registry)
- Runtime: `parseInt(null,10)`/`parseInt('',10)` → `NaN`; `"18.5"`/`"16.0"`
  eligible, `"15.7"` OSTooOld; scheme `find("Goalie") ?? [0]` selects `Goalie`.
  (node)

## Unverified / Wrong Assumptions
- Swift-side claims in fixes 4 and 5 (`FamilyActivitySelection` JSON round-trip,
  `DeviceActivityCenter().stopMonitoring`/`startMonitoring`, `UUID().uuidString`)
  cannot be compiled or executed in this environment — they are design-level and
  match Apple's documented APIs, but their real behavior is deferred to the
  compile ceiling (§8) and ultimately a physical device. This is consistent with
  the design's own §7 compile-only ceiling and is NOT a blocking finding for this
  focused fix re-review.
- No wrong assumptions found among the five fixes.

## Findings
No HIGH, MEDIUM, or NIT findings. All five targeted fixes are correctly and
completely addressed, verified against live package sources where claims were
checkable, and no fix introduced a new blocking gap.

## Verdict
APPROVED (0 HIGH / 0 MEDIUM / 0 NIT).
