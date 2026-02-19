/**
 * Text-splitting logic extracted from TransformerService.
 * Handles preview, execution, placement computation, and segment trees.
 */

import createHttpError from 'http-errors';
import {
  createProjectNode,
  addProjectEdge,
  withTransaction,
  getNode,
  type StoredNode,
} from '../../db';
import {
  clampTitle,
  deriveFallbackTitle,
  extractTitleFromContent,
  flattenSegments,
  buildPreviewTree,
  splitContentByDelimiter,
} from './helpers';
import type {
  CreatedNodeSummary,
  CreatedNodeSnapshot,
  TextSplitConfig,
  TextSplitManualTitle,
  TextSplitPreviewResult,
  TextSplitResult,
  RawSegmentNode,
  SegmentPlanItem,
  SegmentPlacement,
} from './types';
import {
  DEFAULT_TEXT_SPLIT_CONFIG,
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  BASE_HORIZONTAL_OFFSET,
  LEVEL_HORIZONTAL_STEP,
  TOP_LEVEL_VERTICAL_SPACING,
  CHILD_LEVEL_VERTICAL_SPACING,
} from './types';

// ---------------------------------------------------------------------------
// Source node helper
// ---------------------------------------------------------------------------

export function ensureSourceNode(projectId: string, nodeId: string): StoredNode {
  const node = getNode(projectId, nodeId);
  if (!node) {
    throw createHttpError(404, `Node ${nodeId} not found in project ${projectId}`);
  }
  return node;
}

// ---------------------------------------------------------------------------
// Config sanitization
// ---------------------------------------------------------------------------

export function sanitizeTextSplitConfig(config?: Partial<TextSplitConfig>): TextSplitConfig {
  const normalized = config ?? {};
  const separator =
    typeof normalized.separator === 'string' && normalized.separator.trim().length > 0
      ? normalized.separator.trim()
      : DEFAULT_TEXT_SPLIT_CONFIG.separator;

  let subSeparator: string;
  if (normalized.subSeparator === undefined) {
    subSeparator = DEFAULT_TEXT_SPLIT_CONFIG.subSeparator;
  } else if (typeof normalized.subSeparator === 'string') {
    subSeparator = normalized.subSeparator.trim();
  } else {
    subSeparator = DEFAULT_TEXT_SPLIT_CONFIG.subSeparator;
  }

  const namingMode: 'auto' | 'manual' = normalized.namingMode === 'manual' ? 'manual' : 'auto';
  return {
    separator,
    subSeparator,
    namingMode,
  };
}

// ---------------------------------------------------------------------------
// Manual title map builder
// ---------------------------------------------------------------------------

export function buildManualTitleMap(entries?: TextSplitManualTitle[] | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(entries)) {
    return map;
  }
  entries.forEach((entry) => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.title !== 'string') {
      return;
    }
    const path = entry.path.trim();
    const title = clampTitle(entry.title);
    if (path && title) {
      map.set(path, title);
    }
  });
  return map;
}

// ---------------------------------------------------------------------------
// Segment tree construction
// ---------------------------------------------------------------------------

export function buildSegmentTree(content: string, config: TextSplitConfig): RawSegmentNode[] {
  const topParts = splitContentByDelimiter(content, config.separator);
  if (topParts.length === 0) {
    return [];
  }

  return topParts.map((part, index) => {
    const path = `${index}`;
    const children = buildSubSegments(part, path, config);
    return {
      path,
      parentPath: null,
      depth: 0,
      order: index,
      siblings: topParts.length,
      content: part,
      children,
    };
  });
}

export function buildSubSegments(content: string, parentPath: string, config: TextSplitConfig): RawSegmentNode[] {
  if (!config.subSeparator) {
    return [];
  }
  const parts = splitContentByDelimiter(content, config.subSeparator);
  if (parts.length <= 1) {
    return [];
  }
  return parts.map((part, index) => ({
    path: `${parentPath}.${index}`,
    parentPath,
    depth: 1,
    order: index,
    siblings: parts.length,
    content: part,
    children: [],
  }));
}

// ---------------------------------------------------------------------------
// Split plan builder
// ---------------------------------------------------------------------------

