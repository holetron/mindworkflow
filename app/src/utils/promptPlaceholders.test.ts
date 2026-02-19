import { describe, it, expect } from 'vitest';
import {
  PLACEHOLDER_REGEX,
  extractPlaceholderInfo,
  resolvePlaceholderReference,
  buildUserPromptTemplate,
  type PlaceholderInfo,
} from './promptPlaceholders';
import type { FlowNode } from '../state/api';

function makeNode(overrides: Partial<FlowNode> & { node_id: string }): FlowNode {
  return {
    type: 'text',
    title: overrides.title ?? 'Test Node',
    content: overrides.content ?? '',
    ui: { color: '#6B7280', bbox: { x1: 0, y1: 0, x2: 450, y2: 200 } },
    ai_visible: true,
    connections: { incoming: [], outgoing: [] },
    ...overrides,
  };
}

describe('PLACEHOLDER_REGEX', () => {
  it('matches simple placeholder', () => {
    const matches = [...'<input>'.matchAll(new RegExp(PLACEHOLDER_REGEX.source, 'g'))];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('input');
  });

  it('matches placeholder with reference', () => {
    const text = '<context> = "n1_text.content"';
    const matches = [...text.matchAll(new RegExp(PLACEHOLDER_REGEX.source, 'g'))];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('context');
    expect(matches[0][2]).toBe('n1_text.content');
  });
});

describe('resolvePlaceholderReference', () => {
  const nodeA = makeNode({ node_id: 'n1_text', content: 'Hello world', title: 'First Node', description: 'A description' });
  const nodeB = makeNode({ node_id: 'n2_data', content: 'Data content', meta: { output: 'result data' } });
  const nodes = [nodeA, nodeB];

  it('resolves via underscore splitting when node_id contains underscores', () => {
    // 'n1_text' is split by underscore: nodeId='n1', pathParts=['text']
    // 'text' normalizes to 'content' via normalizeFieldName
    // So it looks up n1's content — but there's no node with id 'n1'
    // The node has id 'n1_text', so underscore splitting doesn't find it
    const value = resolvePlaceholderReference('n1_text', nodes, nodeA);
    expect(value).toBeUndefined();
  });

  it('resolves content via dot notation for compound node ids', () => {
    const value = resolvePlaceholderReference('n1_text.content', nodes, nodeA);
    expect(value).toBe('Hello world');
  });

  it('resolves node.content with dot notation', () => {
    const value = resolvePlaceholderReference('n1_text.content', nodes, nodeA);
    expect(value).toBe('Hello world');
  });

  it('resolves node.title', () => {
    const value = resolvePlaceholderReference('n1_text.title', nodes, nodeA);
    expect(value).toBe('First Node');
  });

  it('resolves node.description', () => {
    const value = resolvePlaceholderReference('n1_text.description', nodes, nodeA);
    expect(value).toBe('A description');
  });

  it('resolves meta.output via normalizeFieldName', () => {
    const value = resolvePlaceholderReference('n2_data.output', nodes, nodeA);
    expect(value).toBe('result data');
  });

  it('returns undefined for non-existent node', () => {
    const value = resolvePlaceholderReference('nonexistent', nodes, nodeA);
    expect(value).toBeUndefined();
  });

  it('resolves "self" reference', () => {
    const value = resolvePlaceholderReference('self.title', nodes, nodeA);
    expect(value).toBe('First Node');
  });

  it('resolves "current" reference', () => {
    const value = resolvePlaceholderReference('current.content', nodes, nodeA);
    expect(value).toBe('Hello world');
  });

  it('returns undefined for empty reference', () => {
    const value = resolvePlaceholderReference('', nodes, nodeA);
    expect(value).toBeUndefined();
  });
});

describe('extractPlaceholderInfo', () => {
  const node = makeNode({ node_id: 'n1_text', content: 'Test content' });

  it('extracts placeholders from system prompt', () => {
    const prompt = 'Use <context> and <input> for processing';
    const result = extractPlaceholderInfo(prompt, [node], node);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toContain('context');
    expect(result.map((p) => p.name)).toContain('input');
  });

  it('extracts placeholder with reference', () => {
    const prompt = '<context> = "n1_text.content"';
    const result = extractPlaceholderInfo(prompt, [node], node);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('context');
    expect(result[0].reference).toBe('n1_text.content');
    expect(result[0].resolvedValue).toBe('Test content');
  });

  it('returns empty array for prompt without placeholders', () => {
    const result = extractPlaceholderInfo('no placeholders here', [node], node);
    expect(result).toEqual([]);
  });

  it('deduplicates placeholders by name', () => {
    const prompt = '<input> first and <input> second';
    const result = extractPlaceholderInfo(prompt, [node], node);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('input');
  });
});

describe('buildUserPromptTemplate', () => {
  it('returns just the base prompt line when there are no placeholders', () => {
    const result = buildUserPromptTemplate([]);
    expect(result).toContain('\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u043F\u0440\u043E\u043C\u043F\u0442:');
  });

  it('includes placeholder values in output', () => {
    const placeholders: PlaceholderInfo[] = [
      { name: 'input', resolvedValue: 'hello' },
      { name: 'context', reference: 'n1_text', resolvedValue: 'world' },
    ];
    const result = buildUserPromptTemplate(placeholders);
    expect(result).toContain('"input"');
    expect(result).toContain('"hello"');
    expect(result).toContain('"context"');
  });

  it('shows source note for placeholders with reference', () => {
    const placeholders: PlaceholderInfo[] = [
      { name: 'ctx', reference: 'n1_text.content', resolvedValue: 'data' },
    ];
    const result = buildUserPromptTemplate(placeholders);
    expect(result).toContain('n1_text.content');
  });

  it('marks unresolved references', () => {
    const placeholders: PlaceholderInfo[] = [
      { name: 'missing', reference: 'nonexistent' },
    ];
    const result = buildUserPromptTemplate(placeholders);
    expect(result).toContain('\u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D');
  });
});
