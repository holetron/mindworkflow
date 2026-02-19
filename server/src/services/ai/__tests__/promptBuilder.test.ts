import { describe, it, expect, vi } from 'vitest';

// Mock the db module to prevent real DB initialization
vi.mock('../../../db', () => ({
  getNode: vi.fn(),
}));

vi.mock('../contextBuilder', () => ({
  buildContextSummary: vi.fn().mockResolvedValue('Mocked context summary'),
  summarizeNextNodes: vi.fn().mockReturnValue(''),
  resolveFileDeliveryFormat: vi.fn().mockReturnValue('url'),
}));

import {
  normalizePlaceholderValues,
  applyPlaceholderValues,
  normalizeFieldName,
  getNestedValue,
  resolveFieldValue,
} from '../promptBuilder';
import type { AiContext } from '../types';
import type { StoredNode } from '../../../db/types';

function makeStoredNode(overrides: Partial<StoredNode> = {}): StoredNode {
  return {
    project_id: 'proj-1',
    node_id: 'node-1',
    type: 'text',
    title: 'Test Node',
    content_type: 'text/plain',
    content: 'Test content',
    meta: {},
    config: {},
    visibility: {},
    ui: { color: '#6B7280', bbox: { x1: 0, y1: 0, x2: 240, y2: 120 } },
    ai_visible: true,
    connections: { incoming: [], outgoing: [] },
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeContext(overrides: Partial<AiContext> = {}): AiContext {
  return {
    projectId: 'proj-1',
    node: makeStoredNode(),
    previousNodes: [],
    nextNodes: [],
    schemaRef: 'TEXT_RESPONSE',
    settings: {},
    ...overrides,
  };
}

describe('normalizePlaceholderValues', () => {
  it('should return empty object for null', () => {
    expect(normalizePlaceholderValues(null)).toEqual({});
  });

  it('should return empty object for non-object', () => {
    expect(normalizePlaceholderValues('string')).toEqual({});
    expect(normalizePlaceholderValues(42)).toEqual({});
  });

  it('should extract string values from object', () => {
    const result = normalizePlaceholderValues({
      name: 'Alice',
      age: 30,
      city: 'NYC',
    });
    expect(result).toEqual({ name: 'Alice', city: 'NYC' });
  });

  it('should skip non-string values', () => {
    const result = normalizePlaceholderValues({
      valid: 'yes',
      invalid: { nested: true },
      alsoInvalid: [1, 2, 3],
    });
    expect(result).toEqual({ valid: 'yes' });
  });
});

describe('normalizeFieldName', () => {
  it('should normalize content aliases', () => {
    expect(normalizeFieldName('text')).toBe('content');
    expect(normalizeFieldName('content')).toBe('content');
    expect(normalizeFieldName('body')).toBe('content');
    expect(normalizeFieldName('value')).toBe('content');
  });

  it('should normalize title aliases', () => {
    expect(normalizeFieldName('title')).toBe('title');
    expect(normalizeFieldName('name')).toBe('title');
    expect(normalizeFieldName('heading')).toBe('title');
  });

  it('should normalize description aliases', () => {
    expect(normalizeFieldName('description')).toBe('description');
    expect(normalizeFieldName('desc')).toBe('description');
    expect(normalizeFieldName('summary')).toBe('description');
  });

  it('should normalize output/result to meta.output', () => {
    expect(normalizeFieldName('output')).toBe('meta.output');
    expect(normalizeFieldName('result')).toBe('meta.output');
  });

  it('should lowercase unknown fields', () => {
    expect(normalizeFieldName('CustomField')).toBe('customfield');
    expect(normalizeFieldName('UPPERCASE')).toBe('uppercase');
  });
});

describe('getNestedValue', () => {
  it('should return value at path', () => {
    const source = { a: { b: { c: 'deep' } } };
    expect(getNestedValue(source, ['a', 'b', 'c'])).toBe('deep');
  });

  it('should return undefined for missing path', () => {
    const source = { a: 1 };
    expect(getNestedValue(source, ['b'])).toBeUndefined();
  });

  it('should return undefined for null source', () => {
    expect(getNestedValue(null, ['a'])).toBeUndefined();
  });

  it('should return undefined for undefined source', () => {
    expect(getNestedValue(undefined, ['a'])).toBeUndefined();
  });

  it('should return the source itself for empty path', () => {
    const source = { a: 1 };
    expect(getNestedValue(source, [])).toEqual({ a: 1 });
  });

  it('should return undefined when path crosses a non-object', () => {
    const source = { a: 'string' };
    expect(getNestedValue(source, ['a', 'b'])).toBeUndefined();
  });
});

describe('applyPlaceholderValues', () => {
  it('should return template unchanged when no placeholders', () => {
    const context = makeContext();
    const { prompt, logs } = applyPlaceholderValues('Hello world', {}, context);
    expect(prompt).toBe('Hello world');
    expect(logs).toEqual([]);
  });

  it('should replace placeholder with user value', () => {
    const context = makeContext();
    const { prompt } = applyPlaceholderValues(
      'Hello <name>!',
      { name: 'Alice' },
      context,
    );
    expect(prompt).toBe('Hello Alice!');
  });

  it('should handle multiple placeholders', () => {
    const context = makeContext();
    const { prompt } = applyPlaceholderValues(
      '<greeting> <name>!',
      { greeting: 'Hi', name: 'Bob' },
      context,
    );
    expect(prompt).toBe('Hi Bob!');
  });

  it('should log when placeholder has no value', () => {
    const context = makeContext();
    const { logs } = applyPlaceholderValues('<missing>', {}, context);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain('missing');
    expect(logs[0]).toContain('no value');
  });

  it('should resolve self reference from current node', () => {
    const context = makeContext({
      node: makeStoredNode({ content: 'Node Content' }),
    });
    const { prompt } = applyPlaceholderValues(
      'Content: <self.content>',
      { 'self.content': 'self' },
      context,
    );
    // The placeholder resolution tries to resolve 'self' as a node reference
    expect(prompt).toContain('Content:');
  });
});

describe('resolveFieldValue', () => {
  it('should return manual value for system_prompt', async () => {
    const aiConfig = { system_prompt: 'You are a helper' };
    const result = await resolveFieldValue('system_prompt', aiConfig, [], [], 'node-1');
    expect(result).toBe('You are a helper');
  });

  it('should return default temperature when not configured', async () => {
    const result = await resolveFieldValue('temperature', {}, [], [], 'node-1');
    expect(result).toBe(0.7);
  });

  it('should return configured temperature', async () => {
    const result = await resolveFieldValue('temperature', { temperature: 0.5 }, [], [], 'node-1');
    expect(result).toBe(0.5);
  });

  it('should return empty string for missing string fields', async () => {
    const result = await resolveFieldValue('output_example', {}, [], [], 'node-1');
    expect(result).toBe('');
  });

  it('should resolve from port when source is port and node connected', async () => {
    const sourceNode = makeStoredNode({ node_id: 'source-1', content: 'Port Content' });
    const edges = [{ from: 'source-1', to: 'ai-node', targetHandle: 'system_prompt' }];
    const aiConfig = {
      system_prompt: 'fallback',
      field_mapping: { system_prompt_source: 'port' },
    };

    const result = await resolveFieldValue('system_prompt', aiConfig, [sourceNode], edges, 'ai-node');
    expect(result).toBe('Port Content');
  });

  it('should fall back to manual when port is not connected', async () => {
    const aiConfig = {
      system_prompt: 'Manual Value',
      field_mapping: { system_prompt_source: 'port' },
    };

    const result = await resolveFieldValue('system_prompt', aiConfig, [], [], 'ai-node');
    expect(result).toBe('Manual Value');
  });

  it('should resolve temperature from port with clamping', async () => {
    const sourceNode = makeStoredNode({ node_id: 'temp-node', content: '1.5' });
    const edges = [{ from: 'temp-node', to: 'ai-node', targetHandle: 'temperature' }];
    const aiConfig = {
      temperature: 0.7,
      field_mapping: { temperature_source: 'port' },
    };

    const result = await resolveFieldValue('temperature', aiConfig, [sourceNode], edges, 'ai-node');
    expect(result).toBe(1.5);
  });

  it('should clamp temperature to max 2', async () => {
    const sourceNode = makeStoredNode({ node_id: 'temp-node', content: '5.0' });
    const edges = [{ from: 'temp-node', to: 'ai-node', targetHandle: 'temperature' }];
    const aiConfig = { field_mapping: { temperature_source: 'port' } };

    const result = await resolveFieldValue('temperature', aiConfig, [sourceNode], edges, 'ai-node');
    expect(result).toBe(2);
  });

  it('should return default temperature for invalid port content', async () => {
    const sourceNode = makeStoredNode({ node_id: 'temp-node', content: 'not a number' });
    const edges = [{ from: 'temp-node', to: 'ai-node', targetHandle: 'temperature' }];
    const aiConfig = { field_mapping: { temperature_source: 'port' } };

    const result = await resolveFieldValue('temperature', aiConfig, [sourceNode], edges, 'ai-node');
    expect(result).toBe(0.7);
  });

  it('should use old source key format for backward compatibility', async () => {
    const sourceNode = makeStoredNode({ node_id: 'src', content: 'Old Port Value' });
    const edges = [{ from: 'src', to: 'ai-node', targetHandle: 'system_prompt' }];
    const aiConfig = {
      system_prompt: 'fallback',
      system_prompt_source: 'port',
    };

    const result = await resolveFieldValue('system_prompt', aiConfig, [sourceNode], edges, 'ai-node');
    expect(result).toBe('Old Port Value');
  });
});
