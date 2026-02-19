/**
 * Main workflow execution orchestration: the ExecutorService class
 * that ties together context building, node execution, result collection,
 * and run storage.
 * Extracted from executor.ts as part of ADR-081 refactoring.
 */

import Ajv from 'ajv';
import { v4 as uuidv4 } from 'uuid';

import {
  ensureProjectDirs,
  getProject,
  hashContent,
  storeRun,
  updateNodeContent,
  withTransaction,
} from '../../db';

import { AiService } from '../ai';
import { ParserService } from '../parser';
import { TransformerService } from '../transformerService';

import type {
  ExecutionResult,
  ExecutionStepResult,
  RetryOutcome,
} from './types';
import { MAX_ATTEMPTS, BACKOFF } from './types';

import { getPackageInfo, normalizeContextDepthValue } from './helpers';

import {
  buildExecutionContext,
  topologicalSort,
  collectPreviousNodes,
  collectNextNodeMetadata,
} from './contextManager';

import { executeNodeByType } from './nodeExecutor';

import { logger } from '../../lib/logger';

const log = logger.child({ module: 'execution/workflowRunner' });
import {
  buildRunMetadataSnapshot,
  resolveCreatedNodeLogEntries,
  resolvePredictionPayload,
} from './resultCollector';

// ============================================================
// ExecutorService class
// ============================================================

const serverPackage = getPackageInfo();

export class ExecutorService {
  private readonly aiService: AiService;
  private readonly parserService: ParserService;
  private readonly transformerService: TransformerService;
  private readonly engineVersion: string;

  constructor(private readonly ajv: Ajv) {
    this.aiService = new AiService(ajv);
    this.parserService = new ParserService(ajv);
    this.transformerService = new TransformerService();
    this.engineVersion = serverPackage.version ?? '0.0.0';
  }

