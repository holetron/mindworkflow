import { describe, it, expect } from 'vitest';
import {
  parseRunLogPayload,
  extractReplicateInfo,
  collectNodeLinks,
  formatReplicateStatus,
  formatRunTimestamp,
  safeStringify,
  buildPreviewItems,
  createReplicateHeaderData,
  type CreatedNodeLogEntry,
} from './runLogHelpers';

describe('parseRunLogPayload', () => {
  it('returns empty result for null input', () => {
    const result = parseRunLogPayload(null);
    expect(result.metadata).toBeNull();
    expect(result.createdNodes).toEqual([]);
    expect(result.status).toBeNull();
  });

  it('returns empty result for undefined input', () => {
    const result = parseRunLogPayload(undefined);
    expect(result.createdNodes).toEqual([]);
  });

  it('parses a valid run log with created_nodes', () => {
    const logs = {
      status: 'succeeded',
      provider: 'replicate',
      metadata: { replicate_model: 'stable-diffusion' },
      created_nodes: [
        {
          node_id: 'n1_img',
          type: 'image',
          title: 'Generated Image',
          meta: { image_url: 'https://example.com/img.png' },
        },
      ],
    };
    const result = parseRunLogPayload(logs);
    expect(result.status).toBe('succeeded');
    expect(result.provider).toBe('replicate');
    expect(result.createdNodes).toHaveLength(1);
    expect(result.createdNodes[0].node_id).toBe('n1_img');
    expect(result.createdNodes[0].links).toHaveLength(1);
  });

  it('parses array input', () => {
    const logs = [
      { status: 'completed', metadata: { key: 'value' } },
    ];
    const result = parseRunLogPayload(logs);
    expect(result.status).toBe('completed');
  });

  it('skips invalid created_nodes entries', () => {
    const logs = {
      created_nodes: [
        { node_id: 'valid', type: 'text', title: 'Valid' },
        { node_id: 'missing_type', title: 'Bad' },
        null,
        'string',
      ],
    };
    const result = parseRunLogPayload(logs);
    expect(result.createdNodes).toHaveLength(1);
    expect(result.createdNodes[0].node_id).toBe('valid');
  });
});

describe('extractReplicateInfo', () => {
  it('returns empty object for null metadata', () => {
    expect(extractReplicateInfo(null)).toEqual({});
  });

  it('returns empty object for undefined metadata', () => {
    expect(extractReplicateInfo(undefined)).toEqual({});
  });

  it('extracts all replicate fields', () => {
    const metadata = {
      replicate_model: 'sdxl',
      replicate_version: 'v1',
      replicate_status: 'succeeded',
      replicate_prediction_id: 'pred-123',
      replicate_prediction_url: 'https://replicate.com/p/123',
      replicate_prediction_api_url: 'https://api.replicate.com/v1/predictions/123',
      replicate_output: 'https://example.com/output.png',
      replicate_last_run_at: '2024-01-01T12:00:00Z',
      provider: 'replicate',
    };
    const info = extractReplicateInfo(metadata);
    expect(info.model).toBe('sdxl');
    expect(info.version).toBe('v1');
    expect(info.status).toBe('succeeded');
    expect(info.predictionId).toBe('pred-123');
    expect(info.predictionUrl).toBe('https://replicate.com/p/123');
    expect(info.outputUrl).toBe('https://example.com/output.png');
    expect(info.provider).toBe('replicate');
  });

  it('ignores empty string values', () => {
    const metadata = {
      replicate_model: '',
      replicate_version: '   ',
    };
    const info = extractReplicateInfo(metadata);
    expect(info.model).toBeUndefined();
    expect(info.version).toBeUndefined();
  });
});

describe('collectNodeLinks', () => {
  it('returns empty array for undefined meta', () => {
    expect(collectNodeLinks(undefined)).toEqual([]);
  });

  it('collects known link keys that are valid URLs', () => {
    const meta = {
      image_url: 'https://example.com/img.png',
      video_url: 'https://example.com/vid.mp4',
      random_key: 'https://not-collected.com',
    };
    const links = collectNodeLinks(meta);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ label: 'image_url', url: 'https://example.com/img.png' });
    expect(links[1]).toEqual({ label: 'video_url', url: 'https://example.com/vid.mp4' });
  });

  it('accepts data URIs for images', () => {
    const meta = {
      image_url: 'data:image/png;base64,abc123',
    };
    const links = collectNodeLinks(meta);
    expect(links).toHaveLength(1);
  });

  it('skips non-string and empty values', () => {
    const meta = {
      image_url: 42 as unknown as string,
      video_url: '',
      audio_url: null as unknown as string,
    };
    const links = collectNodeLinks(meta);
    expect(links).toEqual([]);
  });
});

