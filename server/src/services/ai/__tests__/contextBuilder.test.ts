import { describe, it, expect, vi } from 'vitest';

// Mock the utility imports used by contextBuilder
vi.mock('../../../utils/storage', () => ({
  localFileToDataUri: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
}));

vi.mock('../../../utils/assetUrls', () => ({
  resolveAppBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
  resolveAssetAbsolutePath: vi.fn().mockReturnValue(null),
}));

import {
  resolveAssetUrl,
  resolveFileDeliveryFormat,
  buildContextSummary,
  buildFilesSummary,
  summarizeNextNodes,
} from '../contextBuilder';
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

describe('resolveAssetUrl', () => {
  it('should return empty string for non-string input', () => {
    expect(resolveAssetUrl(null as unknown as string)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(resolveAssetUrl('')).toBe('');
    expect(resolveAssetUrl('   ')).toBe('');
  });

  it('should return data URIs as-is', () => {
    const dataUri = 'data:image/png;base64,abc123';
    expect(resolveAssetUrl(dataUri)).toBe(dataUri);
  });

  it('should return HTTP URLs as-is', () => {
    const url = 'https://example.com/image.png';
    expect(resolveAssetUrl(url)).toBe(url);
  });

  it('should prepend base URL for paths starting with /', () => {
    const result = resolveAssetUrl('/api/assets/image.png');
    expect(result).toBe('http://localhost:3000/api/assets/image.png');
  });

  it('should return relative paths as-is', () => {
    expect(resolveAssetUrl('relative/path.png')).toBe('relative/path.png');
  });
});

describe('resolveFileDeliveryFormat', () => {
  it('should return url by default', () => {
    expect(resolveFileDeliveryFormat({})).toBe('url');
  });

  it('should return base64 when configured', () => {
    expect(resolveFileDeliveryFormat({ file_delivery_format: 'base64' })).toBe('base64');
  });

  it('should return url for unknown format', () => {
    expect(resolveFileDeliveryFormat({ file_delivery_format: 'unknown' })).toBe('url');
  });

  it('should handle case insensitivity', () => {
    expect(resolveFileDeliveryFormat({ file_delivery_format: 'BASE64' })).toBe('base64');
  });

  it('should handle non-string values', () => {
    expect(resolveFileDeliveryFormat({ file_delivery_format: 123 })).toBe('url');
  });
});

describe('buildContextSummary', () => {
  it('should return empty string for empty node list', async () => {
    const result = await buildContextSummary([]);
    expect(result).toBe('');
  });

  it('should build simple mode summary by default', async () => {
    const nodes = [makeStoredNode({ title: 'My Node', content: 'Hello world' })];
    const result = await buildContextSummary(nodes);
    expect(result).toContain('My Node');
    expect(result).toContain('Hello world');
  });

  it('should build full_json mode summary', async () => {
    const nodes = [makeStoredNode({ title: 'JSON Node' })];
    const result = await buildContextSummary(nodes, 'full_json');
    expect(result).toContain('JSON Node');
    expect(result).toContain('```json');
  });

  it('should truncate large JSON in full_json mode', async () => {
    const largeContent = 'x'.repeat(60 * 1024);
    const nodes = [makeStoredNode({ content: largeContent })];
    const result = await buildContextSummary(nodes, 'full_json');
    expect(result).toContain('truncated');
  });

  it('should build raw mode summary', async () => {
    const nodes = [
      makeStoredNode({ type: 'text', content: 'First' }),
      makeStoredNode({ node_id: 'node-2', type: 'text', content: 'Second' }),
    ];
    const result = await buildContextSummary(nodes, 'raw');
    expect(result).toBe('First ; Second');
  });

  it('should handle image nodes in raw mode', async () => {
    const nodes = [makeStoredNode({
      type: 'image',
      content: null,
      meta: { image_url: 'https://example.com/img.png' },
    })];
    const result = await buildContextSummary(nodes, 'raw');
    expect(result).toContain('https://example.com/img.png');
  });

  it('should handle video nodes in simple mode', async () => {
    const nodes = [makeStoredNode({
      type: 'video',
      title: 'My Video',
      content: null,
      meta: { video_url: 'https://example.com/video.mp4' },
    })];
    const result = await buildContextSummary(nodes, 'simple');
    expect(result).toContain('Video');
    expect(result).toContain('https://example.com/video.mp4');
  });

  it('should handle code nodes in simple mode', async () => {
    const nodes = [makeStoredNode({
      type: 'code',
      title: 'Script',
      content: 'console.log("hi")',
    })];
    const result = await buildContextSummary(nodes, 'simple');
    expect(result).toContain('Code');
    expect(result).toContain('console.log');
    expect(result).toContain('```');
  });

  it('should truncate long content in simple mode', async () => {
    const longContent = 'a'.repeat(3000);
    const nodes = [makeStoredNode({ content: longContent })];
    const result = await buildContextSummary(nodes, 'simple');
    expect(result.length).toBeLessThan(longContent.length);
  });

  it('should filter empty raw values', async () => {
    const nodes = [
      makeStoredNode({ type: 'text', content: '' }),
      makeStoredNode({ node_id: 'n2', type: 'text', content: 'Valid' }),
    ];
    const result = await buildContextSummary(nodes, 'raw');
    expect(result).toBe('Valid');
  });
});

describe('buildFilesSummary', () => {
  it('should format file entries', () => {
    const files = [
      { name: 'data.json', type: 'application/json', content: '{"key":"value"}' },
    ];
    const result = buildFilesSummary(files);
    expect(result).toContain('File 1: data.json');
    expect(result).toContain('application/json');
    expect(result).toContain('{"key":"value"}');
  });

  it('should truncate long file content', () => {
    const files = [
      { name: 'big.txt', type: 'text/plain', content: 'x'.repeat(5000) },
    ];
    const result = buildFilesSummary(files);
    expect(result).toContain('truncated');
  });

  it('should handle image URL type', () => {
    const files = [
      { name: 'photo.png', type: 'image/url', content: 'https://example.com/photo.png' },
    ];
    const result = buildFilesSummary(files);
    expect(result).toContain('URL: https://example.com/photo.png');
  });

  it('should handle base64 image type', () => {
    const files = [
      { name: 'photo.png', type: 'image/base64', content: 'data:image/png;base64,abc123def' },
    ];
    const result = buildFilesSummary(files);
    expect(result).toContain('Base64 image');
    expect(result).toContain('characters');
  });

  it('should include source node ID', () => {
    const files = [
      { name: 'file.txt', type: 'text/plain', content: 'data', source_node_id: 'node-42' },
    ];
    const result = buildFilesSummary(files);
    expect(result).toContain('node-42');
  });

  it('should show unknown for missing source node', () => {
    const files = [
      { name: 'file.txt', type: 'text/plain', content: 'data' },
    ];
    const result = buildFilesSummary(files);
    expect(result).toContain('unknown');
  });
});

describe('summarizeNextNodes', () => {
  it('should return empty string for empty array', () => {
    expect(summarizeNextNodes([])).toBe('');
  });

  it('should format next node summaries', () => {
    const nodes = [
      { title: 'Parser', type: 'parser', short_description: 'Extracts data' },
      { title: 'AI Node', type: 'ai', short_description: 'Generates text' },
    ];
    const result = summarizeNextNodes(nodes);
    expect(result).toContain('Parser [parser]');
    expect(result).toContain('AI Node [ai]');
    expect(result).toContain('Extracts data');
    expect(result).toContain('Generates text');
  });
});
