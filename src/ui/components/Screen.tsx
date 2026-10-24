// The standard screen container: a safe-area-padded, theme-coloured canvas that
// also centralizes the loading / offline / empty / error / permission states by
// delegating to the shared ScreenState primitives. Screens pass a `state` and,
// for the ready case, their content as children — so every screen renders those
// non-ready states identically instead of hand-rolling a blank.

import { ReactNode } from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from './ScreenState';

type ScreenStatus = 'ready' | 'loading' | 'empty' | 'error' | 'permission';

interface LoadingProps {
  status: 'loading';
  loadingLabel?: string;
}
interface EmptyProps {
  status: 'empty';
  emptyTitle: string;
  emptyDetail?: string;
  emptyAction?: ReactNode;
}
interface ErrorProps {
  status: 'error';
  errorMessage: string;
  onRetry?: () => void;
  retryLabel?: string;
}
// 'permission' reuses the empty primitive with a permission-shaped message,
// keeping a single consistent presentation for an unavailable capability.
interface PermissionProps {
  status: 'permission';
  emptyTitle: string;
  emptyDetail?: string;
  emptyAction?: ReactNode;
}
interface ReadyProps {
  status?: 'ready';
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export type ScreenProps =
  | LoadingProps
  | EmptyProps
  | ErrorProps
  | PermissionProps
  | ReadyProps;

function Canvas({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: spacing.xl + insets.top,
    paddingBottom: spacing.xxl + insets.bottom,
    paddingLeft: spacing.xl + insets.left,
    paddingRight: spacing.xl + insets.right,
  };

  if (scroll) {
    return (
      <ScrollView
        style={styles.canvas}
        contentContainerStyle={[styles.content, padding, contentStyle]}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.canvas, styles.content, padding, contentStyle]}>
      {children}
    </View>
  );
}

export function Screen(props: ScreenProps): ReactNode {
  const status: ScreenStatus = props.status ?? 'ready';

  if (status === 'loading') {
    const p = props as LoadingProps;
    return (
      <View style={[styles.canvas, styles.centerFill]}>
        <LoadingState label={p.loadingLabel} />
      </View>
    );
  }

  if (status === 'error') {
    const p = props as ErrorProps;
    return (
      <View style={[styles.canvas, styles.centerFill]}>
        <ErrorState
          message={p.errorMessage}
          onRetry={p.onRetry}
          retryLabel={p.retryLabel}
        />
      </View>
    );
  }

  if (status === 'empty' || status === 'permission') {
    const p = props as EmptyProps | PermissionProps;
    return (
      <View style={[styles.canvas, styles.centerFill]}>
        <EmptyState
          title={p.emptyTitle}
          detail={p.emptyDetail}
          action={p.emptyAction}
        />
      </View>
    );
  }

  const p = props as ReadyProps;
  return (
    <Canvas scroll={p.scroll} contentStyle={p.contentStyle}>
      {p.children}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
  },
  centerFill: {
    justifyContent: 'center',
  },
});

export default Screen;