export function buildSplitPlan(
  content: string,
  config: TextSplitConfig,
  manualTitleMap: Map<string, string>,
): {
  segments: RawSegmentNode[];
  plan: SegmentPlanItem[];
  titleByPath: Map<string, string>;
  previewSegments: import('./types').TextSplitPreviewSegment[];
} {
  const segments = buildSegmentTree(content, config);
  const flatSegments = flattenSegments(segments);
  const plan: SegmentPlanItem[] = [];
  const titleByPath = new Map<string, string>();

  flatSegments.forEach((segment) => {
    const manualTitle = config.namingMode === 'manual' ? manualTitleMap.get(segment.path) : undefined;
    const autoTitle = extractTitleFromContent(segment.content);
    const finalTitle = clampTitle(manualTitle || autoTitle || deriveFallbackTitle(segment.path));
    titleByPath.set(segment.path, finalTitle);
    plan.push({
      ...segment,
      title: finalTitle,
    });
  });

  const previewSegments = buildPreviewTree(segments, titleByPath);

  return {
    segments,
    plan,
    titleByPath,
    previewSegments,
  };
}

// ---------------------------------------------------------------------------
// Placement computation
// ---------------------------------------------------------------------------

export function computePlacements(sourceNode: StoredNode, plan: SegmentPlanItem[]): SegmentPlacement[] {
  const bbox = sourceNode.ui?.bbox ?? {
    x1: 0,
    y1: 0,
    x2: DEFAULT_NODE_WIDTH,
    y2: DEFAULT_NODE_HEIGHT,
  };
  const baseRight =
    typeof bbox.x2 === 'number' && Number.isFinite(bbox.x2) ? bbox.x2 : DEFAULT_NODE_WIDTH;
  const top = typeof bbox.y1 === 'number' && Number.isFinite(bbox.y1) ? bbox.y1 : 0;
  const bottom =
    typeof bbox.y2 === 'number' && Number.isFinite(bbox.y2) ? bbox.y2 : top + DEFAULT_NODE_HEIGHT;
  const sourceCenterY = (top + bottom) / 2;

  const placements: SegmentPlacement[] = [];
  const placementByPath = new Map<string, SegmentPlacement>();

  plan.forEach((item) => {
    const level = item.depth;
    const siblings = item.siblings > 0 ? item.siblings : 1;
    const order = item.order;
    const x = Math.round(baseRight + BASE_HORIZONTAL_OFFSET + level * LEVEL_HORIZONTAL_STEP);

    let centerY = sourceCenterY;
    if (level === 0) {
      const offset = siblings > 1 ? (order - (siblings - 1) / 2) * TOP_LEVEL_VERTICAL_SPACING : 0;
      centerY = sourceCenterY + offset;
    } else {
      const parentPlacement = item.parentPath ? placementByPath.get(item.parentPath) : undefined;
      const parentCenter = parentPlacement
        ? parentPlacement.position.y + DEFAULT_NODE_HEIGHT / 2
        : sourceCenterY;
      const offset =
        siblings > 1 ? (order - (siblings - 1) / 2) * CHILD_LEVEL_VERTICAL_SPACING : 0;
      centerY = parentCenter + offset;
    }

    const y = Math.round(centerY - DEFAULT_NODE_HEIGHT / 2);
    const placement: SegmentPlacement = {
      ...item,
      position: {
        x,
        y,
      },
    };
    placements.push(placement);
    placementByPath.set(item.path, placement);
  });

  return placements;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export async function previewTextSplit(
  projectId: string,
  sourceNodeId: string,
  options?: {
    content?: string | null;
    config?: Partial<TextSplitConfig>;
    manualTitles?: TextSplitManualTitle[];
  },
): Promise<TextSplitPreviewResult> {
  const sourceNode = ensureSourceNode(projectId, sourceNodeId);
  const contentSource =
    typeof options?.content === 'string'
      ? options.content
      : typeof sourceNode.content === 'string'
        ? sourceNode.content
        : '';
  const content = contentSource.trim();
  if (!content) {
    throw createHttpError(400, 'Nothing to split: text node is empty');
  }

  const config = sanitizeTextSplitConfig(options?.config);
  const manualTitleMap = buildManualTitleMap(options?.manualTitles);
  const { previewSegments } = buildSplitPlan(content, config, manualTitleMap);

  if (previewSegments.length === 0) {
    throw createHttpError(400, 'Failed to extract segments using the specified delimiters');
  }

  return {
    sourceNodeId,
    config,
    segments: previewSegments,
  };
}

// ---------------------------------------------------------------------------
// Execute split
// ---------------------------------------------------------------------------

export async function splitTextNode(
  projectId: string,
  sourceNodeId: string,
  options?: {
    content?: string | null;
    config?: Partial<TextSplitConfig>;
    manualTitles?: TextSplitManualTitle[];
  },
): Promise<TextSplitResult> {
  const sourceNode = ensureSourceNode(projectId, sourceNodeId);
  const contentSource =
    typeof options?.content === 'string'
      ? options.content
      : typeof sourceNode.content === 'string'
        ? sourceNode.content
        : '';
  const content = contentSource.trim();
  if (!content) {
    throw createHttpError(400, 'Nothing to split: text node is empty');
  }

  const config = sanitizeTextSplitConfig(options?.config);
  const manualTitleMap = buildManualTitleMap(options?.manualTitles);
  const { plan, previewSegments } = buildSplitPlan(content, config, manualTitleMap);

  if (plan.length === 0) {
    throw createHttpError(400, 'Failed to extract segments using the specified delimiters');
  }

  const placements = computePlacements(sourceNode, plan);
  const logs: string[] = [];

  const transactionResult = withTransaction(() => {
    const createdNodes: CreatedNodeSummary[] = [];
    const nodeSnapshots: CreatedNodeSnapshot[] = [];
    const edges: Array<{ from: string; to: string }> = [];
    const pathToNodeId = new Map<string, string>();
    let lastUpdatedAt: string | null = null;

    placements.forEach((placement) => {
      const parentNodeId =
        placement.parentPath && pathToNodeId.has(placement.parentPath)
          ? pathToNodeId.get(placement.parentPath)!
          : sourceNodeId;

      const meta: Record<string, unknown> = {
        text_split: {
          source_node_id: sourceNodeId,
          parent_path: placement.parentPath,
          path: placement.path,
          depth: placement.depth,
          order: placement.order,
          separator: config.separator,
          sub_separator: config.subSeparator,
          naming_mode: config.namingMode,
          generated_at: new Date().toISOString(),
        },
      };

      const { node, updated_at } = createProjectNode(
        projectId,
        {
          type: 'text',
          title: placement.title,
          content: placement.content,
          content_type: 'text/plain',
          meta,
        },
        {
          position: placement.position,
        },
      );

      addProjectEdge(projectId, {
        from: parentNodeId,
        to: node.node_id,
      });

      pathToNodeId.set(placement.path, node.node_id);
      lastUpdatedAt = updated_at;
      createdNodes.push({ node_id: node.node_id, type: node.type, title: node.title });
      nodeSnapshots.push({
        node_id: node.node_id,
        type: node.type,
        title: node.title,
        content_type: node.content_type ?? null,
        ui_position: { x: node.ui.bbox.x1, y: node.ui.bbox.y1 },
        meta: node.meta ?? {},
      });
      edges.push({ from: parentNodeId, to: node.node_id });
      logs.push(`Created segment "${node.title}" (${node.node_id})`);
    });

    if (!lastUpdatedAt) {
      throw createHttpError(500, 'Failed to commit project update after text splitting');
    }

    return {
      createdNodes,
      nodeSnapshots,
      edges,
      projectUpdatedAt: lastUpdatedAt,
    };
  });

  if (transactionResult.createdNodes.length > 1) {
    logs.push(
      `Created ${transactionResult.createdNodes.length} segment${transactionResult.createdNodes.length === 1 ? '' : 's'}.`,
    );
  }

  return {
    preview: {
      sourceNodeId,
      config,
      segments: previewSegments,
    },
    createdNodes: transactionResult.createdNodes,
    nodeSnapshots: transactionResult.nodeSnapshots,
    edges: transactionResult.edges,
    logs,
    projectUpdatedAt: transactionResult.projectUpdatedAt,
  };
}

// ---------------------------------------------------------------------------
// Single text node creation
// ---------------------------------------------------------------------------

export async function createSingleTextNode(
  projectId: string,
  sourceNodeId: string,
  rawContent: string,
  explicitTitle?: string,
  nodeType: 'text' | 'folder' = 'text',
): Promise<CreatedNodeSummary> {
  const sourceNode = ensureSourceNode(projectId, sourceNodeId);
  const content = rawContent.trim();

  if (!content && nodeType !== 'folder') {
    throw createHttpError(400, 'Empty AI response — new text node was not created');
  }

  const autoTitle = extractTitleFromContent(content) ?? deriveFallbackTitle('0');
  const title = clampTitle(explicitTitle?.trim() || autoTitle);

  const plan: SegmentPlanItem = {
    path: '0',
    parentPath: null,
    depth: 0,
    order: 0,
    siblings: 1,
    content,
    children: [],
    title,
  };
  const [placement] = computePlacements(sourceNode, [plan]);

  const { node } = createProjectNode(
    projectId,
    {
      type: nodeType,
      title: placement.title,
      content: nodeType === 'folder' ? '' : content,
      content_type: 'text/plain',
      meta: {
        generated_from: {
          kind: 'ai_single_node',
          source_node_id: sourceNodeId,
          generated_at: new Date().toISOString(),
        },
      },
    },
    {
      position: placement.position,
    },
  );

  addProjectEdge(projectId, {
    from: sourceNodeId,
    to: node.node_id,
  });

  return {
    node_id: node.node_id,
    type: node.type,
    title: node.title,
  };
}
