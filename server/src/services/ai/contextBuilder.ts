/**
 * Context building logic for AI calls.
 * Collects upstream node data, formats it according to the chosen mode,
 * and prepares the context string that gets injected into the prompt.
 *
 * ADR-081 Phase 2 — extracted from AiService.
 */

import type { StoredNode } from '../../db';
import { localFileToDataUri } from '../../utils/storage';
import { resolveAppBaseUrl, resolveAssetAbsolutePath } from '../../utils/assetUrls';

import { logger } from '../../lib/logger';

const log = logger.child({ module: 'ai/contextBuilder' });
// ---------------------------------------------------------------------------
// Debug logging helper (kept for backward compat; will be replaced by pino)
// ---------------------------------------------------------------------------

const DEBUG_LOGGING = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) log.debug(args.map(String).join(' '));
};

// ---------------------------------------------------------------------------
// Asset URL resolution helpers
// ---------------------------------------------------------------------------

export function resolveAssetUrl(raw: string): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(data:|https?:\/\/)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    const baseUrl = resolveAppBaseUrl().replace(/\/+$/, '');
    return `${baseUrl}${trimmed}`;
  }
  return trimmed;
}

export function resolveFileDeliveryFormat(
  aiConfig: Record<string, unknown>,
): 'url' | 'base64' {
  const raw =
    typeof aiConfig.file_delivery_format === 'string'
      ? aiConfig.file_delivery_format.trim().toLowerCase()
      : '';
  return raw === 'base64' ? 'base64' : 'url';
}

export async function prepareAssetForDelivery(
  value: string,
  mode: 'url' | 'base64',
  assetKind: 'image' | 'video' | 'file' = 'image',
): Promise<string> {
  if (typeof value !== 'string') return value as unknown as string;
  const trimmed = value.trim();
  if (!trimmed || mode !== 'base64' || assetKind !== 'image') return trimmed;
  if (trimmed.startsWith('data:')) return trimmed;

  const absolutePath =
    resolveAssetAbsolutePath(trimmed) ??
    resolveAssetAbsolutePath(resolveAssetUrl(trimmed));
  if (!absolutePath) return trimmed;

  try {
    const dataUri = await localFileToDataUri(absolutePath);
    log.info('[prepareAssetForDelivery] Converted internal asset to data URI');
    return dataUri;
  } catch (error) {
    log.error({ err: error }, '[prepareAssetForDelivery] Failed to convert asset to data URI');
    return trimmed;
  }
}

// ---------------------------------------------------------------------------
// Context summary builder
// ---------------------------------------------------------------------------

