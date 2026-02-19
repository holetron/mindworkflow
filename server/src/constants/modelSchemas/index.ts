/**
 * Barrel export — merges all provider-specific model schemas into
 * the single MODEL_SCHEMAS record that the rest of the codebase expects.
 */

import { ModelInfo } from '../../types/models';
import { OPENAI_MODELS } from './openaiModels';
import { GEMINI_MODELS } from './geminiModels';
import { MIDJOURNEY_MODELS } from './midjourneyModels';
import { MIDJOURNEY_NIJI_MODELS } from './midjourneyNijiModels';
import { ANTHROPIC_MODELS } from './anthropicModels';

export const MODEL_SCHEMAS: Record<string, ModelInfo> = {
  ...OPENAI_MODELS,
  ...GEMINI_MODELS,
  ...MIDJOURNEY_MODELS,
  ...MIDJOURNEY_NIJI_MODELS,
  ...ANTHROPIC_MODELS,
};

// Re-export individual groups for consumers that only need a subset
export { OPENAI_MODELS } from './openaiModels';
export { GEMINI_MODELS } from './geminiModels';
export { MIDJOURNEY_MODELS, MIDJOURNEY_V7_MODELS, MIDJOURNEY_LEGACY_MODELS } from './midjourneyModels';
export { MIDJOURNEY_NIJI_MODELS } from './midjourneyNijiModels';
export { ANTHROPIC_MODELS } from './anthropicModels';
