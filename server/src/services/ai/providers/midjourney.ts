/**
 * Midjourney provider implementation.
 * ADR-081 Phase 2 — extracted from AiService.
 */

import * as path from 'path';
import { getNode, updateNodeMetaSystem, createProjectNode, addProjectEdge } from '../../../db';
import { downloadRemoteAsset } from '../../../utils/storage';
import { MidjourneyService, resolveMidjourneyIntegration } from '../../midjourney';
import type { AiContext, AiResult } from '../types';
import type { AiService } from '../aiRouter';

import { logger } from '../../../lib/logger';

const log = logger.child({ module: 'ai/providers/midjourney' });
async function waitAndUpscaleAll(
  service: MidjourneyService,
  mainJobId: string,
  logs: string[],
): Promise<Array<{ index: number; jobId: string; imageUrl: string }>> {
  log.info(`[Midjourney] Waiting for main job ${mainJobId} to complete before upscaling...`);
  logs.push('Waiting for main image generation...');

  let attempts = 0;
  const maxAttempts = 60;
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;

    const status = await service.pollStatus(mainJobId);
    log.info(`[Midjourney] Main job ${mainJobId} status: ${status.status} (${attempts}/${maxAttempts})`);

    if (status.status === 'SUCCESS') {
      logs.push('Main image generated! Starting upscale for 4 variants...');

      const upscaleJobs: Array<{ index: number; jobId: string }> = [];
      for (let i = 1; i <= 4; i++) {
        try {
          const upscaleResult = await service.submitUpscale(mainJobId, i);
          upscaleJobs.push({ index: i, jobId: upscaleResult.jobId });
          logs.push(`Upscale variant ${i} submitted...`);
        } catch (error) {
          log.error({ err: error }, '`[Midjourney] Failed to submit upscale ${i}:`');
        }
      }

      logs.push(`Waiting for ${upscaleJobs.length} upscale tasks to complete...`);
      const results: Array<{ index: number; jobId: string; imageUrl: string }> = [];

      for (const job of upscaleJobs) {
        let upscaleAttempts = 0;
        const maxUpscaleAttempts = 30;
        while (upscaleAttempts < maxUpscaleAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          upscaleAttempts++;
          const upscaleStatus = await service.pollStatus(job.jobId);
          if (upscaleStatus.status === 'SUCCESS' && upscaleStatus.artifacts.length > 0) {
            results.push({ index: job.index, jobId: job.jobId, imageUrl: upscaleStatus.artifacts[0].url });
            logs.push(`Upscale variant ${job.index} ready!`);
            break;
          } else if (upscaleStatus.status === 'FAILURE') {
            log.error(`[Midjourney] Upscale ${job.index} failed`);
            break;
          }
        }
      }
      return results;
    } else if (status.status === 'FAILURE') {
      logs.push('Main image generation failed');
      throw new Error('Main image generation failed');
    }
  }
  logs.push('Timed out waiting for main image');
  throw new Error('Timed out waiting for main image generation');
}

