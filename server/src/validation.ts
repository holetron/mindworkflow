import {
  NodeConnections,
  NodeIncomingConnection,
  NodeOutgoingConnection,
  NodeUI,
  DEFAULT_NODE_UI_BBOX,
  DEFAULT_NODE_UI_COLOR,
  createDefaultNodeConnections,
  createDefaultNodeUI,
} from './types';

const COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const MIN_WIDTH = DEFAULT_NODE_UI_BBOX.x2 - DEFAULT_NODE_UI_BBOX.x1 || 1;
const MIN_HEIGHT = DEFAULT_NODE_UI_BBOX.y2 - DEFAULT_NODE_UI_BBOX.y1 || 1;

export function normalizeNodeUI(input?: Partial<NodeUI>): NodeUI {
  const base = createDefaultNodeUI();
  if (!input) {
    return base;
  }

  const colorCandidate = typeof input.color === 'string' ? input.color.trim() : base.color;
  const color = COLOR_REGEX.test(colorCandidate) ? colorCandidate : DEFAULT_NODE_UI_COLOR;

  const bboxSource = input.bbox ?? base.bbox;
  const bbox = {
    x1: pickFiniteNumber(bboxSource?.x1, base.bbox.x1),
    y1: pickFiniteNumber(bboxSource?.y1, base.bbox.y1),
    x2: pickFiniteNumber(bboxSource?.x2, base.bbox.x2),
    y2: pickFiniteNumber(bboxSource?.y2, base.bbox.y2),
  };

  if (bbox.x2 <= bbox.x1) {
    bbox.x2 = bbox.x1 + MIN_WIDTH;
  }
  if (bbox.y2 <= bbox.y1) {
    bbox.y2 = bbox.y1 + MIN_HEIGHT;
  }

  const normalized: NodeUI = { color, bbox };
  assertValidNodeUI(normalized);
  return normalized;
}

export function mergeNodeUI(current: NodeUI, patch?: Partial<NodeUI>): NodeUI {
  if (!patch) {
    return current;
  }

  return normalizeNodeUI({
    color: patch.color ?? current.color,
    bbox: {
      x1: pickFiniteNumber(patch.bbox?.x1, current.bbox.x1),
      y1: pickFiniteNumber(patch.bbox?.y1, current.bbox.y1),
      x2: pickFiniteNumber(patch.bbox?.x2, current.bbox.x2),
      y2: pickFiniteNumber(patch.bbox?.y2, current.bbox.y2),
    },
  });
}

export function normalizeNodeConnections(input?: Partial<NodeConnections>): NodeConnections {
  const base = createDefaultNodeConnections();
  if (!input) {
    return base;
  }

  const incoming = Array.isArray(input.incoming)
    ? sanitizeIncomingConnections(input.incoming)
    : base.incoming;
  const outgoing = Array.isArray(input.outgoing)
    ? sanitizeOutgoingConnections(input.outgoing)
    : base.outgoing;

  const normalized: NodeConnections = { incoming, outgoing };
  assertValidNodeConnections(normalized);
  return normalized;
}

export function mergeNodeConnections(
  current: NodeConnections,
  patch?: Partial<NodeConnections>,
): NodeConnections {
  if (!patch) {
    return current;
  }

  return normalizeNodeConnections({
    incoming: patch.incoming ?? current.incoming,
    outgoing: patch.outgoing ?? current.outgoing,
  });
}

export function normalizeAiVisible(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return true;
}

export function assertValidNodeUI(ui: NodeUI): void {
  if (!COLOR_REGEX.test(ui.color)) {
    throw new Error(`Invalid node color: ${ui.color}`);
  }

  const { x1, y1, x2, y2 } = ui.bbox;
  assertFiniteNumber(x1, 'bbox.x1');
  assertFiniteNumber(y1, 'bbox.y1');
  assertFiniteNumber(x2, 'bbox.x2');
  assertFiniteNumber(y2, 'bbox.y2');

  if (x2 <= x1) {
    throw new Error(`Invalid node bbox: x2 (${x2}) must be greater than x1 (${x1})`);
  }
  if (y2 <= y1) {
    throw new Error(`Invalid node bbox: y2 (${y2}) must be greater than y1 (${y1})`);
  }
}

export function assertValidNodeConnections(connections: NodeConnections): void {
  if (!connections || typeof connections !== 'object') {
    throw new Error('Node connections must be an object');
  }
  if (!Array.isArray(connections.incoming) || !Array.isArray(connections.outgoing)) {
    throw new Error('Node connections must include incoming/outgoing arrays');
  }

  connections.incoming.forEach((connection, index) => {
    assertValidIncomingConnection(connection, index);
  });
  connections.outgoing.forEach((connection, index) => {
    assertValidOutgoingConnection(connection, index);
  });
}

function sanitizeIncomingConnections(values: unknown[]): NodeIncomingConnection[] {
  const result: NodeIncomingConnection[] = [];
  for (const raw of values) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const { edge_id, from, routing } = raw as Record<string, unknown>;
    if (!isNonEmptyString(edge_id) || !isNonEmptyString(from)) {
      continue;
    }
    const routingValue = typeof routing === 'string' ? routing.trim() : '';
    result.push({
      edge_id: edge_id.trim(),
      from: from.trim(),
      routing: routingValue,
    });
  }
  return result;
}

function sanitizeOutgoingConnections(values: unknown[]): NodeOutgoingConnection[] {
  const result: NodeOutgoingConnection[] = [];
  for (const raw of values) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const { edge_id, to, routing } = raw as Record<string, unknown>;
    if (!isNonEmptyString(edge_id) || !isNonEmptyString(to)) {
      continue;
    }
    const routingValue = typeof routing === 'string' ? routing.trim() : '';
    result.push({
      edge_id: edge_id.trim(),
      to: to.trim(),
      routing: routingValue,
    });
  }
  return result;
}

function assertValidIncomingConnection(connection: NodeIncomingConnection, index: number): void {
  if (!isNonEmptyString(connection.edge_id)) {
    throw new Error(`Incoming connection #${index} has invalid edge_id`);
  }
  if (!isNonEmptyString(connection.from)) {
    throw new Error(`Incoming connection #${index} has invalid from node id`);
  }
  if (typeof connection.routing !== 'string') {
    throw new Error(`Incoming connection #${index} has invalid routing`);
  }
}

function assertValidOutgoingConnection(connection: NodeOutgoingConnection, index: number): void {
  if (!isNonEmptyString(connection.edge_id)) {
    throw new Error(`Outgoing connection #${index} has invalid edge_id`);
  }
  if (!isNonEmptyString(connection.to)) {
    throw new Error(`Outgoing connection #${index} has invalid to node id`);
  }
  if (typeof connection.routing !== 'string') {
    throw new Error(`Outgoing connection #${index} has invalid routing`);
  }
}

function pickFiniteNumber(candidate: unknown, fallback: number): number {
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback;
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
