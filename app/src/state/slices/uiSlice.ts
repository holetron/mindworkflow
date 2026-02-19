import type { StateCreator } from 'zustand';
import type { ProjectStoreState, UiSlice } from './types';

export const createUiSlice: StateCreator<
  ProjectStoreState,
  [],
  [],
  UiSlice
> = (set) => ({
  runs: {},
  uiSettings: null,

  setRuns: (nodeId, runs) =>
    set((state) => ({
      runs: { ...state.runs, [nodeId]: runs },
    })),

  setUiSettings: (settings) =>
    set(() => ({
      uiSettings: settings,
    })),
});
