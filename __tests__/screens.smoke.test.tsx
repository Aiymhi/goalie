import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { STORAGE_KEY } from '../src/persistence/store';
import { REASON_TEXT } from '../src/ui/focus/reasonText';
import { FocusUnavailableReason } from '../src/focus/types';
import {
  ProgressionProvider,
} from '../src/ui/context/ProgressionProvider';
import { CoursePathScreen } from '../src/ui/screens/CoursePathScreen';
import { FocusScreen } from '../src/ui/screens/FocusScreen';
import { ProgressScreen } from '../src/ui/screens/ProgressScreen';
import type { RootStackParamList } from '../src/ui/navigation/RootNavigator';

// jest-expo does not auto-mock AsyncStorage: register the official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// This environment is not an iOS device, so getFocusAvailability() resolves to
// an honest "unavailable" verdict (NotIOS on the jest/node host). We assert the
// screen shows the honest unavailable copy, never a fabricated blocked/active
// state.

const Stack = createNativeStackNavigator<RootStackParamList>();

// Collect every string rendered anywhere in the tree.
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

function renderedStrings(tree: ReactTestRenderer): string[] {
  const json = tree.toJSON();
  const out: string[] = [];
  collectText(json, out);
  return out;
}

// Join and collapse whitespace so assertions are not sensitive to how RN splits
// interpolated text into sibling nodes (e.g. `{title} complete`).
function renderedText(tree: ReactTestRenderer): string {
  return renderedStrings(tree).join(' ').replace(/\s+/g, ' ').trim();
}

async function mount(
  routeName: keyof RootStackParamList,
  params: object | undefined,
): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ProgressionProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen
              name={routeName as never}
              // The target screen is registered dynamically per test.
              component={ROUTE_COMPONENTS[routeName] as never}
              initialParams={params as never}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ProgressionProvider>,
    );
  });
  // Let the provider's async loadData() + focus availability settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

const ROUTE_COMPONENTS: Partial<
  Record<keyof RootStackParamList, React.ComponentType<object>>
> = {
  Focus: FocusScreen as React.ComponentType<object>,
  CoursePath: CoursePathScreen as React.ComponentType<object>,
  Progress: ProgressScreen as React.ComponentType<object>,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('Focus screen (honest availability)', () => {
  it('renders without throwing and shows the honest unavailable verdict', async () => {
    const tree = await mount('Focus', undefined);
    const text = renderedText(tree);

    // The host is not a real iOS device, so getFocusAvailability() reports an
    // honest "unavailable" verdict. Whatever the reason, the screen must show
    // the matching shared REASON_TEXT copy (never a fabricated verdict). At
    // least one unavailable reason's copy is present.
    const anyReasonShown = Object.values(FocusUnavailableReason).some(
      (reason) => text.includes(REASON_TEXT[reason]),
    );
    expect(anyReasonShown).toBe(true);
    expect(text).toContain('unavailable');
    // Never a fabricated "blocked"/"active"/"blocking" state.
    expect(text.toLowerCase()).not.toContain('blocked');
    expect(text.toLowerCase()).not.toContain('blocking');
    expect(text.toLowerCase()).not.toContain('session active');

    await act(async () => {
      tree.unmount();
    });
  });
});

describe('finance screen (disclaimer banner)', () => {
  it('renders the FinanceDisclaimerBanner text from the disclaimer content field', async () => {
    // Select the finance track so the course path renders its disclaimer.
    const tree = await mount('CoursePath', { trackId: 'personal-finance' });
    const strings = renderedStrings(tree).join(' ');

    expect(strings).toContain('Educational content only.');

    await act(async () => {
      tree.unmount();
    });
  });
});

describe('Progress screen (badge only when a level is complete)', () => {
  it('shows no completion badge for empty progression', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        selectedTrackId: 'computer-science',
        displayName: null,
        progression: { version: 1, levels: {} },
      }),
    );

    const tree = await mount('Progress', undefined);
    const text = renderedText(tree);

    expect(text).not.toContain('Beginner complete');

    await act(async () => {
      tree.unmount();
    });
  });

  it('shows a completion badge only when isLevelComplete is true', async () => {
    // Both beginner lessons complete AND mastery passed -> level complete.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        selectedTrackId: 'computer-science',
        displayName: null,
        progression: {
          version: 1,
          levels: {
            'computer-science/beginner': {
              completedLessonIds: [
                'computer-science-beginner-1',
                'computer-science-beginner-2',
              ],
              masteryPassed: true,
              bestCorrectCount: 5,
            },
          },
        },
      }),
    );

    const tree = await mount('Progress', undefined);
    const text = renderedText(tree);

    expect(text).toContain('Beginner complete');

    await act(async () => {
      tree.unmount();
    });
  });
});
