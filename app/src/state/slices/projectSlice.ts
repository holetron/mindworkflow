import type { StateCreator } from 'zustand';
import type { ProjectFlow } from '../api';
import type { ProjectStoreState, ProjectSlice } from './types';
import { normalizeFlowNode } from '../utils/nodeHelpers';
import { mergeSettings } from '../utils/settingsHelpers';

function normalizeProject(project: ProjectFlow): ProjectFlow {
  return {
    ...project,
    nodes: project.nodes.map(normalizeFlowNode),
  };
}

export const createProjectSlice: StateCreator<
  ProjectStoreState,
  [],
  [],
  ProjectSlice
> = (set) => ({
  project: null,
  loading: false,
  error: null,

  setProject: (project) =>
    set(() => {
      const normalized = normalizeProject(project);
      return {
        project: normalized,
        selectedNodeId: normalized.nodes[0]?.node_id ?? null,
      };
    }),

  mergeProject: (patch) =>
    set((state) => {
      if (!state.project) return state;
      const merged: ProjectFlow = {
        ...state.project,
        ...patch,
        nodes: patch.nodes ?? state.project.nodes,
        edges: patch.edges ?? state.project.edges,
        settings: patch.settings ?? state.project.settings,
        schemas: patch.schemas ?? state.project.schemas,
        collaborators: patch.collaborators ?? state.project.collaborators,
      };
      return { project: merged };
    }),

  setLoading: (value) => set({ loading: value }),

  setError: (value) => set({ error: value }),

  updateProjectSettings: (settingsPatch, updatedAt) =>
    set((state) => {
      if (!state.project) return state;
      const nextSettings = mergeSettings(
        state.project.settings ?? {},
        settingsPatch,
      );
      return {
        project: {
          ...state.project,
          settings: nextSettings,
          updated_at: updatedAt ?? state.project.updated_at,
        },
      };
    }),

  clearProject: () =>
    set(() => ({
      project: null,
      selectedNodeId: null,
      runs: {},
    })),
});
