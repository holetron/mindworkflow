import Ajv from 'ajv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import {
  StoredEdge,
  StoredNode,
  ensureProjectDirs,
  getProject,
  hashContent,
  listProjectEdges,
  listProjectNodes,
  storeRun,
  updateNodeContent,
  withTransaction,
} from '../db';
import { AiService } from './ai';
import { ParserService } from './parser';
import { executePython } from './pythonSandbox';
import { generatePreviz } from './videoGenStub';
import serverPackage from '../../package.json';

interface ExecutionContext {
  projectId: string;
  node: StoredNode;
  allNodes: Map<string, StoredNode>;
  edges: StoredEdge[];
  sortedNodeIds: string[];
}

export interface ExecutionResult {
  status: 'success' | 'failed';
  nodeId: string;
  content?: string | null;
  contentType?: string | null;
  logs: string[];
  runId: string;
}

interface RetryOutcome<T> {
  result: T;
  attempts: number;
  logs: string[];
}

const MAX_ATTEMPTS = 3;
const BACKOFF = [0, 1_000, 2_000];

export class ExecutorService {
  private readonly aiService: AiService;
  private readonly parserService: ParserService;
  private readonly engineVersion: string;

  constructor(private readonly ajv: Ajv) {
    this.aiService = new AiService(ajv);
    this.parserService = new ParserService(ajv);
    this.engineVersion = serverPackage.version ?? '0.0.0';
  }

