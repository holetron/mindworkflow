export interface NodeBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NodeUI {
  color: string;
  bbox: NodeBoundingBox;
}

export interface NodeIncomingConnection {
  edge_id: string;
  from: string;
  routing: string;
}

export interface NodeOutgoingConnection {
  edge_id: string;
  to: string;
  routing: string;
}

export interface NodeConnections {
  incoming: NodeIncomingConnection[];
  outgoing: NodeOutgoingConnection[];
}

export const DEFAULT_NODE_UI_COLOR = '#6B7280';

export const DEFAULT_NODE_UI_BBOX: Readonly<NodeBoundingBox> = Object.freeze({
  x1: 0,
  y1: 0,
  x2: 240,
  y2: 120,
});

export function createDefaultNodeUI(): NodeUI {
  return {
    color: DEFAULT_NODE_UI_COLOR,
    bbox: { ...DEFAULT_NODE_UI_BBOX },
  };
}

export function createDefaultNodeConnections(): NodeConnections {
  return { incoming: [], outgoing: [] };
}
