import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearData,
  defaultPersistedData,
  loadData,
  PersistedData,
  saveData,
  STORAGE_KEY,
} from '../src/persistence/store';

// Official AsyncStorage jest mock (jest-expo does not auto-mock it).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('store load', () => {
  it('returns defaults when the key is absent (first run)', async () => {
    const data = await loadData();
    expect(data).toEqual(defaultPersistedData());
  });

  it('returns defaults + one warn on unparseable JSON', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(STORAGE_KEY, 'not json {');

    const data = await loadData();

    expect(data).toEqual(defaultPersistedData());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('goalie: discarding unreadable store');
  });

  it('returns defaults + one warn on out-of-range bestCorrectCount', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const corrupt = {
      version: 1,
      selectedTrackId: null,
      displayName: null,
      progression: {
        version: 1,
        levels: {
          'computer-science/beginner': {
            completedLessonIds: [],
            masteryPassed: false,
            bestCorrectCount: 999,
          },
        },
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(corrupt));

    const data = await loadData();

    expect(data).toEqual(defaultPersistedData());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('goalie: discarding unreadable store');
  });

  it('returns defaults + one warn on completedLessonIds containing null', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const corrupt = {
      version: 1,
      selectedTrackId: null,
      displayName: null,
      progression: {
        version: 1,
        levels: {
          'computer-science/beginner': {
            completedLessonIds: [null],
            masteryPassed: false,
            bestCorrectCount: 0,
          },
        },
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(corrupt));

    const data = await loadData();

    expect(data).toEqual(defaultPersistedData());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('goalie: discarding unreadable store');
  });
});

describe('store save + round-trip', () => {
  it('preserves data across a save -> load round-trip', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const data: PersistedData = {
      version: 1,
      selectedTrackId: 'computer-science',
      displayName: 'Ada',
      progression: {
        version: 1,
        levels: {
          'computer-science/beginner': {
            completedLessonIds: ['computer-science-beginner-1'],
            masteryPassed: true,
            bestCorrectCount: 5,
          },
        },
      },
    };

    await saveData(data);
    const loaded = await loadData();

    expect(loaded).toEqual(data);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('store deletion contract', () => {
  it('clear -> loadData returns defaults (LOCAL-DATA DELETION CLEARS STATE)', async () => {
    const data: PersistedData = {
      version: 1,
      selectedTrackId: 'economics',
      displayName: 'Grace',
      progression: {
        version: 1,
        levels: {
          'economics/beginner': {
            completedLessonIds: ['economics-beginner-1'],
            masteryPassed: true,
            bestCorrectCount: 4,
          },
        },
      },
    };
    await saveData(data);

    await clearData();

    const loaded = await loadData();
    expect(loaded).toEqual(defaultPersistedData());
  });

  it('confirms nothing persists after save then clear (reopen)', async () => {
    const data: PersistedData = {
      version: 1,
      selectedTrackId: 'personal-finance',
      displayName: null,
      progression: {
        version: 1,
        levels: {
          'personal-finance/beginner': {
            completedLessonIds: ['personal-finance-beginner-1'],
            masteryPassed: false,
            bestCorrectCount: 2,
          },
        },
      },
    };
    await saveData(data);
    await clearData();

    // A fresh read (as if the app were reopened) finds nothing stored.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    const reopened = await loadData();
    expect(reopened).toEqual(defaultPersistedData());
  });
});
