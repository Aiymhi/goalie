// UI-layer React context (NOT domain). The single place the UI touches
// persistence: screens read loaded Catalog + ProgressionState + displayName +
// selectedTrackId from here and call completeLesson/recordMasteryResult/
// setSelection/deleteAllData, which call the PURE domain functions and then
// persist via saveData/clearData. Screens never import AsyncStorage.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import tracksJson from '../../../content/tracks.json';
import { MasteryResult } from '../../domain/assessment';
import { loadCatalog } from '../../domain/content/catalog';
import { Catalog, LevelId } from '../../domain/content/catalog.types';
import {
  completeLesson as completeLessonPure,
  emptyProgression,
  ProgressionState,
  recordMasteryResult as recordMasteryResultPure,
} from '../../domain/progression';
import {
  clearData,
  defaultPersistedData,
  loadData,
  PersistedData,
  saveData,
} from '../../persistence/store';

export type RootGateStatus = 'loading' | 'ready' | 'error';

export interface ProgressionContextValue {
  status: RootGateStatus;
  error: Error | null;
  catalog: Catalog | null;
  progression: ProgressionState;
  displayName: string | null;
  selectedTrackId: string | null;
  // Re-run the async root load (used by the error-retry affordance).
  reload: () => void;
  // Persist a track selection (and optional display name) then expose it.
  setSelection: (trackId: string, displayName: string | null) => Promise<void>;
  // Mark a lesson complete via the pure domain fn, then persist.
  completeLesson: (
    trackId: string,
    levelId: LevelId,
    lessonId: string,
  ) => Promise<void>;
  // Record a mastery result via the pure domain fn, then persist.
  recordMasteryResult: (
    trackId: string,
    levelId: LevelId,
    result: MasteryResult,
  ) => Promise<void>;
  // Clear all local data, reset in-memory to defaults; on failure leave state
  // untouched and re-throw so the caller can surface an error.
  deleteAllData: () => Promise<void>;
}

const ProgressionContext = createContext<ProgressionContextValue | null>(null);

// Parse the bundled catalog once. loadCatalog throws CatalogError on bad
// content; that surfaces as the root gate's error state.
function parseCatalog(): Catalog {
  return loadCatalog(tracksJson);
}

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RootGateStatus>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [data, setData] = useState<PersistedData>(defaultPersistedData());

  const load = useCallback(() => {
    let active = true;
    setStatus('loading');
    setError(null);
    (async () => {
      try {
        const parsed = parseCatalog();
        const persisted = await loadData();
        if (!active) {
          return;
        }
        setCatalog(parsed);
        setData(persisted);
        setStatus('ready');
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const reload = useCallback(() => {
    load();
  }, [load]);

  const persist = useCallback(async (next: PersistedData) => {
    // Optimistically hold the new in-memory state, then write. On write
    // failure the domain state is already updated in memory (honest: the
    // learner sees their progress) but we re-throw so the caller can warn
    // "couldn't save — retry".
    setData(next);
    await saveData(next);
  }, []);

  const setSelection = useCallback(
    async (trackId: string, displayName: string | null) => {
      const next: PersistedData = {
        ...data,
        selectedTrackId: trackId,
        displayName,
      };
      await persist(next);
    },
    [data, persist],
  );

  const completeLesson = useCallback(
    async (trackId: string, levelId: LevelId, lessonId: string) => {
      const nextProgression = completeLessonPure(
        data.progression,
        trackId,
        levelId,
        lessonId,
      );
      await persist({ ...data, progression: nextProgression });
    },
    [data, persist],
  );

  const recordMasteryResult = useCallback(
    async (trackId: string, levelId: LevelId, result: MasteryResult) => {
      const nextProgression = recordMasteryResultPure(
        data.progression,
        trackId,
        levelId,
        result,
      );
      await persist({ ...data, progression: nextProgression });
    },
    [data, persist],
  );

  const deleteAllData = useCallback(async () => {
    // Clear persistence first; only reset memory if the wipe succeeded.
    await clearData();
    setData({
      version: 1,
      selectedTrackId: null,
      displayName: null,
      progression: emptyProgression(),
    });
  }, []);

  const value = useMemo<ProgressionContextValue>(
    () => ({
      status,
      error,
      catalog,
      progression: data.progression,
      displayName: data.displayName,
      selectedTrackId: data.selectedTrackId,
      reload,
      setSelection,
      completeLesson,
      recordMasteryResult,
      deleteAllData,
    }),
    [
      status,
      error,
      catalog,
      data.progression,
      data.displayName,
      data.selectedTrackId,
      reload,
      setSelection,
      completeLesson,
      recordMasteryResult,
      deleteAllData,
    ],
  );

  return (
    <ProgressionContext.Provider value={value}>
      {children}
    </ProgressionContext.Provider>
  );
}

export function useProgression(): ProgressionContextValue {
  const ctx = useContext(ProgressionContext);
  if (ctx === null) {
    throw new Error('useProgression must be used within a ProgressionProvider');
  }
  return ctx;
}
