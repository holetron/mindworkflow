import type { RawSegmentNode, TextSplitPreviewSegment } from './types';

// ---------------------------------------------------------------------------
// Node-type color mapping
// ---------------------------------------------------------------------------

export function getNodeTypeColor(type: string): string {
  switch (type) {
    case 'input':
      return '#10b981';
    case 'output':
      return '#f59e0b';
    case 'ai':
      return '#8b5cf6';
    case 'ai_improved':
      return '#8b5cf6';
    case 'text':
      return '#64748b';
    case 'file':
      return '#f59e0b';
    case 'image':
      return '#ec4899';
    case 'video':
      return '#06b6d4';
    case 'audio':
      return '#84cc16';
    case 'html':
      return '#f97316';
    case 'transformer':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
}

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

export function splitContentByDelimiter(content: string, delimiter: string): string[] {
  const normalized = normalizeNewlines(content);
  const trimmedDelimiter = delimiter.trim();
  if (!trimmedDelimiter) {
    const single = normalized.trim();
    return single ? [single] : [];
  }
  const pattern = new RegExp(`\\s*${escapeRegExp(trimmedDelimiter)}\\s*`, 'g');
  return normalized
    .split(pattern)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function clampTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 80) {
    return trimmed;
  }
  return `${trimmed.slice(0, 77).trimEnd()}…`;
}

export function deriveFallbackTitle(path: string): string {
  const parts = path
    .split('.')
    .map((segment) => {
      const index = Number.parseInt(segment, 10);
      return Number.isNaN(index) ? segment : index + 1;
    });
  if (parts.length <= 1) {
    return `Segment ${parts[0]}`;
  }
  return `Sub-segment ${parts.join('.')}`;
}

export function extractTitleFromContent(content: string): string | null {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) {
    return null;
  }
  const lines = normalized.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const cleaned = trimmed
      .replace(/^#+\s*/, '')
      .replace(/^\d+[\.\)]\s*/, '')
      .replace(/^[-*•]+\s*/, '')
      .replace(/[`*_]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) {
      return cleaned;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Segment tree helpers
// ---------------------------------------------------------------------------

export function flattenSegments(segments: RawSegmentNode[]): RawSegmentNode[] {
  const result: RawSegmentNode[] = [];
  const traverse = (node: RawSegmentNode) => {
    result.push(node);
    node.children.forEach(traverse);
  };
  segments.forEach(traverse);
  return result;
}

export function buildPreviewTree(
  segments: RawSegmentNode[],
  titleByPath: Map<string, string>,
): TextSplitPreviewSegment[] {
  return segments.map((segment) => ({
    path: segment.path,
    depth: segment.depth,
    order: segment.order,
    title: titleByPath.get(segment.path) ?? deriveFallbackTitle(segment.path),
    content: segment.content,
    children: buildPreviewTree(segment.children, titleByPath),
  }));
}

export function selectRussianPlural(count: number, forms: [string, string, string]): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) {
    return forms[2];
  }
  if (n1 > 1 && n1 < 5) {
    return forms[1];
  }
  if (n1 === 1) {
    return forms[0];
  }
  return forms[2];
}
