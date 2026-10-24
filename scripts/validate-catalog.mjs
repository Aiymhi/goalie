import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../content/tracks.json', import.meta.url), 'utf8'));
const expectedTracks = ['computer-science', 'economics', 'personal-finance'];
const expectedLevels = ['beginner', 'intermediate', 'advanced'];
const errors = [];
const seen = new Set();

if (catalog.schemaVersion !== 1) errors.push('schemaVersion must be 1');
if (!Array.isArray(catalog.tracks)) errors.push('tracks must be an array');

for (const track of catalog.tracks ?? []) {
  if (!track.id || seen.has(track.id)) errors.push('track IDs must be present and unique');
  seen.add(track.id);
  if (!track.title?.trim() || !track.description?.trim()) errors.push(track.id + ': title and description are required');
  const ids = (track.levels ?? []).map(level => level.id);
  if (ids.join(',') !== expectedLevels.join(',')) errors.push(track.id + ': expected Beginner, Intermediate, Advanced in order');
  for (const level of track.levels ?? []) {
    if (!level.title?.trim() || !level.objective?.trim()) errors.push(track.id + '/' + level.id + ': title and objective are required');
    if (!Array.isArray(level.lessons)) errors.push(track.id + '/' + level.id + ': lessons must be an array');
    for (const lesson of level.lessons ?? []) {
      if (!lesson.id || !lesson.title?.trim() || !lesson.objective?.trim()) errors.push(track.id + '/' + level.id + ': lesson needs id, title, objective');
    }
  }
}
for (const id of expectedTracks) if (!seen.has(id)) errors.push('missing required starter track: ' + id);

if (errors.length) {
  console.error(errors.map(error => '- ' + error).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Course catalog structure valid: ' + catalog.tracks.length + ' tracks, ' + expectedLevels.length + ' levels each.');
}
