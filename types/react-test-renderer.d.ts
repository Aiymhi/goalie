// Minimal ambient types for react-test-renderer 19.1.0 (already installed in
// the SDK 54 matrix) so the strict typecheck passes without pulling in
// @types/react-test-renderer (which is outside the pinned matrix). Only the
// surface the smoke test uses is declared. Lives outside __tests__ so jest does
// not treat it as a test suite.

declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestRendererJSON {
    type: string;
    props: Record<string, unknown>;
    children: (ReactTestRendererJSON | string)[] | null;
  }

  export interface ReactTestRenderer {
    toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null;
    unmount(): void;
    update(element: ReactElement): void;
  }

  export function create(element: ReactElement): ReactTestRenderer;

  export function act(callback: () => void | Promise<void>): Promise<void>;
}
