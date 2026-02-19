// presetRepository.ts — Prompt preset CRUD operations
import { db, withTransaction, createHttpError } from '../connection';
import type {
  PromptPresetCategory,
  PromptPreset,
  PromptPresetCreateInput,
  PromptPresetUpdateInput,
  PromptPresetImportInput,
} from '../types';
import {
  type PromptPresetRow,
  type NormalizedPromptPresetWrite,
  mapPromptPresetRow,
  buildPromptPresetWhere,
  sanitizePromptPresetForInsert,
  sanitizePromptPresetForUpdate,
} from './presetHelpers';

// ---- Internal helper ---------------------------------------------------------

function insertPromptPresetRecord(
  record: NormalizedPromptPresetWrite,
  timestamps: { createdAt?: string; updatedAt?: string } = {},
): PromptPreset {
  const createdAt = timestamps.createdAt ?? new Date().toISOString();
  const updatedAt = timestamps.updatedAt ?? createdAt;

  db.prepare(
    `INSERT INTO prompt_presets (
      preset_id, category, label, description, content,
      tags_json, is_quick_access, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.presetId, record.category, record.label, record.description, record.content,
    record.tags.length > 0 ? JSON.stringify(record.tags) : null,
    record.isQuick ? 1 : 0, record.sortOrder, createdAt, updatedAt,
  );

  const created = getPromptPreset(record.presetId);
  if (!created) throw createHttpError(500, `Prompt preset ${record.presetId} was not created`);
  return created;
}

// ---- Public API --------------------------------------------------------------

export function getPromptPreset(presetId: string): PromptPreset | undefined {
  const row = db.prepare(
    `SELECT preset_id, category, label, description, content, tags_json, is_quick_access, sort_order, created_at, updated_at
     FROM prompt_presets WHERE preset_id = ?`,
  ).get(presetId) as PromptPresetRow | undefined;
  return row ? mapPromptPresetRow(row) : undefined;
}

export function listPromptPresetsForAdmin(
  options: { category?: PromptPresetCategory; search?: string } = {},
): PromptPreset[] {
  const { whereClause, params } = buildPromptPresetWhere(options);
  const rows = db.prepare(
    `SELECT preset_id, category, label, description, content, tags_json, is_quick_access, sort_order, created_at, updated_at
     FROM prompt_presets ${whereClause}
     ORDER BY category ASC, sort_order ASC, label COLLATE NOCASE ASC`,
  ).all(...params) as PromptPresetRow[];
  return rows.map(mapPromptPresetRow);
}

export function searchPromptPresets(
  options: { category?: PromptPresetCategory; search?: string; limit?: number } = {},
): PromptPreset[] {
  const limit = options.limit && Number.isFinite(options.limit)
    ? Math.min(100, Math.max(1, Math.trunc(options.limit))) : 25;
  const { whereClause, params } = buildPromptPresetWhere(options);
  const rows = db.prepare(
    `SELECT preset_id, category, label, description, content, tags_json, is_quick_access, sort_order, created_at, updated_at
     FROM prompt_presets ${whereClause}
     ORDER BY is_quick_access DESC, sort_order ASC, datetime(updated_at) DESC LIMIT ?`,
  ).all(...params, limit) as PromptPresetRow[];
  return rows.map(mapPromptPresetRow);
}

export function listQuickPromptPresets(category: PromptPresetCategory, limit = 8): PromptPreset[] {
  const { whereClause, params } = buildPromptPresetWhere({ category, quickOnly: true });
  const rows = db.prepare(
    `SELECT preset_id, category, label, description, content, tags_json, is_quick_access, sort_order, created_at, updated_at
     FROM prompt_presets ${whereClause}
     ORDER BY sort_order ASC, label COLLATE NOCASE ASC LIMIT ?`,
  ).all(...params, limit) as PromptPresetRow[];
  return rows.map(mapPromptPresetRow);
}

export function createPromptPreset(input: PromptPresetCreateInput): PromptPreset {
  return insertPromptPresetRecord(sanitizePromptPresetForInsert(input));
}

export function updatePromptPreset(presetId: string, updates: PromptPresetUpdateInput): PromptPreset {
  const current = getPromptPreset(presetId);
  if (!current) throw createHttpError(404, `Prompt preset ${presetId} not found`);

  const normalized = sanitizePromptPresetForUpdate(current, updates);
  db.prepare(
    `UPDATE prompt_presets
     SET category = ?, label = ?, description = ?, content = ?, tags_json = ?,
         is_quick_access = ?, sort_order = ?, updated_at = ?
     WHERE preset_id = ?`,
  ).run(
    normalized.category, normalized.label, normalized.description, normalized.content,
    normalized.tags.length > 0 ? JSON.stringify(normalized.tags) : null,
    normalized.isQuick ? 1 : 0, normalized.sortOrder, new Date().toISOString(), presetId,
  );

  const updated = getPromptPreset(presetId);
  if (!updated) throw createHttpError(500, `Prompt preset ${presetId} disappeared after update`);
  return updated;
}

export function deletePromptPreset(presetId: string): void {
  const result = db.prepare('DELETE FROM prompt_presets WHERE preset_id = ?').run(presetId);
  if (result.changes === 0) throw createHttpError(404, `Prompt preset ${presetId} not found`);
}

export function importPromptPresets(
  prompts: PromptPresetImportInput[], options: { replace?: boolean } = {},
): PromptPreset[] {
  if (!Array.isArray(prompts)) throw createHttpError(400, 'Invalid import payload');

  const replace = Boolean(options.replace);
  const normalizedEntries = prompts.map((entry) => sanitizePromptPresetForInsert(entry));

  return withTransaction(() => {
    if (replace) db.prepare('DELETE FROM prompt_presets').run();

    const results: PromptPreset[] = [];
    for (const entry of normalizedEntries) {
      const existing = getPromptPreset(entry.presetId);
      if (existing) {
        results.push(updatePromptPreset(entry.presetId, {
          category: entry.category, label: entry.label, content: entry.content,
          description: entry.description ?? undefined, tags: entry.tags,
          is_quick_access: entry.isQuick, sort_order: entry.sortOrder,
        }));
        continue;
      }
      results.push(insertPromptPresetRecord(entry));
    }
    return results;
  });
}
