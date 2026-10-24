// Small pure lookup helpers shared by the journey screens. They resolve route
// params against the loaded Catalog and return null (not throw) on a bad param
// so screens can render an honest "not found" state instead of crashing.

import { Catalog, Level, Lesson, Track } from '../../domain/content/catalog.types';

export function findTrack(catalog: Catalog, trackId: string): Track | null {
  return catalog.tracks.find((t) => t.id === trackId) ?? null;
}

export function findLevel(track: Track, levelId: string): Level | null {
  return track.levels.find((l) => l.id === levelId) ?? null;
}

export function findLesson(level: Level, lessonId: string): Lesson | null {
  return level.lessons.find((l) => l.id === lessonId) ?? null;
}

export function isFinanceTrack(trackId: string): boolean {
  return trackId === 'personal-finance';
}
