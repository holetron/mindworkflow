import { create } from 'zustand';
import {
  DEFAULT_NODE_BBOX,
  NODE_DEFAULT_COLOR,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  NODE_MAX_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MIN_WIDTH,
} from '../constants/nodeDefaults';
import type {
  ProjectFlow,
  FlowNode,
  FlowEdge,
  RunLog,
  InputPortSpec,
  NodeConnections,
  NodeUI,
} from './api';

interface ProjectState {
  project: ProjectFlow | null;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  runs: Record<string, RunLog[]>;
  setProject: (project: ProjectFlow) => void;
  setLoading: (value: boolean) => void;
  setError: (value: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  setRuns: (nodeId: string, runs: RunLog[]) => void;
  upsertNodeContent: (nodeId: string, patch: Partial<FlowNode>) => void;
  addNodeFromServer: (node: FlowNode, updatedAt?: string) => void;
  addNode: (template: NodeTemplate, options: AddNodeOptions) => void;
  removeNode: (nodeId: string) => void;
  setEdges: (edges: FlowEdge[], updatedAt?: string) => void;
  addEdge: (edge: FlowEdge, updatedAt?: string) => void;
  removeEdge: (edge: { from: string; to: string }, updatedAt?: string) => void;
  updateProjectSettings: (settingsPatch: Record<string, unknown>, updatedAt?: string) => void;
  clearProject: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  loading: false,
  error: null,
  selectedNodeId: null,
  runs: {},
  setProject: (project) =>
    set(() => {
      const normalized = normalizeProject(project);
      return {
        project: normalized,
        selectedNodeId: normalized.nodes[0]?.node_id ?? null,
      };
    }),
  setLoading: (value) => set({ loading: value }),
  setError: (value) => set({ error: value }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setRuns: (nodeId, runs) =>
    set((state) => ({
      runs: { ...state.runs, [nodeId]: runs },
    })),
  upsertNodeContent: (nodeId, patch) =>
    set((state) => {
      if (!state.project) return state;
      const nodes = state.project.nodes.map((node) =>
        node.node_id === nodeId ? { ...node, ...patch } : node,
      );
      return {
        project: { ...state.project, nodes },
      };
    }),
  addNodeFromServer: (node, updatedAt) =>
    set((state) => {
      if (!state.project) return state;
      const exists = state.project.nodes.some((item) => item.node_id === node.node_id);
      const normalizedNode = normalizeFlowNode(node);
      const nodes = exists
        ? state.project.nodes.map((item) =>
            item.node_id === normalizedNode.node_id ? { ...item, ...normalizedNode } : item,
          )
        : [...state.project.nodes, normalizedNode];
      return {
        project: {
          ...state.project,
          nodes,
          updated_at: updatedAt ?? state.project.updated_at,
        },
        selectedNodeId: node.node_id,
      };
    }),
  addNode: (template, options) =>
    set((state) => {
      if (!state.project) return state;
      const project = state.project;
      const slug = sanitizeSlug(options.slug);
      const nodeId = generateNodeId(project.nodes, slug);
      const now = new Date().toISOString();
      const templateMeta = cloneNodeMeta(template.meta);
      const baseUi = createInitialNodeUi(options.position);
      const newNode: FlowNode = {
        node_id: nodeId,
        type: template.type,
        title: template.title,
        content_type: template.content_type,
        content: template.content,
        meta: templateMeta ?? {},
        ai: template.ai,
        parser: template.parser,
        python: template.python,
        visibility_rules: template.visibility_rules ?? {},
        ui: baseUi,
        ai_visible: true,
        connections: createDefaultConnections(),
      };

      return {
        project: {
          ...project,
          nodes: [...project.nodes, newNode],
          updated_at: now,
        },
        selectedNodeId: nodeId,
      };
    }),
  removeNode: (nodeId) =>
    set((state) => {
      if (!state.project) return state;

      const filteredNodes = state.project.nodes.filter((node) => node.node_id !== nodeId);
      const filteredEdges = state.project.edges.filter(
        (edge) => edge.from !== nodeId && edge.to !== nodeId,
      );
      const nextSelected =
        state.selectedNodeId === nodeId ? filteredNodes[0]?.node_id ?? null : state.selectedNodeId;
      const { [nodeId]: _removed, ...restRuns } = state.runs;

      return {
        project: {
          ...state.project,
          nodes: filteredNodes,
          edges: filteredEdges,
          updated_at: new Date().toISOString(),
        },
        runs: restRuns,
        selectedNodeId: nextSelected,
      };
    }),
  setEdges: (edges, updatedAt) =>
    set((state) => {
      if (!state.project) return state;
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
      const exists = state.project.edges.some((item) => item.from === edge.from && item.to === edge.to);
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
      const filtered = state.project.edges.filter((edge) => !(edge.from === from && edge.to === to));
      return {
        project: {
          ...state.project,
          edges: filtered,
          updated_at: updatedAt ?? state.project.updated_at,
        },
      };
    }),
  updateProjectSettings: (settingsPatch, updatedAt) =>
    set((state) => {
      if (!state.project) return state;
      const nextSettings = mergeSettings(state.project.settings ?? {}, settingsPatch);
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
}));

export function selectNodeById(project: ProjectFlow | null, nodeId?: string | null): FlowNode | null {
  if (!project || !nodeId) return null;
  return project.nodes.find((node) => node.node_id === nodeId) ?? null;
}

export interface NodeTemplate {
  type: FlowNode['type'];
  title: string;
  content_type?: string;
  content?: string;
  meta?: ({ input_ports?: InputPortSpec[] } & Record<string, unknown>);
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
}

export interface AddNodeOptions {
  slug: string;
  position?: { x: number; y: number };
}

function cloneNodeMeta(
  meta?: ({ input_ports?: InputPortSpec[] } & Record<string, unknown>) | undefined,
) {
  if (!meta) return undefined;
  const { input_ports, ...rest } = meta;
  return {
    ...rest,
    ...(input_ports
      ? {
          input_ports: input_ports.map((port, index) => ({
            ...port,
            id: port.id ?? generatePortId(`${(port.kind as string | undefined) ?? 'port'}-${index}`),
            kind: typeof port.kind === 'string' ? port.kind : 'text',
            max_items:
              typeof port.max_items === 'number' && Number.isFinite(port.max_items)
                ? Math.max(1, Math.floor(port.max_items))
                : 1,
          })),
        }
      : {}),
  } as ({ input_ports?: InputPortSpec[] } & Record<string, unknown>);
}

let portIdCounter = 0;

function generatePortId(seed = 'port') {
  portIdCounter += 1;
  return `${seed}-${Date.now()}-${portIdCounter}`;
}

export function buildNodeMap(project: ProjectFlow | null): Map<string, FlowNode> {
  const map = new Map<string, FlowNode>();
  if (!project) return map;
  for (const node of project.nodes) {
    map.set(node.node_id, node);
  }
  return map;
}

export function findPreviousNodes(project: ProjectFlow | null, nodeId: string): FlowNode[] {
  if (!project) return [];
  const adjacency = new Map<string, string[]>();
  for (const edge of project.edges) {
    const list = adjacency.get(edge.to) ?? [];
    list.push(edge.from);
    adjacency.set(edge.to, list);
  }
  const result: FlowNode[] = [];
  const visited = new Set<string>();
  const stack = [...(adjacency.get(nodeId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = project.nodes.find((item) => item.node_id === current);
    if (node) {
      result.push(node);
      stack.push(...(adjacency.get(current) ?? []));
    }
  }
  return result;
}

export function findNextNodes(project: ProjectFlow | null, nodeId: string): FlowNode[] {
  if (!project) return [];
  return project.edges
    .filter((edge) => edge.from === nodeId)
    .map((edge) => project.nodes.find((node) => node.node_id === edge.to))
    .filter((node): node is FlowNode => Boolean(node));
}

function mergeSettings(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value)) {
      const current = result[key];
      if (isPlainObject(current)) {
        result[key] = mergeSettings(current, value);
      } else {
        result[key] = deepClone(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function generateNodeId(existing: FlowNode[], slug: string): string {
  const maxNumber = existing.reduce((max, node) => {
    const match = /^n(\d+)_/.exec(node.node_id);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (!Number.isNaN(value)) {
        return Math.max(max, value);
      }
    }
    return max;
  }, 0);
  const next = maxNumber + 1;
  return `n${next}_${slug}`;
}

function sanitizeSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '');
  return normalized || 'node';
}

function createInitialNodeUi(position?: { x: number; y: number } | null): NodeUI {
  const width = NODE_DEFAULT_WIDTH;
  const height = NODE_DEFAULT_HEIGHT;
  const x1 = position ? Math.round(position.x) : DEFAULT_NODE_BBOX.x1;
  const y1 = position ? Math.round(position.y) : DEFAULT_NODE_BBOX.y1;
  return {
    color: NODE_DEFAULT_COLOR,
    bbox: {
      x1,
      y1,
      x2: x1 + width,
      y2: y1 + height,
    },
  };
}

function createDefaultConnections(): NodeConnections {
  return { incoming: [], outgoing: [] };
}

function normalizeProject(project: ProjectFlow): ProjectFlow {
  return {
    ...project,
    nodes: project.nodes.map(normalizeFlowNode),
  };
}

function normalizeFlowNode(node: FlowNode): FlowNode {
  const normalizedUi = normalizeNodeUi(node.ui as NodeUI | undefined);
  const connections = normalizeNodeConnections(node.connections as NodeConnections | undefined);
  return {
    ...node,
    ui: normalizedUi,
    ai_visible: node.ai_visible ?? true,
    connections,
  };
}

function normalizeNodeUi(ui: NodeUI | undefined): NodeUI {
  const color = typeof ui?.color === 'string' && ui.color.trim().length > 0 ? ui.color : NODE_DEFAULT_COLOR;
  const bbox = normalizeBoundingBox(ui?.bbox);
  return { color, bbox };
}

function normalizeBoundingBox(bbox?: NodeUI['bbox']): NodeUI['bbox'] {
  const fallback = DEFAULT_NODE_BBOX;
  if (!bbox) {
    return { ...fallback };
  }
  const width = sanitizeDimension(bbox.x2 - bbox.x1, NODE_DEFAULT_WIDTH, NODE_MIN_WIDTH, NODE_MAX_WIDTH);
  const height = sanitizeDimension(bbox.y2 - bbox.y1, NODE_DEFAULT_HEIGHT, NODE_MIN_HEIGHT, NODE_MAX_HEIGHT);
  const x1 = Number.isFinite(bbox.x1) ? bbox.x1 : fallback.x1;
  const y1 = Number.isFinite(bbox.y1) ? bbox.y1 : fallback.y1;
  return {
    x1,
    y1,
    x2: x1 + width,
    y2: y1 + height,
  };
}

function sanitizeDimension(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeNodeConnections(connections: NodeConnections | undefined): NodeConnections {
  const incoming = Array.isArray(connections?.incoming) ? connections!.incoming.filter(isValidIncoming) : [];
  const outgoing = Array.isArray(connections?.outgoing) ? connections!.outgoing.filter(isValidOutgoing) : [];
  return {
    incoming: incoming.map((entry) => ({
      edge_id: entry.edge_id,
      from: entry.from,
      routing: typeof entry.routing === 'string' ? entry.routing : '',
    })),
    outgoing: outgoing.map((entry) => ({
      edge_id: entry.edge_id,
      to: entry.to,
      routing: typeof entry.routing === 'string' ? entry.routing : '',
    })),
  };
}

function isValidIncoming(entry: NodeConnections['incoming'][number] | undefined): entry is NodeConnections['incoming'][number] {
  return Boolean(entry && entry.edge_id && entry.from);
}

function isValidOutgoing(entry: NodeConnections['outgoing'][number] | undefined): entry is NodeConnections['outgoing'][number] {
  return Boolean(entry && entry.edge_id && entry.to);
}
