import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

import {
  getPromptPreset, listPromptPresetsForAdmin, searchPromptPresets,
  listQuickPromptPresets, createPromptPreset, updatePromptPreset,
  deletePromptPreset, importPromptPresets,
} from '../presetRepository';

async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

describe('presetRepository', () => {
  beforeEach(async () => { await reset(); });

  describe('createPromptPreset', () => {
    it('should create a preset with required fields', () => {
      const result = createPromptPreset({ category: 'system_prompt', label: 'My SP', content: 'You are a helper.' });
      expect(result.preset_id).toBeTruthy();
      expect(result.category).toBe('system_prompt');
      expect(result.label).toBe('My SP');
      expect(result.content).toBe('You are a helper.');
      expect(result.tags).toEqual([]);
      expect(result.is_quick_access).toBe(false);
    });

    it('should create a preset with optional fields', () => {
      const result = createPromptPreset({
        category: 'output_example', label: 'JSON', content: '{"k":"v"}',
        description: 'A JSON example', tags: ['json', 'example'], is_quick_access: true, sort_order: 5,
      });
      expect(result.description).toBe('A JSON example');
      expect(result.tags).toEqual(['json', 'example']);
      expect(result.is_quick_access).toBe(true);
      expect(result.sort_order).toBe(5);
    });

    it('should throw for invalid category', () => {
      expect(() => createPromptPreset({ category: 'bad' as 'system_prompt', label: 'L', content: 'C' })).toThrow();
    });

    it('should throw for empty label', () => {
      expect(() => createPromptPreset({ category: 'system_prompt', label: '', content: 'C' })).toThrow();
    });

    it('should throw for empty content', () => {
      expect(() => createPromptPreset({ category: 'system_prompt', label: 'L', content: '' })).toThrow();
    });
  });

  describe('getPromptPreset', () => {
    it('should return a preset by ID', () => {
      const created = createPromptPreset({ category: 'system_prompt', label: 'Test', content: 'C' });
      const result = getPromptPreset(created.preset_id);
      expect(result).toBeTruthy();
      expect(result!.preset_id).toBe(created.preset_id);
    });

    it('should return undefined for non-existent ID', () => {
      expect(getPromptPreset('nonexistent')).toBeUndefined();
    });
  });

  describe('listPromptPresetsForAdmin', () => {
    it('should return empty array when no presets exist', () => {
      expect(listPromptPresetsForAdmin()).toEqual([]);
    });

    it('should return all presets', () => {
      createPromptPreset({ category: 'system_prompt', label: 'SP1', content: 'C1' });
      createPromptPreset({ category: 'output_example', label: 'OE1', content: 'C2' });
      expect(listPromptPresetsForAdmin()).toHaveLength(2);
    });

    it('should filter by category', () => {
      createPromptPreset({ category: 'system_prompt', label: 'SP1', content: 'C1' });
      createPromptPreset({ category: 'output_example', label: 'OE1', content: 'C2' });
      const result = listPromptPresetsForAdmin({ category: 'system_prompt' });
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('system_prompt');
    });

    it('should filter by search term', () => {
      createPromptPreset({ category: 'system_prompt', label: 'Alpha', content: 'CA' });
      createPromptPreset({ category: 'system_prompt', label: 'Beta', content: 'CB' });
      expect(listPromptPresetsForAdmin({ search: 'alpha' })).toHaveLength(1);
    });
  });

  describe('searchPromptPresets', () => {
    it('should return matching presets', () => {
      createPromptPreset({ category: 'system_prompt', label: 'Code Helper', content: 'Help code' });
      createPromptPreset({ category: 'system_prompt', label: 'Writing Helper', content: 'Help write' });
      expect(searchPromptPresets({ search: 'code' })).toHaveLength(1);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 5; i++) createPromptPreset({ category: 'system_prompt', label: `P${i}`, content: `C${i}` });
      expect(searchPromptPresets({ limit: 2 })).toHaveLength(2);
    });

    it('should prioritize quick access presets', () => {
      createPromptPreset({ category: 'system_prompt', label: 'Regular', content: 'C1', is_quick_access: false });
      createPromptPreset({ category: 'system_prompt', label: 'Quick', content: 'C2', is_quick_access: true });
      expect(searchPromptPresets({})[0].label).toBe('Quick');
    });
  });

  describe('listQuickPromptPresets', () => {
    it('should return only quick access presets', () => {
      createPromptPreset({ category: 'system_prompt', label: 'Regular', content: 'C1', is_quick_access: false });
      createPromptPreset({ category: 'system_prompt', label: 'Quick', content: 'C2', is_quick_access: true });
      const result = listQuickPromptPresets('system_prompt');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Quick');
    });

    it('should filter by category', () => {
      createPromptPreset({ category: 'system_prompt', label: 'SP Quick', content: 'C1', is_quick_access: true });
      createPromptPreset({ category: 'output_example', label: 'OE Quick', content: 'C2', is_quick_access: true });
      expect(listQuickPromptPresets('system_prompt')).toHaveLength(1);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 10; i++) createPromptPreset({ category: 'system_prompt', label: `Q${i}`, content: `C${i}`, is_quick_access: true });
      expect(listQuickPromptPresets('system_prompt', 3)).toHaveLength(3);
    });
  });

  describe('updatePromptPreset', () => {
    it('should update label', () => {
      const created = createPromptPreset({ category: 'system_prompt', label: 'Old', content: 'C' });
      expect(updatePromptPreset(created.preset_id, { label: 'New' }).label).toBe('New');
    });

    it('should keep unchanged fields', () => {
      const created = createPromptPreset({ category: 'system_prompt', label: 'L', content: 'C', description: 'D' });
      const result = updatePromptPreset(created.preset_id, { label: 'Updated' });
      expect(result.content).toBe('C');
      expect(result.description).toBe('D');
    });

    it('should throw for non-existent preset', () => {
      expect(() => updatePromptPreset('nonexistent', { label: 'N' })).toThrow();
    });
  });

  describe('deletePromptPreset', () => {
    it('should delete an existing preset', () => {
      const created = createPromptPreset({ category: 'system_prompt', label: 'L', content: 'C' });
      deletePromptPreset(created.preset_id);
      expect(getPromptPreset(created.preset_id)).toBeUndefined();
    });

    it('should throw for non-existent preset', () => {
      expect(() => deletePromptPreset('nonexistent')).toThrow();
    });
  });

  describe('importPromptPresets', () => {
    it('should import multiple presets', () => {
      const result = importPromptPresets([
        { category: 'system_prompt', label: 'I1', content: 'C1' },
        { category: 'output_example', label: 'I2', content: 'C2' },
      ]);
      expect(result).toHaveLength(2);
      expect(listPromptPresetsForAdmin()).toHaveLength(2);
    });

    it('should update existing presets during import', () => {
      const existing = createPromptPreset({ category: 'system_prompt', label: 'Existing', content: 'Old' });
      const result = importPromptPresets([{ preset_id: existing.preset_id, category: 'system_prompt', label: 'Updated', content: 'New' }]);
      expect(result[0].label).toBe('Updated');
      expect(result[0].content).toBe('New');
    });

    it('should replace all when replace option is true', () => {
      createPromptPreset({ category: 'system_prompt', label: 'Old1', content: 'C1' });
      createPromptPreset({ category: 'system_prompt', label: 'Old2', content: 'C2' });
      importPromptPresets([{ category: 'system_prompt', label: 'New', content: 'NC' }], { replace: true });
      expect(listPromptPresetsForAdmin()).toHaveLength(1);
    });

    it('should throw for invalid payload', () => {
      expect(() => importPromptPresets('not array' as unknown as Array<{ category: 'system_prompt'; label: string; content: string }>)).toThrow();
    });
  });
});
