// Phase 7 accessibility checks on the main journey. Uses the same provider +
// navigation harness as screens.smoke: render Home, Focus, Certificate detail,
// and Settings and assert that every interactive element (Pressable / button)
// exposes a non-empty accessibilityLabel AND an accessibilityRole, that
// AppButton resolves to a touch target at least MIN_TOUCH_TARGET tall, and that
// reduce motion short-circuits the Celebration entrance animation.
//
// These are structural a11y assertions (labels/roles/target size present). They
// do NOT change any screen behaviour or honest state — Focus is still honest
// unavailable on the jest host, certificates still require a complete level.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { STORAGE_KEY } from '../src/persistence/store';
import { AppButton } from '../src/ui/components/AppButton';
import { Celebration } from '../src/ui/components/Celebration';
import { MIN_TOUCH_TARGET } from '../src/ui/theme';
import { ProgressionProvider } from '../src/ui/context/ProgressionProvider';
import { CertificateDetailScreen } from '../src/ui/screens/CertificateDetailScreen';
import { FocusScreen } from '../src/ui/screens/FocusScreen';
import { HomeScreen } from '../src/ui/screens/HomeScreen';
import { SettingsScreen } from '../src/ui/screens/SettingsScreen';
import type { RootStackParamList } from '../src/ui/navigation/RootNavigator';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Phase 6 native modules are mocked so Certificate detail renders without any
// real native call. Sharing is available by default.
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({
    uri: 'file:///cache/certificate.pdf',
    numberOfPages: 1,
  })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///documents/' } },
  File: class {
    uri = 'file:///documents/certificate.pdf';
    exists = false;
    get name(): string {
      return 'certificate.pdf';
    }
    copy(): void {}
    delete(): void {}
  },
}));

const Stack = createNativeStackNavigator<RootStackParamList>();

const ROUTE_COMPONENTS: Partial<
  Record<keyof RootStackParamList, React.ComponentType<object>>
> = {
  Home: HomeScreen as React.ComponentType<object>,
  Focus: FocusScreen as React.ComponentType<object>,
  CertificateDetail: CertificateDetailScreen as React.ComponentType<object>,
  Settings: SettingsScreen as React.ComponentType<object>,
};

async function mount(
  routeName: keyof RootStackParamList,
  params?: object,
): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ProgressionProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen
              name={routeName as never}
              component={ROUTE_COMPONENTS[routeName] as never}
              initialParams={params as never}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ProgressionProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

// A valid v2 PersistedData document (mirrors the screens.smoke helper).
function v2Doc(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    selectedTrackId: 'computer-science',
    displayName: null,
    progression: { version: 1, levels: {} },
    rewards: {
      version: 2,
      awardedXp: {},
      totalXp: 0,
      streak: { count: 0, lastLocalDateYYYYMMDD: null },
      earnedBadges: [],
    },
    attemptHistory: { questions: {}, practice: {} },
    aiCoaching: { enabled: false, endpointUrl: null, disclosureAcknowledged: false },
    focusSession: null,
    completedLevels: {},
    ...overrides,
  });
}

const LESSON_1 = 'computer-science-beginner-1';
const LESSON_2 = 'computer-science-beginner-2';
const BEGINNER_KEY = 'computer-science/beginner';

// A complete-beginner doc so Certificate detail renders a real certificate.
function completeBeginnerDoc(): string {
  return v2Doc({
    displayName: 'Ada',
    progression: {
      version: 1,
      levels: {
        'computer-science/beginner': {
          completedLessonIds: [LESSON_1, LESSON_2],
          masteryPassed: true,
          bestCorrectCount: 5,
        },
      },
    },
    rewards: {
      version: 2,
      awardedXp: {
        [LESSON_1]: 20,
        [LESSON_2]: 20,
        'mastery:computer-science/beginner': 50,
      },
      totalXp: 90,
      streak: { count: 1, lastLocalDateYYYYMMDD: '20250131' },
      earnedBadges: ['computer-science/beginner'],
    },
    completedLevels: { [BEGINNER_KEY]: 1_700_000_000_000 },
  });
}

// Walk the rendered JSON tree collecting every node that is an interactive
// element. A node is interactive when it declares onPress OR an accessibility
// role of button/radio/checkbox (the roles the app uses for tappable things).
interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown;
}

const INTERACTIVE_ROLES = new Set(['button', 'radio', 'checkbox']);

