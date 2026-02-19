import * as crypto from 'crypto';
import { db } from '../db';
import {
  IntegrationConfig,
  IntegrationRecord,
} from '../types/integration';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'integrationRepository' });

import {
  DEFAULT_CONFIG,
  sanitizeIntegrationExtra as _sanitizeIntegrationExtra,
  normalizeConfigPayload,
  parseConfig,
  serializeConfig,
} from './integrationConfigHelpers';

// Re-export so existing callers keep working
export { sanitizeIntegrationExtra } from './integrationConfigHelpers';

// Local alias for internal use
const sanitizeIntegrationExtra = _sanitizeIntegrationExtra;

type IntegrationRow = {
  integration_id: string;
  user_id: string;
  type: string;
  name: string;
  config_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  is_default?: number | null;
};

function mapRow(row: IntegrationRow): IntegrationRecord {
  return {
    id: row.integration_id,
    userId: row.user_id,
    providerId: row.type,
    name: row.name,
    config: parseConfig(row.config_json),
    enabled: row.enabled !== 0,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listIntegrationsForUser(userId: string): IntegrationRecord[] {
  const rows = db
    .prepare(
      `SELECT integration_id, user_id, type, name, config_json, enabled, created_at, updated_at, is_default
         FROM global_integrations
        WHERE user_id = ?
        ORDER BY datetime(updated_at) DESC`,
    )
    .all(userId) as IntegrationRow[];
  return rows.map(mapRow);
}

export function listAllIntegrations(): IntegrationRecord[] {
  const rows = db
    .prepare(
      `SELECT integration_id, user_id, type, name, config_json, enabled, created_at, updated_at, is_default
         FROM global_integrations
        ORDER BY datetime(updated_at) DESC`,
    )
    .all() as IntegrationRow[];
  return rows.map(mapRow);
}

export function getIntegrationById(id: string): IntegrationRecord | null {
  const row = db
    .prepare(
      `SELECT integration_id, user_id, type, name, config_json, enabled, created_at, updated_at, is_default
         FROM global_integrations
        WHERE integration_id = ?
        LIMIT 1`,
    )
    .get(id) as IntegrationRow | undefined;
  return row ? mapRow(row) : null;
}

export function getIntegrationForUserById(id: string, userId: string): IntegrationRecord | null {
  const row = db
    .prepare(
      `SELECT integration_id, user_id, type, name, config_json, enabled, created_at, updated_at, is_default
         FROM global_integrations
        WHERE integration_id = ? AND user_id = ?
        LIMIT 1`,
    )
    .get(id, userId) as IntegrationRow | undefined;
  return row ? mapRow(row) : null;
}

export function getIntegrationForUserByProvider(providerId: string, userId: string): IntegrationRecord | null {
  const row = db
    .prepare(
      `SELECT integration_id, user_id, type, name, config_json, enabled, created_at, updated_at, is_default
        FROM global_integrations
        WHERE type = ? AND user_id = ?
        LIMIT 1`,
    )
    .get(providerId, userId) as IntegrationRow | undefined;
  return row ? mapRow(row) : null;
}

export function getLatestEnabledIntegrationByProvider(providerId: string): IntegrationRecord | null {
  const row = db
    .prepare(
      `SELECT integration_id, user_id, type, name, config_json, enabled, created_at, updated_at, is_default
         FROM global_integrations
        WHERE type = ? AND enabled = 1
        ORDER BY datetime(updated_at) DESC
        LIMIT 1`,
    )
    .get(providerId) as IntegrationRow | undefined;
  return row ? mapRow(row) : null;
}

export function getLatestIntegrationByProvider(providerId: string): IntegrationRecord | null {
  const row = db
    .prepare(
      `SELECT integration_id, user_id, type, name, config_json, enabled, created_at, updated_at, is_default
         FROM global_integrations
        WHERE type = ?
        ORDER BY datetime(updated_at) DESC
        LIMIT 1`,
    )
    .get(providerId) as IntegrationRow | undefined;
  return row ? mapRow(row) : null;
}

export interface IntegrationCreatePayload {
  userId: string;
  providerId: string;
  name: string;
  config?: Partial<IntegrationConfig>;
  enabled?: boolean;
  id?: string;
}

export function createIntegration(payload: IntegrationCreatePayload): IntegrationRecord {
  const id = payload.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const normalized = normalizeConfigPayload(payload.config);
  const config = serializeConfig({
    ...DEFAULT_CONFIG,
    ...normalized,
    extra: sanitizeIntegrationExtra(payload.config),
  });

  log.info({ data: { id, userId: payload.userId, providerId: payload.providerId, name: payload.name } }, '[createIntegration] Inserting');

  db.prepare(
    `INSERT INTO global_integrations (
       integration_id,
       user_id,
       type,
       name,
       config_json,
       enabled,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    payload.userId,
    payload.providerId,
    payload.name,
    config,
    payload.enabled === false ? 0 : 1,
    now,
    now,
  );
  log.info('[createIntegration] Insert successful %s', id);
  return getIntegrationById(id)!;
}

export interface IntegrationUpdatePayload {
  name?: string;
  config?: Partial<IntegrationConfig>;
  enabled?: boolean;
}

export function updateIntegration(id: string, userId: string, changes: IntegrationUpdatePayload): IntegrationRecord {
  const existing = getIntegrationForUserById(id, userId);
  if (!existing) {
    throw new Error('Integration not found');
  }
  let mergedConfig: IntegrationConfig = {
    ...existing.config,
    inputFields: Array.isArray(existing.config.inputFields)
      ? [...existing.config.inputFields]
      : [],
    models: Array.isArray(existing.config.models)
      ? [...existing.config.models]
      : [],
    extra: { ...existing.config.extra },
  };

  if (changes.config) {
    const normalized = normalizeConfigPayload(changes.config);
    const raw = changes.config as Record<string, unknown>;

    const apply = (key: keyof IntegrationConfig, aliases: string[] = []) => {
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        (mergedConfig as IntegrationConfig)[key] = normalized[key] as any;
        return;
      }
      for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(raw, alias)) {
          (mergedConfig as IntegrationConfig)[key] = normalized[key] as any;
          return;
        }
      }
    };

    apply('description');
    apply('apiKey', ['api_key', 'API_KEY', 'token', 'authToken', 'secret']);
    apply('baseUrl', ['base_url', 'endpoint', 'url']);
    apply('organization', ['org', 'organization_id', 'orgId', 'openai_org']);
    apply('webhookContract');
    apply('systemPrompt', ['system_prompt']);
    apply('inputFields', ['input_fields']);
    apply('exampleRequest');
    apply('exampleResponseMapping');
    apply('models');
    apply('modelsUpdatedAt');

    if (Object.prototype.hasOwnProperty.call(raw, 'extra')) {
      const extraValue = raw.extra;
      if (extraValue === null) {
        mergedConfig.extra = {};
      } else {
        mergedConfig.extra = sanitizeIntegrationExtra(extraValue);
      }
    } else {
      const implicitExtra = sanitizeIntegrationExtra(raw);
      if (Object.keys(implicitExtra).length > 0) {
        mergedConfig.extra = {
          ...mergedConfig.extra,
          ...implicitExtra,
        };
      }
    }
  }

  const nextConfig = serializeConfig(mergedConfig);
  const now = new Date().toISOString();
  const nextEnabled = changes.enabled === undefined ? existing.enabled : Boolean(changes.enabled);
  db.prepare(
    `UPDATE global_integrations
        SET name = ?,
            config_json = ?,
            enabled = ?,
            updated_at = ?
      WHERE integration_id = ? AND user_id = ?`,
  ).run(
    changes.name ?? existing.name,
    nextConfig,
    nextEnabled ? 1 : 0,
    now,
    id,
    userId,
  );
  return getIntegrationForUserById(id, userId)!;
}

export function deleteIntegration(id: string, userId: string): boolean {
  const result = db
    .prepare(
      `DELETE FROM global_integrations
        WHERE integration_id = ? AND user_id = ?`,
    )
    .run(id, userId);
  return result.changes > 0;
}
