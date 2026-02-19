/**
 * AI module facade — re-exports for backward compatibility.
 * All consumers that `import { AiService, AiContext, AiResult } from './ai'`
 * will continue to work via this barrel file.
 *
 * ADR-081 Phase 2
 */

export { AiService, normalizeProviderConfig, ensureJson, safeJsonParse, toStringArray } from './aiRouter';
export type { AiContext, AiResult, NormalizedProviderConfig, ProviderFieldConfig, ProviderFieldValuePersisted, ResolvedProviderField } from './types';
export { resolveFieldValue, normalizePlaceholderValues, applyPlaceholderValues, composeUserPrompt, normalizeFieldName, getNestedValue } from './promptBuilder';
export { buildContextSummary, buildFilesSummary, summarizeNextNodes, resolveAssetUrl, resolveFileDeliveryFormat, prepareAssetForDelivery } from './contextBuilder';
