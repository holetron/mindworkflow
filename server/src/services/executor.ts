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
  createProjectNode,
  addProjectEdge,
} from '../db';
import { AiService } from './ai';
import { ParserService } from './parser';
import { TransformerService } from './transformerService';
import { executePython } from './pythonSandbox';
import { generatePreviz } from './videoGenStub';
// import { processMultiNodeResponse, ProcessedMultiNodes } from './multiNodeProcessor'; // Moved to experimental
import * as fs from 'fs';

// Динамически загружаем package.json
const getPackageInfo = () => {
  try {
    // Пробуем разные пути для разных окружений
    const possiblePaths = [
      path.resolve(__dirname, '../../package.json'), // dev mode
      path.resolve(process.cwd(), 'package.json'),   // portable mode
      path.resolve(__dirname, '../package.json'),    // другой случай
    ];
    
    for (const packagePath of possiblePaths) {
      if (fs.existsSync(packagePath)) {
        return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      }
    }
    
    // Fallback если package.json не найден
    return { name: 'local-creative-flow-server', version: '0.1.0' };
  } catch {
    return { name: 'local-creative-flow-server', version: '0.1.0' };
  }
};

const serverPackage = getPackageInfo();

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
  createdNodes?: Array<{
    node_id: string;
    type: string;
    title: string;
  }>;
  isMultiNodeResult?: boolean;
}

interface RetryOutcome<T> {
  result: T;
  attempts: number;
  logs: string[];
}

interface ExecutionStepResult {
  content: string;
  contentType: string;
  logs: string[];
  createdNodes?: Array<{ node_id: string; type: string; title: string }>;
  isMultiNodeResult?: boolean;
}