  async runNode(projectId: string, nodeId: string): Promise<ExecutionResult> {
    ensureProjectDirs(projectId);

    const { node, allNodes, edges, sortedNodeIds } = this.buildExecutionContext(projectId, nodeId);

    const previousNodes = this.collectPreviousNodes(nodeId, sortedNodeIds, allNodes, edges);
    const nextMetadata = this.collectNextNodeMetadata(nodeId, allNodes, edges);
    const project = getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

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

    try {
      const outcome = await this.withRetry(async () => {
        switch (node.type) {
        case 'ai': {
          const aiConfig = (node.config.ai ?? {}) as Record<string, unknown>;
          const schemaRef = String(aiConfig.output_schema_ref ?? 'PLAN_SCHEMA');
          const aiResult = await this.aiService.run({
            projectId,
            node,
            previousNodes,
            nextNodes: nextMetadata,
            schemaRef,
            settings: (project.settings ?? {}) as Record<string, unknown>,
          });
          return {
            content: aiResult.output,
            contentType: aiResult.contentType,
            logs: aiResult.logs,
          };
        }
        case 'ai_improved': {
          // Handle ai_improved nodes similar to ai nodes
          const aiConfig = (node.config?.ai ?? {}) as Record<string, unknown>;
          const schemaRef = 'TEXT_RESPONSE'; // Use simple text response for ai_improved
          const aiResult = await this.aiService.run({
            projectId,
            node,
            previousNodes,
            nextNodes: nextMetadata,
            schemaRef,
            settings: (project.settings ?? {}) as Record<string, unknown>,
          });
          return {
            content: aiResult.output,
            contentType: aiResult.contentType,
            logs: aiResult.logs,
          };
        }
        case 'parser': {
          const htmlSource = previousNodes[previousNodes.length - 1]?.content ?? '';
          const parserConfig = (node.config.parser ?? {}) as Record<string, unknown>;
          const schemaRef = String(parserConfig.output_schema_ref ?? 'PARSE_SCHEMA');
          const parserResult = this.parserService.run({
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
          const allowNetwork = Boolean(project?.settings?.allow_network);
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
        case 'video_gen': {
          const videoResult = await generatePreviz({ projectId, nodeId: node.node_id });
          return {
            content: JSON.stringify({ status: 'generated', path: videoResult.videoPath }),
            contentType: 'application/json',
            logs: videoResult.logs,
          };
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

        storeRun({
          run_id: runId,
          project_id: projectId,
          node_id: nodeId,
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'success',
          input_hash: hashContent(inputFingerprint),
          output_hash: outputHash,
          logs_json: JSON.stringify({
            engine: this.engineVersion,
            attempts: outcome.attempts,
            logs: outcome.logs,
            result: outcome.result.logs,
          }),
        });
      });

      return {
        status: 'success' as const,
        nodeId,
        content: outcome.result.content ?? null,
        contentType: outcome.result.contentType ?? null,
        logs: [...outcome.logs, ...outcome.result.logs],
        runId,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
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
          logs_json: JSON.stringify({
            engine: this.engineVersion,
            attempts: MAX_ATTEMPTS,
            logs: [(error as Error).message],
          }),
        });
      });
      throw error;
    }
  }

  private buildExecutionContext(projectId: string, nodeId: string): ExecutionContext {
    const allNodes = new Map<string, StoredNode>();
    for (const node of listProjectNodes(projectId)) {
      allNodes.set(node.node_id, node);
    }

    const node = allNodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const edges = listProjectEdges(projectId);
    const sorted = this.topologicalSort(allNodes, edges);
    if (sorted.hasCycle) {
      throw new Error('Graph contains cycles. Execution aborted');
    }

    return { projectId, node, allNodes, edges, sortedNodeIds: sorted.order };
  }

  private collectPreviousNodes(
    nodeId: string,
    order: string[],
    allNodes: Map<string, StoredNode>,
    edges: StoredEdge[],
  ): StoredNode[] {
    const seen = new Set<string>();
    const predecessors: StoredNode[] = [];

    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      const list = adjacency.get(edge.to_node) ?? [];
      list.push(edge.from_node);
      adjacency.set(edge.to_node, list);
    }

    const stack = [...(adjacency.get(nodeId) ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const node = allNodes.get(current);
      if (node) {
        predecessors.push(node);
        const upstream = adjacency.get(current) ?? [];
        stack.push(...upstream);
      }
    }

    predecessors.sort((a, b) => order.indexOf(a.node_id) - order.indexOf(b.node_id));
    return predecessors;
  }

  private collectNextNodeMetadata(
    nodeId: string,
    allNodes: Map<string, StoredNode>,
    edges: StoredEdge[],
  ) {
    const connectionMap = edges.filter((edge) => edge.from_node === nodeId);
    return connectionMap.map((edge) => {
      const target = allNodes.get(edge.to_node);
      return {
        node_id: edge.to_node,
        type: target?.type ?? 'text',
        title: target?.title ?? 'Следующий узел',
        short_description: this.buildShortDescription(target),
        connection_labels: edge.label ? [edge.label] : [],
      };
    });
  }

  private buildShortDescription(node?: StoredNode): string {
    if (!node) return 'Нет данных';
    const base = node.meta?.short_description ?? node.content ?? node.title;
    return String(base ?? node.title).substring(0, 200);
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

  private topologicalSort(allNodes: Map<string, StoredNode>, edges: StoredEdge[]): {
    order: string[];
    hasCycle: boolean;
  } {
    const indegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const nodeId of allNodes.keys()) {
      indegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }

    for (const edge of edges) {
      if (!indegree.has(edge.to_node)) {
        indegree.set(edge.to_node, 0);
      }
      indegree.set(edge.to_node, (indegree.get(edge.to_node) ?? 0) + 1);
      const list = adjacency.get(edge.from_node) ?? [];
      list.push(edge.to_node);
      adjacency.set(edge.from_node, list);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of indegree.entries()) {
      if (degree === 0) queue.push(nodeId);
    }

    const order: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      order.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        const next = (indegree.get(neighbor) ?? 0) - 1;
        indegree.set(neighbor, next);
        if (next === 0) queue.push(neighbor);
      }
    }

    const hasCycle = order.length !== allNodes.size;
    return { order, hasCycle };
  }
}
