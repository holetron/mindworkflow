import { describe, it, expect } from 'vitest';
import {
  diffToTextOperations,
  applyTextOperations,
  type TextOperation,
} from './textOperations';

describe('diffToTextOperations', () => {
  it('returns empty array for identical strings', () => {
    expect(diffToTextOperations('hello', 'hello')).toEqual([]);
  });

  it('detects a simple insertion at the end', () => {
    const ops = diffToTextOperations('hello', 'hello world');
    const result = applyTextOperations('hello', ops);
    expect(result).toBe('hello world');
  });

  it('detects a deletion at the end', () => {
    const ops = diffToTextOperations('hello world', 'hello');
    const result = applyTextOperations('hello world', ops);
    expect(result).toBe('hello');
  });

  it('detects a replacement in the middle', () => {
    const ops = diffToTextOperations('hello world', 'hello there');
    const result = applyTextOperations('hello world', ops);
    expect(result).toBe('hello there');
  });

  it('handles empty to non-empty', () => {
    const ops = diffToTextOperations('', 'new text');
    expect(ops).toEqual([{ op: 'insert', text: 'new text' }]);
    expect(applyTextOperations('', ops)).toBe('new text');
  });

  it('handles non-empty to empty', () => {
    const ops = diffToTextOperations('old text', '');
    const result = applyTextOperations('old text', ops);
    expect(result).toBe('');
  });

  it('handles insertion at the beginning', () => {
    const ops = diffToTextOperations('world', 'hello world');
    const result = applyTextOperations('world', ops);
    expect(result).toBe('hello world');
  });

  it('preserves common prefix and suffix with changes in between', () => {
    const ops = diffToTextOperations('abcXYZdef', 'abcMNOdef');
    const result = applyTextOperations('abcXYZdef', ops);
    expect(result).toBe('abcMNOdef');
    // Should have retain(3), delete(3), insert(MNO), retain(3)
    expect(ops.some((op) => op.op === 'retain' && op.count === 3)).toBe(true);
  });
});

describe('applyTextOperations', () => {
  it('returns the base string when operations are empty', () => {
    expect(applyTextOperations('hello', [])).toBe('hello');
  });

  it('applies a retain operation correctly', () => {
    const ops: TextOperation[] = [{ op: 'retain', count: 5 }];
    expect(applyTextOperations('hello', ops)).toBe('hello');
  });

  it('applies an insert operation correctly', () => {
    const ops: TextOperation[] = [
      { op: 'retain', count: 5 },
      { op: 'insert', text: ' world' },
    ];
    expect(applyTextOperations('hello', ops)).toBe('hello world');
  });

  it('applies a delete operation correctly', () => {
    const ops: TextOperation[] = [
      { op: 'retain', count: 5 },
      { op: 'delete', count: 6 },
    ];
    expect(applyTextOperations('hello world', ops)).toBe('hello');
  });

  it('handles complex operation sequences', () => {
    const ops: TextOperation[] = [
      { op: 'retain', count: 2 },
      { op: 'delete', count: 3 },
      { op: 'insert', text: 'NEW' },
      { op: 'retain', count: 2 },
    ];
    expect(applyTextOperations('abcdefg', ops)).toBe('abNEWfg');
  });

  it('throws on retain exceeding base length', () => {
    const ops: TextOperation[] = [{ op: 'retain', count: 100 }];
    expect(() => applyTextOperations('hi', ops)).toThrow(
      'Retain operation exceeds base length',
    );
  });

  it('throws on delete exceeding base length', () => {
    const ops: TextOperation[] = [{ op: 'delete', count: 100 }];
    expect(() => applyTextOperations('hi', ops)).toThrow(
      'Delete operation exceeds base length',
    );
  });

  it('throws on negative retain count', () => {
    const ops: TextOperation[] = [{ op: 'retain', count: -1 }];
    expect(() => applyTextOperations('hi', ops)).toThrow(
      'Retain operation must have non-negative count',
    );
  });

  it('appends remaining base content after all operations', () => {
    const ops: TextOperation[] = [{ op: 'insert', text: 'prefix-' }];
    expect(applyTextOperations('hello', ops)).toBe('prefix-hello');
  });

  it('skips insert operations with empty text', () => {
    const ops: TextOperation[] = [
      { op: 'retain', count: 3 },
      { op: 'insert', text: '' },
    ];
    expect(applyTextOperations('abc', ops)).toBe('abc');
  });
});

describe('diffToTextOperations + applyTextOperations roundtrip', () => {
  const cases = [
    ['', ''],
    ['same', 'same'],
    ['abc', 'xyz'],
    ['hello world', 'hello beautiful world'],
    ['multiline\ntext\nhere', 'multiline\nmodified\nhere'],
    ['unicode: \u{1F600}', 'unicode: \u{1F601}'],
  ];

  for (const [before, after] of cases) {
    it(`roundtrips "${before}" -> "${after}"`, () => {
      const ops = diffToTextOperations(before, after);
      if (before === after) {
        expect(ops).toEqual([]);
      } else {
        const result = applyTextOperations(before, ops);
        expect(result).toBe(after);
      }
    });
  }
});
