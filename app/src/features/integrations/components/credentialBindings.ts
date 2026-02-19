import type { ProviderCredential, ProviderCredentialOption } from '../../../data/providers';
import type { IntegrationFieldConfig, GlobalIntegration } from '../../../state/api';

export interface IntegrationDraft {
  id?: string;
  providerId: string;
  name: string;
  description?: string;
  apiKey?: string;
  apiKeyStored?: boolean;
  apiKeyPreview?: string | null;
  apiKeyModified?: boolean;
  baseUrl?: string;
  organization?: string;
  webhookContract?: string;
  systemPrompt?: string;
  inputFields: IntegrationFieldConfig[];
  exampleRequest?: GlobalIntegration['exampleRequest'];
  exampleResponseMapping?: GlobalIntegration['exampleResponseMapping'];
  models?: string[];
  modelsUpdatedAt?: string | null;
  enabled?: boolean;
  isDefault?: boolean;
  extra?: Record<string, unknown>;
}

export type CredentialTarget = 'apiKey' | 'baseUrl' | 'organization' | 'model' | 'mode' | 'discordGuildId' | 'discordChannelId' | 'discordUserToken' | 'discordUserAgent';

export interface CredentialBinding {
  key: string;
  label: string;
  target: CredentialTarget;
  value: string;
  placeholder?: string;
  component: 'input' | 'textarea' | 'select';
  inputType?: 'text' | 'url' | 'password';
  helperText?: string;
  onChange: (value: string) => void;
  onReset?: () => void;
  options?: ProviderCredentialOption[];
}

export function inferCredentialTarget(key: string): CredentialTarget | null {
  const normalized = key.toLowerCase();
  if (
    normalized.includes('token') ||
    normalized.includes('api_key') ||
    normalized.includes('apikey') ||
    normalized.endsWith('_key') ||
    normalized.includes('secret')
  ) {
    return 'apiKey';
  }
  if (normalized.includes('url') || normalized.includes('endpoint')) {
    return 'baseUrl';
  }
  if (normalized.includes('org')) {
    return 'organization';
  }
  if (normalized.includes('model')) {
    return 'model';
  }
  if (normalized.includes('mode')) {
    return 'mode';
  }
  // Special handling for Discord fields
  if (normalized === 'discord_guild_id') return 'discordGuildId';
  if (normalized === 'discord_channel_id') return 'discordChannelId';
  if (normalized === 'discord_user_token') return 'discordUserToken';
  if (normalized === 'discord_user_agent') return 'discordUserAgent';
  return null;
}

