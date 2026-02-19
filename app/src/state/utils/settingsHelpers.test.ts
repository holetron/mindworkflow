import { describe, it, expect } from 'vitest';
import { mergeSettings } from './settingsHelpers';

describe('mergeSettings', () => {
  it('returns base when patch is empty', () => {
    const base = { a: 1, b: 'hello' };
    const result = mergeSettings(base, {});
    expect(result).toEqual({ a: 1, b: 'hello' });
  });

  it('overwrites primitive values', () => {
    const base = { a: 1, b: 'hello' };
    const result = mergeSettings(base, { a: 2 });
    expect(result.a).toBe(2);
    expect(result.b).toBe('hello');
  });

  it('deep-merges nested objects', () => {
    const base = {
      theme: { color: 'blue', font: 'sans' },
      version: 1,
    };
    const patch = {
      theme: { color: 'red' },
    };
    const result = mergeSettings(base, patch);
    expect(result.theme).toEqual({ color: 'red', font: 'sans' });
  });

  it('adds new keys from patch', () => {
    const base = { a: 1 };
    const result = mergeSettings(base, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('overwrites non-object base value with object patch', () => {
    const base = { a: 'string' };
    const patch = { a: { nested: true } };
    const result = mergeSettings(base, patch);
    expect(result.a).toEqual({ nested: true });
  });

  it('overwrites object base value with primitive patch', () => {
    const base = { a: { nested: true } };
    const patch = { a: 'replaced' };
    const result = mergeSettings(base, patch);
    expect(result.a).toBe('replaced');
  });

  it('handles deeply nested merge', () => {
    const base = {
      level1: {
        level2: {
          level3: { value: 'original' },
        },
      },
    };
    const patch = {
      level1: {
        level2: {
          level3: { value: 'modified' },
        },
      },
    };
    const result = mergeSettings(base, patch);
    expect((result.level1 as Record<string, unknown>)).toBeDefined();
    const level2 = (result.level1 as Record<string, unknown>).level2 as Record<string, unknown>;
    const level3 = level2.level3 as Record<string, unknown>;
    expect(level3.value).toBe('modified');
  });

  it('does not mutate the base object', () => {
    const base = { a: 1, b: { c: 2 } };
    const baseCopy = JSON.parse(JSON.stringify(base));
    mergeSettings(base, { a: 99, b: { c: 99 } });
    expect(base).toEqual(baseCopy);
  });

  it('handles arrays as values (not deep-merged)', () => {
    const base = { items: [1, 2, 3] };
    const patch = { items: [4, 5] };
    const result = mergeSettings(base, patch);
    // Arrays are not plain objects, so they should be replaced
    expect(result.items).toEqual([4, 5]);
  });

  it('handles null values in patch', () => {
    const base = { a: 1 };
    const result = mergeSettings(base, { a: null });
    expect(result.a).toBeNull();
  });
});
