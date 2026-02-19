import { db } from '../../db';
import { logger } from '../../lib/logger';
import type {
  MidjourneyIntegrationConfig,
  MidjourneyArtifact,
  MidjourneyJobStatus,
} from './types';

const log = logger.child({ module: 'midjourney' });

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function maskSecret(secret: string): string {
  if (!secret) {
    return '';
  }
  if (secret.length <= 8) {
    return '*'.repeat(secret.length);
  }
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export function normalizeUrl(base: string): string {
  return base.replace(/\/+$/, '');
}

export function ensureAbsoluteUrl(baseUrl: string, pathSegment: string): string {
  try {
    return new URL(pathSegment, `${normalizeUrl(baseUrl)}/`).toString();
  } catch {
    return `${normalizeUrl(baseUrl)}/${pathSegment.replace(/^\/+/, '')}`;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Integration resolver
// ---------------------------------------------------------------------------

export function resolveMidjourneyIntegration(): MidjourneyIntegrationConfig | null {
  try {
    log.info('[Midjourney] Resolving integration from database...');
    const row = db
      .prepare(
        `SELECT integration_id as id, config_json as config, name, updated_at, user_id
         FROM global_integrations
         WHERE type = ? AND enabled = 1
         ORDER BY datetime(updated_at) DESC
         LIMIT 1`,
      )
      .get('midjourney_mindworkflow_relay') as
      | { id: string; config: string | null; name?: string | null; user_id?: string | null }
      | undefined;

    log.info({ data: {
      found: !!row,
      hasConfig: row?.config ? 'yes' : 'no',
      configLength: row?.config?.length || 0
    } }, '[Midjourney] Query result');

    if (!row) {
      const disabledRow = db
        .prepare(
          `SELECT enabled FROM global_integrations
             WHERE type = ?
             ORDER BY datetime(updated_at) DESC
             LIMIT 1`,
        )
        .get('midjourney_mindworkflow_relay') as { enabled?: number } | undefined;
      if (disabledRow && disabledRow.enabled === 0) {
        throw new Error('Midjourney Relay integration is disabled by administrator');
      }
      return null;
    }

    const parsedConfig = row.config ? safeJsonParse<Record<string, unknown>>(row.config, {}) : {};

    // Resolve relay URL (default to mindworkflow hosted relay)
    let relayUrl =
      typeof parsedConfig.baseUrl === 'string' && parsedConfig.baseUrl.trim()
        ? parsedConfig.baseUrl.trim()
        : typeof parsedConfig.relayUrl === 'string' && parsedConfig.relayUrl.trim()
          ? parsedConfig.relayUrl.trim()
          : 'https://relay.mindworkflow.com';

    // Remove trailing slash
    if (relayUrl.endsWith('/')) {
      relayUrl = relayUrl.slice(0, -1);
    }

    const token =
      typeof parsedConfig.apiKey === 'string' && parsedConfig.apiKey.trim()
        ? parsedConfig.apiKey.trim()
        : typeof parsedConfig.authToken === 'string' && parsedConfig.authToken.trim()
          ? parsedConfig.authToken.trim()
          : '';

    // Resolve mode from config (photo by default)
    const mode: 'photo' | 'video' =
      typeof parsedConfig.midjourney_mode === 'string' && parsedConfig.midjourney_mode === 'video'
        ? 'video'
        : 'photo';

    if (!token) {
      log.error({ detail: {
        hasApiKey: !!parsedConfig.apiKey,
        hasAuthToken: !!parsedConfig.authToken,
        configKeys: Object.keys(parsedConfig)
      } }, '[Midjourney] No Discord token found in config');
      throw new Error('Midjourney Relay integration is missing Discord User Token');
    }

    log.info({ data: {
      relayUrl,
      hasToken: !!token,
      tokenPreview: token.substring(0, 10) + '***',
      mode
    } }, '[Midjourney] Resolved config');

    return {
      relayUrl,
      token,
      integrationId: row.id,
      userId: row.user_id ?? undefined,
      name: row.name ?? undefined,
      mode,
    };
  } catch (error) {
    log.error({ err: error }, '[Midjourney] Failed to resolve integration');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// API client methods (enqueue, poll, upscale)
// ---------------------------------------------------------------------------

export async function enqueueJob(
  baseUrl: string,
  token: string,
  payload: {
    prompt: string;
    referenceImages: { url: string; purpose?: string; strength?: number }[];
    additionalInputs?: Record<string, unknown>;
    modelId?: string;
  },
  buildDiscordPrompt: (
    basePrompt: string,
    referenceImages: { url: string; purpose?: string; strength?: number }[],
    inputs: Record<string, unknown>,
    modelId?: string,
  ) => string,
): Promise<{
  jobId: string;
  status: string;
  raw: unknown;
  preview?: { url: string; body: Record<string, unknown> };
}> {
  const discordPrompt = buildDiscordPrompt(
    payload.prompt,
    payload.referenceImages,
    payload.additionalInputs || {},
    payload.modelId,
  );

  const submitUrl = `${baseUrl}/mj/submit/imagine`;
  const body: Record<string, unknown> = {
    prompt: discordPrompt,
  };

  const previewPrompt = `/imagine ${discordPrompt}`;
  const previewBody = { prompt: previewPrompt };

  log.info({ data: JSON.stringify(
      {
        url: submitUrl,
        method: 'POST',
        body: previewBody,
        referenceImages: payload.referenceImages || [],
        tokenMasked: maskSecret(token),
      },
      null,
      2,
    ) }, '[Midjourney API Request Preview]');

  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'mj-api-secret': token,
    },
    body: JSON.stringify(body),
  });

  log.info(`[Midjourney Relay HTTP Status] ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Relay error');
    log.error({ detail: errorText }, '[Midjourney Relay Error Response]');
    throw new Error(
      `Midjourney Relay returned ${response.status}: ${errorText} (token ${maskSecret(token)})`,
    );
  }

  const data = await response.json().catch(() => ({}));

  log.info({ data: JSON.stringify(data, null, 2) }, '[Midjourney Relay Response]');

  const dataObj = data as Record<string, unknown>;
  const code = typeof dataObj.code === 'number' ? dataObj.code : 0;
  const description = typeof dataObj.description === 'string' ? dataObj.description : '';

  const jobId = typeof dataObj.result === 'string' ? dataObj.result : '';

  let status = 'queued';
  if (code === 1) {
    status = 'submitted';
  } else if (code === 21) {
    status = 'exists';
  } else if (code === 22) {
    status = 'queued';
  } else if (code === 23) {
    status = 'queue_full';
  } else if (code === 24) {
    status = 'banned_prompt';
  }

  if (!jobId) {
    log.error({ detail: data }, '[Midjourney Relay Error] Response missing result (job_id)');
    throw new Error(`Midjourney Relay error: ${description || 'missing job_id'}`);
  }

  log.info(`[Midjourney Relay Success] Job ID: ${jobId}, Status: ${status}, Code: ${code}`);

  return {
    jobId,
    status,
    raw: data,
    preview: {
      url: submitUrl,
      body: previewBody,
    },
  };
}

export async function pollJobStatus(
  baseUrl: string,
  token: string,
  jobId: string,
  normalizeArtifact: (candidate: unknown, jId: string) => MidjourneyArtifact | null,
): Promise<MidjourneyJobStatus> {
  const endpoint = `${baseUrl}/mj/task/${jobId}/fetch`;
  log.info('[Midjourney] Polling status %s', endpoint);

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Relay error');
    throw new Error(
      `Failed to poll Midjourney status (${response.status}): ${errorText} (token ${maskSecret(token)})`,
    );
  }

  const data = await response.json().catch(() => ({}));
  log.info({ data: JSON.stringify(data).substring(0, 300) }, '[Midjourney] Poll response');

  const status =
    typeof (data as Record<string, unknown>).status === 'string'
      ? ((data as Record<string, unknown>).status as string)
      : 'unknown';
  const progress =
    typeof (data as Record<string, unknown>).progress === 'number'
      ? ((data as Record<string, unknown>).progress as number)
      : typeof (data as Record<string, unknown>).progress === 'string'
        ? parseInt((data as Record<string, unknown>).progress as string, 10)
        : undefined;

  const artifactsArray = Array.isArray((data as Record<string, unknown>).artifacts)
    ? ((data as Record<string, unknown>).artifacts as unknown[])
    : [];

  if (artifactsArray.length === 0 && (data as Record<string, unknown>).imageUrl) {
    artifactsArray.push({
      url: (data as Record<string, unknown>).imageUrl,
      type: 'image',
    });
  }

  const artifacts = artifactsArray
    .map((item) => normalizeArtifact(item, jobId))
    .filter((item): item is MidjourneyArtifact => item !== null);

  const errorMessage =
    typeof (data as Record<string, unknown>).error === 'string'
      ? ((data as Record<string, unknown>).error as string)
      : undefined;

  return {
    status,
    jobId,
    progress,
    artifacts,
    raw: data,
    error: errorMessage,
  };
}

export async function submitUpscale(
  baseUrl: string,
  taskId: string,
  index: number,
): Promise<{ jobId: string; status: string }> {
  log.info(`[Midjourney] Submitting upscale for task ${taskId}, variant ${index}`);

  const response = await fetch(`${baseUrl}/mj/submit/change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      taskId,
      action: 'UPSCALE',
      index,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Relay error');
    throw new Error(`Midjourney upscale failed (${response.status}): ${errorText}`);
  }

  const data = await response.json().catch(() => ({}));
  const jobId =
    typeof (data as Record<string, unknown>).result === 'string'
      ? ((data as Record<string, unknown>).result as string)
      : '';
  const status = 'queued';

  if (!jobId) {
    throw new Error('Midjourney upscale response is missing job_id');
  }

  return { jobId, status };
}
