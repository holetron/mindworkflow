import { describe, it, expect } from 'vitest';
import {
  applyTextOperations,
  diffToTextOperations,
  type TextOperation,
} from '../textOperations';

describe('applyTextOperations', () => {
  it('should return the base string when ops is empty', () => {
    expect(applyTextOperations('hello', [])).toBe('hello');
  });

  it('should return the base string when ops is not an array', () => {
    // The function checks Array.isArray, so a null-ish value returns base
    expect(applyTextOperations('hello', null as unknown as TextOperation[])).toBe('hello');
  });

  it('should apply a retain operation', () => {
    const ops: TextOperation[] = [{ op: 'retain', count: 5 }];
    expect(applyTextOperations('hello world', ops)).toBe('hello world');
  });

  it('should apply an insert operation', () => {
    const ops: TextOperation[] = [{ op: 'insert', text: 'hey ' }];
    expect(applyTextOperations('world', ops)).toBe('hey world');
  });

  it('should apply a delete operation', () => {
    const ops: TextOperation[] = [{ op: 'delete', count: 6 }];
    expect(applyTextOperations('hello world', ops)).toBe('world');
  });

  it('should apply retain + delete + insert (replace first word)', () => {
    const ops: TextOperation[] = [
      { op: 'delete', count: 5 },
      { op: 'insert', text: 'goodbye' },
    ];
    expect(applyTextOperations('hello world', ops)).toBe('goodbye world');
  });

  it('should throw when retain exceeds base length', () => {
    const ops: TextOperation[] = [{ op: 'retain', count: 100 }];
    expect(() => applyTextOperations('hi', ops)).toThrow('Retain operation exceeds base length');
  });

  it('should throw when delete exceeds base length', () => {
    const ops: TextOperation[] = [{ op: 'delete', count: 100 }];
    expect(() => applyTextOperations('hi', ops)).toThrow('Delete operation exceeds base length');
  });

  it('should throw on negative retain count', () => {
    const ops: TextOperation[] = [{ op: 'retain', count: -1 }];
    expect(() => applyTextOperations('hi', ops)).toThrow('non-negative');
  });

  it('should throw on negative delete count', () => {
    const ops: TextOperation[] = [{ op: 'delete', count: -1 }];
    expect(() => applyTextOperations('hi', ops)).toThrow('non-negative');
  });

  it('should skip insert with empty text', () => {
    const ops: TextOperation[] = [{ op: 'insert', text: '' }];
    expect(applyTextOperations('hello', ops)).toBe('hello');
  });
});

describe('diffToTextOperations', () => {
  it('should return empty operations for identical strings', () => {
    expect(diffToTextOperations('hello', 'hello')).toEqual([]);
  });

  it('should handle complete replacement', () => {
    const ops = diffToTextOperations('abc', 'xyz');
    const result = applyTextOperations('abc', ops);
    expect(result).toBe('xyz');
  });

  it('should handle insertion at the end', () => {
    const ops = diffToTextOperations('hello', 'hello world');
    const result = applyTextOperations('hello', ops);
    expect(result).toBe('hello world');
  });

  it('should handle deletion at the end', () => {
    const ops = diffToTextOperations('hello world', 'hello');
    const result = applyTextOperations('hello world', ops);
    expect(result).toBe('hello');
  });

  it('should handle insertion at the beginning', () => {
    const ops = diffToTextOperations('world', 'hello world');
    const result = applyTextOperations('world', ops);
    expect(result).toBe('hello world');
  });

  it('should handle middle replacement', () => {
    const ops = diffToTextOperations('hello world', 'hello earth');
    const result = applyTextOperations('hello world', ops);
    expect(result).toBe('hello earth');
  });

  it('should handle empty to non-empty', () => {
    const ops = diffToTextOperations('', 'new text');
    const result = applyTextOperations('', ops);
    expect(result).toBe('new text');
  });

  it('should handle non-empty to empty', () => {
    const ops = diffToTextOperations('old text', '');
    const result = applyTextOperations('old text', ops);
    expect(result).toBe('');
  });
});
