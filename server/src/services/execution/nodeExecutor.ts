/**
 * Individual node execution logic: dispatches execution based on node type.
 * AI-specific logic is in aiNodeExecutor.ts.
 * Extracted from executor.ts as part of ADR-081 refactoring.
 */

import * as path from 'path';
import type { StoredNode, StoredEdge } from '../../db';
import { AiService } from '../ai';
import { ParserService } from '../parser';
import { TransformerService } from '../transformerService';
import { executePython } from '../pythonSandbox';
import { generatePreviz } from '../videoGenStub';
import type { ExecutionStepResult, NextNodeMetadataEntry } from './types';
import { executeAiNode } from './aiNodeExecutor';

import { logger } from '../../lib/logger';

const log = logger.child({ module: 'execution/nodeExecutor' });
// ============================================================
// Execute a single node based on its type
// ============================================================

export async function executeNodeByType(
  projectId: string,
  node: StoredNode,
  previousNodes: StoredNode[],
  nextMetadata: NextNodeMetadataEntry[],
  edges: StoredEdge[],
  services: {
    aiService: AiService;
    parserService: ParserService;
    transformerService: TransformerService;
  },
  context: {
    projectOwnerId: string | null;
    actorUserId: string | null;
    projectSettings: Record<string, unknown>;
  },
): Promise<ExecutionStepResult> {
  const baseAiConfig = (node.config.ai ?? {}) as Record<string, unknown>;

  log.info('[DEBUG] >>>>> INSIDE withRetry for node %s', node.node_id);

  switch (node.type) {
  case 'ai': {
    return executeAiNode(
      projectId,
      node,
      previousNodes,
      nextMetadata,
      edges,
      baseAiConfig,
      services,
      context,
    );
  }
  case 'parser': {
    const htmlSource = previousNodes[previousNodes.length - 1]?.content ?? '';
    const parserConfig = (node.config.parser ?? {}) as Record<string, unknown>;
    const schemaRef = String(parserConfig.output_schema_ref ?? 'PARSE_SCHEMA');
    const parserResult = services.parserService.run({
      html: htmlSource,
      source: node.node_id,
      schemaRef,
    });
    return {
      content: parserResult.output,
      contentType: parserResult.contentType,
      logs: parserResult.logs,
    };
  }
  case 'python': {
    const pythonConfig = (node.config.python ?? {}) as Record<string, unknown>;
    const code = String(pythonConfig.code ?? 'import json\nprint(json.dumps({"status": "ok"}))');
    const allowNetwork = Boolean(context.projectSettings?.allow_network);
    const result = await executePython({
      projectId,
      code,
      input: {
        node_id: node.node_id,
        inputs: previousNodes.map((n) => ({ node_id: n.node_id, content: n.content })),
      },
      allowNetwork,
    });
    const payload =
      typeof result.outputJson === 'string'
        ? result.outputJson
        : JSON.stringify(result.outputJson ?? { status: 'ok' }, null, 2);
    return {
      content: payload,
      contentType: 'application/json',
      logs: [`Python sandbox executed successfully`, result.stderr.trim()].filter(Boolean),
    };
  }
  case 'image_gen': {
    return {
      content: JSON.stringify({
        status: 'generated',
        prompt: node.meta?.prompt ?? 'image stub prompt',
        url: path.posix.join('/projects', projectId, 'project_output', `${node.node_id}.png`),
      }),
      contentType: 'application/json',
      logs: ['Image generation stub executed'],
    };
  }
  case 'audio_gen': {
    return {
      content: JSON.stringify({
        status: 'generated',
        text: node.meta?.script ?? 'audio stub script',
        url: path.posix.join('/projects', projectId, 'project_output', `${node.node_id}.wav`),
      }),
      contentType: 'application/json',
      logs: ['Audio generation stub executed'],
    };
  }
  case 'transformer': {
    const jsonContent = node.content ?? '';
    if (!jsonContent.trim()) {
      return {
        content: 'Transformer node requires JSON content with nodes',
        contentType: 'text/plain',
        logs: ['No JSON content provided for transformation'],
      };
    }

    try {
      const startX = node.ui.bbox.x2 + 100;
      const startY = node.ui.bbox.y1;

      const transformResult = await services.transformerService.transformJsonToNodes(
        projectId,
        node.node_id,
        jsonContent,
        startX,
        startY,
      );

      return {
        content: `Создано ${transformResult.createdNodes.length} нод: ${transformResult.createdNodes.map(n => n.title).join(', ')}`,
        contentType: 'text/plain',
        logs: transformResult.logs,
        createdNodes: transformResult.createdNodes,
        isMultiNodeResult: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      return {
        content: `Ошибка трансформации: ${errorMessage}`,
        contentType: 'text/plain',
        logs: [`Transformer error: ${errorMessage}`],
      };
    }
  }
  case 'video_gen': {
    const videoResult = await generatePreviz({ projectId, nodeId: node.node_id });
    return {
      content: JSON.stringify({ status: 'generated', path: videoResult.videoPath }),
      contentType: 'application/json',
      logs: videoResult.logs,
    };
  }
  case 'html': {
    const htmlViewMode = node.meta?.htmlViewMode as string;
    const htmlUrl = node.meta?.htmlUrl as string;
    const htmlSourceCode = node.meta?.htmlSourceCode as string;

    if (htmlViewMode === 'code' && htmlSourceCode) {
      return {
        content: htmlSourceCode,
        contentType: 'text/html',
        logs: ['HTML node returned source code'],
      };
    } else if (htmlUrl) {
      return {
        content: htmlUrl,
        contentType: 'text/uri-list',
        logs: ['HTML node returned URL'],
      };
    }
    return {
      content: node.content ?? '',
      contentType: node.content_type ?? 'text/html',
      logs: ['HTML node returned existing content'],
    };
  }
  case 'image_test': {
    const imageData = node.meta?.image_data as string;
    const annotationData = node.meta?.annotation_data as string;

    if (!imageData) {
      return {
        content: '',
        contentType: 'text/plain',
        logs: ['No image data found in image_test node'],
      };
    }

    if (!annotationData) {
      return {
        content: imageData,
        contentType: 'image/png',
        logs: ['Returning original image (no annotations)'],
      };
    }

    try {
      return {
        content: annotationData,
        contentType: 'image/png',
        logs: ['Returning annotation overlay as composite image'],
      };
    } catch (error) {
      log.error({ err: error }, 'Error creating composite image');
      return {
        content: imageData,
        contentType: 'image/png',
        logs: ['Error creating composite image, returning original'],
      };
    }
  }
  case 'text':
  default: {
    return {
      content: node.content ?? '',
      contentType: node.content_type ?? 'text/plain',
      logs: ['Text node returned existing content'],
    };
  }
  }
}
