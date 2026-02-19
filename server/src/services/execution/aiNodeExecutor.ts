/**
 * AI node execution: handles all AI-specific execution scenarios
 * (tree/mindmap, node, folder, response folder, default modes).
 * Split from nodeExecutor.ts as part of ADR-081 refactoring.
 */

import type { StoredNode, StoredEdge } from '../../db';
import { getNode, getProject, updateNodeMetaSystem } from '../../db';
import { AiService } from '../ai';
import { ParserService } from '../parser';
import { TransformerService, type CreatedNodeSummary, type CreatedNodeSnapshot } from '../transformerService';
import type { ExecutionStepResult, CollectedFile, NextNodeMetadataEntry } from './types';
import { DEFAULT_MINDMAP_PROMPT, DEFAULT_MINDMAP_EXAMPLE } from './types';
import { debugLog, selectRussianPlural, describeArtifactPlural } from './helpers';
import { collectReplicateOutputCandidates } from './replicateHelpers';
import { createReplicateAssetNodes } from './replicateAssets';
import { updateLastRequestPayload, applyCreatedNodesToMeta } from './resultCollector';
import { collectFilesFromPreviousNodes } from './contextManager';

export interface AiExecutionServices {
  aiService: AiService; parserService: ParserService; transformerService: TransformerService;
}
export interface AiExecutionContext {
  projectOwnerId: string | null; actorUserId: string | null; projectSettings: Record<string, unknown>;
}

type ArtifactBag = { createdNodes: CreatedNodeSummary[]; nodeSnapshots: CreatedNodeSnapshot[]; logs: string[]; aggregatedText: string | null };
const emptyArtifactBag = (): ArtifactBag => ({ createdNodes: [], nodeSnapshots: [], logs: [], aggregatedText: null });

// Helper: build edges array for AI service
function edgesForAi(edges: StoredEdge[]) {
  return edges.map(e => ({ from: e.from_node, to: e.to_node, sourceHandle: e.source_handle || undefined, targetHandle: e.target_handle || undefined }));
}

// Helper: build artifact summary text
function buildArtifactSummary(nodes: CreatedNodeSummary[]): string {
  const byType = new Map<string, number>();
  nodes.forEach((n) => byType.set(n.type, (byType.get(n.type) ?? 0) + 1));
  const totalLabel = selectRussianPlural(nodes.length, ['artifact', 'artifacts', 'artifacts']);
  const fragments = Array.from(byType.entries()).map(([t, c]) => `${c} ${describeArtifactPlural(t, c)}`);
  return `Created ${nodes.length} ${totalLabel}: ${fragments.join(', ')}.`;
}

// Helper: resolve provider string
function resolveProvider(aiResult: { provider?: string }, aiConfig: Record<string, unknown>): string | undefined {
  return aiResult.provider ?? (typeof aiConfig.provider === 'string' ? aiConfig.provider : undefined);
}

// Main AI node dispatcher
export async function executeAiNode(
  projectId: string, node: StoredNode, previousNodes: StoredNode[],
  nextMetadata: NextNodeMetadataEntry[], edges: StoredEdge[],
  baseAiConfig: Record<string, unknown>, services: AiExecutionServices, context: AiExecutionContext,
): Promise<ExecutionStepResult> {
  const aiConfig = { ...baseAiConfig };
  const responseType = aiConfig.response_type as string;
  const outputType = node.meta?.output_type as string;
  const files = await collectFilesFromPreviousNodes(previousNodes, node.node_id, edges);

  if (responseType === 'mindmap') {
    aiConfig.system_prompt = aiConfig.planner_prompt || DEFAULT_MINDMAP_PROMPT;
    if (!(aiConfig.user_prompt as string)?.trim()) aiConfig.user_prompt = node.content || '';
    if (!(aiConfig.examples as string)?.trim()) aiConfig.examples = DEFAULT_MINDMAP_EXAMPLE;
  }

  const eai = edgesForAi(edges);
  if (responseType === 'tree' || responseType === 'mindmap') return aiTreeMode(projectId, node, previousNodes, nextMetadata, aiConfig, files, eai, responseType, services, context);
  if (outputType === 'node' || outputType === 'mindmap' || !outputType) return aiNodeMode(projectId, node, previousNodes, nextMetadata, aiConfig, files, eai, responseType, outputType, services, context);
  if (outputType === 'folder') return aiFolderMode(projectId, node, previousNodes, nextMetadata, aiConfig, files, eai, edges, services, context);
  if (responseType === 'folder') return aiResponseFolderMode(projectId, node, previousNodes, nextMetadata, aiConfig, eai, services, context);
  return aiDefaultMode(projectId, node, previousNodes, nextMetadata, aiConfig, files, eai, services, context);
}

