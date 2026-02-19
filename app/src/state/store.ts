/**
 * Zustand project store — composed from focused slices.
 *
 * Slices live in ./slices/ and each handle one domain:
 *   projectSlice  — project-level state (loading, error, settings)
 *   nodeSlice     — node CRUD & selection
 *   edgeSlice     — edge CRUD
 *   uiSlice       — run logs & UI settings
 *
 * This file creates the combined store and re-exports every public symbol so
 * that existing imports from '…/state/store' continue to work unchanged.
 */

import { create } from 'zustand';

import { createProjectSlice } from './slices/projectSlice';
import { createNodeSlice } from './slices/nodeSlice';
import { createEdgeSlice } from './slices/edgeSlice';
import { createUiSlice } from './slices/uiSlice';
import type { ProjectStoreState } from './slices/types';

// ---------------------------------------------------------------------------
// Combined store
// ---------------------------------------------------------------------------

export const useProjectStore = create<ProjectStoreState>((...args) => ({
  ...createProjectSlice(...args),
  ...createNodeSlice(...args),
  ...createEdgeSlice(...args),
  ...createUiSlice(...args),
}));

// ---------------------------------------------------------------------------
// Re-exports — backward-compatible public API
// ---------------------------------------------------------------------------

// Types
export type { NodeTemplate, AddNodeOptions, ProjectStoreState } from './slices/types';

// Selectors / pure helpers
export { selectNodeById, buildNodeMap, findPreviousNodes, findNextNodes } from './utils/selectors';
