import Foundation

// Single shared constants namespace (design.md §4.4).
//
// This file is compiled into BOTH the main app module target (GoalieFocus pod)
// AND the DeviceActivityMonitor extension target (templated in by the config
// plugin). Because the main app and the extension communicate ONLY through the
// shared app-group UserDefaults, a single mismatched literal silently breaks
// shield release — so every such literal lives here, referenced identically by
// both sides.
enum GoalieFocusConstants {
  /// The shared `UserDefaults(suiteName:)` suite shared by app + extension.
  static let appGroupId = "group.com.goalie.app.focus"

  /// Key for the `Data` blob of the encoded `FamilyActivitySelection`.
  static let selectionKey = "selection.v1"

  /// Key for the JSON of `{ id, deadlineEpochMs, selectionSummary }` active-session metadata.
  static let sessionKey = "session.v1"

  /// The *named* `ManagedSettingsStore` both sides shield / unshield.
  static let managedSettingsStoreName = "goalie.focus"

  /// The monitored `DeviceActivityName` whose interval end triggers shield release.
  static let deviceActivityName = "goalie.focus.session"
}