// AI tree/mindmap mode
async function aiTreeMode(
  projectId: string, node: StoredNode, prevNodes: StoredNode[], nextMeta: NextNodeMetadataEntry[],
  aiConfig: Record<string, unknown>, files: CollectedFile[],
  eai: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }>,
  responseType: string, svc: AiExecutionServices, ctx: AiExecutionContext,
): Promise<ExecutionStepResult> {
  const schemaRef = responseType === 'mindmap' ? 'MINDMAP_SCHEMA' : 'TEXT_RESPONSE';
  const contextMode = (aiConfig.context_mode || 'simple') as 'simple' | 'full_json';
  const aiResult = await svc.aiService.run({
    projectId, node: { ...node, config: { ...node.config, ai: aiConfig } }, previousNodes: prevNodes,
    nextNodes: nextMeta, schemaRef, settings: ctx.projectSettings, projectOwnerId: ctx.projectOwnerId,
    actorUserId: ctx.actorUserId, files, contextMode, edges: eai,
  });
  updateLastRequestPayload(projectId, node, aiResult.requestPayload);

  try {
    let json = aiResult.output;
    if (schemaRef === 'MINDMAP_SCHEMA') { try { const p = JSON.parse(json); if (p.response && typeof p.response === 'string') json = p.response; } catch { /* ignore */ } }
    if (schemaRef !== 'MINDMAP_SCHEMA') {
      const m1 = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/); if (m1) json = m1[1].trim();
      const m2 = json.match(/\{[\s\S]*\}/); if (m2 && !m1) json = m2[0];
    }
    const tr = await svc.transformerService.transformJsonToNodes(projectId, node.node_id, json, node.ui.bbox.x2 + 100, node.ui.bbox.y1);
    const modeText = responseType === 'mindmap' ? 'mindmap' : 'tree';
    return { content: `Created ${modeText} from ${tr.createdNodes.length} nodes: ${tr.createdNodes.map(n => n.title).join(', ')}`, contentType: 'text/plain', logs: [...aiResult.logs, ...tr.logs], createdNodes: tr.createdNodes, isMultiNodeResult: true, predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig) };
  } catch (error) {
    return { content: `Error creating node tree: ${error instanceof Error ? error.message : 'Unknown error'}\n\nAI response:\n${aiResult.output}`, contentType: 'text/plain', logs: [...aiResult.logs, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`], predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig) };
  }
}

// AI node/mindmap mode
async function aiNodeMode(
  projectId: string, node: StoredNode, prevNodes: StoredNode[], nextMeta: NextNodeMetadataEntry[],
  aiConfig: Record<string, unknown>, files: CollectedFile[],
  eai: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }>,
  responseType: string, outputType: string, svc: AiExecutionServices, ctx: AiExecutionContext,
): Promise<ExecutionStepResult> {
  const contextMode = (aiConfig.context_mode || 'simple') as 'simple' | 'full_json';
  const aiResult = await svc.aiService.run({
    projectId, node, previousNodes: prevNodes, nextNodes: nextMeta, schemaRef: 'TEXT_RESPONSE',
    settings: ctx.projectSettings, projectOwnerId: ctx.projectOwnerId, actorUserId: ctx.actorUserId,
    files, contextMode, edges: eai,
  });
  updateLastRequestPayload(projectId, node, aiResult.requestPayload);

  // Text splitting for mindmap mode
  if (outputType === 'mindmap' && typeof aiResult.output === 'string') {
    const delimiter = (node.meta?.mindmap_delimiter as string) || '---';
    const sr = await svc.transformerService.splitTextNode(projectId, node.node_id, { content: aiResult.output, config: { separator: delimiter, subSeparator: '', namingMode: 'auto' } });
    return { content: `Created ${sr.createdNodes.length} ${selectRussianPlural(sr.createdNodes.length, ['node', 'nodes', 'nodes'])} from text`, contentType: 'text/plain', logs: [...aiResult.logs, ...sr.logs], createdNodes: sr.createdNodes, createdNodeSnapshots: sr.nodeSnapshots, isMultiNodeResult: true, predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig), predictionPayload: aiResult.predictionPayload };
  }

  // Replicate artifacts or text response
  let parsed: unknown = null;
  if (typeof aiResult.output === 'string') { try { parsed = JSON.parse(aiResult.output); } catch { /* not JSON */ } }

  let bag: ArtifactBag = emptyArtifactBag();
  const isReplicate = aiResult.provider === 'replicate';
  const isJsonObj = parsed && typeof parsed === 'object' && parsed !== null;
  const shouldCreate = isReplicate || (isJsonObj && responseType === 'mindmap') || (isJsonObj && outputType === 'node' && Array.isArray(parsed) && parsed.length > 1);

  if (shouldCreate) {
    bag = await createReplicateAssetNodes(projectId, node, collectReplicateOutputCandidates(aiResult, parsed), aiResult.predictionId, aiResult.predictionUrl);
  }

  const aggText = bag.aggregatedText?.trim() || null;

  if (bag.nodeSnapshots.length > 0) {
    applyCreatedNodesToMeta(projectId, node, bag.nodeSnapshots, { predictionPayload: aiResult.predictionPayload });
    const summary = buildArtifactSummary(bag.createdNodes);
    return { content: aggText ? `${aggText}\n\n${summary}` : summary, contentType: 'text/plain', logs: [...aiResult.logs, ...bag.logs], createdNodes: bag.createdNodes, createdNodeSnapshots: bag.nodeSnapshots, isMultiNodeResult: bag.createdNodes.length > 0, predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig), predictionPayload: aiResult.predictionPayload };
  }
  if (isReplicate && aiResult.predictionPayload !== undefined) applyCreatedNodesToMeta(projectId, node, [], { predictionPayload: aiResult.predictionPayload });
  if (isReplicate) return { content: aggText ?? aiResult.output, contentType: aiResult.contentType, logs: aiResult.logs, predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig), predictionPayload: aiResult.predictionPayload };

  try {
    const cn = await svc.transformerService.createSingleTextNode(projectId, node.node_id, aiResult.output, 'AI Agent Response');
    return { content: `Created node with response: "${cn.title}"`, contentType: 'text/plain', logs: aiResult.logs, createdNodes: [cn], isMultiNodeResult: true, predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig) };
  } catch (error) {
    return { content: `Error creating node: ${error instanceof Error ? error.message : 'Unknown error'}\n\nAI response:\n${aiResult.output}`, contentType: 'text/plain', logs: [...aiResult.logs, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`], predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig) };
  }
}

