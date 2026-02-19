/**
 * Google AI Studio provider implementation.
 * ADR-081 Phase 2 — extracted from AiService.
 */

import { getNode, updateNodeMetaSystem } from '../../../db';
import type { AiContext, AiResult } from '../types';
import type { AiService } from '../aiRouter';
import { logger } from '../../../lib/logger';

const log = logger.child({ module: 'ai/providers/googleAiStudio' });
import {
  GoogleAiStudioService,
  resolveGoogleAiStudioIntegration,
  type GoogleAiStudioArtifact,
} from '../../googleAiStudio';

export async function runGoogleAiStudio(
  service: AiService,
  context: AiContext,
): Promise<AiResult> {
  const integration = resolveGoogleAiStudioIntegration();
  if (!integration) {
    throw new Error(
      'Google AI Studio integration is not configured. Add API key and model in Integrations.',
    );
  }

  // Override model from context.node.config.ai.model if provided
  const nodeConfig = context.node.config as Record<string, unknown>;
  const aiConfig = nodeConfig?.ai as Record<string, unknown>;
  if (aiConfig?.model && typeof aiConfig.model === 'string' && aiConfig.model.trim()) {
    log.info(`[Google AI Studio] Overriding model from chat settings: ${integration.model} -> ${aiConfig.model}`);
    integration.model = aiConfig.model.trim();
  }

  const logs: string[] = [];
  const googleService = new GoogleAiStudioService(integration);
  const { prompt, logs: promptLogs } = googleService.buildPrompt(context);
  logs.push(...promptLogs);

  if (!prompt) {
    throw new Error('Google AI Studio prompt is empty. Add content or upstream context before running.');
  }

  const jobId = googleService.generateJobId();
  const hasWorkflowNode =
    Boolean(context.projectId) &&
    Boolean(getNode(context.projectId as string, context.node.node_id));

  let folderNode: import('../../../db').StoredNode | null = null;
  if (hasWorkflowNode) {
    folderNode = await googleService.createOrResolveFolder(context, jobId);
    logs.push(`Using folder ${folderNode.node_id} for Google AI Studio artifacts.`);
  } else if (context.projectId) {
    logs.push('Skipping artifact folder creation: source node not found in project.');
  } else {
    logs.push('Skipping artifact folder creation: no project context provided.');
  }

  const generation = await googleService.generateContent(prompt, context.files);
  logs.push(...generation.logs);

  let persistedArtifacts: GoogleAiStudioArtifact[] = [];
  if (hasWorkflowNode && folderNode && context.projectId) {
    persistedArtifacts = await googleService.persistArtifacts(
      context.projectId,
      context.node,
      folderNode,
      jobId,
      generation.artifacts,
    );
  }

  const status =
    persistedArtifacts.length > 0 || generation.textOutputs.length > 0 ? 'completed' : 'empty';

  if (hasWorkflowNode && context.projectId && folderNode) {
    const currentMeta = (context.node.meta ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = {
      ...currentMeta,
      google_ai_job_id: jobId,
      google_ai_status: status,
      google_ai_text_outputs: generation.textOutputs,
      output_folder_id: folderNode.node_id,
      artifacts: persistedArtifacts,
      last_generated_at: new Date().toISOString(),
    };
    updateNodeMetaSystem(context.projectId, context.node.node_id, nextMeta);
    context.node.meta = nextMeta;
  } else if (!hasWorkflowNode) {
    logs.push('Skipping workflow metadata updates (chat context without saved node).');
  }

  const payload = {
    status,
    job_id: jobId,
    folder_id: folderNode?.node_id ?? null,
    artifacts: persistedArtifacts,
    text_outputs: generation.textOutputs,
  };

  return {
    output: JSON.stringify(payload, null, 2),
    contentType: 'application/json',
    logs,
  };
}
