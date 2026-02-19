import * as crypto from 'crypto';
import { db } from '../db';
import {
  IntegrationConfig,
  IntegrationField,
  IntegrationRecord,
} from '../types/integration';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../utils/secretStorage';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'integrationRepository' });
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

const DEFAULT_CONFIG: IntegrationConfig = {
  description: '',
  apiKey: '',
  baseUrl: '',
  organization: '',
  webhookContract: '',
  systemPrompt: '',
  inputFields: [],
  exampleRequest: null,
  exampleResponseMapping: null,
  models: [],
  modelsUpdatedAt: null,
  extra: {},
};

const KNOWN_CONFIG_KEYS = new Set<string>([
  'description',
  'apiKey',
  'api_key',
  'baseUrl',
  'base_url',
  'organization',
  'webhookContract',
  'webhook_contract',
  'systemPrompt',
  'system_prompt',
  'inputFields',
  'input_fields',
  'exampleRequest',
  'example_request',
  'exampleResponseMapping',
  'example_response_mapping',
  'models',
  'modelsUpdatedAt',
  'models_updatedat',
  'models_updated_at',
  'models_updated_at',
  'enabled',
  'disabled',
  'created_at',
  'updated_at',
  'integration_id',
  'integrationId',
  'user_id',
  'userId',
  'name',
  'type',
  'extra',
]);

export function sanitizeIntegrationExtra(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'extra' && value && typeof value === 'object') {
      Object.assign(extra, sanitizeIntegrationExtra(value));
      continue;
    }
    if (KNOWN_CONFIG_KEYS.has(key)) {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    extra[key] = value;
  }
  return extra;
}

function decodeExtraValue(value: unknown): unknown {
  if (typeof value === 'string' && isEncryptedSecret(value)) {
    return decryptSecret(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeExtraValue(item));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const decoded: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      decoded[key] = decodeExtraValue(entry);
    }
    return decoded;
  }
  return value;
}

function decodeIntegrationExtra(raw: unknown): Record<string, unknown> {
  const sanitized = sanitizeIntegrationExtra(raw);
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    decoded[key] = decodeExtraValue(value);
  }
  return decoded;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
  }
  return [];
}

function normalizeFields(value: unknown): IntegrationField[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized: IntegrationField[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const label = normalizeString(record.label);
    const key = normalizeString(record.key);
    if (!label || !key) {
      continue;
    }
    const normalizedType: 'text' | 'textarea' = record.type === 'textarea' ? 'textarea' : 'text';
    normalized.push({
      id: normalizeString(record.id) || undefined,
      label,
      key,
      type: normalizedType,
      placeholder: normalizeString(record.placeholder) || undefined,
      description: normalizeString(record.description) || undefined,
      required: normalizeBoolean(record.required),
      defaultValue: normalizeString(record.defaultValue ?? record.default_value) || undefined,
    });
  }
  return normalized;
}

function normalizeConfigPayload(config?: Partial<IntegrationConfig>): IntegrationConfig {
  const safe = config ?? {};
  return {
    description: normalizeString(safe.description),
    apiKey: normalizeString(safe.apiKey ?? (safe as Record<string, unknown>).api_key),
    baseUrl: normalizeString(safe.baseUrl ?? (safe as Record<string, unknown>).base_url),
    organization: normalizeString(safe.organization),
    webhookContract: normalizeString(safe.webhookContract),
    systemPrompt: normalizeString(safe.systemPrompt),
    inputFields:
      normalizeFields(safe.inputFields ?? (safe as Record<string, unknown>).input_fields) ?? [],
    exampleRequest:
      safe.exampleRequest && typeof safe.exampleRequest === 'object'
        ? (safe.exampleRequest as IntegrationConfig['exampleRequest'])
        : null,
    exampleResponseMapping:
      safe.exampleResponseMapping && typeof safe.exampleResponseMapping === 'object'
        ? (safe.exampleResponseMapping as IntegrationConfig['exampleResponseMapping'])
        : null,
    models: normalizeStringArray(safe.models),
    modelsUpdatedAt: (() => {
      const value = normalizeString(safe.modelsUpdatedAt);
      return value ? value : null;
    })(),
    extra: DEFAULT_CONFIG.extra,
  };
}

function parseConfig(json: string): IntegrationConfig {
  if (!json || typeof json !== 'string') {
    return { ...DEFAULT_CONFIG, extra: {} };
  }
  try {
    const parsed = JSON.parse(json) as Partial<IntegrationConfig> & Record<string, unknown>;
    const config = {
      ...DEFAULT_CONFIG,
      ...normalizeConfigPayload(parsed),
    };
    const decryptedApiKey = config.apiKey ? decryptSecret(config.apiKey) : '';
    return {
      ...config,
      apiKey: decryptedApiKey,
      extra: decodeIntegrationExtra(parsed),
    };
  } catch {
    return { ...DEFAULT_CONFIG, extra: {} };
  }
}

function serializeConfig(config: IntegrationConfig): string {
  const normalized = {
    ...DEFAULT_CONFIG,
    ...normalizeConfigPayload(config),
  };
  const extra = sanitizeIntegrationExtra(config.extra);
  const serialized: Record<string, unknown> = {
    ...extra,
    description: normalized.description,
    baseUrl: normalized.baseUrl,
    organization: normalized.organization,
    webhookContract: normalized.webhookContract,
    systemPrompt: normalized.systemPrompt,
    inputFields: normalized.inputFields,
    exampleRequest: normalized.exampleRequest,
    exampleResponseMapping: normalized.exampleResponseMapping,
    models: normalized.models,
    modelsUpdatedAt: normalized.modelsUpdatedAt,
  };
  serialized.apiKey = normalized.apiKey ? encryptSecret(normalized.apiKey) : '';
  if (!normalized.apiKey) {
    serialized.apiKey = '';
  }
  return JSON.stringify(serialized);
}

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
