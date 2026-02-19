import {
  IntegrationConfig,
  IntegrationExampleRequest,
  IntegrationExampleResponseMapping,
  IntegrationField,
  IntegrationRecord,
} from '../types/integration';
import { sanitizeIntegrationExtra } from './integrationRepository';
import * as fs from 'fs';
import * as path from 'path';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'integrationUtils' });
const REPLICATE_PLACEHOLDER_TOKENS = [
  'r8_dev_placeholder_token',
  'replicate_placeholder_token',
  'replicate_token_placeholder',
  'replicate_api_token_placeholder',
].map((value) => value.toLowerCase());

export type IntegrationUpsertInput = {
  description?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  organization?: string | null;
  webhookContract?: string | null;
  systemPrompt?: string | null;
  inputFields?: IntegrationField[] | null;
  exampleRequest?: IntegrationExampleRequest | null;
  exampleResponseMapping?: IntegrationExampleResponseMapping | null;
  models?: string[] | null;
  modelsUpdatedAt?: string | null;
  enabled?: boolean;
  extra?: Record<string, unknown> | null;
  // Midjourney-specific fields
  discordGuildId?: string | null;
  discordChannelId?: string | null;
  discordUserToken?: string | null;
};

export function isReplicatePlaceholderToken(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (REPLICATE_PLACEHOLDER_TOKENS.includes(normalized)) {
    return true;
  }
  return normalized.includes('placeholder') || normalized.includes('changeme');
}

export function sanitizeReplicateToken(raw: string | null | undefined): { token: string; isPlaceholder: boolean } {
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  if (!candidate) {
    return { token: '', isPlaceholder: false };
  }
  const placeholder = isReplicatePlaceholderToken(candidate);
  return {
    token: placeholder ? '' : candidate,
    isPlaceholder: placeholder,
  };
}

// Update Midjourney proxy application.yml configuration
export function updateMidjourneyProxyConfig(guildId?: string, channelId?: string, userToken?: string): void {
  try {
    const configPath = path.join(process.cwd(), '..', 'midjourney-proxy', 'src', 'main', 'resources', 'application.yml');
    log.info('[Midjourney] Updating config at %s', configPath);
    
    if (!fs.existsSync(configPath)) {
      log.warn('[Midjourney] Config file not found %s', configPath);
      return;
    }
    
    // Read current config
    let content = fs.readFileSync(configPath, 'utf-8');
    
    // Update fields if provided
    if (guildId) {
      content = content.replace(/guild-id:\s*"[^"]*"/, `guild-id: "${guildId}"`);
      log.info('[Midjourney] Updated guild-id %s', guildId);
    }
    if (channelId) {
      content = content.replace(/channel-id:\s*"[^"]*"/, `channel-id: "${channelId}"`);
      log.info('[Midjourney] Updated channel-id %s', channelId);
    }
    if (userToken) {
      content = content.replace(/user-token:\s*"[^"]*"/, `user-token: "${userToken}"`);
      log.info({ tokenLength: userToken.length }, 'Midjourney user-token updated');
    }
    
    // Write back
    fs.writeFileSync(configPath, content, 'utf-8');
    log.info('[Midjourney] Config file updated successfully');
  } catch (error) {
    log.error({ err: error }, '[Midjourney] Failed to update config');
  }
}

export function normalizeReplicateBaseUrl(rawBaseUrl: string): string {
  let candidate = rawBaseUrl.trim();
  if (!candidate) {
    throw new Error('Replicate base URL is required');
  }
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (!url.pathname) {
      url.pathname = '';
    }
    const normalized = url.toString();
    return normalized.replace(/\/+$/, '');
  } catch (error) {
    throw new Error('Invalid Replicate base URL');
  }
}

