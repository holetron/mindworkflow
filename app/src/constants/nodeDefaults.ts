export const NODE_MIN_WIDTH = 320;
export const NODE_MIN_HEIGHT = 200;
export const NODE_MAX_WIDTH = 640;
export const NODE_MAX_HEIGHT = 480;
export const NODE_DEFAULT_WIDTH = 360;
export const NODE_DEFAULT_HEIGHT = 260;
export const NODE_DEFAULT_COLOR = '#6B7280';

export const DEFAULT_NODE_BBOX = Object.freeze({
  x1: 0,
  y1: 0,
  x2: NODE_DEFAULT_WIDTH,
  y2: NODE_DEFAULT_HEIGHT,
});

export function normalizeNodeWidth(width: number | undefined): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return NODE_DEFAULT_WIDTH;
  }
  return Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, width));
}

export function normalizeNodeHeight(height: number | undefined): number {
  if (typeof height !== 'number' || !Number.isFinite(height)) {
    return NODE_DEFAULT_HEIGHT;
  }
  return Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, height));
}
