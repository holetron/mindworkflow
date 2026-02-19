/**
 * AI Router — model-to-provider routing logic.
 * Contains the AiService class that delegates to the correct provider.
 *
 * ADR-081 Phase 2 — extracted from the monolithic ai.ts.
 */

import Ajv, { type ErrorObject } from 'ajv';
import type { StoredNode } from '../../db';
import { db, getNode } from '../../db';
import type { IntegrationRecord } from '../../types/integration';
import { getIntegrationForUserByProvider } from '../integrationRepository';

import type {
  AiContext,
  AiResult,
  NormalizedProviderConfig,
  ProviderFieldConfig,
  ProviderFieldValuePersisted,
  ResolvedProviderField,
} from './types';

import {
  resolveFieldValue,
  normalizePlaceholderValues,
  applyPlaceholderValues,
  composeUserPrompt,
} from './promptBuilder';

import {
  resolveAssetUrl,
  resolveFileDeliveryFormat,
  prepareAssetForDelivery,
} from './contextBuilder';

import { runOpenAi } from './providers/openai';
import { runGemini } from './providers/gemini';
import { runGoogleAiStudio } from './providers/googleAiStudio';
import { runReplicate } from './providers/replicate';
import { runMidjourney } from './providers/midjourney';

import { logger } from '../../lib/logger';

const log = logger.child({ module: 'ai/aiRouter' });
// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

const DEBUG_LOGGING = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) log.debug(args.map(String).join(' '));
};

// ---------------------------------------------------------------------------
// Shared utility functions (used by AiService and provider modules)
// ---------------------------------------------------------------------------

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeProviderConfig(source: unknown): NormalizedProviderConfig {
  if (!source || typeof source !== 'object') return {};
  const record = source as Record<string, unknown>;

  const readString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const raw = record[key];
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
    return undefined;
  };

  const normalized: NormalizedProviderConfig = {
    api_key: readString('api_key', 'apiKey', 'API_KEY', 'token', 'authToken', 'secret'),
    organization: readString('organization', 'org', 'organization_id', 'orgId', 'openai_org'),
    base_url: readString('base_url', 'baseUrl', 'endpoint', 'url'),
    model: readString('model', 'MODEL', 'default_model', 'defaultModel'),
  };

  const inputFields =
    (Array.isArray(record.inputFields) ? record.inputFields : undefined) ??
    (Array.isArray(record.input_fields) ? record.input_fields : undefined);
  if (Array.isArray(inputFields)) {
    normalized.input_fields = inputFields as ProviderFieldConfig[];
  }

  return normalized;
}

export function ensureJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

// ---------------------------------------------------------------------------
// AiService — the main router
// ---------------------------------------------------------------------------

export class AiService {
  constructor(private readonly ajv: Ajv) {}

  // ---- Integration config resolution ----

  integrationRecordToConfig(record: IntegrationRecord): Record<string, unknown> {
    const { config } = record;
    return {
      description: config.description,
      apiKey: config.apiKey,
      api_key: config.apiKey,
      baseUrl: config.baseUrl,
      base_url: config.baseUrl,
      organization: config.organization,
      inputFields: config.inputFields,
      input_fields: config.inputFields,
      models: config.models,
      modelsUpdatedAt: config.modelsUpdatedAt,
      systemPrompt: config.systemPrompt,
    };
  }

  getResolvedIntegrationConfig(
    type: string,
    context: AiContext,
  ): Record<string, unknown> | null {
    const actorUserId = context.actorUserId ?? undefined;
    const projectOwnerId = context.projectOwnerId ?? undefined;

    if (actorUserId) {
      const actorIntegration = getIntegrationForUserByProvider(type, actorUserId);
      if (actorIntegration && actorIntegration.enabled) {
        return this.integrationRecordToConfig(actorIntegration);
      }
    }
    if (projectOwnerId && projectOwnerId !== actorUserId) {
      const ownerIntegration = getIntegrationForUserByProvider(type, projectOwnerId);
      if (ownerIntegration && ownerIntegration.enabled) {
        return this.integrationRecordToConfig(ownerIntegration);
      }
    }
    return null;
  }

  // ---- Provider field helpers ----

