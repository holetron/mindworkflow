/**
 * Replicate provider utilities: constants, helpers, input sanitization,
 * and image input resolution.
 *
 * ADR-081 Phase 2 — extracted from replicate.ts to keep files under 500 lines.
 */

import { resolveAssetUrl, prepareAssetForDelivery } from '../contextBuilder';
import type { AiContext } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_REPLICATE_BASE_URL = 'https://api.replicate.com';

const REPLICATE_PLACEHOLDER_TOKENS = [
  'r8_dev_placeholder_token',
  'replicate_placeholder_token',
  'replicate_token_placeholder',
  'replicate_api_token_placeholder',
].map((v) => v.toLowerCase());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isReplicatePlaceholderToken(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return REPLICATE_PLACEHOLDER_TOKENS.some((p) => normalized.includes(p));
}

export function normalizeReplicateBaseUrl(rawBaseUrl: string | null | undefined): string {
  const fallback = DEFAULT_REPLICATE_BASE_URL;
  if (typeof rawBaseUrl !== 'string' || rawBaseUrl.trim().length === 0) return fallback;
  const trimmed = rawBaseUrl.trim();
  try {
    const parsed = new URL(trimmed, fallback);
    if (!parsed.protocol || !parsed.hostname) return fallback;
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

export function joinReplicateUrl(baseUrl: string, path: string): string {
  const normalized = normalizeReplicateBaseUrl(baseUrl);
  const suffix = path.startsWith('/') ? path.slice(1) : path;
  return `${normalized}/${suffix}`;
}

export function getReplicateHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Token ${apiKey}` };
}

export function getReplicateModelType(
  modelId: string,
): { type: 'text' | 'image' | 'video' | 'audio' | '3d'; emoji: string } {
  const ml = modelId.toLowerCase();
  if (ml.includes('flux') || ml.includes('sdxl') || ml.includes('stable-diffusion') || ml.includes('midjourney') || ml.includes('dall-e') || ml.includes('ideogram') || ml.includes('recraft') || ml.includes('playground') || ml.includes('kandinsky') || ml.includes('banana') || ml.includes('sd-') || ml.includes('imagen') || ml.includes('pixart'))
    return { type: 'image', emoji: '🎨' };
  if (ml.includes('video') || ml.includes('runway') || ml.includes('pika') || ml.includes('gen-2') || ml.includes('gen-3') || ml.includes('animatediff') || ml.includes('svd') || ml.includes('stable-video'))
    return { type: 'video', emoji: '🎬' };
  if (ml.includes('3d') || ml.includes('mesh') || ml.includes('shap-e'))
    return { type: '3d', emoji: '🎲' };
  if (ml.includes('audio') || ml.includes('music') || ml.includes('sound') || ml.includes('whisper') || ml.includes('bark') || ml.includes('musicgen') || ml.includes('audioldm'))
    return { type: 'audio', emoji: '🎵' };
  return { type: 'text', emoji: '📝' };
}

export function looksLikeImageUrl(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('data:')) return true;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].some((ext) =>
    value.toLowerCase().includes(ext),
  );
}

export function splitReplicateMediaList(value: string): string[] {
  const separators = /[;\n\r]+/;
  if (!separators.test(value)) return [value];
  const tokens = value.split(separators).map((t) => t.trim()).filter((t) => t.length > 0);
  if (tokens.length <= 1) return [value];
  if (tokens.every((t) => /^https?:\/\//i.test(t) || t.startsWith('data:'))) return tokens;
  return [value];
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function normalizeArrayInput(value: unknown): unknown[] | null {
  const collected: unknown[] = [];
  const push = (entry: unknown): void => {
    if (entry === null || entry === undefined) return;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return;
      const candidates = splitReplicateMediaList(trimmed);
      if (candidates.length > 1) { candidates.forEach(push); return; }
      const nv = candidates[0];
      if ((nv.startsWith('[') && nv.endsWith(']')) || (nv.startsWith('{') && nv.endsWith('}'))) {
        const parsed = safeJsonParse<unknown>(nv, null);
        if (Array.isArray(parsed)) { parsed.forEach(push); return; }
        if (parsed && typeof parsed === 'object') { collected.push(parsed); return; }
      }
      collected.push(nv);
      return;
    }
    if (Array.isArray(entry)) { entry.forEach(push); return; }
    if (entry && typeof entry === 'object') collected.push(entry);
  };
  push(value);
  return collected.length > 0 ? collected : null;
}

// Sanitize replicate input before sending
export function sanitizeReplicateInput(
  input: Record<string, unknown>,
  fallbackPrompt: string,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const trimmedFallback = typeof fallbackPrompt === 'string' ? fallbackPrompt.trim() : '';
  const numericFields = ['width', 'height', 'fps', 'steps', 'num_frames', 'seed', 'guidance_scale', 'num_inference_steps'];
  const uriFields = ['image', 'first_frame', 'last_frame', 'video', 'audio', 'mask', 'init_image', 'control_image'];
  const isValidUri = (v: string) => /^https?:\/\/.+/i.test(v) || /^data:[^;]+;base64,/.test(v);
  const clampDuration = (v: number) => {
    const valid = [4, 6, 8];
    if (valid.includes(v)) return v;
    return valid.reduce((prev, curr) => (Math.abs(curr - v) < Math.abs(prev - v) ? curr : prev));
  };

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      if (uriFields.includes(key) && !isValidUri(trimmed)) continue;
      if (key === 'duration') {
        const numValue = Number(trimmed);
        if (!isNaN(numValue) && isFinite(numValue)) { sanitized[key] = clampDuration(numValue); continue; }
      }
      if (numericFields.includes(key)) {
        const numValue = Number(trimmed);
        if (!isNaN(numValue) && isFinite(numValue)) { sanitized[key] = numValue; continue; }
      }
      sanitized[key] = trimmed;
    } else {
      sanitized[key] = value;
    }
  }

  // Normalize image_input arrays
  const arrayFields = Object.keys(sanitized).filter((f) => f === 'image_input' || /^image_input[\w-]*/.test(f));
  for (const field of arrayFields) {
    const normalized = normalizeArrayInput(sanitized[field]);
    if (!normalized || normalized.length === 0) delete sanitized[field];
    else sanitized[field] = normalized;
  }

  if (typeof sanitized.prompt !== 'string' || sanitized.prompt.trim().length === 0) {
    if (trimmedFallback.length > 0) sanitized.prompt = trimmedFallback;
  }
  if (Object.keys(sanitized).length === 0) {
    sanitized.prompt = trimmedFallback.length > 0 ? trimmedFallback : 'Generate an asset for this workflow node.';
  }
  return sanitized;
}

// Resolve image inputs from files
export async function resolveReplicateImageInputsFromFiles(
  files: AiContext['files'] | undefined,
  mode: 'url' | 'base64',
): Promise<string[]> {
  if (!files || files.length === 0) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!file || typeof file.content !== 'string' || typeof file.type !== 'string' || !file.type.startsWith('image/')) continue;
    const rawContent = file.content.trim();
    if (!rawContent) continue;
    const rawEntries = splitReplicateMediaList(rawContent);
    for (const rawEntry of rawEntries) {
      if (!rawEntry) continue;
      const normalizedSource = file.type === 'image/url' ? resolveAssetUrl(rawEntry) : rawEntry;
      const delivered = await prepareAssetForDelivery(normalizedSource, mode, 'image');
      if (typeof delivered !== 'string') continue;
      const finalEntries = splitReplicateMediaList(delivered);
      for (const entry of finalEntries) {
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        results.push(trimmed);
      }
    }
  }
  return results;
}
