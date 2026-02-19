import { describe, it, expect } from 'vitest';
import {
  normalizeNodeUI,
  mergeNodeUI,
  normalizeNodeConnections,
  mergeNodeConnections,
  normalizeAiVisible,
  assertValidNodeUI,
  assertValidNodeConnections,
} from '../validation';
import {
  createDefaultNodeUI,
  createDefaultNodeConnections,
  DEFAULT_NODE_UI_COLOR,
  DEFAULT_NODE_UI_BBOX,
} from '../types';

describe('normalizeNodeUI', () => {
  it('should return default UI when no input is provided', () => {
    const result = normalizeNodeUI();
    expect(result.color).toBe(DEFAULT_NODE_UI_COLOR);
    expect(result.bbox.x1).toBe(DEFAULT_NODE_UI_BBOX.x1);
    expect(result.bbox.y1).toBe(DEFAULT_NODE_UI_BBOX.y1);
    expect(result.bbox.x2).toBe(DEFAULT_NODE_UI_BBOX.x2);
    expect(result.bbox.y2).toBe(DEFAULT_NODE_UI_BBOX.y2);
  });

  it('should accept valid color and bbox', () => {
    const result = normalizeNodeUI({
      color: '#FF0000',
      bbox: { x1: 10, y1: 20, x2: 300, y2: 200 },
    });
    expect(result.color).toBe('#FF0000');
    expect(result.bbox.x1).toBe(10);
    expect(result.bbox.y1).toBe(20);
    expect(result.bbox.x2).toBe(300);
    expect(result.bbox.y2).toBe(200);
  });

  it('should use default color for invalid hex', () => {
    const result = normalizeNodeUI({ color: 'not-a-color' });
    expect(result.color).toBe(DEFAULT_NODE_UI_COLOR);
  });

  it('should fix x2 when it is less than or equal to x1', () => {
    const result = normalizeNodeUI({
      bbox: { x1: 100, y1: 0, x2: 50, y2: 120 },
    });
    expect(result.bbox.x2).toBeGreaterThan(result.bbox.x1);
  });

  it('should fix y2 when it is less than or equal to y1', () => {
    const result = normalizeNodeUI({
      bbox: { x1: 0, y1: 100, x2: 240, y2: 50 },
    });
    expect(result.bbox.y2).toBeGreaterThan(result.bbox.y1);
  });

  it('should handle partial bbox input', () => {
    const result = normalizeNodeUI({ bbox: { x1: 50 } as { x1: number; y1: number; x2: number; y2: number } });
    expect(result.bbox.x1).toBe(50);
    // Other values should fall back to defaults
    expect(result.bbox.y1).toBe(DEFAULT_NODE_UI_BBOX.y1);
  });
});

describe('mergeNodeUI', () => {
  it('should return current UI when patch is undefined', () => {
    const current = createDefaultNodeUI();
    const result = mergeNodeUI(current);
    expect(result).toEqual(current);
  });

  it('should merge color from patch', () => {
    const current = createDefaultNodeUI();
    const result = mergeNodeUI(current, { color: '#00FF00' });
    expect(result.color).toBe('#00FF00');
  });

  it('should merge bbox partially from patch', () => {
    const current = createDefaultNodeUI();
    const result = mergeNodeUI(current, { bbox: { x1: 50, y1: 0, x2: 240, y2: 120 } });
    expect(result.bbox.x1).toBe(50);
  });
});

describe('normalizeNodeConnections', () => {
  it('should return default connections when no input provided', () => {
    const result = normalizeNodeConnections();
    expect(result.incoming).toEqual([]);
    expect(result.outgoing).toEqual([]);
  });

  it('should accept valid connections', () => {
    const result = normalizeNodeConnections({
      incoming: [{ edge_id: 'e1', from: 'n1', routing: 'default' }],
      outgoing: [{ edge_id: 'e2', to: 'n2', routing: 'default' }],
    });
    expect(result.incoming).toHaveLength(1);
    expect(result.outgoing).toHaveLength(1);
    expect(result.incoming[0].edge_id).toBe('e1');
    expect(result.outgoing[0].edge_id).toBe('e2');
  });

  it('should filter out invalid incoming connections', () => {
    const result = normalizeNodeConnections({
      incoming: [
        { edge_id: '', from: 'n1', routing: 'default' },
        { edge_id: 'e1', from: '', routing: 'default' },
        null as unknown as { edge_id: string; from: string; routing: string },
      ],
      outgoing: [],
    });
    expect(result.incoming).toHaveLength(0);
  });

  it('should filter out invalid outgoing connections', () => {
    const result = normalizeNodeConnections({
      incoming: [],
      outgoing: [
        { edge_id: '', to: 'n1', routing: 'default' },
        { edge_id: 'e1', to: '', routing: 'default' },
      ],
    });
    expect(result.outgoing).toHaveLength(0);
  });
});

describe('mergeNodeConnections', () => {
  it('should return current connections when patch is undefined', () => {
    const current = createDefaultNodeConnections();
    const result = mergeNodeConnections(current);
    expect(result).toEqual(current);
  });

  it('should replace incoming from patch when provided', () => {
    const current = createDefaultNodeConnections();
    const result = mergeNodeConnections(current, {
      incoming: [{ edge_id: 'e1', from: 'n1', routing: '' }],
    });
    expect(result.incoming).toHaveLength(1);
    expect(result.outgoing).toHaveLength(0);
  });
});

describe('normalizeAiVisible', () => {
  it('should return true for boolean true', () => {
    expect(normalizeAiVisible(true)).toBe(true);
  });

  it('should return false for boolean false', () => {
    expect(normalizeAiVisible(false)).toBe(false);
  });

  it('should return false for number 0', () => {
    expect(normalizeAiVisible(0)).toBe(false);
  });

  it('should return true for number 1', () => {
    expect(normalizeAiVisible(1)).toBe(true);
  });

  it('should return true for null or undefined', () => {
    expect(normalizeAiVisible(null)).toBe(true);
    expect(normalizeAiVisible(undefined)).toBe(true);
  });

  it('should return true for string values', () => {
    expect(normalizeAiVisible('yes')).toBe(true);
  });
});

describe('assertValidNodeUI', () => {
  it('should not throw for valid UI', () => {
    const ui = createDefaultNodeUI();
    expect(() => assertValidNodeUI(ui)).not.toThrow();
  });

  it('should throw for invalid color', () => {
    const ui = { color: 'bad', bbox: { x1: 0, y1: 0, x2: 240, y2: 120 } };
    expect(() => assertValidNodeUI(ui)).toThrow('Invalid node color');
  });

  it('should throw when x2 <= x1', () => {
    const ui = { color: '#FF0000', bbox: { x1: 100, y1: 0, x2: 50, y2: 120 } };
    expect(() => assertValidNodeUI(ui)).toThrow('x2');
  });

  it('should throw when y2 <= y1', () => {
    const ui = { color: '#FF0000', bbox: { x1: 0, y1: 100, x2: 240, y2: 50 } };
    expect(() => assertValidNodeUI(ui)).toThrow('y2');
  });
});

describe('assertValidNodeConnections', () => {
  it('should not throw for valid connections', () => {
    const connections = createDefaultNodeConnections();
    expect(() => assertValidNodeConnections(connections)).not.toThrow();
  });

  it('should throw for null connections', () => {
    expect(() => assertValidNodeConnections(null as unknown as ReturnType<typeof createDefaultNodeConnections>)).toThrow();
  });
});
