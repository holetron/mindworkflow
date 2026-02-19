/**
 * OpenAI provider implementation.
 * Handles chat completions via the OpenAI-compatible API.
 *
 * ADR-081 Phase 2 — extracted from AiService.
 */

import fetch from 'node-fetch';
import { StoredNode, db } from '../../../db';
import type { AiContext, AiResult, NormalizedProviderConfig, ProviderFieldConfig } from '../types';
import type { AiService } from '../aiRouter';
import { normalizeProviderConfig } from '../aiRouter';
import { resolveFieldValue, normalizePlaceholderValues, applyPlaceholderValues, composeUserPrompt } from '../promptBuilder';

import { logger } from '../../../lib/logger';

const log = logger.child({ module: 'ai/providers/openai' });
const DEBUG_LOGGING = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) log.debug(args.map(String).join(' '));
};

export async function runOpenAi(
  service: AiService,
  context: AiContext,
  aiConfig: Record<string, unknown>,
): Promise<AiResult> {
  const globalConfig = normalizeProviderConfig(service.getResolvedIntegrationConfig('openai_gpt', context));

  const integrations = (context.settings?.integrations ?? {}) as Record<string, unknown>;
  debugLog('[AI Service] runOpenAi - integrations keys:', Object.keys(integrations));
  const projectConfigRaw =
    integrations.openai ?? integrations.open_ai ?? integrations.openai_gpt ?? null;
  debugLog('[AI Service] runOpenAi - projectConfigRaw:', projectConfigRaw ? 'exists' : 'null');
  if (projectConfigRaw && typeof projectConfigRaw === 'object') {
    debugLog('[AI Service] runOpenAi - projectConfigRaw keys:', Object.keys(projectConfigRaw as Record<string, unknown>));
    debugLog('[AI Service] runOpenAi - projectConfigRaw.apiKey:', (projectConfigRaw as Record<string, unknown>).apiKey ? 'exists' : 'missing');
  }
  const projectConfig = normalizeProviderConfig(projectConfigRaw);
  debugLog('[AI Service] runOpenAi - projectConfig.api_key after normalize:', projectConfig.api_key ? 'exists' : 'missing');

  const openaiConfig: NormalizedProviderConfig = {
    api_key: projectConfig.api_key ?? globalConfig.api_key,
    organization: projectConfig.organization ?? globalConfig.organization,
    base_url: projectConfig.base_url ?? globalConfig.base_url,
    input_fields:
      (projectConfig.input_fields && projectConfig.input_fields.length > 0
        ? projectConfig.input_fields
        : globalConfig.input_fields) ?? [],
  };

  debugLog('[AI Service] runOpenAi - globalConfig.api_key:', globalConfig.api_key ? 'exists' : 'missing');
  debugLog('[AI Service] runOpenAi - projectConfig.api_key:', projectConfig.api_key ? 'exists' : 'missing');
  debugLog('[AI Service] runOpenAi - merged api_key:', openaiConfig.api_key ? 'exists' : 'missing');

  const apiKey = typeof openaiConfig.api_key === 'string' ? openaiConfig.api_key.trim() : '';
  if (!apiKey) {
    debugLog('[AI Service] OpenAI API key not configured, using stub response');
    return service.generateStubPlan(context);
  }

  const baseUrl =
    typeof openaiConfig.base_url === 'string' && openaiConfig.base_url.trim().length > 0
      ? openaiConfig.base_url.trim().replace(/\/$/, '')
      : 'https://api.openai.com/v1';
  const endpoint = `${baseUrl}/chat/completions`;

  const rawModel =
    typeof aiConfig.model === 'string' && aiConfig.model.trim().length > 0
      ? aiConfig.model.trim()
      : '';
  const model =
    rawModel && rawModel !== 'default-model' ? rawModel : 'gpt-4o-mini';

  const supportsStructuredOutputs = model.includes('gpt-4o') || model.includes('gpt-4-turbo');
  debugLog(`[AI Service] Using model: ${model}, supports structured outputs: ${supportsStructuredOutputs}`);

  const allNodesInProject = context.projectId
    ? (db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(context.projectId) as StoredNode[])
    : [];
  const edges = (context.edges || []).map((e) => ({ from: e.from, to: e.to, targetHandle: e.targetHandle }));

  const systemPrompt = String(await resolveFieldValue('system_prompt', aiConfig, allNodesInProject, edges, context.node.node_id));
  const outputExample = String(await resolveFieldValue('output_example', aiConfig, allNodesInProject, edges, context.node.node_id));
  const temperature = Number(await resolveFieldValue('temperature', aiConfig, allNodesInProject, edges, context.node.node_id));
  debugLog(`[AI Service] Resolved fields - system_prompt: ${systemPrompt.substring(0, 50)}..., temperature: ${temperature}`);

  const schema = service['ajv'].getSchema(context.schemaRef)?.schema ?? service['ajv'].getSchema(context.schemaRef.toUpperCase())?.schema;
  const isTextResponse = context.schemaRef === 'TEXT_RESPONSE' || context.schemaRef === 'text_response';
  const responseFormat =
    !isTextResponse && schema && typeof schema === 'object' && supportsStructuredOutputs
      ? { type: 'json_schema', json_schema: { name: `node_${context.node.node_id}`, schema } }
      : undefined;

  const defaultPlanPrompt = 'You are an assistant that always returns results as JSON with one or more nodes. Each node must have type, title, and content. For simple tasks create one node with type="text", for complex ones create a plan with multiple nodes.';
  const defaultTextPrompt = 'You are a thorough assistant. Respond in plain text or Markdown, without JSON or service prefixes. Provide a concise, accurate, and helpful answer.';

  let finalSystemPrompt = systemPrompt;
  if (!finalSystemPrompt || finalSystemPrompt.trim().length === 0) {
    finalSystemPrompt = isTextResponse ? defaultTextPrompt : defaultPlanPrompt;
  }

  if (!isTextResponse && outputExample) {
    finalSystemPrompt += `\n\nExample of the expected response format:\n${outputExample}`;
  }

  if (!isTextResponse && !supportsStructuredOutputs && schema) {
    finalSystemPrompt += '\n\nCRITICAL: You MUST respond ONLY with valid JSON. No text before or after the JSON. Only a clean JSON object conforming to the schema.';
    finalSystemPrompt += `\n\nRequired JSON schema (follow strictly!):\n${JSON.stringify(schema, null, 2)}`;
    finalSystemPrompt += '\n\nExample of a correct response:\n{"nodes": [{"type": "text", "title": "Title", "content": "Response text"}]}';
  }

  const placeholderValues = normalizePlaceholderValues((aiConfig as Record<string, unknown>).placeholder_values);
  const placeholderResult = applyPlaceholderValues(finalSystemPrompt, placeholderValues, context);
  finalSystemPrompt = placeholderResult.prompt;
  const placeholderLogs = placeholderResult.logs;

  const providerFieldsConfig = Array.isArray(openaiConfig.input_fields)
    ? (openaiConfig.input_fields as ProviderFieldConfig[])
    : [];
  const storedProviderFields = service.parseProviderFields(
    ((context.node.config.ai ?? {}) as Record<string, unknown>).provider_fields,
  );
  const resolvedFields = service.resolveProviderFields(providerFieldsConfig, storedProviderFields, context.previousNodes);

  const userPrompt = await composeUserPrompt(aiConfig, context, isTextResponse ? null : schema, resolvedFields, allNodesInProject, edges, []);

  const requestBody: Record<string, unknown> = {
    model,
    temperature,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (responseFormat) requestBody.response_format = responseFormat;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (typeof openaiConfig.organization === 'string' && openaiConfig.organization.trim().length > 0) {
    headers['OpenAI-Organization'] = openaiConfig.organization.trim();
  }

  const requestPayload = {
    provider: 'openai',
    model,
    timestamp: new Date().toISOString(),
    request: requestBody,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} ${errorText}`.trim());
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const rawContent = payload?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('OpenAI returned an empty response.');
  }

  // TEXT_RESPONSE — return raw text
  if (context.schemaRef === 'TEXT_RESPONSE' || context.schemaRef === 'text_response') {
    debugLog(`[AI Service] TEXT_RESPONSE schema - returning raw text without JSON processing`);
    let finalContent = rawContent.trim();
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === 'object') {
        const textContent = parsed.response || parsed.content || parsed.text || parsed.message;
        if (typeof textContent === 'string' && textContent.trim()) {
          finalContent = textContent.trim();
          debugLog(`[AI Service] Extracted text content from JSON response`);
        }
      }
    } catch {
      debugLog(`[AI Service] Using raw content as plain text`);
    }

    const userMessages = (requestBody.messages as Array<{ role: string; content: string }>).filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    const logs = [
      ...placeholderLogs,
      `OpenAI model ${model} responded successfully`,
      `Prompt tokens: ${payload.usage?.prompt_tokens ?? 'n/a'}, completion tokens: ${payload.usage?.completion_tokens ?? 'n/a'}`,
      'Plain text response (no JSON validation)',
      '',
      '=== REQUEST ===',
      `Model: ${model}`,
      `Temperature: ${requestBody.temperature}`,
      `Max tokens: ${requestBody.max_tokens}`,
      `Messages: ${(requestBody.messages as unknown[]).length} messages`,
      `User message: ${lastUserMessage?.content || 'none'}`,
      '',
      '=== RESPONSE ===',
      finalContent.substring(0, 500) + (finalContent.length > 500 ? '...' : ''),
    ];
    return { output: finalContent, contentType: 'text/plain', logs, requestPayload };
  }

  // JSON response — parse and validate
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`OpenAI response is not valid JSON: ${(error as Error).message}`);
  }

  const validator = service['ajv'].getSchema(context.schemaRef) ?? service['ajv'].getSchema(context.schemaRef.toUpperCase());
  if (!validator) throw new Error(`Unknown schema: ${context.schemaRef}`);
  if (!validator(parsed)) {
    const message = service.formatAjvErrors(validator.errors);
    throw new Error(`OpenAI response failed schema validation: ${message}`);
  }

  const normalized = JSON.stringify(parsed, null, 2);
  const logs = [
    ...placeholderLogs,
    `OpenAI model ${model} responded successfully`,
    `Prompt tokens: ${payload.usage?.prompt_tokens ?? 'n/a'}, completion tokens: ${payload.usage?.completion_tokens ?? 'n/a'}`,
    resolvedFields.length > 0
      ? `Provider fields used: ${resolvedFields.map((f) => f.key).join(', ')}`
      : 'Provider fields not supplied',
    '',
    '=== REQUEST ===',
    `Model: ${model}`,
    `Schema: ${context.schemaRef}`,
    `Temperature: ${requestBody.temperature}`,
    `Messages: ${(requestBody.messages as unknown[]).length} messages`,
    '',
    '=== RESPONSE ===',
    normalized.substring(0, 500) + (normalized.length > 500 ? '...' : ''),
  ];

  return { output: normalized, contentType: 'application/json', logs, requestPayload };
}