export function normalizeInputFields(fields?: IntegrationField[] | null): IntegrationField[] | undefined {
  if (!fields) {
    return undefined;
  }
  const normalized: IntegrationField[] = [];
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const label = raw.label?.trim();
    const key = raw.key?.trim();
    if (!label || !key) {
      continue;
    }
    const normalizedType: 'text' | 'textarea' = raw.type === 'textarea' ? 'textarea' : 'text';
    normalized.push({
      id: raw.id || undefined,
      label,
      key,
      type: normalizedType,
      placeholder: raw.placeholder?.trim() || undefined,
      description: raw.description?.trim() || undefined,
      required: raw.required,
      defaultValue: raw.defaultValue?.trim() || undefined,
    });
  }
  return normalized;
}

export function normalizeExampleRequest(
  value: IntegrationExampleRequest | null | undefined,
): IntegrationExampleRequest | undefined {
  if (!value) {
    return undefined;
  }
  const method = value.method?.trim();
  const url = value.url?.trim();
  if (!method || !url) {
    return undefined;
  }
  return {
    method,
    url,
    headers: value.headers,
    body: value.body,
  };
}

export function normalizeExampleResponse(
  value: IntegrationExampleResponseMapping | null | undefined,
): IntegrationExampleResponseMapping | undefined {
  if (!value) {
    return undefined;
  }
  const incoming = value.incoming && Object.keys(value.incoming).length > 0 ? value.incoming : undefined;
  const outgoing = value.outgoing && Object.keys(value.outgoing).length > 0 ? value.outgoing : undefined;
  if (!incoming && !outgoing) {
    return undefined;
  }
  return { incoming, outgoing };
}

export function dedupeModels(models?: string[] | null): string[] | undefined {
  if (!models) {
    return undefined;
  }
  const unique = Array.from(
    new Set(
      models
        .map((model) => (typeof model === 'string' ? model.trim() : ''))
        .filter((model) => model.length > 0),
    ),
  );
  return unique;
}

