// Single composition root above RootNavigator. Wraps the tree in
// ProgressionProvider (which performs the async loadData()) and an async root
// gate: a neutral loading state while the load is pending, an error-with-retry
// if the native read rejects, then the navigator with a computed
// initialRouteName (TrackSelect if no track selected, else Home). The
// navigator is never mounted against unresolved/fabricated state.

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from './src/ui/components/ScreenState';
import {
  ProgressionProvider,
  useProgression,
} from './src/ui/context/ProgressionProvider';
import { RootNavigator } from './src/ui/navigation/RootNavigator';

function RootGate() {
  const { status, error, selectedTrackId, reload } = useProgression();

  if (status === 'loading') {
    return <LoadingState label="Starting Goalie…" />;
  }
  if (status === 'error') {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load your saved data.'}
        onRetry={reload}
      />
    );
  }

  const initialRouteName = selectedTrackId === null ? 'TrackSelect' : 'Home';
  return <RootNavigator initialRouteName={initialRouteName} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProgressionProvider>
        <RootGate />
      </ProgressionProvider>
    </SafeAreaProvider>
  );
}
