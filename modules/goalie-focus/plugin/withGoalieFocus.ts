import {
  ConfigPlugin,
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
} from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

// Config plugin for the Goalie focus feature (design.md §5 / §5.1).
//
// Two responsibilities:
//   1. withEntitlementsPlist — add Family Controls + App Groups to the MAIN app.
//   2. withXcodeProject (the escape hatch) — hand-build the DeviceActivityMonitor
//      app-extension target via raw pbxproj mutation, because @expo/config-plugins
//      exposes no high-level helper for app-extension targets. This is the top
//      compile-only risk (§7): a malformed mutation surfaces as a prebuild or
//      Xcode project-load/compile failure.
//
// The shared app group id is the single source of truth in app.config.ts and is
// passed in here.

const APP_GROUP_ID = 'group.com.goalie.app.focus';
const FAMILY_CONTROLS_KEY = 'com.apple.developer.family-controls';
const APP_GROUPS_KEY = 'com.apple.security.application-groups';

// DeviceActivityMonitor extension identity (§5 item 3 / §5.1).
const EXT_NAME = 'GoalieMonitor';
const EXT_BUNDLE_ID = 'com.goalie.app.DeviceActivityMonitor';
const EXT_POINT_IDENTIFIER = 'com.apple.deviceactivity.monitor-extension';
const EXT_PRINCIPAL_CLASS = '$(PRODUCT_MODULE_NAME).GoalieMonitor';
const DEPLOYMENT_TARGET = '16.0';
const DEV_TEAM_PLACEHOLDER = '<<APPLE_TEAM_ID>>';

type PluginOptions = { appGroupId?: string };

// ---------------------------------------------------------------------------
// 1. Main-app entitlements (§5 item 1).
// ---------------------------------------------------------------------------
const withMainAppEntitlements: ConfigPlugin<PluginOptions> = (config, { appGroupId = APP_GROUP_ID } = {}) =>
  withEntitlementsPlist(config, (cfg) => {
    cfg.modResults[FAMILY_CONTROLS_KEY] = true;
    const existing = cfg.modResults[APP_GROUPS_KEY];
    const groups = Array.isArray(existing) ? (existing as string[]) : [];
    if (!groups.includes(appGroupId)) {
      groups.push(appGroupId);
    }
    cfg.modResults[APP_GROUPS_KEY] = groups;
    return cfg;
  });

// ---------------------------------------------------------------------------
// Template the extension source + generated files into ios/<EXT_NAME>/.
// Runs as a dangerous mod so the files exist on disk before the pbxproj
// references them. The shared constants file is copied in alongside the monitor
// so the extension target compiles its own copy (§4.4 / §5.1).
// ---------------------------------------------------------------------------
function extEntitlements(appGroupId: string): string {
  const groupItems = `\t\t<string>${appGroupId}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>${FAMILY_CONTROLS_KEY}</key>
\t<true/>
\t<key>${APP_GROUPS_KEY}</key>
\t<array>
${groupItems}
\t</array>
</dict>
</plist>
`;
}

function extInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundleDisplayName</key>
\t<string>${EXT_NAME}</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundlePackageType</key>
\t<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
\t<key>CFBundleShortVersionString</key>
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>$(CURRENT_PROJECT_VERSION)</string>
\t<key>NSExtension</key>
\t<dict>
\t\t<key>NSExtensionPointIdentifier</key>
\t\t<string>${EXT_POINT_IDENTIFIER}</string>
\t\t<key>NSExtensionPrincipalClass</key>
\t\t<string>${EXT_PRINCIPAL_CLASS}</string>
\t</dict>
</dict>
</plist>
`;
}

const withExtensionFiles: ConfigPlugin<PluginOptions> = (config, { appGroupId = APP_GROUP_ID } = {}) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;
      const extDir = path.join(iosRoot, EXT_NAME);
      fs.mkdirSync(extDir, { recursive: true });

      // Monitor source (templated from ios-extensions/DeviceActivityMonitor/).
      const monitorSrc = path.join(
        projectRoot,
        'ios-extensions',
        'DeviceActivityMonitor',
        'GoalieMonitor.swift'
      );
      fs.copyFileSync(monitorSrc, path.join(extDir, 'GoalieMonitor.swift'));

      // Shared constants compiled into this target too (§4.4).
      const constantsSrc = path.join(
        projectRoot,
        'modules',
        'goalie-focus',
        'ios',
        'GoalieFocusConstants.swift'
      );
      fs.copyFileSync(constantsSrc, path.join(extDir, 'GoalieFocusConstants.swift'));

      // Generated extension entitlements + Info.plist.
      fs.writeFileSync(path.join(extDir, `${EXT_NAME}.entitlements`), extEntitlements(appGroupId));
      fs.writeFileSync(path.join(extDir, `${EXT_NAME}-Info.plist`), extInfoPlist());

      return cfg;
    },
  ]);

// ---------------------------------------------------------------------------
// 2. pbxproj mutation — create + embed the app-extension target (§5.1).
// ---------------------------------------------------------------------------
const withExtensionTarget: ConfigPlugin<PluginOptions> = (config) =>
  withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;

    // Idempotency: if the target already exists (re-run without --clean), skip.
    if (proj.pbxTargetByName(EXT_NAME)) {
      return cfg;
    }

    // --- Create the app-extension PBXNativeTarget. ---
    // addTarget with 'app_extension' also: creates an XCConfigurationList with
    // Debug/Release, a product .appex file, a "Embed App Extensions" copy-files
    // phase (dstSubfolderSpec 13) on the first (main app) target, and a target
    // dependency so the extension builds first (§5.1).
    const target = proj.addTarget(EXT_NAME, 'app_extension', EXT_NAME, EXT_BUNDLE_ID);

    // --- Sources build phase compiling the monitor + shared constants. ---
    proj.addBuildPhase(
      ['GoalieMonitor.swift', 'GoalieFocusConstants.swift'],
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid
    );

    // Frameworks phase (keeps the target shape complete for Xcode).
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    // --- Project-tree group holding the extension's files. ---
    const group = proj.addPbxGroup(
      [
        'GoalieMonitor.swift',
        'GoalieFocusConstants.swift',
        `${EXT_NAME}-Info.plist`,
        `${EXT_NAME}.entitlements`,
      ],
      EXT_NAME,
      EXT_NAME
    );
    // Attach the group under the project's main group.
    const groups = proj.hash.project.objects.PBXGroup;
    Object.keys(groups).forEach((key) => {
      if (
        typeof groups[key] === 'object' &&
        groups[key].name === undefined &&
        groups[key].path === undefined &&
        groups[key].isa === 'PBXGroup'
      ) {
        proj.addToPbxGroup(group.uuid, key);
      }
    });

    // --- Build settings on BOTH Debug + Release for the new target. ---
    const configurations = proj.pbxXCBuildConfigurationSection();
    const buildListId = proj.hash.project.objects.PBXNativeTarget[target.uuid].buildConfigurationList;
    const configRefs = proj.hash.project.objects.XCConfigurationList[buildListId].buildConfigurations;

    configRefs.forEach(({ value }: { value: string }) => {
      const settings = configurations[value].buildSettings;
      settings.PRODUCT_BUNDLE_IDENTIFIER = `"${EXT_BUNDLE_ID}"`;
      settings.PRODUCT_NAME = '"$(TARGET_NAME)"';
      settings.INFOPLIST_FILE = `"${EXT_NAME}/${EXT_NAME}-Info.plist"`;
      settings.CODE_SIGN_ENTITLEMENTS = `"${EXT_NAME}/${EXT_NAME}.entitlements"`;
      settings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
      settings.DEVELOPMENT_TEAM = `"${DEV_TEAM_PLACEHOLDER}"`;
      settings.CODE_SIGN_STYLE = 'Automatic';
      settings.SWIFT_VERSION = '5.9';
      settings.SWIFT_EMIT_LOC_STRINGS = 'YES';
      settings.CURRENT_PROJECT_VERSION = '1';
      settings.MARKETING_VERSION = '1.0.0';
      settings.GENERATE_INFOPLIST_FILE = 'YES';
      settings.SKIP_INSTALL = 'YES';
      settings.TARGETED_DEVICE_FAMILY = '"1,2"';
      settings.LD_RUNPATH_SEARCH_PATHS =
        '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
    });

    return cfg;
  });

// ---------------------------------------------------------------------------
// Compose. Order: main entitlements, template files to disk, then mutate pbxproj.
// ---------------------------------------------------------------------------
const withGoalieFocus: ConfigPlugin<PluginOptions | void> = (config, options) => {
  const opts: PluginOptions = options ?? {};
  config = withMainAppEntitlements(config, opts);
  config = withExtensionFiles(config, opts);
  config = withExtensionTarget(config, opts);
  return config;
};

export default withGoalieFocus;