export function buildIntegrationConfigPatch(
  payload: IntegrationUpsertInput,
  providerId: string,
  existing?: IntegrationRecord,
): { config: Partial<IntegrationConfig>; enabled?: boolean } {
  const configPatch: Partial<IntegrationConfig> = {};
  let enabledOverride: boolean | undefined;

  if (payload.description !== undefined) {
    configPatch.description = payload.description?.trim() ?? '';
  }
  if (payload.baseUrl !== undefined) {
    const baseUrl = payload.baseUrl?.trim() ?? '';
    if (providerId === 'replicate' && baseUrl) {
      configPatch.baseUrl = normalizeReplicateBaseUrl(baseUrl);
    } else {
      configPatch.baseUrl = baseUrl;
    }
  }
  if (payload.organization !== undefined) {
    configPatch.organization = payload.organization?.trim() ?? '';
  }
  if (payload.webhookContract !== undefined) {
    configPatch.webhookContract = payload.webhookContract?.trim() ?? '';
  }
  if (payload.systemPrompt !== undefined) {
    configPatch.systemPrompt = payload.systemPrompt?.trim() ?? '';
  }
  if (payload.inputFields !== undefined) {
    configPatch.inputFields = normalizeInputFields(payload.inputFields) ?? [];
  }
  if (payload.exampleRequest !== undefined) {
    configPatch.exampleRequest = normalizeExampleRequest(payload.exampleRequest) ?? null;
  }
  if (payload.exampleResponseMapping !== undefined) {
    configPatch.exampleResponseMapping =
      normalizeExampleResponse(payload.exampleResponseMapping) ?? null;
  }
  if (payload.models !== undefined) {
    configPatch.models = dedupeModels(payload.models) ?? [];
  }
  if (payload.modelsUpdatedAt !== undefined) {
    configPatch.modelsUpdatedAt = payload.modelsUpdatedAt ?? null;
  }

  if (payload.extra !== undefined) {
    const sanitized = payload.extra === null ? {} : sanitizeIntegrationExtra(payload.extra);
    configPatch.extra = sanitized;
    
    // Extract Midjourney Discord credentials from extra fields
    const isMidjourneyProvider = providerId.includes('midjourney');
    if (isMidjourneyProvider && sanitized) {
      log.info({ data: {
        hasGuildId: !!sanitized.DISCORD_GUILD_ID,
        hasChannelId: !!sanitized.DISCORD_CHANNEL_ID,
        hasToken: !!sanitized.DISCORD_USER_TOKEN,
        tokenValue: sanitized.DISCORD_USER_TOKEN ? String(sanitized.DISCORD_USER_TOKEN).substring(0, 20) + '...' : 'none'
      } }, '[Integration] Processing Midjourney extra fields');
      
      if (sanitized.DISCORD_GUILD_ID) {
        configPatch.discordGuildId = String(sanitized.DISCORD_GUILD_ID).trim();
      }
      if (sanitized.DISCORD_CHANNEL_ID) {
        configPatch.discordChannelId = String(sanitized.DISCORD_CHANNEL_ID).trim();
      }
      if (sanitized.DISCORD_USER_TOKEN) {
        const token = String(sanitized.DISCORD_USER_TOKEN).trim();
        // Ignore UI placeholder values (NOT actual Discord tokens starting with mfa.)
        const isUiPlaceholder = token === 'mfa.***' || token === '***';
        
        log.info({ data: {
          length: token.length,
          preview: token.substring(0, 20) + '...',
          isUiPlaceholder
        } }, '[Integration] DISCORD_USER_TOKEN');
        
        if (!isUiPlaceholder && token.length > 10) {
          // Store Discord User Token in apiKey field (will be encrypted)
          log.info('[Integration] Setting apiKey from DISCORD_USER_TOKEN');
          configPatch.apiKey = token;
          
          // Update Midjourney proxy config file with new token
          updateMidjourneyProxyConfig(
            configPatch.discordGuildId || '',
            configPatch.discordChannelId || '',
            token
          );
          
          if (token && enabledOverride === undefined) {
            enabledOverride = true;
          }
        } else {
          log.info('[Integration] Ignoring UI placeholder, keeping existing token');
        }
      }
    }
  }

  // Handle Midjourney Discord credentials from direct fields (fallback)
  const isMidjourneyProvider = providerId.includes('midjourney');
  if (isMidjourneyProvider) {
    log.info({ data: {
      hasGuildId: payload.discordGuildId !== undefined,
      hasChannelId: payload.discordChannelId !== undefined,
      hasToken: payload.discordUserToken !== undefined,
    } }, '[Integration] Processing Midjourney direct fields');
    
    if (payload.discordGuildId !== undefined) {
      configPatch.discordGuildId = payload.discordGuildId?.trim() ?? '';
    }
    if (payload.discordChannelId !== undefined) {
      configPatch.discordChannelId = payload.discordChannelId?.trim() ?? '';
    }
    if (payload.discordUserToken !== undefined) {
      const token = payload.discordUserToken?.trim() ?? '';
      // Store Discord User Token in apiKey field (will be encrypted)
      log.info('[Integration] Setting apiKey from discordUserToken, length %s', token.length);
      configPatch.apiKey = token;
      
      // Update Midjourney proxy config file with new token
      updateMidjourneyProxyConfig(
        configPatch.discordGuildId || '',
        configPatch.discordChannelId || '',
        token
      );
      
      if (token && enabledOverride === undefined) {
        enabledOverride = true;
      }
    }
  }

  if (payload.apiKey !== undefined) {
    const trimmed = payload.apiKey?.trim() ?? '';
    if (providerId === 'replicate') {
      const { token, isPlaceholder } = sanitizeReplicateToken(trimmed);
      const existingToken = existing?.config.apiKey?.trim() ?? '';
      if (isPlaceholder && existingToken) {
        // Ignore placeholder replacement attempts if a token is already stored.
      } else {
        configPatch.apiKey = token;
        if (!token) {
          configPatch.models = [];
          configPatch.modelsUpdatedAt = null;
          enabledOverride = false;
        } else if (enabledOverride === undefined) {
          enabledOverride = true;
        }
      }
    } else if (!isMidjourneyProvider) {
      // For non-Midjourney providers, use apiKey directly
      configPatch.apiKey = trimmed;
    }
  }

  if (payload.enabled !== undefined) {
    enabledOverride = Boolean(payload.enabled);
  }

  return { config: configPatch, enabled: enabledOverride };
}

