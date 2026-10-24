// Pure TS. No react / react-native / Node-IO imports.
// Mirrors content/tracks.json and the invariants scripts/validate-catalog.mjs enforces.

export type LevelId = 'beginner' | 'intermediate' | 'advanced';

export interface Lesson {
  id: string;
  title: string;
  objective: string;
}

export interface Level {
  id: LevelId;
  title: string;
  objective: string;
  lessons: Lesson[];
}

export interface Track {
  id: string;
  title: string;
  description: string;
  levels: Level[];
}

export interface Catalog {
  schemaVersion: 1;
  tracks: Track[];
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}
