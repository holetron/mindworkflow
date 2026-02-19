/**
 * Prompt construction logic for AI calls.
 * Handles placeholder resolution, field mapping, and user prompt composition.
 *
 * ADR-081 Phase 2 — extracted from AiService.
 */

import type { StoredNode } from '../../db';
import { getNode } from '../../db';
import type { AiContext } from './types';
import { logger } from '../../lib/logger';

const log = logger.child({ module: 'ai/promptBuilder' });
import {
  buildContextSummary,
  summarizeNextNodes,
  resolveFileDeliveryFormat,
} from './contextBuilder';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLACEHOLDER_TOKEN_REGEX = /<([^<>]+)>(?:\s*=\s*"([^"]+)")?/g;

const DEBUG_LOGGING = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) log.debug(args.map(String).join(' '));
};

// ---------------------------------------------------------------------------
// Placeholder helpers
// ---------------------------------------------------------------------------

export function normalizePlaceholderValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') result[key] = raw;
  }
  return result;
}

export function applyPlaceholderValues(
  template: string,
  values: Record<string, string>,
  context: AiContext,
): { prompt: string; logs: string[] } {
  if (!template || !template.includes('<')) return { prompt: template, logs: [] };

  const logs: string[] = [];
  let prompt = template;
  PLACEHOLDER_TOKEN_REGEX.lastIndex = 0;

  const replacements: Array<{ token: string; value: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = PLACEHOLDER_TOKEN_REGEX.exec(template)) !== null) {
    const rawName = match[1]?.trim();
    if (!rawName) continue;

    const templateReference = match[2]?.trim();
    const userValueRaw = values[rawName];
    let replacement: string | null = null;

    if (typeof userValueRaw === 'string' && userValueRaw.trim().length > 0) {
      const manual = userValueRaw.trim();
      const resolved = resolvePlaceholderReference(manual, context);
      if (resolved !== undefined) {
        replacement = resolved;
        logs.push(`Placeholder <${rawName}> resolved from input "${manual}"`);
      } else {
        replacement = manual;
        logs.push(`Placeholder <${rawName}> using literal input "${manual}"`);
      }
    } else if (typeof templateReference === 'string' && templateReference.trim().length > 0) {
      const resolved = resolvePlaceholderReference(templateReference, context);
      if (resolved !== undefined) {
        replacement = resolved;
        logs.push(`Placeholder <${rawName}> resolved from template reference "${templateReference}"`);
      } else {
        logs.push(`Placeholder <${rawName}> reference "${templateReference}" could not be resolved`);
      }
    } else {
      logs.push(`Placeholder <${rawName}> has no value`);
    }

    if (replacement !== null) {
      replacements.push({ token: match[0], value: replacement });
    }
  }

  for (const { token, value } of replacements) {
    prompt = prompt.split(token).join(value);
  }

  return { prompt, logs };
}

// ---------------------------------------------------------------------------
// Placeholder reference resolution
// ---------------------------------------------------------------------------

