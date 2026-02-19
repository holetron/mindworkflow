import {
  IntegrationConfig,
  IntegrationField,
} from '../types/integration';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../utils/secretStorage';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: IntegrationConfig = {
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

// ---------------------------------------------------------------------------
// Known config keys (used to separate "extra" from recognized fields)
// ---------------------------------------------------------------------------

export const KNOWN_CONFIG_KEYS = new Set<string>([
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

// ---------------------------------------------------------------------------
// Sanitize / decode helpers
// ---------------------------------------------------------------------------

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

export function decodeIntegrationExtra(raw: unknown): Record<string, unknown> {
  const sanitized = sanitizeIntegrationExtra(raw);
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    decoded[key] = decodeExtraValue(value);
  }
  return decoded;
}

// ---------------------------------------------------------------------------
// Primitive normalizers
// ---------------------------------------------------------------------------

export function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeBoolean(value: unknown): boolean {
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

export function normalizeStringArray(value: unknown): string[] {
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

export function normalizeFields(value: unknown): IntegrationField[] | undefined {
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

// ---------------------------------------------------------------------------
// Config normalization & serialization
// ---------------------------------------------------------------------------

export function normalizeConfigPayload(config?: Partial<IntegrationConfig>): IntegrationConfig {
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

export function parseConfig(json: string): IntegrationConfig {
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

export function serializeConfig(config: IntegrationConfig): string {
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