const MAX_ATTEMPTS = 3;
const BACKOFF = [0, 1_000, 2_000];

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

  // EXPERIMENTAL FEATURE - Multi-node creation disabled
  /*
  private async createMultipleNodes(
    projectId: string, 
    sourceNodeId: string, 
    multiNodeResult: ProcessedMultiNodes
  ): Promise<Array<{ node_id: string; type: string; title: string }>> {
    const createdNodes: Array<{ node_id: string; type: string; title: string }> = [];
    
    return withTransaction(() => {
      for (const nodeSpec of multiNodeResult.nodes) {
        const { node } = createProjectNode(projectId, {
          type: nodeSpec.type,
          title: nodeSpec.title,
          content: nodeSpec.content || '',
          slug: nodeSpec.slug,
          meta: nodeSpec.meta,
          ai: nodeSpec.ai,
        }, {
          position: { x: nodeSpec.x, y: nodeSpec.y }
        });
        
        // Add edge from source AI node to created node
        addProjectEdge(projectId, {
          from: sourceNodeId,
          to: node.node_id,
        });
        
        createdNodes.push({
          node_id: node.node_id,
          type: node.type,
          title: node.title,
        });
      }
      
      return createdNodes;
    });
  }
  */

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
      const outcome = await this.withRetry<ExecutionStepResult>(async () => {
        switch (node.type) {
        case 'ai': {
          const aiConfig = (node.config.ai ?? {}) as Record<string, unknown>;
          const outputType = node.meta?.output_type as string;
          console.log(`[Executor DEBUG] Node config:`, JSON.stringify(aiConfig, null, 2));
          console.log(`[Executor DEBUG] Node meta output_type:`, outputType);
          
          // Проверяем тип вывода из мета-данных
          if (outputType === 'mindmap') {
            // Для mindmap используем MINDMAP_SCHEMA для правильного JSON формата
            const schemaRef = 'MINDMAP_SCHEMA';
            console.log(`[Executor] Node ${node.node_id}: Using ${schemaRef} for mindmap output`);
            
            const aiResult = await this.aiService.run({
              projectId,
              node,
              previousNodes,
              nextNodes: nextMetadata,
              schemaRef,
              settings: (project.settings ?? {}) as Record<string, unknown>,
            });
            
            // Используем transformer service для создания дерева нод
            try {
              console.log(`[Executor] Transforming MINDMAP JSON to nodes:`, aiResult.output.substring(0, 200));
              
              const transformerResult = await this.transformerService.transformJsonToNodes(
                projectId,
                node.node_id,
                aiResult.output,
                node.ui.bbox.x2 + 100,
                node.ui.bbox.y1
              );
              
              return {
                content: `Создан mindmap из ${transformerResult.createdNodes.length} нод: ${transformerResult.createdNodes.map(n => n.title).join(', ')}`,
                contentType: 'text/plain',
                logs: [...aiResult.logs, ...transformerResult.logs],
                createdNodes: transformerResult.createdNodes,
                isMultiNodeResult: true,
              };
            } catch (error) {
              console.error('[Executor] Error creating mindmap:', error);
              return {
                content: `Ошибка создания mindmap: ${error instanceof Error ? error.message : 'Unknown error'}\n\nОтвет ИИ:\n${aiResult.output}`,
                contentType: 'text/plain',
                logs: [...aiResult.logs, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
              };
            }
          } else {
            // Для обычного режима используем PLAN_SCHEMA (как было раньше)
            const schemaRef = 'PLAN_SCHEMA';
            console.log(`[Executor] Node ${node.node_id}: FORCING schema to ${schemaRef}`);
            
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
        }
        case 'ai_improved': {
          // Handle ai_improved nodes with support for different response types
          const aiConfig = (node.config?.ai ?? {}) as Record<string, unknown>;
          const responseType = aiConfig.response_type as string || 'single';
          const outputType = node.meta?.output_type as string;
          
          console.log(`[Executor] AI Improved node ${node.node_id}: response_type = ${responseType}, output_type = ${outputType}`);
          
          // Проверяем output_type из метаданных (приоритет над response_type)
          if (outputType === 'mindmap' || responseType === 'tree') {
            const schemaRef = outputType === 'mindmap' ? 'MINDMAP_SCHEMA' : 'TEXT_RESPONSE';
            
            const aiResult = await this.aiService.run({
              projectId,
              node,
              previousNodes,
              nextNodes: nextMetadata,
              schemaRef,
              settings: (project.settings ?? {}) as Record<string, unknown>,
            });
            
            // Use transformer service to create node tree
            try {
              let jsonContent = aiResult.output;
              
              // Если не используем MINDMAP_SCHEMA, пробуем извлечь JSON из текста
              if (schemaRef !== 'MINDMAP_SCHEMA') {
                // Try to extract JSON from markdown code blocks
                const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                  jsonContent = jsonMatch[1].trim();
                }
                
                // Try to find JSON object in the text
                const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/);
                if (jsonObjectMatch && !jsonMatch) {
                  jsonContent = jsonObjectMatch[0];
                }
              }
              
              console.log(`[Executor] Creating mindmap from AI_IMPROVED output (${schemaRef}):`, jsonContent.substring(0, 200));
              
              const transformerResult = await this.transformerService.transformJsonToNodes(
                projectId,
                node.node_id,
                jsonContent,
                node.ui.bbox.x2 + 100,
                node.ui.bbox.y1
              );
              
              const modeText = outputType === 'mindmap' ? 'mindmap' : 'дерево';
              return {
                content: `Создан ${modeText} из ${transformerResult.createdNodes.length} нод: ${transformerResult.createdNodes.map(n => n.title).join(', ')}`,
                contentType: 'text/plain',
                logs: [...aiResult.logs, ...transformerResult.logs],
                createdNodes: transformerResult.createdNodes,
                isMultiNodeResult: true,
              };
            } catch (error) {
              console.error('[Executor] Error creating node tree:', error);
              return {
                content: `Ошибка создания дерева нод: ${error instanceof Error ? error.message : 'Unknown error'}\n\nОтвет ИИ:\n${aiResult.output}`,
                contentType: 'text/plain',
                logs: [...aiResult.logs, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
              };
            }
          } else if (responseType === 'folder') {
            // Determine schema based on response type
            const schemaRef = 'TEXT_RESPONSE'; // Use text response for file descriptions (for now)
            
            const aiResult = await this.aiService.run({
              projectId,
              node,
              previousNodes,
              nextNodes: nextMetadata,
              schemaRef,
              settings: (project.settings ?? {}) as Record<string, unknown>,
            });
            
            // TODO: Implement folder creation logic
            // This would parse AI response for file specifications and create actual files
            return {
              content: `Режим "папка файлов" в разработке. Ответ ИИ:\n${aiResult.output}`,
              contentType: 'text/plain',
              logs: [...aiResult.logs, 'Folder mode not yet implemented'],
            };
          } else {
            // Default single response
            const schemaRef = 'TEXT_RESPONSE'; // Default for single response
            
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
            // Позиция для создания нод - правее текущей ноды
            const startX = node.ui.bbox.x2 + 100;
            const startY = node.ui.bbox.y1;
            
            const transformResult = await this.transformerService.transformJsonToNodes(
              projectId,
              node.node_id,
              jsonContent,
              startX,
              startY
            );
            
            return {
              content: `🔄 Создано ${transformResult.createdNodes.length} нод: ${transformResult.createdNodes.map(n => n.title).join(', ')}`,
              contentType: 'text/plain',
              logs: transformResult.logs,
              createdNodes: transformResult.createdNodes,
              isMultiNodeResult: true,
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            return {
              content: `❌ Ошибка трансформации: ${errorMessage}`,
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
        createdNodes: (outcome.result as any).createdNodes,
        isMultiNodeResult: (outcome.result as any).isMultiNodeResult || false,
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
