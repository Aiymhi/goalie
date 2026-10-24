// Phase 1 placeholder. Pure TS, intentionally unimplemented typed surface.
import { LevelId } from '../content/catalog.types';

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} not implemented in Phase 1`);
    this.name = 'NotImplementedError';
  }
}

export interface Progress {
  trackId: string;
  levelId: LevelId;
}

export function advanceProgress(_input: never): Progress {
  throw new NotImplementedError('progression');
}
