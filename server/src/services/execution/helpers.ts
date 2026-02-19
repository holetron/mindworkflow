/**
 * Utility/helper functions for execution service.
 * Extracted from executor.ts as part of ADR-081 refactoring.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { StoredNode } from '../../db';
import type { CreatedNodeSnapshot } from '../transformerService';
import { logger } from '../../lib/logger';

const log = logger.child({ module: 'execution/helpers' });
// ReplicateArtifact type and Replicate-specific helpers are in replicateHelpers.ts

// ============================================================
// Logging
// ============================================================

const DEBUG_LOGGING = process.env.NODE_ENV !== 'production';

export const debugLog = (...args: unknown[]): void => {
  if (DEBUG_LOGGING) {
    log.debug(args.map(String).join(' '));
  }
};

// ============================================================
// Package info
// ============================================================

export const getPackageInfo = (): { name: string; version: string } => {
  try {
    const possiblePaths = [
      path.resolve(__dirname, '../../../package.json'),  // dev mode
      path.resolve(process.cwd(), 'package.json'),       // portable mode
      path.resolve(__dirname, '../../package.json'),      // another case
    ];

    for (const packagePath of possiblePaths) {
      if (fs.existsSync(packagePath)) {
        return JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { name: string; version: string };
      }
    }

    return { name: 'mindworkflow-server', version: '0.1.0' };
  } catch {
    return { name: 'mindworkflow-server', version: '0.1.0' };
  }
};

// ============================================================
// English pluralization
// ============================================================

export function selectRussianPlural(count: number, forms: [string, string, string]): string {
  // Simple English pluralization: forms[0] = singular, forms[1] = plural (2-4), forms[2] = plural (5+)
  // For English we only need singular vs plural
  if (count === 1) {
    return forms[0];
  }
  return forms[1] || forms[2];
}

export function describeArtifactPlural(type: string, count: number): string {
  const dictionary: Record<string, [string, string, string]> = {
    image: ['image', 'images', 'images'],
    video: ['video', 'videos', 'videos'],
    text: ['text', 'texts', 'texts'],
  };
  const forms = dictionary[type] ?? ['node', 'nodes', 'nodes'];
  return selectRussianPlural(count, forms);
}

// ============================================================
// URL / data URI detection
// ============================================================

export function isLikelyUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (isDataUri(trimmed)) {
    return true;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function isDataUri(value: string): boolean {
  return /^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

export function detectAssetKindFromUrl(url: string): 'text' | 'image' | 'video' {
  const lower = url.toLowerCase();
  log.info('[DEBUG] detectAssetKindFromUrl - checking URL %s', lower.slice(0, 150));

  if (isDataUri(lower)) {
    if (/^data:image\//.test(lower)) {
      log.info('[DEBUG] detectAssetKindFromUrl - detected image data URI');
      return 'image';
    }
    if (/^data:video\//.test(lower)) {
      log.info('[DEBUG] detectAssetKindFromUrl - detected video data URI');
      return 'video';
    }
  }
  if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.bmp|\.tiff)(\?.*)?$/.test(lower)) {
    log.info('[DEBUG] detectAssetKindFromUrl - detected image by extension');
    return 'image';
  }
  if (/(\.mp4|\.mov|\.webm|\.mkv|\.avi|\.mpe?g)(\?.*)?$/.test(lower)) {
    log.info('[DEBUG] detectAssetKindFromUrl - detected video by extension');
    return 'video';
  }
  if (/\bimage\b/.test(lower)) {
    log.info('[DEBUG] detectAssetKindFromUrl - detected image by keyword');
    return 'image';
  }
  if (/\bvideo\b/.test(lower)) {
    log.info('[DEBUG] detectAssetKindFromUrl - detected video by keyword');
    return 'video';
  }
  log.info('[DEBUG] detectAssetKindFromUrl - defaulting to text');
  return 'text';
}

// ============================================================
// String picking from record
// ============================================================

export function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

// ============================================================
// Meta normalization & sanitization
// ============================================================

export function normalizeMetaRecord(meta: unknown): Record<string, unknown> {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) };
  }
  return {};
}

export function sanitizeMetaSnapshot(meta: Record<string, unknown>): Record<string, unknown> {
  const allowed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed.length > 2048) {
        if (isDataUri(trimmed)) {
          continue;
        }
        allowed[key] = `${trimmed.slice(0, 200)}\u2026`;
      } else {
        allowed[key] = trimmed;
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      allowed[key] = value;
    }
  }
  return allowed;
}

// ============================================================
// Short description builder
// ============================================================

export function buildShortDescription(node?: StoredNode): string {
  if (!node) return 'No data';
  const base = node.meta?.short_description ?? node.content ?? node.title;
  return String(base ?? node.title).substring(0, 200);
}

// ============================================================
// Context depth normalization
// ============================================================

export function normalizeContextDepthValue(raw: unknown, fallback: number): number {
  const maxSupportedDepth = 10;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(maxSupportedDepth, Math.trunc(raw)));
  }
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(maxSupportedDepth, Math.trunc(parsed)));
    }
  }
  return Math.max(0, Math.min(maxSupportedDepth, Math.trunc(fallback)));
}

// ============================================================
// Node formatting for context
// ============================================================

export function formatNodeForContext(
  node: StoredNode,
  mode: 'simple' | 'full_json',
): string {
  const MAX_JSON_SIZE = 50 * 1024; // 50KB limit for full_json mode

  if (mode === 'full_json') {
    const fullJson = JSON.stringify(node, null, 2);

    if (fullJson.length > MAX_JSON_SIZE) {
      const truncated = fullJson.substring(0, MAX_JSON_SIZE);
      return truncated + '\n\n[...truncated - node JSON exceeds 50KB]';
    }

    return fullJson;
  }

  // Simple mode - format based on node type
  const parts: string[] = [];
  parts.push(`Context from "${node.title || node.node_id}":`);

  switch (node.type) {
  case 'text': {
    if (node.content) {
      parts.push(node.content);
    }
    break;
  }

  case 'image': {
    const meta = (node.meta ?? {}) as Record<string, unknown>;
    const imageUrl = meta?.image_url || meta?.original_image;
    parts.push(`Image: ${node.title || 'Untitled'}`);
    if (imageUrl && typeof imageUrl === 'string') {
      parts.push(`URL: ${imageUrl}`);
    }
    break;
  }

  case 'video': {
    const meta = (node.meta ?? {}) as Record<string, unknown>;
    const videoUrl = meta?.video_url;
    parts.push(`Video: ${node.title || 'Untitled'}`);
    if (videoUrl && typeof videoUrl === 'string') {
      parts.push(`URL: ${videoUrl}`);
    }
    break;
  }

  case 'pdf':
  case 'file': {
    const meta = (node.meta ?? {}) as Record<string, unknown>;
    const fileUrl = meta?.file_url || meta?.pdf_url;
    parts.push(`File: ${node.title || 'Untitled'}`);
    if (fileUrl && typeof fileUrl === 'string') {
      parts.push(`URL: ${fileUrl}`);
    }
    if (node.content) {
      parts.push(`Content: ${node.content}`);
    }
    break;
  }

  case 'code': {
    parts.push(`Code: ${node.title || 'Untitled'}`);
    if (node.content) {
      parts.push('```');
      parts.push(node.content);
      parts.push('```');
    }
    break;
  }

  case 'ai': {
    parts.push(`AI Node: ${node.title || 'Untitled'}`);
    if (node.content) {
      parts.push(node.content);
    }
    break;
  }

  default: {
    if (node.content) {
      parts.push(node.content);
    } else {
      const meta = (node.meta ?? {}) as Record<string, unknown>;
      if (meta && Object.keys(meta).length > 0) {
        parts.push(`Type: ${node.type}`);
        parts.push(`Meta: ${JSON.stringify(meta, null, 2)}`);
      }
    }
    break;
  }
  }

  return parts.join('\n');
}

// ============================================================
// Localhost URL conversion
// ============================================================

export async function convertUrlToDataUriIfNeeded(url: string): Promise<string> {
  // Import dynamically to avoid circular dependency issues at module load time
  const { localFileToDataUri } = await import('../../utils/storage');

  try {
    if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
      return url;
    }

    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    const uploadsMatch = pathname.match(/\/uploads\/(.+)/);
    if (!uploadsMatch) {
      log.warn(`[convertUrlToDataUriIfNeeded] Cannot parse uploads path from: ${url}`);
      return url;
    }

    const relativePath = uploadsMatch[1];
    const PROJECTS_ROOT = path.resolve(process.cwd(), 'projects');
    const absolutePath = path.join(PROJECTS_ROOT, relativePath);

    log.info(`[convertUrlToDataUriIfNeeded] Converting localhost URL to data URI: ${url}`);
    log.info(`[convertUrlToDataUriIfNeeded] Absolute path: ${absolutePath}`);

    const dataUri = await localFileToDataUri(absolutePath);
    log.info(`[convertUrlToDataUriIfNeeded] Converted to data URI (${dataUri.length} chars)`);

    return dataUri;
  } catch (error) {
    log.error({ err: error }, '`[convertUrlToDataUriIfNeeded] Failed to convert URL:`');
    return url;
  }
}

// ============================================================
// Extract node meta snapshot (for Replicate artifacts)
// ============================================================

export function extractNodeMetaSnapshot(
  meta: Record<string, unknown>,
  artifactKind: 'text' | 'image' | 'video',
  rawValue?: string,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  const sourceKeys = [
    'source_provider',
    'source_prediction_id',
    'source_prediction_url',
    'source_node_id',
    'source_node_title',
    'asset_index',
    'artifact_value_preview',
    'source_asset_signature',
    'display_mode',
    'view_mode',
    'image_output_mode',
  ];
  for (const key of sourceKeys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) {
      snapshot[key] = key.includes('url') && !isLikelyUrl(value) && !isDataUri(value) ? undefined : value.trim();
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      snapshot[key] = value;
    }
  }

  const linkKeys =
    artifactKind === 'image'
      ? [
        'image_url',
        'image_original',
        'original_image',
        'image_edited',
        'edited_image',
        'image_crop',
        'crop_image',
        'annotated_image',
      ]
      : artifactKind === 'video'
        ? ['video_url']
        : ['text_preview'];
  for (const key of linkKeys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) {
      if (isLikelyUrl(value) || isDataUri(value)) {
        snapshot[key] = value.trim();
      } else if (key === 'text_preview') {
        snapshot[key] = value.slice(0, 280);
      }
    }
  }

  if (!snapshot.artifact_value_preview && typeof rawValue === 'string' && rawValue.trim()) {
    snapshot.artifact_value_preview = rawValue.trim().slice(0, 280);
  }

  return sanitizeMetaSnapshot(snapshot);
}

// ============================================================
// UI position extraction
// ============================================================

export function safeExtractUiPosition(meta: Record<string, unknown>): { x: number; y: number } | null {
  const raw = meta.ui_position;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const x = Number((raw as Record<string, unknown>).x);
    const y = Number((raw as Record<string, unknown>).y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x: Math.round(x), y: Math.round(y) };
    }
  }
  return null;
}

// ============================================================
// Pick primary link from snapshot
// ============================================================

export function pickPrimaryLinkFromSnapshot(snapshot?: CreatedNodeSnapshot): string | undefined {
  if (!snapshot?.meta) {
    return undefined;
  }
  const candidates = [
    'image_url',
    'image_original',
    'original_image',
    'image_edited',
    'edited_image',
    'image_crop',
    'crop_image',
    'annotated_image',
    'video_url',
    'text_preview',
  ];
  for (const key of candidates) {
    const value = snapshot.meta[key];
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      if (key === 'text_preview') {
        continue;
      }
      if (isLikelyUrl(trimmed) || isDataUri(trimmed)) {
        return trimmed;
      }
    }
  }
  return undefined;
}

// ============================================================
// Derive Replicate asset position
// ============================================================

export function deriveReplicateAssetPosition(
  sourceNode: StoredNode,
  index: number,
): { x: number; y: number } {
  if (sourceNode.type === 'folder') {
    log.info('[DEBUG] deriveReplicateAssetPosition: sourceNode is folder, returning (0, 0)');
    return { x: 0, y: 0 };
  }

  const bbox = sourceNode.ui?.bbox;
  const baseX = bbox ? bbox.x2 : 0;
  const baseY = bbox ? bbox.y1 : 0;
  const spacingY = 220;
  return {
    x: Math.round(baseX + 200),
    y: Math.round(baseY + index * spacingY),
  };
}