  parseProviderFields(raw: unknown): Record<string, ProviderFieldValuePersisted> {
    if (!raw || typeof raw !== 'object') return {};
    const result: Record<string, ProviderFieldValuePersisted> = {};
    for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const typed = entry as Record<string, unknown>;
      result[key] = {
        value:
          typeof typed.value === 'string'
            ? typed.value
            : typeof typed.value === 'number'
              ? String(typed.value)
              : undefined,
        source_node_id: typeof typed.source_node_id === 'string' ? typed.source_node_id : null,
      };
    }
    return result;
  }

  resolveProviderFields(
    defs: ProviderFieldConfig[],
    stored: Record<string, ProviderFieldValuePersisted>,
    previousNodes: StoredNode[],
  ): ResolvedProviderField[] {
    if (defs.length === 0) return [];
    const previousMap = new Map<string, StoredNode>();
    previousNodes.forEach((node) => previousMap.set(node.node_id, node));

    return defs.map((field) => {
      const storedValue = stored[field.key];
      if (storedValue?.source_node_id) {
        const upstream = previousMap.get(storedValue.source_node_id);
        const derived = typeof upstream?.content === 'string' ? upstream.content : '';
        return {
          key: field.key,
          label: field.label,
          value:
            derived && derived.trim().length > 0
              ? derived
              : storedValue?.value ?? field.default_value ?? '',
          source_node_id: storedValue.source_node_id,
        };
      }
      return {
        key: field.key,
        label: field.label,
        value: storedValue?.value ?? field.default_value ?? '',
      };
    });
  }

  // ---- Validation helpers ----

  formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
    if (!errors || errors.length === 0) return 'Unknown validation error';
    return errors
      .map((error) => {
        const path = error.instancePath || error.schemaPath || '<root>';
        const message = error.message ?? 'invalid value';
        const params =
          error.params && Object.keys(error.params).length > 0
            ? ` (${JSON.stringify(error.params)})`
            : '';
        return `${path}: ${message}${params}`;
      })
      .join('; ');
  }

  looksLikeImageUrl(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    if (value.startsWith('data:')) return true;
    if (value.startsWith('http://') || value.startsWith('https://')) return true;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    return imageExtensions.some((ext) => value.toLowerCase().includes(ext));
  }

  // ---- Stub generators ----

  inferTargetAudience(source: string): string {
    if (/школ/i.test(source)) return 'students aged 10-16';
    if (/взросл/i.test(source)) return 'adult audience aged 25-45';
    return 'general audience';
  }

  inferGoal(source: string): string {
    if (!source) return 'Increase brand awareness';
    return source.split(/[.!?]/)[0]?.trim() || 'Create a memorable video';
  }

  inferTone(source: string): string {
    if (/серьез/i.test(source)) return 'serious';
    if (/весел/i.test(source) || /смешн/i.test(source)) return 'playful';
    return 'dynamic';
  }

  ensureMinimumNodes(nodes: AiContext['nextNodes']): AiContext['nextNodes'] {
    const result = [...nodes];
    const defaults: AiContext['nextNodes'] = [
      { node_id: 'default_briefing', type: 'text', title: 'Additional brief', short_description: 'Structured brief based on the planning results', connection_labels: ['auto'] },
      { node_id: 'default_storyboard', type: 'image_gen', title: 'Storyboard preview', short_description: 'Draft storyboard frames', connection_labels: ['auto'] },
      { node_id: 'default_voiceover', type: 'audio_gen', title: 'Voiceover', short_description: 'Synthesized text for narration', connection_labels: ['auto'] },
    ];
    let index = 0;
    while (result.length < 3 && index < defaults.length) {
      result.push(defaults[index]);
      index += 1;
    }
    return result;
  }

  generateStubPlan(context: AiContext): AiResult {
    const { previousNodes, schemaRef, nextNodes } = context;
    const promptSource = previousNodes[previousNodes.length - 1]?.content ?? '';

    if (schemaRef === 'TEXT_RESPONSE') return this.generateStubTextResponse(context, promptSource);

    const targetAudience = this.inferTargetAudience(promptSource);
    const goal = this.inferGoal(promptSource);
    const tone = this.inferTone(promptSource);
    const downstream = this.ensureMinimumNodes(nextNodes);

    const allowedTypes = new Set(['text', 'ai', 'parser', 'python', 'image_gen', 'audio_gen', 'video_gen']);
    const sanitizedNodes = downstream.map((node, index) => {
      const nodeId = typeof node.node_id === 'string' && node.node_id.trim().length > 0 ? node.node_id.trim() : `auto_node_${index + 1}`;
      const rawType = typeof node.type === 'string' ? node.type.trim() : 'text';
      const type = allowedTypes.has(rawType) ? rawType : 'text';
      const title = typeof node.title === 'string' && node.title.trim().length > 0 ? node.title.trim() : `Step ${index + 1}`;
      const description = typeof node.short_description === 'string' && node.short_description.trim().length > 0 ? node.short_description.trim() : 'Description will be refined during step execution.';
      return { node_id: nodeId, type, title, description, outputs: ['structured_json', 'summary_text'] };
    });

    const plan = {
      overview: { goal, target_audience: targetAudience, tone, duration_sec: 30 },
      phases: [
        { name: 'Concept', steps: ['Refine the brief', 'Formulate key messages'] },
        { name: 'Production', steps: ['Generate scenes', 'Prepare talent', 'Collect assets'] },
        { name: 'Post-production', steps: ['Assemble preview', 'Final quality control'] },
      ],
      nodes: sanitizedNodes,
    };

    const validator = this.ajv.getSchema(schemaRef) ?? this.ajv.getSchema(schemaRef.toUpperCase());
    if (!validator) throw new Error(`Unknown schema: ${schemaRef}`);
    if (!validator(plan)) {
      const message = this.formatAjvErrors(validator.errors);
      throw new Error(`AI stub produced invalid payload: ${message}`);
    }

    return {
      output: JSON.stringify(plan, null, 2),
      contentType: 'application/json',
      logs: [
        `AI stub local-llm-7b-q5 executed for node ${context.node.node_id}`,
        `Detected target audience: ${targetAudience}`,
        `Generated ${plan.phases.length} phases and ${plan.nodes.length} downstream node descriptors`,
      ],
    };
  }

  generateStubTextResponse(context: AiContext, promptSource: string): AiResult {
    const nodeContent = context.node.content || '';
    const combinedPrompt = nodeContent.trim() ? nodeContent : promptSource;

    let responseText = '';
    if (combinedPrompt.toLowerCase().includes('ремонт') || combinedPrompt.toLowerCase().includes('renovation') || combinedPrompt.toLowerCase().includes('repair')) {
      responseText = `Step-by-step renovation plan:\n\n1. **Preparation phase**\n   - Remove old plumbing fixtures\n   - Clean surfaces\n   - Prepare tools and materials\n\n2. **Main work**\n   - Replace vanity under the sink\n   - Install new mirror\n   - Replace toilet\n   - Install backsplash behind the sink\n\n3. **Finishing phase**\n   - Connect utilities\n   - Seal joints\n   - Clean up the workspace\n   - Verify everything works properly`;
    } else {
      responseText = `Response to request: "${combinedPrompt}"\n\nThis is a detailed agent response generated based on your prompt. The content is adapted to the context of your request.`;
    }

    const textResponse = { response: responseText };
    const validator = this.ajv.getSchema('TEXT_RESPONSE');
    if (!validator) throw new Error('TEXT_RESPONSE schema not found');
    if (!validator(textResponse)) {
      const message = this.formatAjvErrors(validator.errors);
      throw new Error(`AI stub produced invalid TEXT_RESPONSE: ${message}`);
    }

    return {
      output: JSON.stringify(textResponse, null, 2),
      contentType: 'application/json',
      logs: [
        `AI text response generated for node ${context.node.node_id}`,
        `Prompt source: ${combinedPrompt.substring(0, 50)}...`,
        `Response length: ${responseText.length} characters`,
      ],
    };
  }

  // ---- Main routing entry point ----

  async run(context: AiContext): Promise<AiResult> {
    const aiConfig = (context.node.config.ai ?? {}) as Record<string, unknown>;
    const settingsProviderId = (context.settings?.ai as Record<string, unknown>)?.provider;
    const providerId =
      typeof settingsProviderId === 'string' && settingsProviderId.length > 0
        ? settingsProviderId
        : typeof aiConfig.provider === 'string'
          ? aiConfig.provider
          : 'stub';

    debugLog(`[AI Service] Provider ID: ${providerId}, Schema: ${context.schemaRef}`);

    if (providerId === 'stub' || providerId === 'local_stub') {
      if (context.schemaRef === 'TEXT_RESPONSE' || context.schemaRef === 'text_response') {
        return this.generateStubTextResponse(context, context.node.content || '');
      }
      return this.generateStubPlan(context);
    } else if (providerId === 'replicate') {
      return runReplicate(this, context, aiConfig);
    } else if (providerId === 'midjourney_proxy' || providerId === 'midjourney_mindworkflow_relay') {
      return runMidjourney(this, context);
    } else if (providerId === 'google_ai_studio') {
      return runGoogleAiStudio(this, context);
    } else if (providerId === 'gemini' || providerId === 'google_gemini' || providerId === 'google_workspace') {
      return runGemini(this, context, aiConfig);
    } else {
      return runOpenAi(this, context, aiConfig);
    }
  }
}
