import { describe, it, expect } from 'vitest';
import { calculateContextUsage, formatTokenCount } from './contextCalculation';
import type { ContextUsage } from './contextCalculation';

describe('calculateContextUsage', () => {
  it('calculates tokens for text nodes (~1 token per 4 chars)', () => {
    const nodes = [{ content: 'a'.repeat(400) }];
    const result = calculateContextUsage(nodes, 1000);
    expect(result.used).toBe(100); // 400 chars / 4 = 100 tokens
    expect(result.limit).toBe(1000);
    expect(result.percentage).toBe(10);
    expect(result.isOverLimit).toBe(false);
  });

  it('calculates tokens for image nodes as 1000 tokens', () => {
    const nodes = [{ content: '', type: 'image' }];
    const result = calculateContextUsage(nodes, 2000);
    expect(result.used).toBe(1000);
    expect(result.percentage).toBe(50);
    expect(result.isOverLimit).toBe(false);
  });

  it('calculates tokens for video nodes as 5000 tokens', () => {
    const nodes = [{ content: '', type: 'video' }];
    const result = calculateContextUsage(nodes, 4000);
    expect(result.used).toBe(5000);
    expect(result.isOverLimit).toBe(true);
    expect(result.percentage).toBe(125);
  });

  it('calculates tokens for audio nodes as 2000 tokens', () => {
    const nodes = [{ content: '', type: 'audio' }];
    const result = calculateContextUsage(nodes, 10000);
    expect(result.used).toBe(2000);
    expect(result.isOverLimit).toBe(false);
  });

  it('uses 500 tokens for unknown media types', () => {
    const nodes = [{ content: '', type: 'unknown_media' }];
    // unknown_media does not match image/video/audio, so treated as text
    // empty content => 0 tokens (text path)
    const result = calculateContextUsage(nodes, 1000);
    expect(result.used).toBe(0);
  });

  it('aggregates tokens from multiple nodes', () => {
    const nodes = [
      { content: 'a'.repeat(80) },    // 20 tokens
      { content: 'b'.repeat(120) },   // 30 tokens
      { content: '', type: 'image' }, // 1000 tokens
    ];
    const result = calculateContextUsage(nodes, 2000);
    expect(result.used).toBe(1050);
    expect(result.percentage).toBe(53); // Math.round(1050/2000 * 100)
  });

  it('handles empty nodes array', () => {
    const result = calculateContextUsage([], 4096);
    expect(result.used).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.isOverLimit).toBe(false);
  });

  it('handles nodes with undefined content', () => {
    const nodes = [{ content: undefined as unknown as string }];
    const result = calculateContextUsage(nodes, 1000);
    // estimateTextTokens('') => 0
    expect(result.used).toBe(0);
  });

  it('marks isOverLimit when tokens exceed the limit', () => {
    const nodes = [{ content: 'x'.repeat(4100) }]; // ceil(4100/4) = 1025
    const result = calculateContextUsage(nodes, 1000);
    expect(result.isOverLimit).toBe(true);
    expect(result.used).toBe(1025);
  });
});

describe('formatTokenCount', () => {
  it('formats numbers below 1000 as plain string', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats 1000 as "1.0K"', () => {
    expect(formatTokenCount(1000)).toBe('1.0K');
  });

  it('formats large numbers with one decimal', () => {
    expect(formatTokenCount(4096)).toBe('4.1K');
    expect(formatTokenCount(128000)).toBe('128.0K');
  });

  it('formats numbers just above 1000', () => {
    expect(formatTokenCount(1500)).toBe('1.5K');
  });
});
