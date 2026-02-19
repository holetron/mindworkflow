import type { FlowNode } from '../state/api';

export interface PlaceholderInfo {
  name: string;
  reference?: string;
  resolvedValue?: string;
}

export const PLACEHOLDER_REGEX = /<([^<>]+)>(?:\s*=\s*"([^"]+)")?/g;

function getNestedValue(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
}

function normalizeFieldName(field: string): string {
  const normalized = field.toLowerCase();
  if (['text', 'content', 'body', 'value'].includes(normalized)) {
    return 'content';
  }
  if (['title', 'name', 'heading'].includes(normalized)) {
    return 'title';
  }
  if (['description', 'desc', 'summary'].includes(normalized)) {
    return 'description';
  }
  if (normalized === 'output' || normalized === 'result') {
    return 'meta.output';
  }
  return normalized;
}

export function resolvePlaceholderReference(reference: string, nodes: FlowNode[], currentNode: FlowNode): string | undefined {
  const cleaned = reference.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) {
    return undefined;
  }

  const dotParts = cleaned.split('.');
  const underscoreParts = cleaned.split('_');

  let nodeId = cleaned;
  let pathParts: string[] = [];

  if (dotParts.length > 1) {
    nodeId = dotParts[0];
    pathParts = dotParts.slice(1);
  } else if (underscoreParts.length > 1) {
    nodeId = underscoreParts[0];
    pathParts = underscoreParts.slice(1);
  }

  const nodePool = [...nodes];
  if (!nodePool.some((nodeItem) => nodeItem.node_id === currentNode.node_id)) {
    nodePool.push(currentNode);
  }

  let targetNode: FlowNode | undefined;
  if (nodeId === 'self' || nodeId === 'current') {
    targetNode = currentNode;
  } else {
    targetNode = nodePool.find((nodeItem) => nodeItem.node_id === nodeId);
  }

  if (!targetNode) {
    return undefined;
  }

  const firstSegmentRaw = pathParts[0] ?? 'content';
  const normalizedFirst = normalizeFieldName(firstSegmentRaw);
  const remaining = pathParts.slice(1);

  let value: unknown;

  if (normalizedFirst.startsWith('meta.')) {
    const metaPath = normalizedFirst.split('.').slice(1);
    value = getNestedValue(targetNode.meta, [...metaPath, ...remaining]);
  } else {
    switch (normalizedFirst) {
      case 'content':
        value = targetNode.content;
        break;
      case 'title':
        value = targetNode.title;
        break;
      case 'description':
        value = targetNode.description;
        break;
      case 'meta':
        value = getNestedValue(targetNode.meta, remaining);
        break;
      default: {
        const metaValue = getNestedValue(targetNode.meta, [normalizedFirst, ...remaining]);
        value = metaValue ?? (targetNode as Record<string, unknown>)[normalizedFirst];
        break;
      }
    }
  }

  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function extractPlaceholderInfo(systemPrompt: string, nodes: FlowNode[], currentNode: FlowNode): PlaceholderInfo[] {
  const placeholders = new Map<string, PlaceholderInfo>();
  let match: RegExpExecArray | null;

  const nodePool = nodes.length > 0 ? nodes : [currentNode];

  while ((match = PLACEHOLDER_REGEX.exec(systemPrompt)) !== null) {
    const rawName = match[1]?.trim();
    if (!rawName) {
      continue;
    }

    const rawReference = match[2]?.trim();
    const cleanedReference = rawReference ? rawReference.replace(/^["']|["']$/g, '') : undefined;

    const info: PlaceholderInfo = placeholders.get(rawName) ?? { name: rawName };
    if (cleanedReference) {
      info.reference = cleanedReference;
      info.resolvedValue = resolvePlaceholderReference(cleanedReference, nodePool, currentNode);
    }
    placeholders.set(rawName, info);
  }

  return Array.from(placeholders.values());
}

export function buildUserPromptTemplate(placeholders: PlaceholderInfo[]): string {
  const lines: string[] = [];

  if (placeholders.length > 0) {
    lines.push('Fill in the values (replace the text in quotes below):');
    for (const placeholder of placeholders) {
      const serializedValue = JSON.stringify(placeholder.resolvedValue ?? '');
      const sourceNote = placeholder.reference
        ? `  (source: ${placeholder.reference}${placeholder.resolvedValue === undefined ? ' — not found' : ''})`
        : '';
      lines.push(`${JSON.stringify(placeholder.name)}: ${serializedValue}${sourceNote}`);
    }
    lines.push('');
  }

  lines.push('Main prompt:');
  return lines.join('\n');
}

