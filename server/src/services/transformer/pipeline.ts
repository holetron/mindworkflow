import { logger } from '../../lib/logger';
import {
  createProjectNode,
  addProjectEdge,
  withTransaction,
} from '../../db';
import { getNodeTypeColor } from './helpers';
import type {
  NodeSpec,
  CreatedNodeSummary,
  TransformResult,
  TextSplitConfig,
  TextSplitManualTitle,
  TextSplitPreviewResult,
  TextSplitResult,
} from './types';

import {
  sanitizeTextSplitConfig as sanitizeConfig,
  previewTextSplit as previewSplit,
  splitTextNode as executeSplit,
  createSingleTextNode as createSingle,
} from './textSplit';

const log = logger.child({ module: 'transformerService' });

export class TransformerService {
  /**
   * Parses JSON with nodes and creates a tree layout from left to right
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
      logs.push(`Received JSON from AI (first 200 characters): ${jsonContent.substring(0, 200)}...`);
      log.info('[TransformerService] Full JSON content %s', jsonContent);
      const parsed = JSON.parse(jsonContent);
      let nodes: NodeSpec[] = [];
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        nodes = parsed.nodes;
        logs.push(`Found nodes field with ${nodes.length} elements`);
      } else if (Array.isArray(parsed)) {
        nodes = parsed;
        logs.push(`JSON is an array with ${nodes.length} elements`);
      } else {
        logs.push(`Invalid JSON format. Type: ${typeof parsed}, content: ${JSON.stringify(parsed, null, 2)}`);
        throw new Error('JSON must contain a nodes array or be an array of nodes');
      }
      logs.push(`Found ${nodes.length} nodes to create`);
      const createdNodes: CreatedNodeSummary[] = [];

      const levelSpacing = 500;
      const nodeSpacing = 200;
      const staggerOffset = 120;
      const verticalPadding = 50;

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
            title: nodeSpec.title || `Node`,
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
        logs.push(`Created node: ${node.title} (${node.type}) at level ${depth} in staggered position (${x}, ${y})`);

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
      logs.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Text-split methods — delegate to ./textSplit module
  // -----------------------------------------------------------------------

  sanitizeTextSplitConfig(config?: Partial<TextSplitConfig>): TextSplitConfig {
    return sanitizeConfig(config);
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
    return previewSplit(projectId, sourceNodeId, options);
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
    return executeSplit(projectId, sourceNodeId, options);
  }

  async createSingleTextNode(
    projectId: string,
    sourceNodeId: string,
    rawContent: string,
    explicitTitle?: string,
    nodeType: 'text' | 'folder' = 'text',
  ): Promise<CreatedNodeSummary> {
    return createSingle(projectId, sourceNodeId, rawContent, explicitTitle, nodeType);
  }
}