// AI folder mode
async function aiFolderMode(
  projectId: string, node: StoredNode, prevNodes: StoredNode[], nextMeta: NextNodeMetadataEntry[],
  aiConfig: Record<string, unknown>, files: CollectedFile[],
  eai: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }>,
  edges: StoredEdge[], svc: AiExecutionServices, ctx: AiExecutionContext,
): Promise<ExecutionStepResult> {
  const contextMode = (aiConfig.context_mode || 'simple') as 'simple' | 'full_json';
  const aiResult = await svc.aiService.run({
    projectId, node, previousNodes: prevNodes, nextNodes: nextMeta, schemaRef: 'TEXT_RESPONSE',
    settings: ctx.projectSettings, projectOwnerId: ctx.projectOwnerId, actorUserId: ctx.actorUserId,
    files, contextMode, edges: eai,
  });
  updateLastRequestPayload(projectId, node, aiResult.requestPayload);

  const outEdges = edges.filter(e => e.from_node === node.node_id);
  const project = getProject(projectId, undefined, { bypassAuth: true });
  const folderNodes = outEdges.map(e => project?.nodes.find(n => n.node_id === e.to_node && n.type === 'folder')).filter((n): n is NonNullable<typeof n> => n !== undefined);

  let targetFolderId: string, folderTitle: string, folderWasCreated = false;
  if (folderNodes.length > 0) { targetFolderId = folderNodes[0].node_id; folderTitle = folderNodes[0].title; }
  else {
    const fn = await svc.transformerService.createSingleTextNode(projectId, node.node_id, '', 'AI Results', 'folder');
    targetFolderId = fn.node_id; folderTitle = fn.title; folderWasCreated = true;
  }

  let parsed: unknown = null;
  if (typeof aiResult.output === 'string') { try { parsed = JSON.parse(aiResult.output); } catch { /* not JSON */ } }
  const candidates = collectReplicateOutputCandidates(aiResult, parsed);

  let bag: ArtifactBag = emptyArtifactBag();
  if (candidates.length > 0) {
    const folderStored = getNode(projectId, targetFolderId);
    bag = await createReplicateAssetNodes(projectId, folderStored ?? { ...node, node_id: targetFolderId }, candidates, aiResult.predictionId, aiResult.predictionUrl);
    if (bag.createdNodes.length > 0) {
      const fn = getNode(projectId, targetFolderId);
      if (fn) {
        const existing = Array.isArray(fn.meta?.folder_children) ? fn.meta.folder_children as string[] : [];
        updateNodeMetaSystem(projectId, targetFolderId, { ...fn.meta, folder_children: [...existing, ...bag.createdNodes.filter(n => n.type !== 'folder').map(n => n.node_id)] });
      }
    }
  }

  if (folderWasCreated) bag.createdNodes.unshift({ node_id: targetFolderId, title: folderTitle, type: 'folder' as const });
  const aggText = bag.aggregatedText?.trim() || null;
  const summary = bag.createdNodes.length > 0 ? buildArtifactSummary(bag.createdNodes) : 'Response processed';
  return { content: aggText ? `${aggText}\n\n${summary}` : summary, contentType: 'text/plain', logs: [...aiResult.logs, ...bag.logs], createdNodes: bag.createdNodes, createdNodeSnapshots: bag.nodeSnapshots, isMultiNodeResult: bag.createdNodes.length > 0, predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig), predictionPayload: aiResult.predictionPayload };
}

