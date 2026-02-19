import { z } from 'zod';
import { PromptPresetCategory } from '../db';

export const adminIntegrationFieldSchema = z.object({
  id: z.string().optional(), label: z.string(), key: z.string(),
  type: z.enum(['text', 'textarea']).optional(), placeholder: z.string().optional(),
  description: z.string().optional(), required: z.boolean().optional(), defaultValue: z.string().optional(),
});

export const adminIntegrationExampleRequestSchema = z.object({
  method: z.string(), url: z.string(),
  headers: z.record(z.string(), z.string()).optional(), body: z.string().optional(),
}).nullable().optional();

export const adminIntegrationExampleResponseSchema = z.object({
  incoming: z.record(z.string(), z.string()).optional(),
  outgoing: z.record(z.string(), z.string()).optional(),
}).nullable().optional();

export const adminIntegrationCreateSchema = z.object({
  id: z.string().uuid().optional(), userId: z.string().uuid(),
  providerId: z.string().min(1), name: z.string().min(1),
  description: z.string().optional(), apiKey: z.string().optional(),
  baseUrl: z.string().optional(), organization: z.string().optional(),
  webhookContract: z.string().optional(), systemPrompt: z.string().optional(),
  inputFields: z.array(adminIntegrationFieldSchema).optional(),
  exampleRequest: adminIntegrationExampleRequestSchema,
  exampleResponseMapping: adminIntegrationExampleResponseSchema,
  models: z.array(z.string().min(1)).optional(),
  modelsUpdatedAt: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

export const adminIntegrationUpdateSchema = adminIntegrationCreateSchema.partial().extend({
  userId: z.string().uuid().optional(),
});

const PROMPT_PRESET_CATEGORIES: PromptPresetCategory[] = ['system_prompt', 'output_example'];

const FEEDBACK_STATUS_VALUES = ['new', 'in_progress', 'resolved', 'archived'] as const;
const feedbackStatusSchema = z.enum(FEEDBACK_STATUS_VALUES);

export const feedbackUpdateSchema = z.object({
  title: z.string().max(240).optional(), description: z.string().max(8000).optional(),
  status: feedbackStatusSchema.optional(), contact: z.union([z.string().max(320), z.null()]).optional(),
  resolution: z.union([z.string().max(8000), z.null()]).optional(),
}).strict();

export const feedbackTypeMap: Record<string, 'problem' | 'suggestion' | 'unknown'> = {
  'bug': 'problem', 'feature_request': 'suggestion', 'performance': 'problem',
  'ui_ux': 'suggestion', 'other': 'unknown',
};

export function isPromptPresetCategory(value: unknown): value is PromptPresetCategory {
  return PROMPT_PRESET_CATEGORIES.includes(value as PromptPresetCategory);
}

export function parseBooleanFlag(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    if (n === 'true' || n === '1') return true;
    if (n === 'false' || n === '0') return false;
  }
  return undefined;
}

export function parseSortOrder(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.trunc(numeric);
}

export function parseTagsPayload(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((i) => (typeof i === 'string' ? i : String(i ?? '')).trim()).filter((i) => i.length > 0);
  if (typeof value === 'string') return value.split(',').map((i) => i.trim()).filter((i) => i.length > 0);
  return [];
}
