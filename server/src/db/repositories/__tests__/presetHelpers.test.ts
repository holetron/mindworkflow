/**
 * Tests for presetHelpers.ts — pure sanitization/normalization functions.
 * These functions don't use the database directly (except createHttpError).
 */
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Mock the connection module to avoid DB initialization
vi.mock('../../connection', () => ({
  createHttpError: (status: number, message: string) => {
    const error = new Error(message);
    (error as { status?: number }).status = status;
    return error;
  },
}));

import {
  mapPromptPresetRow,
  buildPromptPresetWhere,
  sanitizePromptPresetForInsert,
  sanitizePromptPresetForUpdate,
  type PromptPresetRow,
} from '../presetHelpers';

describe('mapPromptPresetRow', () => {
  it('should map a complete row to a PromptPreset', () => {
    const row: PromptPresetRow = {
      preset_id: 'p1',
      category: 'system_prompt',
      label: 'Test Label',
      description: 'Some description',
      content: 'Hello world',
      tags_json: '["tag1","tag2"]',
      is_quick_access: 1,
      sort_order: 5,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    };

    const result = mapPromptPresetRow(row);
    expect(result.preset_id).toBe('p1');
    expect(result.category).toBe('system_prompt');
    expect(result.label).toBe('Test Label');
    expect(result.description).toBe('Some description');
    expect(result.content).toBe('Hello world');
    expect(result.tags).toEqual(['tag1', 'tag2']);
    expect(result.is_quick_access).toBe(true);
    expect(result.sort_order).toBe(5);
  });

  it('should handle null tags_json', () => {
    const row: PromptPresetRow = {
      preset_id: 'p1',
      category: 'output_example',
      label: 'Label',
      description: null,
      content: 'Content',
      tags_json: null,
      is_quick_access: 0,
      sort_order: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    };

    const result = mapPromptPresetRow(row);
    expect(result.tags).toEqual([]);
    expect(result.is_quick_access).toBe(false);
    expect(result.description).toBeNull();
  });

  it('should handle invalid tags JSON gracefully', () => {
    const row: PromptPresetRow = {
      preset_id: 'p1',
      category: 'system_prompt',
      label: 'Label',
      description: null,
      content: 'Content',
      tags_json: '{bad json}',
      is_quick_access: 0,
      sort_order: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    };

    const result = mapPromptPresetRow(row);
    expect(result.tags).toEqual([]);
  });

  it('should handle non-array tags JSON', () => {
    const row: PromptPresetRow = {
      preset_id: 'p1',
      category: 'system_prompt',
      label: 'Label',
      description: null,
      content: 'Content',
      tags_json: '"just a string"',
      is_quick_access: 0,
      sort_order: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    };

    const result = mapPromptPresetRow(row);
    expect(result.tags).toEqual([]);
  });
});

describe('buildPromptPresetWhere', () => {
  it('should return empty WHERE clause with no options', () => {
    const { whereClause, params } = buildPromptPresetWhere({});
    expect(whereClause).toBe('');
    expect(params).toEqual([]);
  });

  it('should filter by category', () => {
    const { whereClause, params } = buildPromptPresetWhere({ category: 'system_prompt' });
    expect(whereClause).toContain('category = ?');
    expect(params).toContain('system_prompt');
  });

  it('should filter by quickOnly', () => {
    const { whereClause } = buildPromptPresetWhere({ quickOnly: true });
    expect(whereClause).toContain('is_quick_access = 1');
  });

  it('should filter by search term', () => {
    const { whereClause, params } = buildPromptPresetWhere({ search: 'test' });
    expect(whereClause).toContain('LIKE');
    expect(params.some((p) => typeof p === 'string' && p.includes('test'))).toBe(true);
  });

  it('should combine multiple filters', () => {
    const { whereClause, params } = buildPromptPresetWhere({
      category: 'output_example',
      search: 'hello',
      quickOnly: true,
    });
    expect(whereClause).toContain('AND');
    expect(params.length).toBeGreaterThan(1);
  });

  it('should handle whitespace-only search term', () => {
    const { whereClause, params } = buildPromptPresetWhere({ search: '   ' });
    // Empty search should not add a LIKE clause
    expect(whereClause).toBe('');
    expect(params).toEqual([]);
  });
});

