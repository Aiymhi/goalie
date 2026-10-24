// Pure TS. No react / react-native / Node-IO imports.
// Mirrors content/tracks.json and the invariants scripts/validate-catalog.mjs enforces.

export type LevelId = 'beginner' | 'intermediate' | 'advanced';

export interface Practice {
  prompt: string;
  answer: string;
  answerExplanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  objective: string;
  explanation: string;
  workedExample: string;
  practice: Practice;
  nextStep: string;
}

export interface MasteryQuestion {
  id: string;
  prompt: string;
  options: readonly string[]; // length 4, validated by parser
  correctIndex: number; // 0..3
}

export interface MasteryCheck {
  passRule: string;
  questions: readonly MasteryQuestion[]; // length 5, validated by parser
}

export interface Level {
  id: LevelId;
  title: string;
  objective: string;
  lessons: readonly Lesson[]; // length 2, validated by parser
  mastery: MasteryCheck;
}

export interface Track {
  id: string;
  title: string;
  description: string;
  levels: readonly Level[];
  disclaimer?: string; // required non-empty on personal-finance only
}

export interface Catalog {
  schemaVersion: 1;
  tracks: readonly Track[];
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}