  async runNode(
    projectId: string,
    nodeId: string,
    options?: { actorUserId?: string | null; overrideInputs?: Record<string, unknown> },
  ): Promise<ExecutionResult> {
    ensureProjectDirs(projectId);

    const { node, allNodes, edges, sortedNodeIds } = buildExecutionContext(
      projectId,
      nodeId,
      topologicalSort,
    );

    const baseAiConfig = (node.config.ai ?? {}) as Record<string, unknown>;
    const shouldLimitContext = node.type === 'ai_improved' || node.type === 'ai';
    const contextLeftDepth = shouldLimitContext
      ? normalizeContextDepthValue(baseAiConfig.context_left_depth, 1)
      : Number.POSITIVE_INFINITY;
    const contextRightDepth = shouldLimitContext
      ? normalizeContextDepthValue(baseAiConfig.context_right_depth, 0)
      : Number.POSITIVE_INFINITY;

    const previousNodes = collectPreviousNodes(nodeId, sortedNodeIds, allNodes, edges, {
      maxDepth: contextLeftDepth,
    });
    const nextMetadata = collectNextNodeMetadata(nodeId, allNodes, edges, {
      maxDepth: contextRightDepth,
    });
    const project = getProject(projectId, undefined, { bypassAuth: true });
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    const actorUserId = options?.actorUserId ?? null;
    const projectOwnerId =
      typeof project.user_id === 'string' && project.user_id.trim().length > 0
        ? project.user_id
        : null;

    const inputFingerprint = {
      node: {
        node_id: node.node_id,
        type: node.type,
        config: node.config,
      },
      previous: previousNodes.map((item) => ({
        node_id: item.node_id,
        type: item.type,
        content_hash: hashContent(item.content ?? null),
      })),
      next: nextMetadata,
      engineVersion: this.engineVersion,
    };

    const startedAt = new Date().toISOString();
    const runId = uuidv4();

    log.info({ nodeId: node.node_id, type: node.type, meta: node.meta }, 'executing node');

    try {
      const outcome = await this.withRetry<ExecutionStepResult>(async () => {
        return executeNodeByType(
          projectId,
          node,
          previousNodes,
          nextMetadata,
          edges,
          {
            aiService: this.aiService,
            parserService: this.parserService,
            transformerService: this.transformerService,
          },
          {
            projectOwnerId,
            actorUserId,
            projectSettings: (project.settings ?? {}) as Record<string, unknown>,
          },
        );
      });

      const finishedAt = new Date().toISOString();
      const outputHash = hashContent(outcome.result.content ?? null);

      withTransaction(() => {
        // Only update content for non-AI nodes to preserve prompts
        if (node.type !== 'ai' && node.type !== 'ai_improved') {
          updateNodeContent(projectId, nodeId, {
            content: outcome.result.content ?? null,
            content_type: outcome.result.contentType ?? null,
          });
        }

        const metadataSnapshot = buildRunMetadataSnapshot(node, outcome.result);
        const createdNodeLogEntries = resolveCreatedNodeLogEntries(projectId, node, outcome.result);
        const predictionPayload = resolvePredictionPayload(node, outcome.result);
        const logPayload: Record<string, unknown> = {
          created_nodes: createdNodeLogEntries,
          status: 'success',
          engine: this.engineVersion,
          attempts: outcome.attempts,
          timeline: outcome.logs ?? [],
          node_logs: outcome.result.logs ?? [],
        };
        if (metadataSnapshot && Object.keys(metadataSnapshot).length > 0) {
          logPayload.metadata = metadataSnapshot;
        }
        if (predictionPayload !== undefined) {
          logPayload.prediction_payload = predictionPayload;
        }
        if (outcome.result.provider) {
          logPayload.provider = outcome.result.provider;
        }
        if (outcome.result.predictionId) {
          logPayload.prediction_id = outcome.result.predictionId;
        }

        storeRun({
          run_id: runId,
          project_id: projectId,
          node_id: nodeId,
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'success',
          input_hash: hashContent(inputFingerprint),
          output_hash: outputHash,
          logs_json: JSON.stringify(logPayload),
        });
      });

      return {
        status: 'success' as const,
        nodeId,
        content: outcome.result.content ?? null,
        contentType: outcome.result.contentType ?? null,
        logs: [...outcome.logs, ...outcome.result.logs],
        runId,
        createdNodes: outcome.result.createdNodes,
        createdNodeSnapshots: outcome.result.createdNodeSnapshots,
        isMultiNodeResult: outcome.result.isMultiNodeResult || false,
        predictionUrl: outcome.result.predictionUrl,
        predictionId: outcome.result.predictionId,
        provider: outcome.result.provider,
        predictionPayload: outcome.result.predictionPayload,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const metadataSnapshot = buildRunMetadataSnapshot(node);
      const logPayload: Record<string, unknown> = {
        engine: this.engineVersion,
        status: 'failed',
        attempts: MAX_ATTEMPTS,
        errors: [(error as Error).message],
        logs: [(error as Error).message],
      };
      if (metadataSnapshot && Object.keys(metadataSnapshot).length > 0) {
        logPayload.metadata = metadataSnapshot;
      }

      withTransaction(() => {
        storeRun({
          run_id: runId,
          project_id: projectId,
          node_id: nodeId,
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'failed',
          input_hash: hashContent(inputFingerprint),
          output_hash: hashContent({ error: (error as Error).message }),
          logs_json: JSON.stringify(logPayload),
        });
      });
      throw error;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<RetryOutcome<T>> {
    const logs: string[] = [];
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        if (BACKOFF[attempt]) {
          logs.push(`Retry backoff ${BACKOFF[attempt]}ms before attempt ${attempt + 1}`);
          await new Promise((resolve) => setTimeout(resolve, BACKOFF[attempt]));
        }
        const result = await fn();
        return { result, attempts: attempt + 1, logs };
      } catch (error) {
        lastError = error;
        logs.push(`Attempt ${attempt + 1} failed: ${(error as Error).message}`);
      }
    }
    const message = lastError instanceof Error ? lastError.message : 'Unknown error';
    throw new Error(`Execution failed after ${MAX_ATTEMPTS} attempts: ${message}`);
  }
}
