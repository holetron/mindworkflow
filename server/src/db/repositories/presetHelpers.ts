// presetHelpers.ts — Internal normalization/sanitization helpers for prompt presets
import * as crypto from 'crypto';
import { createHttpError } from '../connection';
import type {
  PromptPresetCategory,
  PromptPreset,
  PromptPresetCreateInput,
  PromptPresetUpdateInput,
} from '../types';

// ---- Internal types ----------------------------------------------------------

export interface PromptPresetRow {
  preset_id: string;
  category: string;
  label: string;
  description: string | null;
  content: string;
  tags_json: string | null;
  is_quick_access: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PromptPresetQueryOptions {
  category?: PromptPresetCategory;
  search?: string;
  quickOnly?: boolean;
}

export interface NormalizedPromptPresetWrite {
  presetId: string;
  category: PromptPresetCategory;
  label: string;
  content: string;
  description: string | null;
  tags: string[];
  isQuick: boolean;
  sortOrder: number;
}

// ---- Tag helpers -------------------------------------------------------------

function parsePromptTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()))
      .filter((v) => v.length > 0);
  } catch { return []; }
}

function normalizePromptTags(tags?: string[]): string[] {
  if (!tags) return [];
  return tags
    .map((v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()))
    .filter((v) => v.length > 0);
}

function coercePromptTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (item === null || item === undefined) return '';
      return String(item);
    });
  }
  if (typeof value === 'string') {
    return value.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  }
  return [];
}

function normalizePromptTagsInput(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  return normalizePromptTags(coercePromptTags(value));
}

// ---- Field normalizers -------------------------------------------------------

function normalizePromptSortOrder(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function normalizePromptCategory(value: string | undefined, fallback?: PromptPresetCategory): PromptPresetCategory {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    if (fallback !== undefined) return fallback;
    throw createHttpError(400, 'Category is required for prompt preset');
  }
  if (trimmed === 'system_prompt' || trimmed === 'output_example') return trimmed as PromptPresetCategory;
  throw createHttpError(400, `Unknown prompt preset category: ${trimmed}`);
}

function normalizePromptLabel(value: string | undefined, fallback?: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    if (fallback !== undefined) return fallback;
    throw createHttpError(400, 'Label is required for prompt preset');
  }
  return trimmed;
}

function normalizePromptContent(value: string | undefined, fallback?: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    if (fallback !== undefined) return fallback;
    throw createHttpError(400, 'Content is required for prompt preset');
  }
  return trimmed;
}

function normalizePromptDescription(value: string | null | undefined, fallback: string | null = null): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePromptQuickFlag(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (t === 'true' || t === '1') return true;
    if (t === 'false' || t === '0') return false;
  }
  return fallback;
}

// ---- Row mapper --------------------------------------------------------------

export function mapPromptPresetRow(row: PromptPresetRow): PromptPreset {
  return {
    preset_id: row.preset_id,
    category: row.category as PromptPresetCategory,
    label: row.label,
    description: row.description,
    content: row.content,
    tags: parsePromptTags(row.tags_json),
    is_quick_access: row.is_quick_access === 1,
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---- WHERE builder -----------------------------------------------------------

export function buildPromptPresetWhere(options: PromptPresetQueryOptions): { whereClause: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.category) { clauses.push('category = ?'); params.push(options.category); }
  if (options.quickOnly) { clauses.push('is_quick_access = 1'); }
  const trimmedSearch = options.search?.trim().toLowerCase();
  if (trimmedSearch) {
    const pattern = `%${trimmedSearch}%`;
    clauses.push(`(LOWER(label) LIKE ? OR LOWER(IFNULL(description, '')) LIKE ? OR LOWER(content) LIKE ? OR LOWER(IFNULL(tags_json, '')) LIKE ?)`);
    params.push(pattern, pattern, pattern, pattern);
  }
  return { whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// ---- Sanitizers --------------------------------------------------------------

export function sanitizePromptPresetForInsert(
  input: PromptPresetCreateInput & { preset_id?: string | null },
): NormalizedPromptPresetWrite {
  return {
    presetId: typeof input.preset_id === 'string' && input.preset_id.trim().length > 0
      ? input.preset_id.trim() : crypto.randomUUID(),
    category: normalizePromptCategory(input.category),
    label: normalizePromptLabel(input.label),
    content: normalizePromptContent(input.content),
    description: normalizePromptDescription(input.description),
    tags: normalizePromptTagsInput(input.tags, []),
    isQuick: normalizePromptQuickFlag(input.is_quick_access, false),
    sortOrder: normalizePromptSortOrder(input.sort_order, 0),
  };
}

export function sanitizePromptPresetForUpdate(
  current: PromptPreset, updates: PromptPresetUpdateInput,
): NormalizedPromptPresetWrite {
  return {
    presetId: current.preset_id,
    category: updates.category !== undefined ? normalizePromptCategory(updates.category) : current.category,
    label: updates.label !== undefined ? normalizePromptLabel(updates.label) : current.label,
    content: updates.content !== undefined ? normalizePromptContent(updates.content) : current.content,
    description: updates.description !== undefined ? normalizePromptDescription(updates.description) : current.description,
    tags: updates.tags !== undefined ? normalizePromptTagsInput(updates.tags, current.tags) : current.tags,
    isQuick: normalizePromptQuickFlag(updates.is_quick_access, current.is_quick_access),
    sortOrder: normalizePromptSortOrder(updates.sort_order, current.sort_order),
  };
}
