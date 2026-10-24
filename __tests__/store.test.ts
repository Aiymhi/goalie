import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearData,
  defaultPersistedData,
  loadData,
  PersistedData,
  PersistedDataV1,
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

async function readRaw(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

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
      ...defaultPersistedData(),
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
      ...defaultPersistedData(),
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

describe('store save + round-trip (v2)', () => {
  // §8.20 — v2 save->load round-trip equality, no warn.
  it('preserves a full v2 document across a save -> load round-trip', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const data: PersistedData = {
      ...defaultPersistedData(),
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
      rewards: {
        version: 2,
        awardedXp: {
          'computer-science-beginner-1': 20,
          'mastery:computer-science/beginner': 50,
        },
        totalXp: 70,
        streak: { count: 3, lastLocalDateYYYYMMDD: '20250131' },
        earnedBadges: ['computer-science/beginner'],
      },
      attemptHistory: {
        questions: {
          'computer-science-beginner-m1': {
            selectedIndex: 2,
            correct: true,
            atEpochMs: 1000,
          },
        },
        practice: {
          'computer-science-beginner-1': { hadText: true, atEpochMs: 2000 },
        },
      },
    };

    await saveData(data);
    const loaded = await loadData();

    expect(loaded).toEqual(data);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('store migration (v1 -> v2)', () => {
  const v1Doc: PersistedDataV1 = {
    version: 1,
    selectedTrackId: 'computer-science',
    displayName: 'Ada',
    progression: {
      version: 1,
      levels: {
        'computer-science/beginner': {
          completedLessonIds: [
            'computer-science-beginner-1',
            'computer-science-beginner-2',
          ],
          masteryPassed: true,
          bestCorrectCount: 5,
        },
      },
    },
  };

  // §8.18 — migrate preserves progression, inits empty rewards/history, writes back.
  it('migrates a v1 document to v2, preserving progression and writing back', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(v1Doc));

    const loaded = await loadData();

    expect(loaded.version).toBe(2);
    expect(loaded.selectedTrackId).toBe('computer-science');
    expect(loaded.displayName).toBe('Ada');
    expect(loaded.progression).toEqual(v1Doc.progression);
    expect(loaded.rewards).toEqual(defaultPersistedData().rewards);
    expect(loaded.attemptHistory).toEqual({ questions: {}, practice: {} });
    // Migration is benign and silent (no warn).
    expect(warn).not.toHaveBeenCalled();

    // Written back once: a second load sees a version 2 document with no further work.
    const persisted = (await readRaw()) as PersistedData;
    expect(persisted.version).toBe(2);
    const second = await loadData();
    expect(second.version).toBe(2);
    expect(second).toEqual(loaded);
  });

  // §8.19 — no retroactive XP after migration.
  it('awards no retroactive XP for pre-v2 completed levels', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(v1Doc));

    const loaded = await loadData();

    expect(loaded.rewards.totalXp).toBe(0);
    expect(loaded.rewards.awardedXp).toEqual({});
    expect(loaded.rewards.earnedBadges).toEqual([]);
    expect(loaded.rewards.streak).toEqual({
      count: 0,
      lastLocalDateYYYYMMDD: null,
    });
  });

  // §8.25d — v1 -> v2 inits aiCoaching to the default off/un-acknowledged setting.
  it('initializes aiCoaching to the default off setting on migration', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(v1Doc));

    const loaded = await loadData();

    expect(loaded.aiCoaching).toEqual({
      enabled: false,
      endpointUrl: null,
      disclosureAcknowledged: false,
    });
  });
});

