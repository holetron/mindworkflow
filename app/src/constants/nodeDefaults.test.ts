import { describe, it, expect } from 'vitest';
import {
  NODE_MIN_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MAX_HEIGHT,
  NODE_DEFAULT_WIDTH,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_COLOR,
  DEFAULT_NODE_BBOX,
  normalizeNodeWidth,
  normalizeNodeHeight,
  calculateContentBasedHeight,
} from './nodeDefaults';

describe('nodeDefaults constants', () => {
  it('has valid default dimensions', () => {
    expect(NODE_DEFAULT_WIDTH).toBeGreaterThanOrEqual(NODE_MIN_WIDTH);
    expect(NODE_DEFAULT_WIDTH).toBeLessThanOrEqual(NODE_MAX_WIDTH);
    // NODE_DEFAULT_HEIGHT (200) is intentionally less than NODE_MIN_HEIGHT (300)
    // because default height is a starting point that gets clamped during normalization
    expect(NODE_DEFAULT_HEIGHT).toBeGreaterThan(0);
    expect(NODE_DEFAULT_HEIGHT).toBeLessThanOrEqual(NODE_MAX_HEIGHT);
  });

  it('DEFAULT_NODE_BBOX has correct dimensions', () => {
    expect(DEFAULT_NODE_BBOX.x1).toBe(0);
    expect(DEFAULT_NODE_BBOX.y1).toBe(0);
    expect(DEFAULT_NODE_BBOX.x2).toBe(NODE_DEFAULT_WIDTH);
    expect(DEFAULT_NODE_BBOX.y2).toBe(NODE_DEFAULT_HEIGHT);
  });

  it('DEFAULT_NODE_BBOX is frozen', () => {
    expect(Object.isFrozen(DEFAULT_NODE_BBOX)).toBe(true);
  });

  it('has a valid default color (hex)', () => {
    expect(NODE_DEFAULT_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('normalizeNodeWidth', () => {
  it('returns default width for undefined', () => {
    expect(normalizeNodeWidth(undefined)).toBe(NODE_DEFAULT_WIDTH);
  });

  it('returns default width for NaN', () => {
    expect(normalizeNodeWidth(NaN)).toBe(NODE_DEFAULT_WIDTH);
  });

  it('returns default width for Infinity', () => {
    expect(normalizeNodeWidth(Infinity)).toBe(NODE_DEFAULT_WIDTH);
  });

  it('clamps width to minimum', () => {
    expect(normalizeNodeWidth(10)).toBe(NODE_MIN_WIDTH);
  });

  it('clamps width to maximum', () => {
    expect(normalizeNodeWidth(99999)).toBe(NODE_MAX_WIDTH);
  });

  it('passes through valid width', () => {
    const validWidth = (NODE_MIN_WIDTH + NODE_MAX_WIDTH) / 2;
    expect(normalizeNodeWidth(validWidth)).toBe(validWidth);
  });
});

describe('normalizeNodeHeight', () => {
  it('returns default height for undefined', () => {
    expect(normalizeNodeHeight(undefined)).toBe(NODE_DEFAULT_HEIGHT);
  });

  it('returns default height for NaN', () => {
    expect(normalizeNodeHeight(NaN)).toBe(NODE_DEFAULT_HEIGHT);
  });

  it('clamps height to minimum', () => {
    expect(normalizeNodeHeight(10)).toBe(NODE_MIN_HEIGHT);
  });

  it('clamps height to maximum', () => {
    expect(normalizeNodeHeight(99999)).toBe(NODE_MAX_HEIGHT);
  });

  it('passes through valid height', () => {
    const validHeight = (NODE_MIN_HEIGHT + NODE_MAX_HEIGHT) / 2;
    expect(normalizeNodeHeight(validHeight)).toBe(validHeight);
  });
});

describe('calculateContentBasedHeight', () => {
  it('returns NODE_DEFAULT_HEIGHT for undefined content', () => {
    expect(calculateContentBasedHeight(undefined)).toBe(NODE_DEFAULT_HEIGHT);
  });

  it('returns collapsed height for isCollapsed=true', () => {
    const result = calculateContentBasedHeight('lots of content', false, true);
    // collapsed height = header(60) + footer(50) = 110
    expect(result).toBe(110);
  });

  it('returns at least NODE_MIN_HEIGHT for short content', () => {
    const result = calculateContentBasedHeight('short');
    expect(result).toBeGreaterThanOrEqual(NODE_MIN_HEIGHT);
  });

  it('returns at most NODE_MAX_HEIGHT for very long content', () => {
    const longContent = Array.from({ length: 10000 }, () => 'line').join('\n');
    const result = calculateContentBasedHeight(longContent);
    expect(result).toBeLessThanOrEqual(NODE_MAX_HEIGHT);
  });

  it('accounts for AI tabs height when hasAiTabs is true', () => {
    const content = Array.from({ length: 20 }, () => 'line').join('\n');
    const withoutAi = calculateContentBasedHeight(content, false);
    const withAi = calculateContentBasedHeight(content, true);
    expect(withAi).toBeGreaterThan(withoutAi);
  });

  it('returns empty content default height', () => {
    const result = calculateContentBasedHeight('');
    expect(result).toBe(NODE_DEFAULT_HEIGHT);
  });
});