function resolvePlaceholderReference(reference: string, context: AiContext): string | undefined {
  const cleaned = reference.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return undefined;

  const dotParts = cleaned.split('.');
  const underscoreParts = cleaned.split('_');

  let nodeId = cleaned;
  let pathParts: string[] = [];

  if (dotParts.length > 1) {
    nodeId = dotParts[0];
    pathParts = dotParts.slice(1);
  } else if (underscoreParts.length > 1) {
    nodeId = underscoreParts[0];
    pathParts = underscoreParts.slice(1);
  }

  let targetNode: StoredNode | undefined;
  if (nodeId === 'self' || nodeId === 'current') {
    targetNode = context.node;
  } else {
    targetNode =
      context.previousNodes.find((node) => node.node_id === nodeId) ??
      (context.projectId ? getNode(context.projectId, nodeId) : undefined);
  }
  if (!targetNode) return undefined;

  const firstSegmentRaw = pathParts[0] ?? 'content';
  const normalizedFirst = normalizeFieldName(firstSegmentRaw);
  const remaining = pathParts.slice(1);

  let value: unknown;
  if (normalizedFirst.startsWith('meta.')) {
    const metaPath = normalizedFirst.split('.').slice(1);
    value = getNestedValue(targetNode.meta, [...metaPath, ...remaining]);
  } else {
    switch (normalizedFirst) {
      case 'content':
        value = targetNode.content;
        break;
      case 'title':
        value = targetNode.title;
        break;
      case 'description':
        value = targetNode.meta.description;
        break;
      case 'meta':
        value = getNestedValue(targetNode.meta, remaining);
        break;
      default: {
        const metaValue = getNestedValue(targetNode.meta, [normalizedFirst, ...remaining]);
        value = metaValue ?? (targetNode as unknown as Record<string, unknown>)[normalizedFirst];
        break;
      }
    }
  }

  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Field-name normalization helpers
// ---------------------------------------------------------------------------

export function normalizeFieldName(field: string): string {
  const normalized = field.toLowerCase();
  if (['text', 'content', 'body', 'value'].includes(normalized)) return 'content';
  if (['title', 'name', 'heading'].includes(normalized)) return 'title';
  if (['description', 'desc', 'summary'].includes(normalized)) return 'description';
  if (normalized === 'output' || normalized === 'result') return 'meta.output';
  return normalized;
}

export function getNestedValue(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current === undefined || current === null || typeof current !== 'object')
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

// ---------------------------------------------------------------------------
// composeUserPrompt — central user-prompt assembly
// ---------------------------------------------------------------------------

export async function composeUserPrompt(
  aiConfig: Record<string, unknown>,
  context: AiContext,
  schema: unknown,
  resolvedFields: Array<{ key: string; label: string; value: string }>,
  allNodes?: StoredNode[],
  edges?: Array<{ from: string; to: string; targetHandle?: string }>,
  excludeNodesFromContext?: string[],
): Promise<string> {
  // Resolve user_prompt_template via field mapping
  let userPromptTemplate = '';
  if (allNodes && edges) {
    userPromptTemplate = String(
      await resolveFieldValue('user_prompt_template', aiConfig, allNodes, edges, context.node.node_id),
    );
  }

  const nodeContent = typeof context.node.content === 'string' ? context.node.content.trim() : '';
  const isTextResponse =
    context.schemaRef === 'TEXT_RESPONSE' || context.schemaRef === 'text_response';
  const fallbackTemplate = isTextResponse
    ? 'Answer the user request in plain language. Provide a concise, helpful response without JSON.'
    : 'Generate a structured JSON response that satisfies the JSON schema and reflects the provided context.';

  const template =
    nodeContent.length > 0
      ? nodeContent
      : userPromptTemplate.length > 0
        ? userPromptTemplate
        : fallbackTemplate;

  const fileDeliveryFormat = resolveFileDeliveryFormat(aiConfig);
  const sections: string[] = [];
  const primaryPrompt = template.trim();
  if (primaryPrompt.length > 0) sections.push(primaryPrompt);

  // Map context modes
  const rawContextMode = context.contextMode || 'simple';
  let contextMode: 'simple' | 'full_json' | 'raw' = 'simple';
  if (rawContextMode === 'clean') contextMode = 'raw';
  else if (rawContextMode === 'full_json') contextMode = 'full_json';
  else if (rawContextMode === 'simple_json') contextMode = 'simple';
  else contextMode = 'simple';

  log.info('[COMPOSE_PROMPT] excludeNodesFromContext %s', excludeNodesFromContext);
  log.info('[COMPOSE_PROMPT] context.previousNodes IDs %s', context.previousNodes.map((n) => n.node_id));

  // Check for explicit context port connection
  let hasContextPortConnection = false;
  const specialPorts = new Set(['image_input', 'video_input', 'audio_input', 'file_input', 'text_input']);
  const nodesConnectedToSpecialPorts = new Set<string>();

  if (allNodes && edges) {
    for (const edge of edges) {
      if (edge.to === context.node.node_id && edge.targetHandle) {
        if (edge.targetHandle === 'context') {
          hasContextPortConnection = true;
          log.info(`[COMPOSE_PROMPT] Node ${edge.from} connected to 'context' port - will include in context`);
        } else if (specialPorts.has(edge.targetHandle)) {
          nodesConnectedToSpecialPorts.add(edge.from);
          log.info(`[COMPOSE_PROMPT] Node ${edge.from} connected to special port ${edge.targetHandle} - excluded from context`);
        }
      }
    }
  }

  if (hasContextPortConnection) {
    const nodesToIncludeInContext =
      excludeNodesFromContext && excludeNodesFromContext.length > 0
        ? context.previousNodes.filter(
            (n) =>
              !excludeNodesFromContext.includes(n.node_id) &&
              !nodesConnectedToSpecialPorts.has(n.node_id),
          )
        : context.previousNodes.filter(
            (n) => !nodesConnectedToSpecialPorts.has(n.node_id),
          );

    log.info('[COMPOSE_PROMPT] nodesToIncludeInContext IDs %s', nodesToIncludeInContext.map((n) => n.node_id));
    log.info('[COMPOSE_PROMPT] contextMode %s', contextMode);

    const upstreamSummary = await buildContextSummary(nodesToIncludeInContext, contextMode, fileDeliveryFormat);
    log.info('[COMPOSE_PROMPT] upstreamSummary length %s', upstreamSummary.length);
    log.info('[COMPOSE_PROMPT] upstreamSummary %s', upstreamSummary);

    if (upstreamSummary) {
      const contextLabel = 'Context:';
      const contextBody = contextMode === 'raw' ? upstreamSummary : `\n${upstreamSummary}`;
      sections.push(`${contextLabel}${contextBody}`);
    }
  } else {
    log.info('[COMPOSE_PROMPT] No "context" port connection - skipping context');
  }

  if (context.files && context.files.length > 0) {
    log.info('[COMPOSE_PROMPT] context.files exists, but they are not added to prompt text');
    log.info('[COMPOSE_PROMPT] Files are handled via auto-ports (image_input, video_input, etc)');
  }

  const nextSummary = summarizeNextNodes(context.nextNodes);
  if (nextSummary) sections.push(`# Downstream Targets\n${nextSummary}`);

  if (!isTextResponse && schema && typeof schema === 'object') {
    sections.push(`# JSON Schema\n${JSON.stringify(schema, null, 2)}`);
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// resolveFieldValue — resolve field from source node (field mapping)
// ---------------------------------------------------------------------------

export async function resolveFieldValue(
  fieldName: 'system_prompt' | 'output_example' | 'temperature' | 'user_prompt_template',
  aiConfig: Record<string, unknown>,
  allNodes: StoredNode[],
  edges: Array<{ from: string; to: string; targetHandle?: string }>,
  currentNodeId: string,
): Promise<string | number> {
  const fieldMapping = aiConfig.field_mapping as Record<string, unknown> | undefined;
  let source: 'manual' | 'port' = 'manual';

  if (fieldMapping && typeof fieldMapping === 'object') {
    const mappingKey = `${fieldName}_source`;
    const sourceValue = fieldMapping[mappingKey];
    if (sourceValue === 'port' || sourceValue === 'manual') source = sourceValue;
  }

  if (source === 'manual') {
    const sourceKey = `${fieldName}_source`;
    const oldSourceValue = aiConfig[sourceKey];
    if (oldSourceValue === 'port') source = 'port';
  }

  if (source === 'manual') {
    const fallbackValue = aiConfig[fieldName];
    if (fieldName === 'temperature')
      return typeof fallbackValue === 'number' ? fallbackValue : 0.7;
    return typeof fallbackValue === 'string' ? fallbackValue : '';
  }

  // source === 'port'
  const connectedEdge = edges.find(
    (e) => e.to === currentNodeId && e.targetHandle === fieldName,
  );
  if (!connectedEdge) {
    debugLog(`[AI Service] Port "${fieldName}" not connected, using fallback`);
    const fallbackValue = aiConfig[fieldName];
    if (fieldName === 'temperature')
      return typeof fallbackValue === 'number' ? fallbackValue : 0.7;
    return typeof fallbackValue === 'string' ? fallbackValue : '';
  }

  const sourceNode = allNodes.find((n) => n.node_id === connectedEdge.from);
  if (!sourceNode) {
    debugLog(`[AI Service] Source node ${connectedEdge.from} not found, using fallback`);
    const fallbackValue = aiConfig[fieldName];
    if (fieldName === 'temperature')
      return typeof fallbackValue === 'number' ? fallbackValue : 0.7;
    return typeof fallbackValue === 'string' ? fallbackValue : '';
  }

  if (fieldName === 'temperature') {
    const content = typeof sourceNode.content === 'string' ? sourceNode.content.trim() : '';
    const value = parseFloat(content);
    if (isNaN(value)) {
      debugLog(`[AI Service] Invalid temperature value in node ${sourceNode.title}: ${content}`);
      return 0.7;
    }
    const clamped = Math.max(0, Math.min(2, value));
    debugLog(`[AI Service] Resolved temperature from node "${sourceNode.title}": ${clamped}`);
    return clamped;
  } else {
    const content = typeof sourceNode.content === 'string' ? sourceNode.content.trim() : '';
    debugLog(`[AI Service] Resolved ${fieldName} from node "${sourceNode.title}" (${content.length} chars)`);
    return content;
  }
}
