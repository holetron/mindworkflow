export interface NodeSpec {
  type: string;
  title: string;
  content?: string;
  slug?: string;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
}

export interface CreatedNodeSummary {
  node_id: string;
  type: string;
  title: string;
}

export interface CreatedNodeSnapshot extends CreatedNodeSummary {
  content_type?: string | null;
  ui_position?: { x: number; y: number } | null;
  meta?: Record<string, unknown>;
}

export interface TransformResult {
  createdNodes: CreatedNodeSummary[];
  logs: string[];
}

export interface TextSplitConfig {
  separator: string;
  subSeparator: string;
  namingMode: 'auto' | 'manual';
}

export interface TextSplitManualTitle {
  path: string;
  title: string;
}

export interface TextSplitPreviewSegment {
  path: string;
  depth: number;
  order: number;
  title: string;
  content: string;
  children: TextSplitPreviewSegment[];
}

export interface TextSplitPreviewResult {
  sourceNodeId: string;
  config: TextSplitConfig;
  segments: TextSplitPreviewSegment[];
}

export interface TextSplitResult {
  preview: TextSplitPreviewResult;
  createdNodes: CreatedNodeSummary[];
  nodeSnapshots: CreatedNodeSnapshot[];
  edges: Array<{ from: string; to: string }>;
  logs: string[];
  projectUpdatedAt: string;
}

export interface RawSegmentNode {
  path: string;
  parentPath: string | null;
  depth: number;
  order: number;
  siblings: number;
  content: string;
  children: RawSegmentNode[];
}

export type SegmentPlanItem = RawSegmentNode & {
  title: string;
};

export type SegmentPlacement = SegmentPlanItem & {
  position: { x: number; y: number };
};

export const DEFAULT_TEXT_SPLIT_CONFIG: TextSplitConfig = {
  separator: '---',
  subSeparator: '-',
  namingMode: 'auto',
};

export const DEFAULT_NODE_WIDTH = 450;
export const DEFAULT_NODE_HEIGHT = 200;
export const BASE_HORIZONTAL_OFFSET = 120;
export const LEVEL_HORIZONTAL_STEP = DEFAULT_NODE_WIDTH + 160;
export const TOP_LEVEL_VERTICAL_SPACING = DEFAULT_NODE_HEIGHT + 160;
export const CHILD_LEVEL_VERTICAL_SPACING = DEFAULT_NODE_HEIGHT + 140;