export function createCredentialBinding(
  credential: ProviderCredential,
  integration: IntegrationDraft,
  onUpdate: (patch: Partial<IntegrationDraft>) => void,
): CredentialBinding | null {
  const target = inferCredentialTarget(credential.key);
  if (!target) {
    return null;
  }

  if (target === 'apiKey') {
    const storedSecret = integration.apiKeyStored && !integration.apiKeyModified;
    return {
      key: credential.key,
      label: credential.label,
      target,
      component: credential.control === 'textarea' ? 'textarea' : 'input',
      inputType: credential.control === 'password' ? 'password' : 'text',
      value: storedSecret ? '' : integration.apiKey ?? '',
      placeholder: storedSecret ? '••••••' : credential.placeholder ?? 'sk-***',
      helperText: storedSecret
        ? integration.apiKeyPreview
          ? `Key saved (${integration.apiKeyPreview})`
          : 'Key saved on server'
        : undefined,
      onChange: (value: string) =>
        onUpdate({
          apiKey: value,
          apiKeyModified: true,
          apiKeyStored: false,
          apiKeyPreview: null,
        }),
      onReset: storedSecret
        ? () =>
            onUpdate({
              apiKey: '',
              apiKeyStored: false,
              apiKeyPreview: null,
              apiKeyModified: false,
            })
        : undefined,
    };
  }

  if (target === 'baseUrl') {
    return {
      key: credential.key,
      label: credential.label,
      target,
      component: credential.control === 'textarea' ? 'textarea' : 'input',
      inputType: credential.control === 'password' ? 'password' : 'text',
      value: integration.baseUrl ?? '',
      placeholder: credential.placeholder ?? '',
      onChange: (value: string) => onUpdate({ baseUrl: value }),
    };
  }

  if (target === 'organization') {
    return {
      key: credential.key,
      label: credential.label,
      target,
      component: 'input',
      inputType: credential.control === 'password' ? 'password' : 'text',
      value: integration.organization ?? '',
      placeholder: credential.placeholder ?? 'org-...',
      onChange: (value: string) => onUpdate({ organization: value }),
    };
  }

  if (target === 'mode') {
    const currentExtra =
      (typeof integration.extra === 'object' && integration.extra !== null
        ? integration.extra
        : {}) as Record<string, unknown>;
    const currentValue =
      typeof currentExtra.midjourney_mode === 'string'
        ? (currentExtra.midjourney_mode as string)
        : typeof currentExtra.mode === 'string'
          ? (currentExtra.mode as string)
          : credential.placeholder ?? 'photo';
    return {
      key: credential.key,
      label: credential.label,
      target,
      component: 'select',
      value: currentValue,
      placeholder: credential.placeholder ?? 'photo',
      options:
        credential.options ??
        [
          { label: 'Photo (image)', value: 'photo' },
          { label: 'Video (alpha)', value: 'video' },
        ],
      onChange: (value: string) => {
        const nextExtra = {
          ...(currentExtra ?? {}),
          midjourney_mode: value,
        };
        onUpdate({ extra: nextExtra });
      },
    };
  }

  if (target === 'model') {
    return {
      key: credential.key,
      label: credential.label,
      target,
      component: 'input',
      inputType: credential.control === 'password' ? 'password' : 'text',
      value: Array.isArray(integration.models) && integration.models.length > 0 ? integration.models[0] : '',
      placeholder: credential.placeholder ?? '',
      onChange: (value: string) => {
        const trimmed = value.trim();
        onUpdate({
          models: trimmed ? [trimmed] : [],
          modelsUpdatedAt: trimmed ? new Date().toISOString() : null,
        });
      },
    };
  }

  // Discord User Token - stored in apiKey (encrypted), same logic as API Key
  if (target === 'discordUserToken') {
    const storedSecret = integration.apiKeyStored && !integration.apiKeyModified;
    return {
      key: credential.key,
      label: credential.label,
      target,
      component: credential.control === 'textarea' ? 'textarea' : 'input',
      inputType: credential.control === 'password' ? 'password' : 'text',
      value: storedSecret ? '' : integration.apiKey ?? '',
      placeholder: storedSecret ? '••••••' : credential.placeholder ?? 'mfa.***',
      helperText: storedSecret
        ? integration.apiKeyPreview
          ? `Key saved (${integration.apiKeyPreview})`
          : 'Key saved on server'
        : undefined,
      onChange: (value: string) =>
        onUpdate({
          apiKey: value,
          apiKeyModified: true,
          apiKeyStored: false,
          apiKeyPreview: null,
        }),
      onReset: storedSecret
        ? () =>
            onUpdate({
              apiKey: '',
              apiKeyStored: false,
              apiKeyPreview: null,
              apiKeyModified: false,
            })
        : undefined,
    };
  }

  // Discord fields stored in extra (Guild ID, Channel ID, User Agent)
  if (target === 'discordGuildId' || target === 'discordChannelId' || target === 'discordUserAgent') {
    const currentExtra =
      (typeof integration.extra === 'object' && integration.extra !== null
        ? integration.extra
        : {}) as Record<string, unknown>;
    const extraKey = target === 'discordGuildId' ? 'discordGuildId' :
                     target === 'discordChannelId' ? 'discordChannelId' :
                     'discordUserAgent';
    const currentValue = typeof currentExtra[extraKey] === 'string' ? (currentExtra[extraKey] as string) : '';
    return {
      key: credential.key,
      label: credential.label,
      target,
      component: 'input',
      inputType: credential.control === 'password' ? 'password' : 'text',
      value: currentValue,
      placeholder: credential.placeholder ?? '',
      onChange: (value: string) => {
        const nextExtra = {
          ...currentExtra,
          [extraKey]: value,
        };
        onUpdate({ extra: nextExtra });
      },
    };
  }

  return null;
}

export function renderCredentialBindingElement(binding: CredentialBinding) {
  return { binding };
}
