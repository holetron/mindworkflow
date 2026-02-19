import type {
  ProjectFlow,
  FlowNode,
  FlowEdge,
  RunLog,
  InputPortSpec,
  UiSettings,
} from '../api';

// ---------------------------------------------------------------------------
// Shared helper types
// ---------------------------------------------------------------------------

export interface NodeTemplate {
  type: FlowNode['type'];
  title: string;
  content_type?: string;
  content?: string;
  meta?: { input_ports?: InputPortSpec[] } & Record<string, unknown>;
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
}

export interface AddNodeOptions {
  slug: string;
  position?: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Project slice
// ---------------------------------------------------------------------------

export interface ProjectSlice {
  /** The currently loaded project (or null). */
  project: ProjectFlow | null;
  /** Whether a project load/save operation is in progress. */
  loading: boolean;
  /** Last error message, if any. */
  error: string | null;

  setProject: (project: ProjectFlow) => void;
  mergeProject: (patch: Partial<ProjectFlow>) => void;
  setLoading: (value: boolean) => void;
  setError: (value: string | null) => void;
  updateProjectSettings: (
    settingsPatch: Record<string, unknown>,
    updatedAt?: string,
  ) => void;
  clearProject: () => void;
}

// ---------------------------------------------------------------------------
// Node slice
// ---------------------------------------------------------------------------

export interface NodeSlice {
  /** ID of the currently selected node. */
  selectedNodeId: string | null;

  selectNode: (nodeId: string | null) => void;
  upsertNodeContent: (nodeId: string, patch: Partial<FlowNode>) => void;
  addNodeFromServer: (node: FlowNode, updatedAt?: string) => void;
  addNode: (template: NodeTemplate, options: AddNodeOptions) => void;
  removeNode: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Edge slice
// ---------------------------------------------------------------------------

export interface EdgeSlice {
  setEdges: (edges: FlowEdge[], updatedAt?: string) => void;
  addEdge: (edge: FlowEdge, updatedAt?: string) => void;
  removeEdge: (edge: { from: string; to: string }, updatedAt?: string) => void;
}

// ---------------------------------------------------------------------------
// UI slice
// ---------------------------------------------------------------------------

export interface UiSlice {
  /** Run logs keyed by node ID. */
  runs: Record<string, RunLog[]>;
  /** Global UI settings (font scaling, markdown preview, etc.). */
  uiSettings: UiSettings | null;

  setRuns: (nodeId: string, runs: RunLog[]) => void;
  setUiSettings: (settings: UiSettings) => void;
}

// ---------------------------------------------------------------------------
// Combined store
// ---------------------------------------------------------------------------

export type ProjectStoreState = ProjectSlice & NodeSlice & EdgeSlice & UiSlice;
