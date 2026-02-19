import { z } from 'zod';
import {
  getIntegrationForUserByProvider,
  updateIntegration,
} from '../services/integrationRepository';
import { IntegrationConfig } from '../types/integration';
import {
  normalizeReplicateBaseUrl,
  sanitizeReplicateToken,
} from '../services/integrationUtils';

export const STORED_API_KEY_SENTINEL = '__USE_STORED_API_KEY__';

export function resolveApiKeyFromPayload(candidate: unknown, stored: string): string {
  const trimmedCandidate = typeof candidate === 'string' ? candidate.trim() : '';
  if (!trimmedCandidate || trimmedCandidate === STORED_API_KEY_SENTINEL) {
    return typeof stored === 'string' ? stored.trim() : '';
  }
  return trimmedCandidate;
}

export async function fetchReplicateModelsList(baseUrl: string, apiToken: string, limit: number): Promise<string[]> {
  const fetch = (await import('node-fetch')).default;
  const perPage = 100;
  const maxTotal = Math.max(1, Math.min(1000, Number.isFinite(limit) ? Math.trunc(limit) : 200));
  const models: string[] = [];
  const seen = new Set<string>();
  let remaining = maxTotal;
  let safety = 0;
  let pageUrl: URL | null = new URL('/v1/models', baseUrl);
  pageUrl.searchParams.set('limit', String(Math.min(perPage, remaining)));

  while (pageUrl && remaining > 0 && safety < 30) {
    safety += 1;
    const response = await fetch(pageUrl.toString(), {
      headers: { Authorization: `Token ${apiToken}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || `Replicate API error (${response.status})`);
      (error as { status?: number }).status = response.status;
      throw error;
    }
    const payload = (await response.json()) as {
      next?: string | null;
      results?: Array<{
        owner?: string | { username?: string; slug?: string; name?: string };
        user?: string; name?: string; slug?: string;
        latest_version?: { id?: string; version?: string }; version?: string;
      }>;
    };
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const result of results) {
      const identifier = extractReplicateModelIdentifier(result);
      if (identifier && !seen.has(identifier)) {
        seen.add(identifier); models.push(identifier); remaining -= 1;
        if (remaining <= 0) break;
      }
    }
    if (remaining <= 0) break;
    const nextUrl = resolveReplicateNextUrl(baseUrl, payload.next ?? null);
    if (!nextUrl) break;
    pageUrl = new URL(nextUrl);
    const nextLimit = Math.min(perPage, remaining);
    if (!pageUrl.searchParams.has('limit') || Number(pageUrl.searchParams.get('limit') ?? nextLimit) > nextLimit) {
      pageUrl.searchParams.set('limit', String(nextLimit));
    }
  }
  return models.sort((a, b) => a.localeCompare(b));
}

export function normalizeOpenAiBaseUrl(raw: string | null | undefined): string {
  const fallback = 'https://api.openai.com';
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate.replace(/^\/+/, '')}`;
  try {
    const url = new URL(candidate);
    let normalized = url.toString().replace(/\/+$/, '');
    normalized = normalized.replace(/\/v1\/?$/i, '');
    return normalized.replace(/\/+$/, '');
  } catch { return fallback; }
}

export function normalizeGoogleGenerativeBaseUrl(raw: string | null | undefined): string {
  const fallback = 'https://generativelanguage.googleapis.com';
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate.replace(/^\/+/, '')}`;
  try { return new URL(candidate).toString().replace(/\/+$/, ''); } catch { return fallback; }
}

function extractGoogleModelIdentifier(model: { name?: string; displayName?: string; version?: string }): string | null {
  if (!model) return null;
  const nameCandidate = typeof model.name === 'string' ? model.name.trim() : '';
  if (nameCandidate) {
    const segments = nameCandidate.split('/');
    const selector = segments[segments.length - 1] || nameCandidate;
    return selector.trim() || null;
  }
  const displayCandidate = typeof model.displayName === 'string' ? model.displayName.trim() : '';
  return displayCandidate || null;
}

function matchesModelSelector(identifier: string, selector?: string, displayName?: string): boolean {
  if (!selector || selector.trim().length === 0) return true;
  const normalizedSelector = selector.trim().toLowerCase();
  if (identifier.toLowerCase().includes(normalizedSelector)) return true;
  if (displayName && displayName.toLowerCase().includes(normalizedSelector)) return true;
  return false;
}

export async function fetchGoogleGenerativeModelsList(options: {
  apiKey: string; baseUrl?: string; limit?: number; selector?: string;
}): Promise<string[]> {
  const fetch = (await import('node-fetch')).default;
  const normalizedBaseUrl = normalizeGoogleGenerativeBaseUrl(options.baseUrl ?? process.env.GOOGLE_GENAI_BASE_URL);
  const requestedLimit = typeof options.limit === 'number' && Number.isFinite(options.limit) ? Math.trunc(options.limit) : 200;
  const maxTotal = Math.max(1, Math.min(1000, requestedLimit));
  const models: string[] = [];
  const seen = new Set<string>();
  let remaining = maxTotal;
  let nextPageToken: string | undefined;
  let safety = 0;

  while (remaining > 0 && safety < 30) {
    safety += 1;
    const pageSize = Math.min(remaining, 200);
    const url = new URL('/v1beta/models', normalizedBaseUrl);
    url.searchParams.set('key', options.apiKey);
    url.searchParams.set('pageSize', String(pageSize));
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || `Google Generative API error (${response.status})`);
      (error as { status?: number }).status = response.status;
      throw error;
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; displayName?: string; version?: string }>;
      nextPageToken?: string;
    };
    const items = Array.isArray(payload.models) ? payload.models : [];
    for (const item of items) {
      const identifier = extractGoogleModelIdentifier(item);
      if (!identifier) continue;
      if (!matchesModelSelector(identifier, options.selector, item.displayName)) continue;
      const normalizedIdentifier = identifier.trim();
      if (!normalizedIdentifier || seen.has(normalizedIdentifier)) continue;
      seen.add(normalizedIdentifier); models.push(normalizedIdentifier); remaining -= 1;
      if (remaining <= 0) break;
    }
    if (!payload.nextPageToken || remaining <= 0) break;
    nextPageToken = payload.nextPageToken;
  }
  return models.sort((a, b) => a.localeCompare(b));
}

export function extractReplicateModelIdentifier(model: {
  owner?: string | { username?: string; slug?: string; name?: string };
  user?: string; name?: string; slug?: string;
  latest_version?: { id?: string; version?: string }; version?: string;
}): string | null {
  if (!model) return null;
  const ownerCandidate = typeof model.owner === 'string' ? model.owner
    : model.owner && typeof model.owner === 'object'
      ? model.owner.username || model.owner.slug || model.owner.name || '' : '';
  const fallbackOwner = typeof model.user === 'string' ? model.user : '';
  const owner = (ownerCandidate || fallbackOwner || '').trim();
  const nameCandidate = typeof model.name === 'string' ? model.name : '';
  const slugCandidate = typeof model.slug === 'string' ? model.slug : '';
  const name = (nameCandidate || slugCandidate).trim();
  const versionCandidate = model.latest_version && typeof model.latest_version.id === 'string'
    ? model.latest_version.id : typeof model.version === 'string' ? model.version : '';
  const version = (versionCandidate || '').trim();
  if (!owner || !name || !version) return null;
  return `${owner}/${name}:${version}`;
}

export function resolveReplicateNextUrl(baseUrl: string, next?: string | null): string | null {
  if (!next) return null;
  const trimmed = next.trim();
  if (!trimmed) return null;
  try { return new URL(trimmed).toString(); } catch {
    try { return new URL(trimmed, baseUrl).toString(); } catch { return null; }
  }
}

export function ensureDefaultReplicateIntegration(userId: string) {
  const { token } = sanitizeReplicateToken(process.env.REPLICATE_API_TOKEN ?? process.env.REPLICATE_TOKEN);
  const baseUrlEnv = process.env.REPLICATE_API_BASE_URL;
  const desiredBaseUrl = typeof baseUrlEnv === 'string' && baseUrlEnv.trim().length > 0
    ? normalizeReplicateBaseUrl(baseUrlEnv) : 'https://api.replicate.com';
  const existing = getIntegrationForUserByProvider('replicate', userId);
  if (!existing) return;
  const updates: Partial<IntegrationConfig> = {};
  let shouldUpdate = false;
  let enabled = existing.enabled;
  if (token && token !== existing.config.apiKey?.trim()) {
    updates.apiKey = token; enabled = true; shouldUpdate = true;
  }
  if (!existing.config.baseUrl) { updates.baseUrl = desiredBaseUrl; shouldUpdate = true; }
  if (!Array.isArray(existing.config.models)) { updates.models = []; shouldUpdate = true; }
  if (shouldUpdate) {
    updateIntegration(existing.id, userId, { config: updates, enabled });
  }
}
