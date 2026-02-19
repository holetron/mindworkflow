/**
 * Replicate API interactions: model resolution, prediction lifecycle,
 * and node meta helpers.
 *
 * ADR-081 Phase 2 — extracted from replicate.ts to keep files under 500 lines.
 */

import fetch, { type Response as NodeFetchResponse } from 'node-fetch';
import type { StoredNode } from '../../../db';
import {
  joinReplicateUrl,
  getReplicateHeaders,
  normalizeReplicateBaseUrl,
} from './replicateUtils';

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

export async function resolveReplicateModel(
  baseUrl: string,
  apiKey: string,
  modelIdentifier: string,
): Promise<{ identifier: string; version: string; owner: string; name: string }> {
  const trimmed = modelIdentifier.trim();
  const [owner, nameWithVersion] = trimmed.split('/');
  if (!owner || !nameWithVersion) throw new Error(`Invalid Replicate model identifier: ${modelIdentifier}`);
  const [name, versionPart] = nameWithVersion.split(':');
  if (versionPart && versionPart.trim().length > 0) {
    return { identifier: `${owner}/${name}:${versionPart.trim()}`, version: versionPart.trim(), owner, name };
  }
  const latestVersion = await fetchReplicateLatestVersion(baseUrl, apiKey, owner, name);
  return { identifier: `${owner}/${name}:${latestVersion}`, version: latestVersion, owner, name };
}

async function fetchReplicateLatestVersion(baseUrl: string, apiKey: string, owner: string, name: string): Promise<string> {
  const endpoint = joinReplicateUrl(baseUrl, `/v1/models/${owner}/${name}`);
  let response: NodeFetchResponse;
  try {
    response = await fetch(endpoint, { method: 'GET', headers: getReplicateHeaders(apiKey) });
  } catch (error) {
    throw new Error(`Failed to contact Replicate API for model ${owner}/${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Failed to load Replicate model metadata (${response.status} ${response.statusText}): ${errorText || 'no response body'}`);
  }
  const payload = (await response.json()) as { latest_version?: { id?: string }; latest_version_id?: string; version?: string };
  const versionId = typeof payload?.latest_version?.id === 'string' ? payload.latest_version.id.trim()
    : typeof payload?.latest_version_id === 'string' ? payload.latest_version_id.trim()
      : typeof payload?.version === 'string' ? payload.version.trim() : '';
  if (!versionId) throw new Error(`Replicate model ${owner}/${name} does not expose a latest_version identifier.`);
  return versionId;
}

// ---------------------------------------------------------------------------
// Prediction lifecycle
// ---------------------------------------------------------------------------

export async function createReplicatePrediction(
  baseUrl: string, apiKey: string, versionId: string, input: Record<string, unknown>,
): Promise<{ prediction: Record<string, unknown>; requestPayload: { provider: string; model: string; timestamp: string; request: unknown } }> {
  const endpoint = joinReplicateUrl(baseUrl, '/v1/predictions');
  const requestBody = { version: versionId, input };
  const requestPayload = { provider: 'replicate', model: versionId, timestamp: new Date().toISOString(), request: requestBody };
  let response: NodeFetchResponse;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { ...getReplicateHeaders(apiKey), 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
  } catch (error) {
    throw new Error(`Replicate prediction request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Replicate prediction error (${response.status} ${response.statusText}): ${errorText || 'no response body'}`);
  }
  const prediction = (await response.json()) as Record<string, unknown>;
  return { prediction, requestPayload };
}

export async function awaitReplicatePrediction(
  baseUrl: string, apiKey: string, initialPrediction: Record<string, unknown>, logs: string[],
): Promise<Record<string, unknown>> {
  const predictionId = typeof initialPrediction?.id === 'string' ? initialPrediction.id : undefined;
  if (!predictionId) return initialPrediction;
  const pollInterval = Number(process.env.REPLICATE_POLL_INTERVAL_MS ?? 2000);
  const timeoutMs = Number(process.env.REPLICATE_POLL_TIMEOUT_MS ?? 10 * 60 * 1000);
  const terminalStatuses = new Set(['succeeded', 'failed', 'canceled']);
  let current = initialPrediction;
  let status = typeof current?.status === 'string' ? current.status.toLowerCase() : 'starting';
  const start = Date.now();

  while (!terminalStatuses.has(status)) {
    if (Date.now() - start > timeoutMs) throw new Error(`Replicate prediction ${predictionId} timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    const endpoint = joinReplicateUrl(baseUrl, `/v1/predictions/${predictionId}`);
    const resp = await fetch(endpoint, { method: 'GET', headers: getReplicateHeaders(apiKey) });
    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '');
      throw new Error(`Failed to fetch Replicate prediction (${resp.status} ${resp.statusText}): ${errorText || 'no response body'}`);
    }
    current = (await resp.json()) as Record<string, unknown>;
    status = typeof current?.status === 'string' ? current.status.toLowerCase() : status;
    logs.push(`Prediction ${predictionId} status: ${status}`);
  }
  return current;
}

// ---------------------------------------------------------------------------
// Meta helpers
// ---------------------------------------------------------------------------

export function stripLegacyReplicateMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const clone = { ...(meta as Record<string, unknown>) };
  if (clone.replicate && typeof clone.replicate === 'object') delete clone.replicate;
  if (clone.metadata && typeof clone.metadata === 'object' && !Array.isArray(clone.metadata)) {
    const mr = { ...(clone.metadata as Record<string, unknown>) };
    if ('replicate' in mr) delete mr.replicate;
    clone.metadata = mr;
  }
  return clone;
}

export function ensureShortDescription(meta: Record<string, unknown>, node: StoredNode): string {
  const c = meta.short_description;
  if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  if (typeof node.title === 'string' && node.title.trim().length > 0) return node.title.trim().slice(0, 200);
  if (typeof node.content === 'string' && node.content.trim().length > 0) return node.content.trim().slice(0, 200);
  return 'AI response';
}

export function ensureUiPosition(meta: Record<string, unknown>, node: StoredNode): { x: number; y: number } {
  const raw = meta.ui_position;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const x = Number((raw as Record<string, unknown>).x);
    const y = Number((raw as Record<string, unknown>).y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x: Math.round(x), y: Math.round(y) };
  }
  const bbox = (node.ui as unknown as Record<string, unknown>)?.bbox as Record<string, number> | undefined;
  return { x: bbox && typeof bbox.x1 === 'number' ? Math.round(bbox.x1) : 0, y: bbox && typeof bbox.y1 === 'number' ? Math.round(bbox.y1) : 0 };
}

export function ensureOutputType(meta: Record<string, unknown>): string {
  const c = meta.output_type;
  return typeof c === 'string' && c.trim().length > 0 ? c.trim() : 'node';
}

export function extractPrimaryOutput(output: unknown, depth = 0): string {
  if (depth > 5 || output === null || output === undefined) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) { for (const item of output) { const c = extractPrimaryOutput(item, depth + 1); if (c) return c; } return ''; }
  if (typeof output === 'object') {
    const r = output as Record<string, unknown>;
    if (typeof r.output === 'string') return r.output;
    if (r.output !== undefined) { const n = extractPrimaryOutput(r.output, depth + 1); if (n) return n; }
    for (const v of Object.values(r)) { const c = extractPrimaryOutput(v, depth + 1); if (c) return c; }
  }
  return '';
}

export function toStringOrEmpty(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function normalizeLinkValue(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
