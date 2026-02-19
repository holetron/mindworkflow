/**
 * Replicate provider implementation — main entry point.
 * Handles model execution orchestration, input assembly, and result processing.
 *
 * ADR-081 Phase 2 — utilities split into replicateUtils.ts & replicateApi.ts.
 */

import { db, getNode, updateNodeMetaSystem } from '../../../db';
import type { StoredNode } from '../../../db';
import type { AiContext, AiResult, NormalizedProviderConfig, ProviderFieldConfig } from '../types';
import type { AiService } from '../aiRouter';
import { normalizeProviderConfig, ensureJson, toStringArray } from '../aiRouter';
import { resolveFieldValue, composeUserPrompt } from '../promptBuilder';
import { resolveAssetUrl, resolveFileDeliveryFormat, prepareAssetForDelivery } from '../contextBuilder';

import { logger } from '../../../lib/logger';

// Utilities from replicateUtils.ts
import {
  isReplicatePlaceholderToken,
  normalizeReplicateBaseUrl,
  getReplicateModelType,
  looksLikeImageUrl,
  sanitizeReplicateInput,
  resolveReplicateImageInputsFromFiles,
} from './replicateUtils';

// API / lifecycle / meta helpers from replicateApi.ts
import {
  resolveReplicateModel,
  createReplicatePrediction,
  awaitReplicatePrediction,
  stripLegacyReplicateMeta,
  ensureShortDescription,
  ensureUiPosition,
  ensureOutputType,
  extractPrimaryOutput,
  toStringOrEmpty,
  normalizeLinkValue,
} from './replicateApi';

