import type { StateCreator } from 'zustand';
import type { FlowNode, NodeConnections } from '../api';
import type { ProjectStoreState, NodeSlice } from './types';
import {
  normalizeFlowNode,
  generateNodeId,
  sanitizeSlug,
  cloneNodeMeta,
  createInitialNodeUi,
  createDefaultConnections,
} from '../utils/nodeHelpers';

export const createNodeSlice: StateCreator<
  ProjectStoreState,
  [],
  [],
  NodeSlice
> = (set) => ({
  selectedNodeId: null,

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

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
      const exists = state.project.nodes.some(
        (item) => item.node_id === node.node_id,
      );
      const normalizedNode = normalizeFlowNode(node);
      const nodes = exists
        ? state.project.nodes.map((item) =>
            item.node_id === normalizedNode.node_id
              ? { ...item, ...normalizedNode }
              : item,
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

      const filteredNodes = state.project.nodes.filter(
        (node) => node.node_id !== nodeId,
      );
      const filteredEdges = state.project.edges.filter(
        (edge) => edge.from !== nodeId && edge.to !== nodeId,
      );
      const nextSelected =
        state.selectedNodeId === nodeId
          ? filteredNodes[0]?.node_id ?? null
          : state.selectedNodeId;
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
});
