import type { StateCreator } from 'zustand';
import type { ProjectStoreState, EdgeSlice } from './types';

export const createEdgeSlice: StateCreator<
  ProjectStoreState,
  [],
  [],
  EdgeSlice
> = (set) => ({
  setEdges: (edges, updatedAt) =>
    set((state) => {
      if (!state.project) return state;
      console.log(
        'setEdges called with',
        edges.length,
        'edges, updatedAt:',
        updatedAt,
      );
      return {
        project: {
          ...state.project,
          edges,
          updated_at: updatedAt ?? state.project.updated_at,
        },
      };
    }),

  addEdge: (edge, updatedAt) =>
    set((state) => {
      if (!state.project) return state;
      const exists = state.project.edges.some(
        (item) => item.from === edge.from && item.to === edge.to,
      );
      if (exists) {
        return updatedAt
          ? {
              project: { ...state.project, updated_at: updatedAt },
            }
          : state;
      }
      return {
        project: {
          ...state.project,
          edges: [...state.project.edges, edge],
          updated_at: updatedAt ?? state.project.updated_at,
        },
      };
    }),

  removeEdge: ({ from, to }, updatedAt) =>
    set((state) => {
      if (!state.project) return state;
      const filtered = state.project.edges.filter(
        (edge) => !(edge.from === from && edge.to === to),
      );
      return {
        project: {
          ...state.project,
          edges: filtered,
          updated_at: updatedAt ?? state.project.updated_at,
        },
      };
    }),
});
