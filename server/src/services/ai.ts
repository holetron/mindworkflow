/**
 * Thin facade — re-exports everything from the split ai/ module.
 * Preserves backward compatibility for existing import paths.
 *
 * ADR-081 Phase 2: The real implementation now lives in server/src/services/ai/
 */

export {
  AiService,
  normalizeProviderConfig,
  ensureJson,
  safeJsonParse,
  toStringArray,
} from './ai/aiRouter';

export type {
  AiContext,
  AiResult,
  NormalizedProviderConfig,
  ProviderFieldConfig,
  ProviderFieldValuePersisted,
  ResolvedProviderField,
} from './ai/types';

export {
  resolveFieldValue,
  normalizePlaceholderValues,
  applyPlaceholderValues,
  composeUserPrompt,
  normalizeFieldName,
  getNestedValue,
} from './ai/promptBuilder';

export {
  buildContextSummary,
  buildFilesSummary,
  summarizeNextNodes,
  resolveAssetUrl,
  resolveFileDeliveryFormat,
  prepareAssetForDelivery,
} from './ai/contextBuilder';
