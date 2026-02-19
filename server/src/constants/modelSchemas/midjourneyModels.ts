/**
 * Re-export facade — merges V7 and legacy Midjourney models into
 * the MIDJOURNEY_MODELS record for backward compatibility.
 */

import { ModelInfo } from '../../types/models';
import { MIDJOURNEY_V7_MODELS } from './midjourneyV7Models';
import { MIDJOURNEY_LEGACY_MODELS } from './midjourneyLegacyModels';

export const MIDJOURNEY_MODELS: Record<string, ModelInfo> = {
  ...MIDJOURNEY_V7_MODELS,
  ...MIDJOURNEY_LEGACY_MODELS,
};

export { MIDJOURNEY_V7_MODELS } from './midjourneyV7Models';
export { MIDJOURNEY_LEGACY_MODELS } from './midjourneyLegacyModels';
