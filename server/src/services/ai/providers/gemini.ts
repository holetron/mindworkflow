/**
 * Google Gemini provider implementation.
 * ADR-081 Phase 2 — extracted from AiService.
 */

import type { AiContext, AiResult, NormalizedProviderConfig } from '../types';
import type { AiService } from '../aiRouter';
import { normalizeProviderConfig } from '../aiRouter';
import { GeminiService } from '../../gemini';
import { normalizePlaceholderValues, applyPlaceholderValues } from '../promptBuilder';

import { logger } from '../../../lib/logger';

const log = logger.child({ module: 'ai/providers/gemini' });
const DEBUG_LOGGING = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) log.debug(args.map(String).join(' '));
};

export async function runGemini(
  service: AiService,
  context: AiContext,
  aiConfig: Record<string, unknown>,
): Promise<AiResult> {
  const globalGeminiConfig = service.getResolvedIntegrationConfig('google_gemini', context);
  const globalWorkspaceConfig = service.getResolvedIntegrationConfig('google_workspace', context);
  const globalConfig = normalizeProviderConfig(globalGeminiConfig ?? globalWorkspaceConfig ?? null);

  const integrations = (context.settings?.integrations ?? {}) as Record<string, unknown>;
  const projectConfigRaw =
    integrations.google_gemini ?? integrations.gemini ?? integrations.google_workspace ?? null;
  const projectConfig = normalizeProviderConfig(projectConfigRaw);

  const geminiConfig: NormalizedProviderConfig = {
    api_key: projectConfig.api_key ?? globalConfig.api_key,
    organization: undefined,
    base_url: projectConfig.base_url ?? globalConfig.base_url,
    input_fields:
      (projectConfig.input_fields && projectConfig.input_fields.length > 0
        ? projectConfig.input_fields
        : globalConfig.input_fields) ?? [],
    model: projectConfig.model ?? globalConfig.model,
  };

  debugLog('[AI Service] Gemini normalized config:', geminiConfig);

  const apiKey = typeof geminiConfig.api_key === 'string' ? geminiConfig.api_key.trim() : '';
  if (!apiKey) {
    debugLog('[AI Service] Google API key not configured, using stub response');
    return context.schemaRef === 'TEXT_RESPONSE' || context.schemaRef === 'text_response'
      ? service.generateStubTextResponse(context, context.node.content || '')
      : service.generateStubPlan(context);
  }

  try {
    const rawAiModel =
      typeof aiConfig.model === 'string' && aiConfig.model.trim().length > 0
        ? aiConfig.model.trim()
        : '';
    const selectedModel =
      rawAiModel && rawAiModel !== 'default-model'
        ? rawAiModel
        : geminiConfig.model && geminiConfig.model !== 'default-model'
          ? geminiConfig.model
          : 'gemini-2.5-flash';

    debugLog(`[AI Service] Using Gemini model: ${selectedModel}`);

    const normalizedBaseUrl =
      typeof geminiConfig.base_url === 'string' && geminiConfig.base_url.trim().length > 0
        ? geminiConfig.base_url.trim().replace(/\/+$/, '')
        : undefined;

    const geminiService = new GeminiService(apiKey, selectedModel, normalizedBaseUrl);

    const defaultSystemPrompt =
      typeof aiConfig.system_prompt === 'string' && aiConfig.system_prompt.trim().length > 0
        ? aiConfig.system_prompt.trim()
        : 'Ты полезный ИИ-ассистент, который умеет работать с файлами и изображениями.';
    const geminiPlaceholderValues = normalizePlaceholderValues(
      (aiConfig as Record<string, unknown>).placeholder_values,
    );
    const geminiPlaceholderResult = applyPlaceholderValues(defaultSystemPrompt, geminiPlaceholderValues, context);
    const geminiSystemPrompt = geminiPlaceholderResult.prompt;
    const placeholderLogs = geminiPlaceholderResult.logs;

    const result = await geminiService.generateContent(context, {
      systemPrompt: geminiSystemPrompt,
      schemaRef: context.schemaRef,
    });

    const requestPayload = {
      provider: 'gemini',
      model: selectedModel,
      timestamp: new Date().toISOString(),
      request: {
        systemPrompt: geminiSystemPrompt,
        schemaRef: context.schemaRef,
        note: 'Full request details are constructed internally by GeminiService',
      },
    };

    const schemaKey =
      typeof context.schemaRef === 'string' && context.schemaRef.trim().length > 0
        ? context.schemaRef
        : 'TEXT_RESPONSE';
    const validator = service['ajv'].getSchema(schemaKey) ?? service['ajv'].getSchema(schemaKey.toUpperCase());
    if (!validator) throw new Error(`Unknown schema: ${schemaKey}`);

    debugLog(`[AI Service] Validating Gemini response against ${schemaKey.toUpperCase()} schema`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.output);
    } catch (error) {
      throw new Error(`Gemini response is not valid JSON: ${(error as Error).message}`);
    }

    if (!validator(parsed)) {
      const details = service.formatAjvErrors(validator.errors);
      log.error(`[AI Service] Gemini response failed ${schemaKey} validation: ${details}`);
      throw new Error(`Gemini response failed schema validation: ${details}`);
    }

    const normalized = JSON.stringify(parsed, null, 2);
    const baseLogs = Array.isArray(result.logs) ? result.logs : [];
    const logs = [
      ...placeholderLogs,
      `Gemini model ${selectedModel} responded successfully`,
      normalizedBaseUrl ? `Gemini endpoint: ${normalizedBaseUrl}` : 'Gemini endpoint: default',
      ...baseLogs,
    ];

    return { output: normalized, contentType: 'application/json', logs, requestPayload };
  } catch (error) {
    log.error({ err: error }, 'Gemini service error');
    throw new Error(`Gemini generation failed: ${(error as Error)?.message || 'Unknown error'}`);
  }
}