// AI response_type === 'folder' (TODO mode)
async function aiResponseFolderMode(
  projectId: string, node: StoredNode, prevNodes: StoredNode[], nextMeta: NextNodeMetadataEntry[],
  aiConfig: Record<string, unknown>,
  eai: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }>,
  svc: AiExecutionServices, ctx: AiExecutionContext,
): Promise<ExecutionStepResult> {
  const contextMode = (aiConfig.context_mode || 'simple') as 'simple' | 'full_json';
  const aiResult = await svc.aiService.run({ projectId, node, previousNodes: prevNodes, nextNodes: nextMeta, schemaRef: 'TEXT_RESPONSE', settings: ctx.projectSettings, projectOwnerId: ctx.projectOwnerId, actorUserId: ctx.actorUserId, contextMode, edges: eai });
  return { content: `"File folder" mode is under development. AI response:\n${aiResult.output}`, contentType: 'text/plain', logs: [...aiResult.logs, 'Folder mode not yet implemented'], predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig) };
}

// AI default mode (single response)
async function aiDefaultMode(
  projectId: string, node: StoredNode, prevNodes: StoredNode[], nextMeta: NextNodeMetadataEntry[],
  aiConfig: Record<string, unknown>, files: CollectedFile[],
  eai: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }>,
  svc: AiExecutionServices, ctx: AiExecutionContext,
): Promise<ExecutionStepResult> {
  const contextMode = (aiConfig.context_mode || 'simple') as 'simple' | 'full_json';
  const aiResult = await svc.aiService.run({ projectId, node, previousNodes: prevNodes, nextNodes: nextMeta, schemaRef: 'TEXT_RESPONSE', settings: ctx.projectSettings, projectOwnerId: ctx.projectOwnerId, actorUserId: ctx.actorUserId, files, contextMode, edges: eai });
  updateLastRequestPayload(projectId, node, aiResult.requestPayload);

  let parsed: unknown = null;
  if (typeof aiResult.output === 'string') { try { parsed = JSON.parse(aiResult.output); } catch { /* not JSON */ } }

  let repArt: ArtifactBag = emptyArtifactBag();
  if (aiResult.provider === 'replicate' || (parsed && typeof parsed === 'object' && parsed !== null)) {
    repArt = await createReplicateAssetNodes(projectId, node, collectReplicateOutputCandidates(aiResult, parsed), aiResult.predictionId, aiResult.predictionUrl);
  }

  const aggText = repArt.aggregatedText?.trim() || null;
  if (repArt.nodeSnapshots.length > 0) applyCreatedNodesToMeta(projectId, node, repArt.nodeSnapshots, { predictionPayload: aiResult.predictionPayload });
  else if (aiResult.predictionPayload !== undefined && aiResult.provider === 'replicate') applyCreatedNodesToMeta(projectId, node, [], { predictionPayload: aiResult.predictionPayload });

  let finalContent = aiResult.output;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as Record<string, unknown>).output) finalContent = String((parsed as Record<string, unknown>).output);
  if (aiResult.provider === 'replicate' && aggText) finalContent = aggText;
  if (repArt.createdNodes.length > 0) { const s = buildArtifactSummary(repArt.createdNodes); finalContent = aggText ? `${aggText}\n\n${s}` : s; }

  return { content: finalContent, contentType: aiResult.contentType, logs: [...aiResult.logs, ...repArt.logs], createdNodes: repArt.createdNodes, createdNodeSnapshots: repArt.nodeSnapshots, isMultiNodeResult: repArt.createdNodes.length > 0, predictionUrl: aiResult.predictionUrl, predictionId: aiResult.predictionId, provider: resolveProvider(aiResult, aiConfig), predictionPayload: aiResult.predictionPayload };
}
