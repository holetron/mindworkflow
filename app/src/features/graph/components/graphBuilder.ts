import { MarkerType, type Edge, type Node } from 'reactflow';
import type { ProjectFlow, FlowNode, NodeUI } from '../../../state/api';
import type { AiProviderOption, FlowNodeCardData } from '../../nodes/FlowNodeCard';
import {
  NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT,
  NODE_MIN_WIDTH, NODE_MIN_HEIGHT,
  NODE_MAX_WIDTH, NODE_MAX_HEIGHT,
  NODE_DEFAULT_COLOR,
} from '../../../constants/nodeDefaults';

/* ───── Types ───── */

interface GraphCanvasCallbacks {
  onRunNode: (nodeId: string) => void;
  onRegenerateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void | Promise<void>;
  onChangeNodeMeta: (nodeId: string, patch: Record<string, unknown>) => void;
  onChangeNodeContent: (nodeId: string, content: string) => void;
  onCommitNodeContent: (nodeId: string, content: string) => Promise<void> | void;
  onChangeNodeTitle: (nodeId: string, title: string) => void;
  onChangeNodeAi: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onChangeNodeUi: (nodeId: string, patch: Partial<NodeUI>) => void;
}

export interface BuildGraphArgs extends GraphCanvasCallbacks {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  providerOptions: AiProviderOption[];
  loading: boolean;
  isLocked: boolean;
  readOnly: boolean;
  draggingId: string | null;
  currentNodeSizes?: Map<string, { width: number; height: number }>;
  generatingNodes?: Set<string>;
  onMoveNodeToFolder?: (nodeId: string, folderId: string, options?: { index?: number | null }) => void | Promise<void>;
  onRemoveNodeFromFolder?: (nodeId: string, folderId: string) => void | Promise<void>;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => void | Promise<void>;
  onSplitTextNode?: FlowNodeCardData['onSplitText'];
}

export interface GraphElements {
  nodes: Node<FlowNodeCardData>[];
  edges: Edge[];
}

/* ───── Helpers ───── */

export function getNodeDimensions(node: Node<FlowNodeCardData>): { width: number; height: number } {
  const rawWidth =
    (typeof node.width === 'number' && Number.isFinite(node.width) && node.width) ||
    (typeof node.style?.width === 'number' && Number.isFinite(node.style.width) && node.style.width) ||
    (typeof node.data?.node?.ui?.bbox?.x2 === 'number' &&
      typeof node.data?.node?.ui?.bbox?.x1 === 'number' &&
      node.data.node.ui.bbox.x2 - node.data.node.ui.bbox.x1) ||
    NODE_DEFAULT_WIDTH;
  const rawHeight =
    (typeof node.height === 'number' && Number.isFinite(node.height) && node.height) ||
    (typeof node.style?.height === 'number' && Number.isFinite(node.style.height) && node.style.height) ||
    (typeof node.data?.node?.ui?.bbox?.y2 === 'number' &&
      typeof node.data?.node?.ui?.bbox?.y1 === 'number' &&
      node.data.node.ui.bbox.y2 - node.data.node.ui.bbox.y1) ||
    NODE_DEFAULT_HEIGHT;
  return {
    width: Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, Math.round(rawWidth))),
    height: Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, Math.round(rawHeight))),
  };
}

function getStoredPosition(node: FlowNode): { x: number; y: number } {
  const bbox = node.ui?.bbox;
  if (!bbox) return { x: 0, y: 0 };
  return {
    x: Number.isFinite(bbox.x1) ? bbox.x1 : 0,
    y: Number.isFinite(bbox.y1) ? bbox.y1 : 0,
  };
}

function getNodeWidth(node: FlowNode): number {
  const bbox = node.ui?.bbox;
  if (!bbox) return NODE_DEFAULT_WIDTH;
  const w = bbox.x2 - bbox.x1;
  return (!Number.isFinite(w) || w <= 0) ? NODE_DEFAULT_WIDTH : Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, w));
}

function getNodeHeight(node: FlowNode): number {
  const bbox = node.ui?.bbox;
  if (!bbox) return NODE_DEFAULT_HEIGHT;
  const h = bbox.y2 - bbox.y1;
  return (!Number.isFinite(h) || h <= 0) ? NODE_DEFAULT_HEIGHT : Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, h));
}

/* ───── Builder ───── */