function buildApiKeyPreview(token: string | null | undefined): string | null {
  const safe = typeof token === 'string' ? token.trim() : '';
  if (!safe) {
    return null;
  }

  const separators = ['-', '_'];
  let startIndex = -1;
  for (const separator of separators) {
    const index = safe.indexOf(separator);
    if (index !== -1) {
      startIndex = index + 1;
      break;
    }
  }

  const prefix = startIndex > 0 ? safe.slice(0, startIndex) : '';
  const remainder = startIndex > 0 ? safe.slice(startIndex) : safe;
  if (!remainder) {
    return `${prefix}**......`;
  }
  const visible = remainder.slice(0, Math.min(2, remainder.length));
  const hiddenLength = Math.max(remainder.length - visible.length, 0);
  const starCount = hiddenLength > 0 ? Math.max(Math.min(hiddenLength, 4), 2) : 0;
  const dotCount = Math.max(6, hiddenLength - starCount);
  const stars = starCount > 0 ? '*'.repeat(starCount) : '';
  const dots = '.'.repeat(dotCount);
  return `${prefix}${visible}${stars}${dots}`;
}

export function toIntegrationResponse(record: IntegrationRecord) {
  const config = record.config;
  
  // For Midjourney integrations, populate extra fields with Discord credentials
  const isMidjourneyProvider = record.providerId.includes('midjourney');
  
  // Build preview for Discord tokens differently (mfa.*** or MTI6...)
  let apiKeyPreview = buildApiKeyPreview(config.apiKey);
  if (isMidjourneyProvider && config.apiKey) {
    const token = config.apiKey.trim();
    if (token.startsWith('mfa.')) {
      apiKeyPreview = 'mfa.***';
    } else if (token.length > 10) {
      // For long tokens like MTI2Mzg3MTQ0MTYzMjIz...
      apiKeyPreview = token.slice(0, 6) + '***';
    }
  }
  
  let extraFields = config.extra && Object.keys(config.extra).length > 0 ? { ...config.extra } : {};
  
  if (isMidjourneyProvider) {
    // Add Discord credentials to extra for UI compatibility
    if (config.discordGuildId) {
      extraFields.DISCORD_GUILD_ID = config.discordGuildId;
    }
    if (config.discordChannelId) {
      extraFields.DISCORD_CHANNEL_ID = config.discordChannelId;
    }
    // Never return the actual token, just indicate it's stored
    if (config.apiKey) {
      extraFields.DISCORD_USER_TOKEN = 'mfa.***'; // Placeholder to show token is set
    }
  }
  
  return {
    id: record.id,
    providerId: record.providerId,
    name: record.name,
    description: config.description || null,
    apiKey: null,
    apiKeyStored: Boolean(config.apiKey),
    apiKeyPreview,
    baseUrl: config.baseUrl || null,
    organization: config.organization || null,
    webhookContract: config.webhookContract || null,
    systemPrompt: config.systemPrompt || null,
    inputFields: config.inputFields ?? [],
    exampleRequest: config.exampleRequest,
    exampleResponseMapping: config.exampleResponseMapping,
    models: config.models.length > 0 ? config.models : null,
    modelsUpdatedAt: config.modelsUpdatedAt,
    enabled: record.enabled,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    user_id: record.userId,
    isDefault: record.isDefault,
    extra: Object.keys(extraFields).length > 0 ? extraFields : null,
    // Midjourney Discord fields (also available in extra)
    discordGuildId: config.discordGuildId || null,
    discordChannelId: config.discordChannelId || null,
    discordUserToken: null, // Never return the actual token
    discordUserTokenStored: Boolean(config.apiKey), // Token is stored in apiKey
  };
}
