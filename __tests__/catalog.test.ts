import tracksJson from '../content/tracks.json';
import { loadCatalog } from '../src/domain/content/catalog';
import { CatalogError } from '../src/domain/content/catalog.types';

describe('loadCatalog', () => {
  // valid-parse
  it('parses the real tracks.json into a Catalog of 3 tracks x 3 levels', () => {
    const catalog = loadCatalog(tracksJson);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.tracks).toHaveLength(3);
    for (const track of catalog.tracks) {
      expect(track.levels).toHaveLength(3);
      expect(track.levels.map((l) => l.id)).toEqual([
        'beginner',
        'intermediate',
        'advanced',
      ]);
    }
  });

  // wrong-schema
  it('rejects a fixture with schemaVersion 2', () => {
    const raw = {
      schemaVersion: 2,
      tracks: [
        {
          id: 't1',
          title: 'T1',
          description: 'd',
          levels: [
            { id: 'beginner', title: 'B', objective: 'o', lessons: [] },
            { id: 'intermediate', title: 'I', objective: 'o', lessons: [] },
            { id: 'advanced', title: 'A', objective: 'o', lessons: [] },
          ],
        },
      ],
    };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // missing-level
  it('rejects a track missing its intermediate level', () => {
    const raw = {
      schemaVersion: 1,
      tracks: [
        {
          id: 't1',
          title: 'T1',
          description: 'd',
          levels: [
            { id: 'beginner', title: 'B', objective: 'o', lessons: [] },
            { id: 'advanced', title: 'A', objective: 'o', lessons: [] },
          ],
        },
      ],
    };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // duplicate-id
  it('rejects a fixture with two tracks sharing an id', () => {
    const level = (id: string) => ({ id, title: id, objective: 'o', lessons: [] });
    const track = {
      id: 'dup',
      title: 'T',
      description: 'd',
      levels: [level('beginner'), level('intermediate'), level('advanced')],
    };
    const raw = { schemaVersion: 1, tracks: [track, { ...track }] };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });

  // order
  it('rejects levels out of order (advanced before beginner)', () => {
    const raw = {
      schemaVersion: 1,
      tracks: [
        {
          id: 't1',
          title: 'T1',
          description: 'd',
          levels: [
            { id: 'advanced', title: 'A', objective: 'o', lessons: [] },
            { id: 'intermediate', title: 'I', objective: 'o', lessons: [] },
            { id: 'beginner', title: 'B', objective: 'o', lessons: [] },
          ],
        },
      ],
    };
    expect(() => loadCatalog(raw)).toThrow(CatalogError);
  });
});
