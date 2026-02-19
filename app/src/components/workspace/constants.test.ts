import { describe, it, expect } from 'vitest';
import {
  COLOR_PALETTE,
  TYPE_ICONS,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  PALETTE_MIN_WIDTH,
  PALETTE_MAX_WIDTH,
  PALETTE_DEFAULT_WIDTH,
} from './constants';

describe('COLOR_PALETTE', () => {
  it('has at least 10 colors', () => {
    expect(COLOR_PALETTE.length).toBeGreaterThanOrEqual(10);
  });

  it('contains only valid hex color strings', () => {
    for (const color of COLOR_PALETTE) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('has no duplicate colors', () => {
    const uniqueColors = new Set(COLOR_PALETTE);
    expect(uniqueColors.size).toBe(COLOR_PALETTE.length);
  });
});

describe('TYPE_ICONS', () => {
  it('maps common node types to icon strings', () => {
    expect(TYPE_ICONS.text).toBeDefined();
    expect(TYPE_ICONS.ai).toBeDefined();
    expect(TYPE_ICONS.image).toBeDefined();
    expect(TYPE_ICONS.video).toBeDefined();
    expect(TYPE_ICONS.python).toBeDefined();
  });

  it('icon values are non-empty strings', () => {
    for (const [type, icon] of Object.entries(TYPE_ICONS)) {
      expect(typeof icon).toBe('string');
      expect(icon.length).toBeGreaterThan(0);
    }
  });
});

describe('sidebar/palette dimension constants', () => {
  it('sidebar default is between min and max', () => {
    expect(SIDEBAR_DEFAULT_WIDTH).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
    expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH);
  });

  it('palette default is between min and max', () => {
    expect(PALETTE_DEFAULT_WIDTH).toBeGreaterThanOrEqual(PALETTE_MIN_WIDTH);
    expect(PALETTE_DEFAULT_WIDTH).toBeLessThanOrEqual(PALETTE_MAX_WIDTH);
  });

  it('sidebar min is positive', () => {
    expect(SIDEBAR_MIN_WIDTH).toBeGreaterThan(0);
  });

  it('palette min is positive', () => {
    expect(PALETTE_MIN_WIDTH).toBeGreaterThan(0);
  });

  it('max exceeds min for both sidebar and palette', () => {
    expect(SIDEBAR_MAX_WIDTH).toBeGreaterThan(SIDEBAR_MIN_WIDTH);
    expect(PALETTE_MAX_WIDTH).toBeGreaterThan(PALETTE_MIN_WIDTH);
  });
});
