import createHttpError from 'http-errors';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'transformerService' });
import {
  createProjectNode,
  addProjectEdge,
  withTransaction,
  getNode,
  type StoredNode,
} from '../db';

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

const DEFAULT_TEXT_SPLIT_CONFIG: TextSplitConfig = {
  separator: '---',
  subSeparator: '-',
  namingMode: 'auto',
};

const DEFAULT_NODE_WIDTH = 450;
const DEFAULT_NODE_HEIGHT = 200;
const BASE_HORIZONTAL_OFFSET = 120;
const LEVEL_HORIZONTAL_STEP = DEFAULT_NODE_WIDTH + 160;
const TOP_LEVEL_VERTICAL_SPACING = DEFAULT_NODE_HEIGHT + 160;
const CHILD_LEVEL_VERTICAL_SPACING = DEFAULT_NODE_HEIGHT + 140;

interface RawSegmentNode {
  path: string;
  parentPath: string | null;
  depth: number;
  order: number;
  siblings: number;
  content: string;
  children: RawSegmentNode[];
}

type SegmentPlanItem = RawSegmentNode & {
  title: string;
};

type SegmentPlacement = SegmentPlanItem & {
  position: { x: number; y: number };
};

// Функция определения цвета по типу ноды
function getNodeTypeColor(type: string): string {
  switch (type) {
    case 'input':
      return '#10b981';
    case 'output':
      return '#f59e0b';
    case 'ai':
      return '#8b5cf6';
    case 'ai_improved':
      return '#8b5cf6';
    case 'text':
      return '#64748b';
    case 'file':
      return '#f59e0b';
    case 'image':
      return '#ec4899';
    case 'video':
      return '#06b6d4';
    case 'audio':
      return '#84cc16';
    case 'html':
      return '#f97316';
    case 'transformer':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function splitContentByDelimiter(content: string, delimiter: string): string[] {
  const normalized = normalizeNewlines(content);
  const trimmedDelimiter = delimiter.trim();
  if (!trimmedDelimiter) {
    const single = normalized.trim();
    return single ? [single] : [];
  }
  const pattern = new RegExp(`\\s*${escapeRegExp(trimmedDelimiter)}\\s*`, 'g');
  return normalized
    .split(pattern)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function clampTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 80) {
    return trimmed;
  }
  return `${trimmed.slice(0, 77).trimEnd()}…`;
}

function deriveFallbackTitle(path: string): string {
  const parts = path
    .split('.')
    .map((segment) => {
      const index = Number.parseInt(segment, 10);
      return Number.isNaN(index) ? segment : index + 1;
    });
  if (parts.length <= 1) {
    return `Сегмент ${parts[0]}`;
  }
  return `Подсегмент ${parts.join('.')}`;
}

function extractTitleFromContent(content: string): string | null {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) {
    return null;
  }
  const lines = normalized.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const cleaned = trimmed
      .replace(/^#+\s*/, '')
      .replace(/^\d+[\.\)]\s*/, '')
      .replace(/^[-*•]+\s*/, '')
      .replace(/[`*_]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) {
      return cleaned;
    }
  }
  return null;
}

function flattenSegments(segments: RawSegmentNode[]): RawSegmentNode[] {
  const result: RawSegmentNode[] = [];
  const traverse = (node: RawSegmentNode) => {
    result.push(node);
    node.children.forEach(traverse);
  };
  segments.forEach(traverse);
  return result;
}

function buildPreviewTree(
  segments: RawSegmentNode[],
  titleByPath: Map<string, string>,
): TextSplitPreviewSegment[] {
  return segments.map((segment) => ({
    path: segment.path,
    depth: segment.depth,
    order: segment.order,
    title: titleByPath.get(segment.path) ?? deriveFallbackTitle(segment.path),
    content: segment.content,
    children: buildPreviewTree(segment.children, titleByPath),
  }));
}

export class TransformerService {
  /**
   * Парсит JSON с нодами и создает красивое дерево нод слева направо
   */
  async transformJsonToNodes(
    projectId: string,
    sourceNodeId: string,
    jsonContent: string,
    startX: number,
    startY: number,
  ): Promise<TransformResult> {
    const logs: string[] = [];
    try {
      logs.push(`Получен JSON от ИИ (первые 200 символов): ${jsonContent.substring(0, 200)}...`);
      log.info('[TransformerService] Full JSON content %s', jsonContent);
      const parsed = JSON.parse(jsonContent);
      let nodes: NodeSpec[] = [];
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        nodes = parsed.nodes;
        logs.push(`Найдено поле nodes с ${nodes.length} элементами`);
      } else if (Array.isArray(parsed)) {
        nodes = parsed;
        logs.push(`JSON является массивом с ${nodes.length} элементами`);
      } else {
        logs.push(`Неверный формат JSON. Тип: ${typeof parsed}, содержимое: ${JSON.stringify(parsed, null, 2)}`);
        throw new Error('JSON должен содержать массив nodes или быть массивом нод');
      }
      logs.push(`Найдено ${nodes.length} нод для создания`);
      const createdNodes: CreatedNodeSummary[] = [];

      // Параметры для красивого mindmap с шахматным расположением
      const levelSpacing = 500; // расстояние между уровнями по горизонтали
      const nodeSpacing = 200; // базовое расстояние между нодами по вертикали
      const staggerOffset = 120; // смещение для шахматного порядка
      const verticalPadding = 50; // дополнительный отступ между группами

      // Рекурсивная функция для построения красивого дерева
      const createTree = (
        nodeSpec: any,
        parentId: string,
        depth: number,
        x: number,
        baseY: number,
        siblingIndex = 0,
        totalSiblings = 1,
      ) => {
        if (depth > 100) return;

        // Вычисляем позицию с шахматным порядком для лучшей визуальной иерархии
        let y = baseY;
        if (totalSiblings > 1) {
          const isEven = siblingIndex % 2 === 0;
          const verticalOffset = Math.floor(siblingIndex / 2) * nodeSpacing;
          y = baseY + (isEven ? -verticalOffset - verticalPadding : verticalOffset + nodeSpacing + verticalPadding);

          if (depth > 1) {
            const levelStagger = depth % 2 === 0 ? staggerOffset : -staggerOffset;
            y += levelStagger;
          }
        }

        const { node } = createProjectNode(
          projectId,
          {
            type: nodeSpec.type || 'text',
            title: nodeSpec.title || `Нода`,
            content: nodeSpec.content || '',
            slug: nodeSpec.slug,
            meta: nodeSpec.meta,
            ai: nodeSpec.ai,
            ui: {
              color: getNodeTypeColor(nodeSpec.type || 'text'),
            },
          },
          {
            position: { x, y },
          },
        );

        addProjectEdge(projectId, {
          from: parentId,
          to: node.node_id,
        });

        createdNodes.push({ node_id: node.node_id, type: node.type, title: node.title });
        logs.push(`Создана нода: ${node.title} (${node.type}) на уровне ${depth} в шахматной позиции (${x}, ${y})`);

        if (Array.isArray(nodeSpec.children) && nodeSpec.children.length > 0) {
          const childrenCount = nodeSpec.children.length;
          const childX = x + levelSpacing;

          nodeSpec.children.forEach((child: any, idx: number) => {
            createTree(child, node.node_id, depth + 1, childX, y, idx, childrenCount);
          });
        }
      };

      return withTransaction(() => {
        const rootCount = nodes.length;
        nodes.forEach((nodeSpec, idx) => {
          const x = startX + levelSpacing;
          let y = startY;
          if (rootCount > 1) {
            const isEven = idx % 2 === 0;
            const verticalOffset = Math.floor(idx / 2) * nodeSpacing;
            y = startY + (isEven ? -verticalOffset - verticalPadding : verticalOffset + nodeSpacing + verticalPadding);
          }
          createTree(nodeSpec, sourceNodeId, 1, x, y, idx, rootCount);
        });
        return { createdNodes, logs };
      });
    } catch (err) {
      logs.push(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  sanitizeTextSplitConfig(config?: Partial<TextSplitConfig>): TextSplitConfig {
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

  async previewTextSplit(
    projectId: string,
    sourceNodeId: string,
    options?: {
      content?: string | null;
      config?: Partial<TextSplitConfig>;
      manualTitles?: TextSplitManualTitle[];
    },
  ): Promise<TextSplitPreviewResult> {
    const sourceNode = this.ensureSourceNode(projectId, sourceNodeId);
    const contentSource =
      typeof options?.content === 'string'
        ? options.content
        : typeof sourceNode.content === 'string'
          ? sourceNode.content
          : '';
    const content = contentSource.trim();
    if (!content) {
      throw createHttpError(400, 'Нечего разделять: текстовая нода пуста');
    }

    const config = this.sanitizeTextSplitConfig(options?.config);
    const manualTitleMap = this.buildManualTitleMap(options?.manualTitles);
    const { segments, titleByPath, previewSegments } = this.buildSplitPlan(content, config, manualTitleMap);

    if (segments.length === 0) {
      throw createHttpError(400, 'Не удалось выделить сегменты по указанным разделителям');
    }

    return {
      sourceNodeId,
      config,
      segments: previewSegments,
    };
  }

  async splitTextNode(
    projectId: string,
    sourceNodeId: string,
    options?: {
      content?: string | null;
      config?: Partial<TextSplitConfig>;
      manualTitles?: TextSplitManualTitle[];
    },
  ): Promise<TextSplitResult> {
    const sourceNode = this.ensureSourceNode(projectId, sourceNodeId);
    const contentSource =
      typeof options?.content === 'string'
        ? options.content
        : typeof sourceNode.content === 'string'
          ? sourceNode.content
          : '';
    const content = contentSource.trim();
    if (!content) {
      throw createHttpError(400, 'Нечего разделять: текстовая нода пуста');
    }

    const config = this.sanitizeTextSplitConfig(options?.config);
    const manualTitleMap = this.buildManualTitleMap(options?.manualTitles);
    const { segments, plan, titleByPath, previewSegments } = this.buildSplitPlan(content, config, manualTitleMap);

    if (plan.length === 0) {
      throw createHttpError(400, 'Не удалось выделить сегменты по указанным разделителям');
    }

    const placements = this.computePlacements(sourceNode, plan);
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
        logs.push(`Создан сегмент "${node.title}" (${node.node_id})`);
      });

      if (!lastUpdatedAt) {
        throw createHttpError(500, 'Не удалось зафиксировать обновление проекта после разделения текста');
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
        `Создано ${transactionResult.createdNodes.length} ${this.selectRussianPlural(transactionResult.createdNodes.length, [
          'сегмент',
          'сегмента',
          'сегментов',
        ])}.`,
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

  async createSingleTextNode(
    projectId: string,
    sourceNodeId: string,
    rawContent: string,
    explicitTitle?: string,
    nodeType: 'text' | 'folder' = 'text',
  ): Promise<CreatedNodeSummary> {
    const sourceNode = this.ensureSourceNode(projectId, sourceNodeId);
    const content = rawContent.trim();
    
    // Для папок разрешаем пустое содержимое
    if (!content && nodeType !== 'folder') {
      throw createHttpError(400, 'Пустой ответ ИИ — новая текстовая нода не создана');
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
    const [placement] = this.computePlacements(sourceNode, [plan]);

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

  private ensureSourceNode(projectId: string, nodeId: string): StoredNode {
    const node = getNode(projectId, nodeId);
    if (!node) {
      throw createHttpError(404, `Нода ${nodeId} не найдена в проекте ${projectId}`);
    }
    return node;
  }

  private buildManualTitleMap(entries?: TextSplitManualTitle[] | null): Map<string, string> {
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

  private buildSegmentTree(content: string, config: TextSplitConfig): RawSegmentNode[] {
    const topParts = splitContentByDelimiter(content, config.separator);
    if (topParts.length === 0) {
      return [];
    }

    return topParts.map((part, index) => {
      const path = `${index}`;
      const children = this.buildSubSegments(part, path, config);
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

  private buildSubSegments(content: string, parentPath: string, config: TextSplitConfig): RawSegmentNode[] {
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

  private buildSplitPlan(
    content: string,
    config: TextSplitConfig,
    manualTitleMap: Map<string, string>,
  ): {
    segments: RawSegmentNode[];
    plan: SegmentPlanItem[];
    titleByPath: Map<string, string>;
    previewSegments: TextSplitPreviewSegment[];
  } {
    const segments = this.buildSegmentTree(content, config);
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

  private computePlacements(sourceNode: StoredNode, plan: SegmentPlanItem[]): SegmentPlacement[] {
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

  private selectRussianPlural(count: number, forms: [string, string, string]): string {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) {
      return forms[2];
    }
    if (n1 > 1 && n1 < 5) {
      return forms[1];
    }
    if (n1 === 1) {
      return forms[0];
    }
    return forms[2];
  }
}