export async function buildContextSummary(
  nodes: StoredNode[],
  mode: 'simple' | 'full_json' | 'raw' = 'simple',
  fileMode: 'url' | 'base64' = 'url',
): Promise<string> {
  if (nodes.length === 0) return '';

  if (mode === 'full_json') {
    return nodes
      .map((node, index) => {
        const MAX_JSON_SIZE = 50 * 1024;
        const fullJson = JSON.stringify(node, null, 2);
        if (fullJson.length > MAX_JSON_SIZE) {
          const truncated = fullJson.substring(0, MAX_JSON_SIZE);
          return `## Node ${index + 1}: ${node.title || node.node_id}\n\`\`\`json\n${truncated}\n\`\`\`\n[...truncated - node JSON exceeds 50KB]`;
        }
        return `## Node ${index + 1}: ${node.title || node.node_id}\n\`\`\`json\n${fullJson}\n\`\`\``;
      })
      .join('\n\n');
  }

  if (mode === 'raw') {
    const rawValues = await Promise.all(
      nodes.map(async (node) => {
        switch (node.type) {
          case 'text':
            return node.content ? node.content.trim() : '';
          case 'image': {
            const meta = (node.meta ?? {}) as Record<string, unknown>;
            const imageUrl = meta?.image_url || meta?.original_image;
            if (imageUrl && typeof imageUrl === 'string') {
              return await prepareAssetForDelivery(imageUrl, fileMode, 'image');
            }
            return '';
          }
          case 'video': {
            const meta = (node.meta ?? {}) as Record<string, unknown>;
            const videoUrl = meta?.video_url;
            return videoUrl && typeof videoUrl === 'string' ? videoUrl.trim() : '';
          }
          case 'pdf':
          case 'file': {
            const meta = (node.meta ?? {}) as Record<string, unknown>;
            const fileUrl = meta?.file_url || meta?.pdf_url;
            if (fileUrl && typeof fileUrl === 'string') return fileUrl.trim();
            return node.content ? node.content.trim() : '';
          }
          case 'code':
          case 'ai':
          case 'ai_improved':
          default:
            return node.content ? node.content.trim() : '';
        }
      }),
    );
    return rawValues.filter((v) => v.length > 0).join(' ; ');
  }

  // Simple mode
  const formattedNodes = await Promise.all(
    nodes.map(async (node) => {
      const parts: string[] = [];
      parts.push(`• **${node.title || node.node_id}** (${node.type})`);

      switch (node.type) {
        case 'text':
          if (node.content) parts.push(node.content.slice(0, 2000));
          break;
        case 'image': {
          const meta = (node.meta ?? {}) as Record<string, unknown>;
          const imageUrl = meta?.image_url || meta?.original_image;
          parts.push(`Image: ${node.title || 'Untitled'}`);
          if (imageUrl && typeof imageUrl === 'string') {
            const finalUrl = await prepareAssetForDelivery(imageUrl, fileMode, 'image');
            parts.push(`URL: ${finalUrl}`);
          }
          break;
        }
        case 'video': {
          const meta = (node.meta ?? {}) as Record<string, unknown>;
          const videoUrl = meta?.video_url;
          parts.push(`Video: ${node.title || 'Untitled'}`);
          if (videoUrl && typeof videoUrl === 'string') parts.push(`URL: ${videoUrl}`);
          break;
        }
        case 'pdf':
        case 'file': {
          const meta = (node.meta ?? {}) as Record<string, unknown>;
          const fileUrl = meta?.file_url || meta?.pdf_url;
          parts.push(`File: ${node.title || 'Untitled'}`);
          if (fileUrl && typeof fileUrl === 'string') parts.push(`URL: ${fileUrl}`);
          if (node.content) parts.push(`Content: ${node.content.slice(0, 2000)}`);
          break;
        }
        case 'code':
          parts.push(`Code: ${node.title || 'Untitled'}`);
          if (node.content) {
            parts.push('```');
            parts.push(node.content.slice(0, 2000));
            parts.push('```');
          }
          break;
        case 'ai':
        case 'ai_improved':
          parts.push(`AI Node: ${node.title || 'Untitled'}`);
          if (node.content) parts.push(node.content.slice(0, 2000));
          break;
        default:
          if (node.content) parts.push(node.content.slice(0, 2000));
          break;
      }
      return parts.join('\n');
    }),
  );

  return formattedNodes.join('\n\n');
}

// ---------------------------------------------------------------------------
// File summary for attachments
// ---------------------------------------------------------------------------

export function buildFilesSummary(
  files: Array<{ name: string; type: string; content: string; source_node_id?: string }>,
): string {
  return files
    .map((file, index) => {
      let content = file.content;
      if (content.length > 3000) content = content.substring(0, 3000) + '... (truncated)';
      if (file.type.startsWith('image/')) {
        if (file.type === 'image/url') content = `URL: ${content}`;
        else if (file.type === 'image/base64')
          content = `[Base64 image, size: ${content.length} characters]`;
      }
      return (
        `## File ${index + 1}: ${file.name}\n` +
        `**Type:** ${file.type}\n` +
        `**Source:** ${file.source_node_id || 'unknown'}\n` +
        `**Content:**\n\`\`\`\n${content}\n\`\`\``
      );
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Next-node summary
// ---------------------------------------------------------------------------

export function summarizeNextNodes(
  nodes: Array<{ title: string; type: string; short_description: string }>,
): string {
  if (nodes.length === 0) return '';
  return nodes.map((n) => `• ${n.title} [${n.type}] — ${n.short_description}`).join('\n');
}