const log = logger.child({ module: 'ai/providers/replicate' });

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runReplicate(
  service: AiService,
  context: AiContext,
  aiConfig: Record<string, unknown>,
): Promise<AiResult> {
  const logs: string[] = [];

  if (!context.projectId) throw new Error('Replicate provider requires a workflow project. Open a project and try again.');
  const isChatNode = context.node.node_id.startsWith('chat-');
  const sourceNodeExists = Boolean(getNode(context.projectId, context.node.node_id));
  if (!isChatNode && !sourceNodeExists) throw new Error('Replicate provider must run from an existing workflow node. Select a node on the canvas and run it there.');

  const globalConfigRaw = ensureJson(service.getResolvedIntegrationConfig('replicate', context));
  const integrations = ensureJson(context.settings?.integrations ?? {});
  const projectConfigRaw = ensureJson(integrations.replicate ?? integrations.replicate_api ?? integrations.replicate_ai ?? null);

  const globalConfig = normalizeProviderConfig(globalConfigRaw);
  const projectConfig = normalizeProviderConfig(projectConfigRaw);

  const envToken = typeof process.env.REPLICATE_API_TOKEN === 'string' ? process.env.REPLICATE_API_TOKEN.trim() : '';
  const apiKey = [projectConfig.api_key, (projectConfigRaw as Record<string, unknown>).apiKey, globalConfig.api_key, (globalConfigRaw as Record<string, unknown>).apiKey, envToken]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0) ?? '';

  if (!apiKey) throw new Error('Replicate API token is not configured. Add Replicate credentials in Integrations.');
  if (isReplicatePlaceholderToken(apiKey)) throw new Error('Replicate API token is a placeholder. Update the integration with a real token.');

  const baseUrlCandidate = projectConfig.base_url ?? (typeof (projectConfigRaw as Record<string, unknown>).baseUrl === 'string' ? (projectConfigRaw as Record<string, unknown>).baseUrl as string : null)
    ?? globalConfig.base_url ?? (typeof (globalConfigRaw as Record<string, unknown>).baseUrl === 'string' ? (globalConfigRaw as Record<string, unknown>).baseUrl as string : null)
    ?? (typeof process.env.REPLICATE_API_BASE_URL === 'string' ? process.env.REPLICATE_API_BASE_URL : null);
  const baseUrl = normalizeReplicateBaseUrl(baseUrlCandidate as string | null | undefined);
  logs.push(`Replicate endpoint: ${baseUrl}`);

  const projectFields = Array.isArray(projectConfig.input_fields) ? projectConfig.input_fields : [];
  const globalFields = Array.isArray(globalConfig.input_fields) ? globalConfig.input_fields : [];
  const providerFieldsConfig = (projectFields.length > 0 ? projectFields : globalFields) as ProviderFieldConfig[];
  const storedProviderFields = service.parseProviderFields(aiConfig.provider_fields);
  const resolvedFields = service.resolveProviderFields(providerFieldsConfig, storedProviderFields, context.previousNodes);

  const allNodesInProject = context.projectId ? (db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(context.projectId) as StoredNode[]) : [];
  const edges = (context.edges || []).map((e) => ({ from: e.from, to: e.to, targetHandle: e.targetHandle }));

  const schema = context.schemaRef === 'TEXT_RESPONSE' || context.schemaRef === 'text_response' ? null : service['ajv'].getSchema(context.schemaRef)?.schema;
  const inputPayload: Record<string, unknown> = {};
  const fileDeliveryFormat = resolveFileDeliveryFormat(aiConfig);

  // Auto-ports handling
  const autoPorts = aiConfig.auto_ports && Array.isArray(aiConfig.auto_ports) ? aiConfig.auto_ports : null;
  const nodesProcessedViaAutoPorts: string[] = [];

  log.info('`[AUTO_PORTS] aiConfig.auto_ports:` %s', aiConfig.auto_ports);
  log.info('`[AUTO_PORTS] Parsed autoPorts:` %s', autoPorts);

  if (autoPorts && autoPorts.length > 0) {
    log.info(`[AUTO_PORTS] Using auto-ports: ${autoPorts.map((p: Record<string, unknown>) => p.id).join(', ')}`);
    logs.push(`Using auto-ports: ${autoPorts.map((p: Record<string, unknown>) => p.id).join(', ')}`);

    const contextEdges = context.edges || [];
    const nodeEdges = contextEdges.filter((e) => e.to === context.node.node_id);

    for (const port of autoPorts) {
      const portId = (port as Record<string, unknown>).id as string;
      const portType = (port as Record<string, unknown>).type as string;
      const portRequired = Boolean((port as Record<string, unknown>).required);

      const connectedEdge = nodeEdges.find((e) => e.targetHandle === portId || (!e.targetHandle && portId === 'prompt'));
      if (!connectedEdge) {
        if (portRequired) throw new Error(`Обязательный порт "${portId}" не подключен! Подключите ${portType}-ноду к этому порту.`);
        continue;
      }

      const sourceNode = context.previousNodes.find((n) => n.node_id === connectedEdge.from);
      if (!sourceNode) {
        if (portRequired) throw new Error(`Не найдена исходная нода для обязательного порта "${portId}"`);
        continue;
      }

      let value: unknown;
      if (portType === 'image' || portType === 'video') {
        const meta = ensureJson(sourceNode.meta);

        // Handle image-crop port
        if (portId === 'image-crop') {
          const cropSettings = ensureJson(meta.image_crop_settings) as Record<string, unknown> | null;
          const cropEnabled = Boolean(
            (typeof meta.image_crop_expose_port === 'boolean' && meta.image_crop_expose_port === true) ||
            (cropSettings && typeof cropSettings.exposePort === 'boolean' && cropSettings.exposePort === true),
          );
          if (!cropEnabled) {
            if (portRequired) throw new Error('Порт "image-crop" требует включённый вывод обрезки.');
            continue;
          }
          const cropCandidates = [meta.image_crop, meta.crop_image, meta.image_edited, meta.edited_image, meta.annotated_image];
          const cropValue = cropCandidates.find((c) => typeof c === 'string' && c.trim().length > 0) as string | undefined;
          if (cropValue) {
            const resolved = resolveAssetUrl(cropValue.trim());
            const delivered = await prepareAssetForDelivery(resolved, fileDeliveryFormat, 'image');
            inputPayload[portId] = delivered;
            logs.push(`Port ${portId}: image from node ${sourceNode.title || sourceNode.node_id}`);
            nodesProcessedViaAutoPorts.push(sourceNode.node_id);
            continue;
          }
          if (portRequired) throw new Error('Порт "image-crop" подключён, но обрезка отсутствует.');
          continue;
        }

        // Generic image/video resolution
        const pickImage = () => {
          const candidates: unknown[] = [];
          const rawMode = typeof meta.image_output_mode === 'string' ? (meta.image_output_mode as string).trim().toLowerCase() : '';
          if (rawMode === 'crop') candidates.push(meta.image_crop, meta.crop_image);
          else if (rawMode === 'annotated') candidates.push(meta.image_edited, meta.edited_image, meta.annotated_image);
          candidates.push(meta.image_url, meta.local_url, meta.image_original, meta.original_image, meta.image_edited, meta.edited_image, meta.image_crop, meta.crop_image, meta.annotated_image, meta.video_url, typeof sourceNode.content === 'string' ? sourceNode.content : null);
          for (const c of candidates) { if (typeof c === 'string' && c.trim().length > 0) return c.trim(); }
          return null;
        };
        const url = pickImage();
        if (typeof url === 'string' && url.trim().length > 0) {
          const resolvedUrl = resolveAssetUrl(url.trim());
          value = await prepareAssetForDelivery(resolvedUrl, fileDeliveryFormat, portType === 'video' ? 'video' : 'image');
        } else if (portRequired) {
          throw new Error(`Порт "${portId}" требует ${portType}, но подключенная нода не содержит ${portType}`);
        }
      } else if (portType === 'text') {
        value = typeof sourceNode.content === 'string' ? sourceNode.content.trim() : '';
      } else if (portType === 'number') {
        const content = typeof sourceNode.content === 'string' ? sourceNode.content.trim() : '';
        value = parseFloat(content);
        if (isNaN(value as number) && portRequired) throw new Error(`Порт "${portId}" требует число, но получен некорректный формат: "${content}"`);
      } else {
        value = sourceNode.content || '';
      }

      if (value !== undefined && value !== null && value !== '') {
        inputPayload[portId] = value;
        logs.push(`Port ${portId}: ${portType} from node ${sourceNode.title || sourceNode.node_id}`);
        nodesProcessedViaAutoPorts.push(sourceNode.node_id);
      }
    }
  } else {
    // Legacy provider fields
    for (const field of resolvedFields) {
      let val = field.value;
      if (typeof val === 'string' && looksLikeImageUrl(val)) {
        const resolvedUrl = resolveAssetUrl(val);
        val = await prepareAssetForDelivery(resolvedUrl, fileDeliveryFormat, 'image');
      }
      inputPayload[field.key] = val;
    }
  }

  // Compose user prompt
  const userPrompt = (await composeUserPrompt(aiConfig, context, schema, resolvedFields, allNodesInProject, edges, nodesProcessedViaAutoPorts)).trim();

  // Field mapping (system_prompt, output_example, temperature targets)
  const fieldMapping = ensureJson(aiConfig.field_mapping);
  const joinSections = (...parts: string[]) => parts.map((p) => p.trim()).filter((p) => p.length > 0).join('\n\n');
  const normalizeTarget = (v: string) => (v || '').trim();

  const rawSysTarget = typeof fieldMapping['system_prompt_target'] === 'string' ? fieldMapping['system_prompt_target'] as string : typeof aiConfig.system_prompt_target === 'string' ? aiConfig.system_prompt_target as string : 'prompt';
  const systemPromptTarget = normalizeTarget(rawSysTarget) || 'prompt';
  const resolvedSystemPrompt = String(await resolveFieldValue('system_prompt', aiConfig, allNodesInProject, edges, context.node.node_id)).trim();

  const rawOutTarget = typeof fieldMapping['output_example_target'] === 'string' ? fieldMapping['output_example_target'] as string : typeof aiConfig.output_example_target === 'string' ? aiConfig.output_example_target as string : 'prompt';
  const outputExampleTarget = normalizeTarget(rawOutTarget) || 'prompt';
  const resolvedOutputExample = String(await resolveFieldValue('output_example', aiConfig, allNodesInProject, edges, context.node.node_id)).trim();

  const rawTempTarget = typeof fieldMapping['temperature_target'] === 'string' ? fieldMapping['temperature_target'] as string : typeof aiConfig.temperature_target === 'string' ? aiConfig.temperature_target as string : 'temperature';
  const temperatureTarget = normalizeTarget(rawTempTarget) || 'temperature';
  const temperatureSource = typeof fieldMapping['temperature_source'] === 'string' ? String(fieldMapping['temperature_source']) : typeof aiConfig.temperature_source === 'string' ? String(aiConfig.temperature_source) : 'manual';
  const resolvedTemperatureValue = await resolveFieldValue('temperature', aiConfig, allNodesInProject, edges, context.node.node_id);
  const resolvedTemperature = typeof resolvedTemperatureValue === 'number' ? resolvedTemperatureValue : Number(resolvedTemperatureValue);

  const existingPrompt = typeof inputPayload.prompt === 'string' ? inputPayload.prompt.trim() : '';
  let effectivePrompt = existingPrompt.length > 0 ? existingPrompt : userPrompt;

  if (resolvedSystemPrompt.length > 0) {
    if (systemPromptTarget === 'prompt') {
      effectivePrompt = joinSections(resolvedSystemPrompt, effectivePrompt);
    } else {
      const cur = inputPayload[systemPromptTarget];
      if (typeof cur === 'string' && cur.trim().length > 0 && cur.trim() !== resolvedSystemPrompt) {
        inputPayload[systemPromptTarget] = joinSections(resolvedSystemPrompt, cur.trim());
      } else if (cur === undefined || cur === null || (typeof cur === 'string' && cur.trim().length === 0)) {
        inputPayload[systemPromptTarget] = resolvedSystemPrompt;
      }
    }
  }

  if (resolvedOutputExample.length > 0) {
    effectivePrompt = joinSections(effectivePrompt, `output_template:\n${resolvedOutputExample}`);
    if (outputExampleTarget === 'prompt') inputPayload.output_example = resolvedOutputExample;
    else inputPayload[outputExampleTarget] = resolvedOutputExample;
  }

  const hasManualTemp = temperatureSource === 'manual' && typeof aiConfig.temperature === 'number';
  if ((temperatureSource !== 'manual' || hasManualTemp) && typeof resolvedTemperature === 'number' && Number.isFinite(resolvedTemperature)) {
    inputPayload[temperatureTarget] = resolvedTemperature;
  }

  // Additional fields from field_mapping
  const additionalFields = fieldMapping.additional_fields as Record<string, { target: string; source: 'manual' | 'port' }> | undefined;
  if (additionalFields && typeof additionalFields === 'object') {
    for (const [fn, mapping] of Object.entries(additionalFields)) {
      if (!mapping || typeof mapping !== 'object') continue;
      const src = mapping.source || 'manual';
      const tgt = mapping.target || fn;
      let fv: string | number | undefined;
      if (src === 'port') {
        const ce = (context.edges || []).find((e) => e.to === context.node.node_id && e.targetHandle === fn);
        if (ce) {
          const sn = allNodesInProject.find((n) => n.node_id === ce.from);
          if (sn) {
            const cnt = typeof sn.content === 'string' ? sn.content.trim() : '';
            const pn = parseFloat(cnt);
            fv = !isNaN(pn) && cnt.match(/^-?\d+(\.\d+)?$/) ? pn : cnt;
          }
        }
      }
      if (fv === undefined || fv === '') {
        const mv = (context.node.meta as Record<string, unknown>)?.[fn];
        const av = (aiConfig as Record<string, unknown>)[fn];
        const manual = mv !== undefined ? mv : av;
        if (manual !== undefined && manual !== null && String(manual).trim() !== '') fv = manual as string | number;
      }
      if (fv !== undefined && fv !== '') {
        if (tgt === 'prompt') effectivePrompt = joinSections(effectivePrompt, `${fn}: ${fv}`);
        else inputPayload[tgt] = fv;
      }
    }
  }

  if (effectivePrompt.length > 0) inputPayload.prompt = effectivePrompt;
  if (typeof aiConfig.negative_prompt === 'string' && aiConfig.negative_prompt.trim().length > 0) inputPayload.negative_prompt = (aiConfig.negative_prompt as string).trim();

  // Image from aiConfig
  if (typeof aiConfig.image === 'string' && aiConfig.image.trim().length > 0 && typeof inputPayload.image !== 'string') {
    const iv = aiConfig.image.trim();
    inputPayload.image = await prepareAssetForDelivery(resolveAssetUrl(iv), fileDeliveryFormat, 'image');
  }

  if (!('image_input' in inputPayload)) {
    const fallbackImages = await resolveReplicateImageInputsFromFiles(context.files, fileDeliveryFormat);
    if (fallbackImages.length > 0) inputPayload.image_input = fallbackImages;
  }

  // Model resolution
  const rawModel = typeof aiConfig.model === 'string' ? aiConfig.model.trim() : '';
  const configModels = toStringArray((projectConfigRaw as Record<string, unknown>).models ?? (globalConfigRaw as Record<string, unknown>).models);
  const defaultModelCandidate = typeof (projectConfigRaw as Record<string, unknown>).defaultModel === 'string' ? ((projectConfigRaw as Record<string, unknown>).defaultModel as string).trim()
    : typeof (globalConfigRaw as Record<string, unknown>).defaultModel === 'string' ? ((globalConfigRaw as Record<string, unknown>).defaultModel as string).trim() : '';
  const modelIdentifier = rawModel || (typeof projectConfig.model === 'string' && projectConfig.model.trim().length > 0 ? projectConfig.model.trim() : '') || defaultModelCandidate || configModels[0] || '';
  if (!modelIdentifier) throw new Error('Replicate model is not selected. Choose a model in AI settings.');

  const resolvedModel = await resolveReplicateModel(baseUrl, apiKey, modelIdentifier);
  logs.push(`Replicate model: ${resolvedModel.identifier}`);
  logs.push(`Replicate version: ${resolvedModel.version}`);

  const modelTypeInfo = getReplicateModelType(resolvedModel.identifier);
  logs.push(`Model type detected: ${modelTypeInfo.type} ${modelTypeInfo.emoji}`);

  // Apply model-type specific parameters
  const applyParams = (params: { key: string; type: 'string' | 'number' | 'integer' | 'boolean' }[]) => {
    for (const param of params) {
      if (aiConfig[param.key] === undefined || aiConfig[param.key] === null) continue;
      let v = aiConfig[param.key];
      if (typeof v === 'string' && v.trim() === '') continue;
      try {
        if (param.type === 'number') { v = parseFloat(v as string); if (isNaN(v as number)) continue; }
        else if (param.type === 'integer') { v = parseInt(v as string, 10); if (isNaN(v as number)) continue; }
        else if (param.type === 'boolean') { v = /^(true|1|yes)$/i.test(String(v)); }
      } catch { continue; }
      if (inputPayload[param.key] === undefined) inputPayload[param.key] = v;
    }
  };

  if (modelTypeInfo.type === 'text') {
    applyParams([
      { key: 'top_p', type: 'number' }, { key: 'top_k', type: 'integer' }, { key: 'max_tokens', type: 'integer' },
      { key: 'max_output_tokens', type: 'integer' }, { key: 'min_tokens', type: 'integer' }, { key: 'repetition_penalty', type: 'number' },
      { key: 'length_penalty', type: 'number' }, { key: 'seed', type: 'integer' }, { key: 'prompt_template', type: 'string' },
      { key: 'thinking_budget', type: 'integer' }, { key: 'dynamic_thinking', type: 'boolean' }, { key: 'system_instruction', type: 'string' },
    ]);
  } else if (modelTypeInfo.type === 'image') {
    applyParams([
      { key: 'width', type: 'integer' }, { key: 'height', type: 'integer' }, { key: 'aspect_ratio', type: 'string' },
      { key: 'num_outputs', type: 'integer' }, { key: 'num_inference_steps', type: 'integer' }, { key: 'guidance_scale', type: 'number' },
      { key: 'seed', type: 'integer' }, { key: 'strength', type: 'number' },
    ]);
  } else if (modelTypeInfo.type === 'video') {
    applyParams([
      { key: 'num_frames', type: 'integer' }, { key: 'fps', type: 'integer' }, { key: 'motion_bucket_id', type: 'integer' },
      { key: 'cond_aug', type: 'number' }, { key: 'seed', type: 'integer' },
    ]);
  }

  // Pass-through custom fields
  const processedKeys = new Set(['provider', 'model', 'temperature', 'max_tokens', 'top_p', 'frequency_penalty', 'presence_penalty', 'system_prompt', 'output_format', 'output_example', 'field_mapping', 'additional_fields', 'prompt', 'negative_prompt', 'image', 'width', 'height', 'aspect_ratio', 'num_outputs', 'num_inference_steps', 'guidance_scale', 'seed', 'strength', 'num_frames', 'fps', 'motion_bucket_id', 'cond_aug', 'top_k', 'max_output_tokens', 'min_tokens', 'repetition_penalty', 'length_penalty', 'prompt_template', 'thinking_budget', 'dynamic_thinking', 'system_instruction']);
  for (const [key, val] of Object.entries(aiConfig)) {
    if (processedKeys.has(key) || key.endsWith('_source') || key.endsWith('_target')) continue;
    if (inputPayload[key] !== undefined) continue;
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) continue;
    inputPayload[key] = val;
  }

  // Create prediction
  const sanitizedInput = sanitizeReplicateInput(inputPayload, typeof inputPayload.prompt === 'string' ? inputPayload.prompt : effectivePrompt);
  if (Object.keys(sanitizedInput).length > 0) logs.push(`Replicate input fields: ${Object.keys(sanitizedInput).join(', ')}`);

  const { prediction, requestPayload } = await createReplicatePrediction(baseUrl, apiKey, resolvedModel.version, sanitizedInput);
  const finalPrediction = await awaitReplicatePrediction(baseUrl, apiKey, prediction, logs);

  const predictionApiUrl = (finalPrediction as Record<string, unknown>)?.urls && typeof ((finalPrediction as Record<string, unknown>).urls as Record<string, unknown>)?.get === 'string' ? ((finalPrediction as Record<string, unknown>).urls as Record<string, unknown>).get as string : undefined;
  const predictionWebUrl = (finalPrediction as Record<string, unknown>)?.urls && typeof ((finalPrediction as Record<string, unknown>).urls as Record<string, unknown>)?.web === 'string' ? ((finalPrediction as Record<string, unknown>).urls as Record<string, unknown>).web as string : predictionApiUrl;

  const finalStatus = typeof finalPrediction?.status === 'string' ? (finalPrediction.status as string).toLowerCase() : 'unknown';
  logs.push(`Prediction status: ${finalStatus}`);
  if (predictionWebUrl) logs.push(`Prediction URL: ${predictionWebUrl}`);

  if (finalStatus === 'failed') {
    const errorMessage = typeof finalPrediction?.error === 'string' ? finalPrediction.error as string
      : finalPrediction?.error && typeof finalPrediction.error === 'object' ? JSON.stringify(finalPrediction.error)
        : 'Replicate prediction failed without error details.';
    throw new Error(errorMessage);
  }
  if (finalStatus === 'canceled') throw new Error('Replicate prediction was cancelled.');

  const outputPayload = {
    status: finalStatus,
    id: finalPrediction?.id ?? null,
    version: resolvedModel.version,
    model: resolvedModel.identifier,
    input: sanitizedInput,
    output: finalPrediction?.output ?? null,
    logs: finalPrediction?.logs ?? null,
    metrics: finalPrediction?.metrics ?? null,
    error: finalPrediction?.error ?? null,
    urls: { ...((finalPrediction?.urls as Record<string, unknown>) ?? {}), api: predictionApiUrl ?? null, web: predictionWebUrl ?? null },
  };
  logs.push(`Prediction payload: ${JSON.stringify(outputPayload)}`);

  // Update node meta
  const currentMeta = ensureJson(context.node.meta);
  const sanitizedMeta = stripLegacyReplicateMeta(currentMeta);
  const nextMeta: Record<string, unknown> = {
    ...sanitizedMeta,
    short_description: ensureShortDescription(sanitizedMeta, context.node),
    output_type: ensureOutputType(sanitizedMeta),
    ui_position: ensureUiPosition(sanitizedMeta, context.node),
    replicate_model: resolvedModel.identifier,
    replicate_version: resolvedModel.version,
    replicate_prediction_id: toStringOrEmpty(finalPrediction?.id),
    replicate_prediction_url: normalizeLinkValue(predictionWebUrl),
    replicate_prediction_api_url: normalizeLinkValue(predictionApiUrl),
    replicate_status: finalStatus,
    replicate_last_run_at: new Date().toISOString(),
    replicate_output: extractPrimaryOutput(finalPrediction?.output),
    replicate_prediction_payload: outputPayload,
    last_request_payload: requestPayload,
  };
  updateNodeMetaSystem(context.projectId!, context.node.node_id, nextMeta);
  context.node.meta = nextMeta;

  return {
    output: JSON.stringify(outputPayload, null, 2),
    contentType: 'application/json',
    logs,
    predictionUrl: predictionWebUrl ?? undefined,
    predictionId: finalPrediction?.id && typeof finalPrediction.id === 'string' ? finalPrediction.id as string : undefined,
    provider: 'replicate',
    rawOutput: finalPrediction?.output ?? null,
    predictionPayload: outputPayload,
    requestPayload,
  };
}
