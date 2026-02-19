import {
  DEFAULT_NODE_BBOX,
  NODE_DEFAULT_COLOR,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  NODE_MAX_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MIN_WIDTH,
} from '../../constants/nodeDefaults';
import type {
  FlowNode,
  InputPortSpec,
  NodeConnections,
  NodeUI,
} from '../api';

let portIdCounter = 0;

export function generatePortId(seed = 'port'): string {
  portIdCounter += 1;
  return `${seed}-${Date.now()}-${portIdCounter}`;
}

export function cloneNodeMeta(
  meta?: ({ input_ports?: InputPortSpec[] } & Record<string, unknown>) | undefined,
): ({ input_ports?: InputPortSpec[] } & Record<string, unknown>) | undefined {
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
  } as { input_ports?: InputPortSpec[] } & Record<string, unknown>;
}

export function generateNodeId(existing: FlowNode[], slug: string): string {
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

export function sanitizeSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '');
  return normalized || 'node';
}

export function createInitialNodeUi(position?: { x: number; y: number } | null): NodeUI {
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

export function createDefaultConnections(): NodeConnections {
  return { incoming: [], outgoing: [] };
}

export function normalizeProject(project: FlowNode[] | { nodes: FlowNode[] }): FlowNode[] {
  const nodes = Array.isArray(project) ? project : project.nodes;
  return nodes.map(normalizeFlowNode);
}

export function normalizeFlowNode(node: FlowNode): FlowNode {
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

function isValidIncoming(
  entry: NodeConnections['incoming'][number] | undefined,
): entry is NodeConnections['incoming'][number] {
  return Boolean(entry && entry.edge_id && entry.from);
}

function isValidOutgoing(
  entry: NodeConnections['outgoing'][number] | undefined,
): entry is NodeConnections['outgoing'][number] {
  return Boolean(entry && entry.edge_id && entry.to);
}
