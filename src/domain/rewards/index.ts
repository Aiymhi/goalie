// Phase 1 placeholder. Pure TS, intentionally unimplemented typed surface.
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} not implemented in Phase 1`);
    this.name = 'NotImplementedError';
  }
}

export interface Reward {
  id: string;
  label: string;
}

export function grantReward(_input: never): Reward {
  throw new NotImplementedError('rewards');
}