export function buildGraphElements({
  project, selectedNodeId, providerOptions, loading, isLocked, readOnly,
  onRunNode, onRegenerateNode, onDeleteNode, onChangeNodeMeta,
  onChangeNodeContent, onCommitNodeContent, onChangeNodeTitle, onChangeNodeAi, onChangeNodeUi,
  currentNodeSizes, generatingNodes = new Set(),
  onRemoveNodeFromFolder, onRemoveInvalidPorts, onSplitTextNode,
}: BuildGraphArgs): GraphElements {
  if (!project) return { nodes: [], edges: [] };

  const projectNodes = Array.isArray(project.nodes) ? project.nodes : [];
  const projectEdges = Array.isArray(project.edges) ? project.edges : [];

  // Collect all node_ids that are inside folders
  const nodesInFolders = new Set<string>();
  projectNodes.forEach((node) => {
    if (node.type === 'folder') {
      const meta = (node.meta ?? {}) as Record<string, unknown>;
      const folderChildren = meta.folder_children;
      if (Array.isArray(folderChildren)) {
        folderChildren.forEach((childId) => {
          if (typeof childId === 'string') nodesInFolders.add(childId);
        });
      }
    }
  });

  const visibleNodes = projectNodes.filter((n) => !nodesInFolders.has(n.node_id));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.node_id));

  const nodes: Node<FlowNodeCardData>[] = visibleNodes.map((node) => {
    const position = getStoredPosition(node);
    const currentSize = currentNodeSizes?.get(node.node_id);
    const width = currentSize?.width ?? getNodeWidth(node);
    const height = currentSize?.height ?? getNodeHeight(node);

    const data: FlowNodeCardData = {
      node,
      projectId: project.project_id,
      onRun: onRunNode,
      onRegenerate: onRegenerateNode,
      onDelete: onDeleteNode,
      onChangeMeta: onChangeNodeMeta,
      onChangeContent: onChangeNodeContent,
      onCommitContent: onCommitNodeContent,
      onChangeTitle: onChangeNodeTitle,
      onChangeAi: onChangeNodeAi,
      onChangeUi: onChangeNodeUi,
      providers: providerOptions,
      sources: projectEdges
        .filter((e) => e.to === node.node_id)
        .map((e) => projectNodes.find((n) => n.node_id === e.from))
        .filter((n): n is FlowNode => Boolean(n))
        .map((s) => ({ node_id: s.node_id, title: s.title, type: s.type })),
      targets: projectEdges
        .filter((e) => e.from === node.node_id)
        .map((e) => projectNodes.find((n) => n.node_id === e.to))
        .filter((n): n is FlowNode => Boolean(n))
        .map((t) => ({ node_id: t.node_id, title: t.title, type: t.type })),
      disabled: loading || readOnly || Boolean(generatingNodes?.has(node.node_id)),
      isGenerating: Boolean(generatingNodes?.has(node.node_id)),
      allNodes: projectNodes,
      onRemoveNodeFromFolder,
      onRemoveInvalidPorts,
      onSplitText: onSplitTextNode,
    };

    return {
      id: node.node_id,
      type: 'flowNode',
      position, data,
      draggable: !loading && !isLocked && !readOnly && !generatingNodes?.has(node.node_id),
      selected: node.node_id === selectedNodeId,
      style: {
        width, height,
        minWidth: NODE_MIN_WIDTH, minHeight: NODE_MIN_HEIGHT,
        maxWidth: NODE_MAX_WIDTH, maxHeight: NODE_MAX_HEIGHT,
        border: `1px solid ${node.ui?.color ?? NODE_DEFAULT_COLOR}`,
        backgroundColor: '#1e293b',
      },
    } satisfies Node<FlowNodeCardData>;
  });

  const visibleEdges = projectEdges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));
  const edges: Edge[] = visibleEdges.map((edge, index) => {
    const sourceNode = projectNodes.find((n) => n.node_id === edge.from);
    const sourceColor = sourceNode?.ui?.color ?? NODE_DEFAULT_COLOR;
    return {
      id: `${edge.from}-${edge.to}-${index}`,
      source: edge.from, target: edge.to,
      sourceHandle: edge.sourceHandle || undefined,
      targetHandle: edge.targetHandle || undefined,
      label: edge.label, type: 'smart',
      style: { stroke: sourceColor },
      markerEnd: { type: MarkerType.ArrowClosed, color: sourceColor },
    };
  });

  return { nodes, edges };
}
