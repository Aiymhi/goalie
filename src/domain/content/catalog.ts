// Pure TS. No react / react-native / Node-IO imports.
// loadCatalog re-validates the already-parsed JSON value fail-fast and never
// returns a partial catalog. The caller does the import/readFile + JSON.parse.

import {
  Catalog,
  CatalogError,
  Lesson,
  Level,
  LevelId,
  Track,
} from './catalog.types';

const LEVEL_ORDER: readonly LevelId[] = ['beginner', 'intermediate', 'advanced'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseLesson(raw: unknown, trackId: string, levelId: string): Lesson {
  if (!isRecord(raw)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson must be an object`);
  }
  if (!isNonEmptyString(raw.id)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson id must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.title)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" title must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.objective)) {
    throw new CatalogError(`${trackId}/${levelId}: lesson "${raw.id}" objective must be a non-empty string`);
  }
  return { id: raw.id, title: raw.title, objective: raw.objective };
}

function parseLevel(raw: unknown, trackId: string, index: number): Level {
  if (!isRecord(raw)) {
    throw new CatalogError(`${trackId}: level at position ${index} must be an object`);
  }
  const expectedId = LEVEL_ORDER[index];
  if (raw.id !== expectedId) {
    throw new CatalogError(
      `${trackId}: levels must be beginner, intermediate, advanced in order`,
    );
  }
  const levelId = expectedId;
  if (!isNonEmptyString(raw.title)) {
    throw new CatalogError(`${trackId}/${levelId}: title must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.objective)) {
    throw new CatalogError(`${trackId}/${levelId}: objective must be a non-empty string`);
  }
  if (!Array.isArray(raw.lessons)) {
    throw new CatalogError(`${trackId}/${levelId}: lessons must be an array`);
  }
  const lessons = raw.lessons.map((lesson) => parseLesson(lesson, trackId, levelId));
  return { id: levelId, title: raw.title, objective: raw.objective, lessons };
}

function parseTrack(raw: unknown, seenIds: Set<string>): Track {
  if (!isRecord(raw)) {
    throw new CatalogError('track must be an object');
  }
  if (!isNonEmptyString(raw.id)) {
    throw new CatalogError('track id must be a non-empty string');
  }
  const id = raw.id;
  if (seenIds.has(id)) {
    throw new CatalogError(`duplicate track id "${id}"`);
  }
  seenIds.add(id);
  if (!isNonEmptyString(raw.title)) {
    throw new CatalogError(`${id}: title must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.description)) {
    throw new CatalogError(`${id}: description must be a non-empty string`);
  }
  if (!Array.isArray(raw.levels) || raw.levels.length !== LEVEL_ORDER.length) {
    throw new CatalogError(
      `${id}: levels must be beginner, intermediate, advanced in order`,
    );
  }
  const levels = raw.levels.map((level, index) => parseLevel(level, id, index));
  return { id, title: raw.title, description: raw.description, levels };
}

export function loadCatalog(raw: unknown): Catalog {
  if (!isRecord(raw)) {
    throw new CatalogError('catalog must be an object');
  }
  if (raw.schemaVersion !== 1) {
    throw new CatalogError('unsupported schemaVersion');
  }
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) {
    throw new CatalogError('tracks must be a non-empty array');
  }
  const seenIds = new Set<string>();
  const tracks = raw.tracks.map((track) => parseTrack(track, seenIds));
  return { schemaVersion: 1, tracks };
}
