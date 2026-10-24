// Available-path tests for FocusScreen. getFocusAvailability() is mocked to
// report available:true and the whole native GoalieFocus surface is mocked, so
// NO real native call is made. These prove the reconcile-driven active state and
// a working emergency release, plus the honest non-active outcome on a native
// startFocusSession rejection. The real-host honest-unavailable contract lives in
// screens.smoke.test.tsx and is left intact.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { GoalieFocus } from '../src/focus/GoalieFocus';
import { FocusSession } from '../src/focus/types';
import { ProgressionProvider } from '../src/ui/context/ProgressionProvider';
import { FocusScreen } from '../src/ui/screens/FocusScreen';
import type { RootStackParamList } from '../src/ui/navigation/RootNavigator';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Force the available verdict (the host is not a real iOS device).
jest.mock('../src/focus/availability', () => ({
  getFocusAvailability: jest.fn(async () => ({ available: true })),
}));

// Mock the entire native surface; every method is a jest.fn we control per test.
jest.mock('../src/focus/GoalieFocus', () => ({
  GoalieFocus: {
    getAuthorizationStatus: jest.fn(),
    requestAuthorization: jest.fn(),
    presentActivityPicker: jest.fn(),
    getSelection: jest.fn(),
    startFocusSession: jest.fn(),
    stopFocusSession: jest.fn(),
    getActiveSession: jest.fn(),
  },
  isNativeModuleAvailable: jest.fn(() => true),
}));

// The mocked surface, pulled for per-test configuration.
const mockNative = GoalieFocus as jest.Mocked<typeof GoalieFocus>;

const Stack = createNativeStackNavigator<RootStackParamList>();

function collectText(node: unknown, out: string[]): void {
  if (node === null || node === undefined) {
    return;
  }
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out));
    return;
  }
  if (typeof node === 'object' && 'children' in (node as Record<string, unknown>)) {
    collectText((node as { children: unknown }).children, out);
  }
}

function renderedText(tree: ReactTestRenderer): string {
  const json = tree.toJSON();
  const out: string[] = [];
  collectText(json, out);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// Find the first node whose rendered text matches, returning it for press.
interface TestNode {
  props: Record<string, unknown>;
  type: unknown;
}

// react-test-renderer's bundled types do not expose `root`; access it via a
// narrow cast rather than widening the whole module.
interface TestInstance {
  props: Record<string, unknown>;
  children: unknown[];
}
interface RootAccess {
  root: {
    findAll(
      predicate: (node: TestInstance) => boolean,
      options?: { deep?: boolean },
    ): TestInstance[];
  };
}

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ProgressionProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen
              name={'Focus' as never}
              component={FocusScreen as never}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ProgressionProvider>,
    );
  });
  // Let the provider load + the availability/selection/reconcile settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

// Locate a pressable by its accessibility role + visible label text.
function findButton(
  tree: ReactTestRenderer,
  label: string,
): TestNode | undefined {
  const root = (tree as unknown as RootAccess).root;
  const matches = root.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      renderedChildText(node).includes(label),
    { deep: true },
  );
  return matches[0] as unknown as TestNode | undefined;
}

function renderedChildText(node: {
  children?: unknown[];
}): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (n && typeof n === 'object') {
      const children = (n as { children?: unknown[] }).children;
      if (Array.isArray(children)) {
        children.forEach(walk);
      }
    }
  };
  (node.children ?? []).forEach(walk);
  return out.join(' ');
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  // Default: no selection yet, no active session.
  mockNative.getSelection.mockResolvedValue(null);
  mockNative.getActiveSession.mockResolvedValue(null);
});

describe('FocusScreen (available path, mocked native)', () => {
  it('renders the disclosure before any Start affordance, with Start gated on a selection', async () => {
    const tree = await mount();
    const text = renderedText(tree);

    // Explicit disclosure of what will happen is present.
    expect(text).toContain('blocked on this device');
    expect(text).toContain('releases automatically at the deadline');
    expect(text.toLowerCase()).toContain('emergency release');

    // No selection yet -> the Start button is disabled.
    const startButton = findButton(tree, 'Start focus');
    expect(startButton).toBeDefined();
    expect(startButton?.props.accessibilityState).toEqual({ disabled: true });

    await act(async () => {
      tree.unmount();
    });
  });

  it('enables Start once a valid selection exists', async () => {
    mockNative.getSelection.mockResolvedValue({ summary: '3 apps' });

    const tree = await mount();

    const startButton = findButton(tree, 'Start focus');
    expect(startButton?.props.accessibilityState).toEqual({ disabled: false });

    await act(async () => {
      tree.unmount();
    });
  });

  it('leaves the UI non-active with an honest error when startFocusSession rejects', async () => {
    mockNative.getSelection.mockResolvedValue({ summary: '3 apps' });
    mockNative.startFocusSession.mockRejectedValue(
      new Error('E_SCHEDULE_FAILED'),
    );

    const tree = await mount();
    const startButton = findButton(tree, 'Start focus');

    await act(async () => {
      (startButton?.props.onPress as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = renderedText(tree);
    // Honest error, and NOT a fabricated active/blocked state.
    expect(text).toContain('Could not start focus');
    expect(text).toContain('Protection was not started');
    expect(text).not.toContain('Focus is on');
    expect(mockNative.startFocusSession).toHaveBeenCalledWith(25 * 60);

    await act(async () => {
      tree.unmount();
    });
  });

  it('shows remaining time + emergency release when an active session is reconciled from native', async () => {
    const future = Date.now() + 10 * 60 * 1000; // 10 min out
    const active: FocusSession = {
      id: 'native-1',
      deadlineEpochMs: future,
      selectionSummary: '3 apps',
    };
    mockNative.getSelection.mockResolvedValue({ summary: '3 apps' });
    mockNative.getActiveSession.mockResolvedValue(active);

    const tree = await mount();
    const text = renderedText(tree);

    expect(text).toContain('Focus is on');
    expect(text).toContain('remaining');
    expect(text.toLowerCase()).toContain('emergency release');

    await act(async () => {
      tree.unmount();
    });
  });

  it('emergency release calls stopFocusSession and returns to idle', async () => {
    const future = Date.now() + 10 * 60 * 1000;
    const active: FocusSession = {
      id: 'native-1',
      deadlineEpochMs: future,
      selectionSummary: '3 apps',
    };
    mockNative.getSelection.mockResolvedValue({ summary: '3 apps' });
    mockNative.getActiveSession.mockResolvedValue(active);
    mockNative.stopFocusSession.mockResolvedValue(undefined);

    const tree = await mount();
    const releaseButton = findButton(tree, 'Emergency release');
    expect(releaseButton).toBeDefined();

    await act(async () => {
      (releaseButton?.props.onPress as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNative.stopFocusSession).toHaveBeenCalledTimes(1);

    const text = renderedText(tree);
    // Back to the idle setup flow, not an active state.
    expect(text).not.toContain('Focus is on');
    expect(text).toContain('Start focus');

    await act(async () => {
      tree.unmount();
    });
  });
});