describe('sanitizePromptPresetForInsert', () => {
  it('should create a valid record with required fields', () => {
    const result = sanitizePromptPresetForInsert({
      category: 'system_prompt',
      label: 'My Preset',
      content: 'Some content here',
    });

    expect(result.presetId).toBeTruthy();
    expect(result.category).toBe('system_prompt');
    expect(result.label).toBe('My Preset');
    expect(result.content).toBe('Some content here');
    expect(result.description).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.isQuick).toBe(false);
    expect(result.sortOrder).toBe(0);
  });

  it('should use provided preset_id when available', () => {
    const result = sanitizePromptPresetForInsert({
      preset_id: 'my-custom-id',
      category: 'system_prompt',
      label: 'Label',
      content: 'Content',
    });

    expect(result.presetId).toBe('my-custom-id');
  });

  it('should generate a UUID when preset_id is empty', () => {
    const result = sanitizePromptPresetForInsert({
      preset_id: '   ',
      category: 'system_prompt',
      label: 'Label',
      content: 'Content',
    });

    expect(result.presetId).toBeTruthy();
    expect(result.presetId.trim()).not.toBe('');
  });

  it('should normalize tags from array', () => {
    const result = sanitizePromptPresetForInsert({
      category: 'system_prompt',
      label: 'Label',
      content: 'Content',
      tags: ['tag1', '  tag2  ', 'tag3'],
    });

    expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should throw for missing category', () => {
    expect(() =>
      sanitizePromptPresetForInsert({
        category: '' as 'system_prompt',
        label: 'Label',
        content: 'Content',
      }),
    ).toThrow();
  });

  it('should throw for invalid category', () => {
    expect(() =>
      sanitizePromptPresetForInsert({
        category: 'invalid_category' as 'system_prompt',
        label: 'Label',
        content: 'Content',
      }),
    ).toThrow();
  });

  it('should throw for missing label', () => {
    expect(() =>
      sanitizePromptPresetForInsert({
        category: 'system_prompt',
        label: '',
        content: 'Content',
      }),
    ).toThrow();
  });

  it('should throw for missing content', () => {
    expect(() =>
      sanitizePromptPresetForInsert({
        category: 'system_prompt',
        label: 'Label',
        content: '',
      }),
    ).toThrow();
  });

  it('should handle is_quick_access as boolean', () => {
    const result = sanitizePromptPresetForInsert({
      category: 'system_prompt',
      label: 'Label',
      content: 'Content',
      is_quick_access: true,
    });
    expect(result.isQuick).toBe(true);
  });

  it('should handle sort_order as number', () => {
    const result = sanitizePromptPresetForInsert({
      category: 'system_prompt',
      label: 'Label',
      content: 'Content',
      sort_order: 42,
    });
    expect(result.sortOrder).toBe(42);
  });
});

describe('sanitizePromptPresetForUpdate', () => {
  const currentPreset = {
    preset_id: 'p1',
    category: 'system_prompt' as const,
    label: 'Original Label',
    description: 'Original Description',
    content: 'Original Content',
    tags: ['original-tag'],
    is_quick_access: false,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  it('should keep current values when no updates provided', () => {
    const result = sanitizePromptPresetForUpdate(currentPreset, {});
    expect(result.label).toBe('Original Label');
    expect(result.content).toBe('Original Content');
    expect(result.category).toBe('system_prompt');
    expect(result.description).toBe('Original Description');
  });

  it('should update label when provided', () => {
    const result = sanitizePromptPresetForUpdate(currentPreset, { label: 'New Label' });
    expect(result.label).toBe('New Label');
  });

  it('should update content when provided', () => {
    const result = sanitizePromptPresetForUpdate(currentPreset, { content: 'New Content' });
    expect(result.content).toBe('New Content');
  });

  it('should update category when provided', () => {
    const result = sanitizePromptPresetForUpdate(currentPreset, { category: 'output_example' });
    expect(result.category).toBe('output_example');
  });

  it('should set description to null when null is provided', () => {
    const result = sanitizePromptPresetForUpdate(currentPreset, { description: null });
    expect(result.description).toBeNull();
  });

  it('should update is_quick_access when provided', () => {
    const result = sanitizePromptPresetForUpdate(currentPreset, { is_quick_access: true });
    expect(result.isQuick).toBe(true);
  });

  it('should update sort_order when provided', () => {
    const result = sanitizePromptPresetForUpdate(currentPreset, { sort_order: 10 });
    expect(result.sortOrder).toBe(10);
  });
});