export async function runMidjourney(
  service: AiService,
  context: AiContext,
): Promise<AiResult> {
  log.info('[runMidjourney] ========== STARTED ==========');
  const integration = resolveMidjourneyIntegration();
  if (!integration) {
    throw new Error('Midjourney Relay integration is not configured. Add Relay URL and Auth Token in Integrations.');
  }

  const relayUrl = integration.relayUrl.trim();
  const token = integration.token.trim();
  if (!relayUrl || !token) throw new Error('Midjourney Relay credentials are incomplete. Check Relay URL and Auth Token.');
  if (!context.projectId) throw new Error('Midjourney Relay requires a workflow project. Open a project and try again.');
  const sourceNodeExists = Boolean(getNode(context.projectId, context.node.node_id));
  if (!sourceNodeExists) throw new Error('Midjourney Relay must run from an existing workflow node.');

  const mjService = new MidjourneyService(relayUrl, token, service['ajv'], integration.mode);
  const logs: string[] = [];

  const { prompt, referenceImages, logs: promptLogs, additionalInputs: modifierInputs } = mjService.queueJob(context);
  logs.push(...promptLogs);

  const nodeAny = context.node as unknown as Record<string, unknown>;
  const aiInputs = typeof nodeAny.ai === 'object' && nodeAny.ai !== null ? nodeAny.ai as Record<string, unknown> : {};
  const mergedInputs = { ...aiInputs, ...modifierInputs };
  const modelId = typeof nodeAny.ai_model_id === 'string' ? nodeAny.ai_model_id : undefined;

  const enqueueResult = await mjService.enqueue({ prompt, referenceImages, additionalInputs: mergedInputs, modelId }, integration);
  logs.push(`Midjourney job ${enqueueResult.jobId} queued (status: ${enqueueResult.status}).`);

  if ((enqueueResult as Record<string, unknown>).preview) {
    try {
      const preview = (enqueueResult as Record<string, unknown>).preview as { url: string; body: Record<string, unknown> };
      logs.push(`Midjourney preview: ${JSON.stringify(preview.body)}`);
      if (Array.isArray(referenceImages) && referenceImages.length > 0) {
        logs.push(`Reference image URLs: ${referenceImages.map((r) => r.url).join(', ')}`);
      }
    } catch { /* non-fatal */ }
  }

  let upscaleResults: Array<{ index: number; jobId: string; imageUrl: string }> = [];
  const createdImages: Array<{ variant: number; discord_url: string; local_url: string }> = [];

  try {
    upscaleResults = await waitAndUpscaleAll(mjService, enqueueResult.jobId, logs);
    logs.push(`Auto-upscale completed: ${upscaleResults.length} variants ready`);

    for (const result of upscaleResults) {
      try {
        const download = await downloadRemoteAsset(context.projectId, result.imageUrl, {
          subdir: path.join('midjourney', `job_${enqueueResult.jobId}`),
        });
        const relativeUrl = `/uploads/${context.projectId}/${download.relativePath}`;
        const fullUrl = `https://mindworkflow.com${relativeUrl}`;

        createdImages.push({ variant: result.index, discord_url: result.imageUrl, local_url: fullUrl });

        const imageNode = createProjectNode(context.projectId, {
          type: 'image',
          title: `Variant ${result.index}`,
          content: '',
          meta: {
            image_url: fullUrl, image_file: download.filename, display_mode: 'url', image_output_mode: 'original',
            image_original: fullUrl, original_image: fullUrl, image_edited: fullUrl, edited_image: fullUrl,
            file_size: download.size, file_type: download.mimeType, image_path: relativeUrl, original_url: fullUrl,
            local_url: relativeUrl, source_url: result.imageUrl, asset_public_url: fullUrl,
            asset_relative_path: download.relativePath, asset_origin: 'midjourney', auto_downloaded: true,
            midjourney_job_id: result.jobId, variant_index: result.index, source_node_id: context.node.node_id,
          },
        }, {
          position: {
            x: context.node.ui?.bbox?.x2 ? context.node.ui.bbox.x2 + 200 + (result.index - 1) * 300 : 0,
            y: context.node.ui?.bbox?.y1 || 0,
          },
        });

        addProjectEdge(context.projectId, { from: context.node.node_id, to: imageNode.node.node_id });
        logs.push(`Created image node for variant ${result.index}`);
      } catch (error) {
        log.error({ err: error }, '`[Midjourney] Failed to process variant ${result.index}:`');
        logs.push(`Failed to process variant ${result.index}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    log.error({ err: error }, '[Midjourney] Auto-upscale failed');
    logs.push(`Auto-upscale failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const requestPayload = {
    provider: 'midjourney_mindworkflow_relay',
    job_id: enqueueResult.jobId,
    prompt,
    reference_images: referenceImages.map((r) => ({ url: r.url, purpose: r.purpose, strength: r.strength })),
    model_id: modelId,
    additional_inputs: modifierInputs,
  };

  const currentMeta = (context.node.meta ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...currentMeta,
    midjourney_job_id: enqueueResult.jobId,
    midjourney_status: enqueueResult.status,
    last_request_payload: requestPayload,
  };
  if (!Array.isArray(nextMeta.artifacts)) nextMeta.artifacts = [];
  updateNodeMetaSystem(context.projectId, context.node.node_id, nextMeta);
  context.node.meta = nextMeta;

  const outputPayload = {
    status: 'completed',
    job_id: enqueueResult.jobId,
    variants_created: upscaleResults.length,
    message: `Generated ${upscaleResults.length} variants`,
    images: createdImages,
    prompt: prompt.slice(0, 200) + (prompt.length > 200 ? '...' : ''),
  };

  return {
    output: JSON.stringify(outputPayload, null, 2),
    contentType: 'application/json',
    logs,
  };
}