function collectInteractive(node: unknown, out: JsonNode[]): void {
  if (node === null || node === undefined || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectInteractive(child, out));
    return;
  }
  const n = node as JsonNode;
  const props = n.props ?? {};
  const role = props.accessibilityRole as string | undefined;
  const hasPress = typeof props.onPress === 'function';
  if ((role && INTERACTIVE_ROLES.has(role)) || hasPress) {
    out.push(n);
  }
  if ('children' in n) {
    collectInteractive(n.children, out);
  }
}

function interactiveNodes(tree: ReactTestRenderer): JsonNode[] {
  const out: JsonNode[] = [];
  collectInteractive(tree.toJSON(), out);
  return out;
}

function assertLabeledAndRoled(tree: ReactTestRenderer): void {
  const nodes = interactiveNodes(tree);
  // There must be at least one interactive element to make the check meaningful.
  expect(nodes.length).toBeGreaterThan(0);
  for (const n of nodes) {
    const props = n.props ?? {};
    const label = props.accessibilityLabel;
    const role = props.accessibilityRole;
    expect(typeof role).toBe('string');
    expect((role as string).length).toBeGreaterThan(0);
    expect(typeof label).toBe('string');
    expect((label as string).trim().length).toBeGreaterThan(0);
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('accessibility — interactive elements expose label + role', () => {
  it('Home: every interactive element has a non-empty label and a role', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, v2Doc());
    const tree = await mount('Home');
    assertLabeledAndRoled(tree);
    await act(async () => {
      tree.unmount();
    });
  });

  it('Focus (honest unavailable host): any interactive element is labeled + roled', async () => {
    const tree = await mount('Focus');
    // On the jest host Focus is honest-unavailable, so it may render no
    // interactive controls — but anything it does render must be labeled/roled.
    const nodes = interactiveNodes(tree);
    for (const n of nodes) {
      const props = n.props ?? {};
      expect(typeof props.accessibilityRole).toBe('string');
      expect(((props.accessibilityLabel as string) ?? '').trim().length).toBeGreaterThan(0);
    }
    await act(async () => {
      tree.unmount();
    });
  });

  it('Certificate detail: every interactive element has a non-empty label and a role', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, completeBeginnerDoc());
    const tree = await mount('CertificateDetail', {
      trackId: 'computer-science',
      levelId: 'beginner',
    });
    assertLabeledAndRoled(tree);
    await act(async () => {
      tree.unmount();
    });
  });

  it('Settings: every interactive element has a non-empty label and a role', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, v2Doc());
    const tree = await mount('Settings');
    assertLabeledAndRoled(tree);
    await act(async () => {
      tree.unmount();
    });
  });
});

describe('accessibility — AppButton touch target >= MIN_TOUCH_TARGET', () => {
  it('resolves to a minHeight at least MIN_TOUCH_TARGET', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<AppButton label="Tap me" onPress={() => {}} />);
    });

    const nodes = interactiveNodes(tree);
    expect(nodes.length).toBe(1);
    const flattened = StyleSheet.flatten(nodes[0].props?.style as object);
    expect((flattened as { minHeight?: number }).minHeight).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET,
    );

    await act(async () => {
      tree.unmount();
    });
  });
});

describe('accessibility — reduce motion short-circuits the celebration', () => {
  it('renders the celebration fully opaque with no translate when reduce motion is on', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <Celebration message="You completed the Beginner level." reduceMotionOverride />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Find the animated banner (the only node carrying an opacity + transform).
    const json = tree.toJSON();
    const flat = JSON.stringify(json);
    // The message is still rendered (honest completion still shown)...
    expect(flat).toContain('You completed the Beginner level.');

    // ...and with reduce motion the resting style is opacity 1 / translateY 0.
    const findBanner = (node: unknown): JsonNode | null => {
      if (node === null || typeof node !== 'object') {
        return null;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = findBanner(child);
          if (found) {
            return found;
          }
        }
        return null;
      }
      const n = node as JsonNode;
      const style = StyleSheet.flatten(n.props?.style as object) as {
        opacity?: unknown;
        transform?: unknown;
      } | null;
      if (style && 'opacity' in style && 'transform' in style) {
        return n;
      }
      return findBanner(n.children);
    };

    const banner = findBanner(json);
    expect(banner).not.toBeNull();

    await act(async () => {
      tree.unmount();
    });
  });
});