describe('store guard repairs (v2)', () => {
  // §8.21 — totalXp disagreement re-derives from the ledger + one warn.
  it('re-derives a disagreeing totalXp from the ledger with one warn', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = {
      ...defaultPersistedData(),
      rewards: {
        version: 2,
        awardedXp: {
          'computer-science-beginner-1': 20,
          'mastery:computer-science/beginner': 50,
        },
        totalXp: 9999, // disagrees with the ledger sum (70)
        streak: { count: 1, lastLocalDateYYYYMMDD: '20250131' },
        earnedBadges: [],
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(doc));

    const loaded = await loadData();

    expect(loaded.rewards.totalXp).toBe(70);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('goalie: recomputed xp total');
  });

  // §8.22 — corrupt rewards (xp value 37) -> defaults + discard warn.
  it('discards the whole store when an awardedXp value is not 20/50', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = {
      ...defaultPersistedData(),
      rewards: {
        version: 2,
        awardedXp: { 'computer-science-beginner-1': 37 },
        totalXp: 37,
        streak: { count: 1, lastLocalDateYYYYMMDD: '20250131' },
        earnedBadges: [],
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(doc));

    const loaded = await loadData();

    expect(loaded).toEqual(defaultPersistedData());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('goalie: discarding unreadable store');
  });

  // §8.23 — malformed attempt-history record dropped, authoritative data kept.
  it('drops a malformed attempt-history record but keeps authoritative data', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = {
      ...defaultPersistedData(),
      selectedTrackId: 'economics',
      progression: {
        version: 1,
        levels: {
          'economics/beginner': {
            completedLessonIds: ['economics-beginner-1'],
            masteryPassed: false,
            bestCorrectCount: 2,
          },
        },
      },
      rewards: {
        version: 2,
        awardedXp: { 'economics-beginner-1': 20 },
        totalXp: 20,
        streak: { count: 1, lastLocalDateYYYYMMDD: '20250131' },
        earnedBadges: [],
      },
      attemptHistory: {
        questions: {
          'economics-beginner-m1': {
            selectedIndex: 1,
            correct: true,
            atEpochMs: 5,
          },
          'economics-beginner-m2': { selectedIndex: 'bad', correct: true },
        },
        practice: {},
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(doc));

    const loaded = await loadData();

    // The bad record is dropped; the valid one survives.
    expect(loaded.attemptHistory.questions).toEqual({
      'economics-beginner-m1': {
        selectedIndex: 1,
        correct: true,
        atEpochMs: 5,
      },
    });
    // Authoritative data is untouched.
    expect(loaded.rewards.totalXp).toBe(20);
    expect(loaded.progression.levels['economics/beginner']).toEqual({
      completedLessonIds: ['economics-beginner-1'],
      masteryPassed: false,
      bestCorrectCount: 2,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'goalie: dropped malformed attempt history',
    );
  });

  // §8.24 — unknown future version:3 -> defaults + discard warn.
  it('discards a document with an unknown future version', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = { ...defaultPersistedData(), version: 3 };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(doc));

    const loaded = await loadData();

    expect(loaded).toEqual(defaultPersistedData());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('goalie: discarding unreadable store');
  });
});

describe('store aiCoaching setting', () => {
  // §8.25a — aiCoaching round-trips (enabled + endpoint + acknowledged survive).
  it('round-trips an enabled, acknowledged aiCoaching setting', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const data: PersistedData = {
      ...defaultPersistedData(),
      aiCoaching: {
        enabled: true,
        endpointUrl: 'https://coach.example',
        disclosureAcknowledged: true,
      },
    };

    await saveData(data);
    const loaded = await loadData();

    expect(loaded.aiCoaching).toEqual({
      enabled: true,
      endpointUrl: 'https://coach.example',
      disclosureAcknowledged: true,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  // §8.25b — enabled:true without acknowledgement is silently coerced to false.
  it('coerces enabled to false without an acknowledged disclosure (silent)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = {
      ...defaultPersistedData(),
      aiCoaching: {
        enabled: true,
        endpointUrl: 'https://coach.example',
        disclosureAcknowledged: false,
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(doc));

    const loaded = await loadData();

    expect(loaded.aiCoaching).toEqual({
      enabled: false,
      endpointUrl: 'https://coach.example',
      disclosureAcknowledged: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  // §8.25c — malformed aiCoaching resets to default off + one warn, authoritative data kept.
  it('resets a malformed aiCoaching to the default off setting with one warn', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = {
      ...defaultPersistedData(),
      selectedTrackId: 'economics',
      rewards: {
        version: 2,
        awardedXp: { 'economics-beginner-1': 20 },
        totalXp: 20,
        streak: { count: 1, lastLocalDateYYYYMMDD: '20250131' },
        earnedBadges: [],
      },
      aiCoaching: {
        enabled: 'yes', // not a boolean
        endpointUrl: null,
        disclosureAcknowledged: true,
      },
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(doc));

    const loaded = await loadData();

    expect(loaded.aiCoaching).toEqual({
      enabled: false,
      endpointUrl: null,
      disclosureAcknowledged: false,
    });
    // Authoritative data survives the reset.
    expect(loaded.rewards.totalXp).toBe(20);
    expect(loaded.selectedTrackId).toBe('economics');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('goalie: reset ai-coaching setting');
  });
});

describe('store deletion contract', () => {
  // §8.25 — clearData wipes a v2 document (XP/badges/history gone) -> defaults.
  it('clear -> loadData returns defaults (LOCAL-DATA DELETION CLEARS STATE)', async () => {
    const data: PersistedData = {
      ...defaultPersistedData(),
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
      rewards: {
        version: 2,
        awardedXp: { 'economics-beginner-1': 20 },
        totalXp: 20,
        streak: { count: 2, lastLocalDateYYYYMMDD: '20250131' },
        earnedBadges: ['economics/beginner'],
      },
    };
    await saveData(data);

    await clearData();

    const loaded = await loadData();
    expect(loaded).toEqual(defaultPersistedData());
  });

  it('confirms nothing persists after save then clear (reopen)', async () => {
    const data: PersistedData = {
      ...defaultPersistedData(),
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
