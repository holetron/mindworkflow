/**
 * Re-export facade — preserves the original import path
 * `import { MODEL_SCHEMAS } from '../constants/modelSchemas'`
 *
 * The actual definitions have been split by provider into
 * constants/modelSchemas/ directory.
 */
export {
  MODEL_SCHEMAS,
  OPENAI_MODELS,
  GEMINI_MODELS,
  MIDJOURNEY_MODELS,
  MIDJOURNEY_V7_MODELS,
  MIDJOURNEY_LEGACY_MODELS,
  MIDJOURNEY_NIJI_MODELS,
  ANTHROPIC_MODELS,
} from './modelSchemas/index';
