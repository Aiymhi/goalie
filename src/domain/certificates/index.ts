// Phase 1 placeholder. Pure TS, intentionally unimplemented typed surface.
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} not implemented in Phase 1`);
    this.name = 'NotImplementedError';
  }
}

export interface Certificate {
  id: string;
  trackId: string;
}

export function issueCertificate(_input: never): Certificate {
  throw new NotImplementedError('certificates');
}
