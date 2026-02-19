export const NODE_MIN_WIDTH = 450;
export const NODE_MIN_HEIGHT = 300;
export const NODE_MAX_WIDTH = 1600;
export const NODE_MAX_HEIGHT = 3200; // Increased max height (4 times the original 800px)
export const NODE_DEFAULT_WIDTH = 450;
export const NODE_DEFAULT_HEIGHT = 200;
export const NODE_DEFAULT_COLOR = '#6B7280';
export const NODE_COLLAPSED_HEIGHT = 180;

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

export function normalizeNodeHeight(height: number | undefined, nodeType?: string): number {
  if (typeof height !== 'number' || !Number.isFinite(height)) {
    return NODE_DEFAULT_HEIGHT;
  }
  return Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, height));
}

export function calculateContentBasedHeight(content: string | undefined, hasAiTabs: boolean = false, isCollapsed: boolean = false): number {
  // For collapsed nodes, return minimal height (header + footer)
  if (isCollapsed) {
    const headerHeight = 60; // Header height
    const footerHeight = 50; // Footer height
    return headerHeight + footerHeight;
  }
  
  if (!content) return NODE_DEFAULT_HEIGHT;
  
  const lines = content.split('\n');
  const lineHeight = 20; // Approximate line height in pixels
  const headerHeight = 60; // Header height
  const footerHeight = 50; // Footer height
  const aiTabsHeight = hasAiTabs ? 80 : 0; // Additional height for AI tabs if visible
  const padding = 40; // Content padding
  
  const contentHeight = lines.length * lineHeight;
  const totalHeight = headerHeight + contentHeight + footerHeight + aiTabsHeight + padding;
  
  return Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, totalHeight));
}