describe('formatReplicateStatus', () => {
  it('formats succeeded status', () => {
    const result = formatReplicateStatus('succeeded');
    expect(result.label).toBe('\u0423\u0441\u043F\u0435\u0445');
    expect(result.className).toContain('green');
  });

  it('formats failed status', () => {
    const result = formatReplicateStatus('failed');
    expect(result.label).toBe('\u041E\u0448\u0438\u0431\u043A\u0430');
    expect(result.className).toContain('red');
  });

  it('formats null/undefined status as unknown', () => {
    const result = formatReplicateStatus(null);
    expect(result.label).toBe('\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E');
    expect(result.className).toContain('slate');
  });

  it('returns the status string for unrecognized values', () => {
    const result = formatReplicateStatus('processing');
    expect(result.label).toBe('processing');
    expect(result.className).toContain('yellow');
  });
});

describe('formatRunTimestamp', () => {
  it('returns dash for null input', () => {
    expect(formatRunTimestamp(null)).toBe('\u2014');
  });

  it('returns dash for undefined input', () => {
    expect(formatRunTimestamp(undefined)).toBe('\u2014');
  });

  it('formats a valid ISO timestamp', () => {
    const result = formatRunTimestamp('2024-06-15T14:30:00Z');
    // Should produce a locale-formatted string (ru-RU)
    expect(result).toBeTruthy();
    expect(result).not.toBe('\u2014');
  });

  it('returns raw string for invalid date', () => {
    expect(formatRunTimestamp('not-a-date')).toBe('not-a-date');
  });
});

describe('safeStringify', () => {
  it('stringifies objects', () => {
    expect(safeStringify({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('stringifies strings', () => {
    expect(safeStringify('hello')).toBe('"hello"');
  });

  it('handles null', () => {
    expect(safeStringify(null)).toBe('null');
  });

  it('handles undefined', () => {
    expect(safeStringify(undefined)).toBe('undefined');
  });

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = safeStringify(obj);
    expect(typeof result).toBe('string');
  });
});

describe('buildPreviewItems', () => {
  it('returns empty array for empty nodes', () => {
    expect(buildPreviewItems([])).toEqual([]);
  });

  it('builds preview items from created nodes', () => {
    const nodes: CreatedNodeLogEntry[] = [
      {
        node_id: 'n1',
        type: 'image',
        title: 'My Image',
        links: [{ label: 'image_url', url: 'https://example.com/img.png' }],
      },
    ];
    const items = buildPreviewItems(nodes);
    expect(items).toHaveLength(1);
    expect(items[0].href).toBe('https://example.com/img.png');
    expect(items[0].text).toBe('My Image');
  });

  it('adds output URL if not already present in items', () => {
    const nodes: CreatedNodeLogEntry[] = [
      { node_id: 'n1', type: 'text', title: 'Text Node', links: [] },
    ];
    const items = buildPreviewItems(nodes, 'https://example.com/output.png');
    expect(items).toHaveLength(2);
    expect(items[1].href).toBe('https://example.com/output.png');
    expect(items[1].text).toBe('Output');
  });

  it('does not duplicate output URL if already present', () => {
    const url = 'https://example.com/img.png';
    const nodes: CreatedNodeLogEntry[] = [
      {
        node_id: 'n1',
        type: 'image',
        title: 'Image',
        links: [{ label: 'image_url', url }],
      },
    ];
    const items = buildPreviewItems(nodes, url);
    expect(items).toHaveLength(1);
  });
});

describe('createReplicateHeaderData', () => {
  it('returns undefined when no info is available', () => {
    const result = createReplicateHeaderData(null, {});
    expect(result).toBeUndefined();
  });

  it('creates header data when model info exists', () => {
    const info = {
      model: 'sdxl',
      status: 'succeeded',
      predictionId: 'pred-1',
    };
    const result = createReplicateHeaderData('succeeded', info);
    expect(result).toBeDefined();
    expect(result!.model).toBe('sdxl');
    expect(result!.badgeLabel).toBe('\u0423\u0441\u043F\u0435\u0445');
    expect(result!.badgeClassName).toContain('green');
  });
});
