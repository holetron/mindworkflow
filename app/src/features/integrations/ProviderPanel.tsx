import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import {
  PROVIDERS,
  type ProviderConfig,
  type ProviderCredential,
  type ProviderCredentialOption,
} from '../../data/providers';
import { DEFAULT_REPLICATE_MODELS } from '../../data/defaultReplicateModels';
import type {
  GlobalIntegration,
  IntegrationFieldConfig,
  IntegrationModelSyncPayload,
} from '../../state/api';
import { useGlobalIntegrationsStore } from '../../state/globalIntegrationsStore';

type ProviderPanelProps = {
  onSelect?: (provider: ProviderConfig | null) => void;
};

interface IntegrationDraft {
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

type CredentialTarget = 'apiKey' | 'baseUrl' | 'organization' | 'model' | 'mode' | 'discordGuildId' | 'discordChannelId' | 'discordUserToken' | 'discordUserAgent';

interface CredentialBinding {
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

function inferCredentialTarget(key: string): CredentialTarget | null {
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

function createCredentialBinding(
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
          ? `Ключ сохранён (${integration.apiKeyPreview})`
          : 'Ключ сохранён на сервере'
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
          ? `Ключ сохранён (${integration.apiKeyPreview})`
          : 'Ключ сохранён на сервере'
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

function ProviderPanel({ onSelect }: ProviderPanelProps) {
  const {
    integrations,
    loading,
    error,
    fetchIntegrations,
    addIntegration,
    updateIntegration,
    removeIntegration,
    refreshIntegrationModels,
  } = useGlobalIntegrationsStore();

  const [activeGlobalIntegrationId, setActiveGlobalIntegrationId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false); // New state for editing modal
  const [integrationDraft, setIntegrationDraft] = useState<IntegrationDraft | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);

  // Confirm dialog hook
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  const activeGlobalIntegration = useMemo(
    () => integrations.find((integration) => integration.id === activeGlobalIntegrationId) ?? null,
    [integrations, activeGlobalIntegrationId],
  );

  const activeProviderConfig = useMemo(
    () => PROVIDERS.find((provider) => provider.id === (activeGlobalIntegration?.providerId || integrationDraft?.providerId)) ?? null,
    [activeGlobalIntegration, integrationDraft],
  );

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  useEffect(() => {
    if (!activeGlobalIntegration) {
      setIntegrationDraft(null);
      return;
    }

    setIntegrationDraft((previous) => {
      if (!previous || previous.id !== activeGlobalIntegration.id) {
        const providerConfig = PROVIDERS.find(p => p.id === activeGlobalIntegration.providerId);
        return {
          id: activeGlobalIntegration.id,
          providerId: activeGlobalIntegration.providerId,
          name: activeGlobalIntegration.name,
          description: activeGlobalIntegration.description ?? '',
          apiKey: '',
          apiKeyStored: activeGlobalIntegration.apiKeyStored ?? false,
          apiKeyPreview: activeGlobalIntegration.apiKeyPreview ?? null,
          apiKeyModified: false,
          baseUrl: activeGlobalIntegration.baseUrl ?? '',
          organization: activeGlobalIntegration.organization ?? '',
          webhookContract: activeGlobalIntegration.webhookContract ?? '',
          systemPrompt: activeGlobalIntegration.systemPrompt ?? '',
          inputFields: activeGlobalIntegration.inputFields ?? providerConfig?.inputFields ?? [],
          exampleRequest: activeGlobalIntegration.exampleRequest,
          exampleResponseMapping: activeGlobalIntegration.exampleResponseMapping,
          models: Array.isArray(activeGlobalIntegration.models) ? activeGlobalIntegration.models : [],
          modelsUpdatedAt: activeGlobalIntegration.modelsUpdatedAt ?? null,
          enabled: typeof activeGlobalIntegration.enabled === 'boolean' ? activeGlobalIntegration.enabled : true,
          isDefault: activeGlobalIntegration.isDefault ?? false,
          extra:
            (typeof activeGlobalIntegration.extra === 'object' && activeGlobalIntegration.extra !== null
              ? { ...activeGlobalIntegration.extra }
              : {}),
        };
      }

      const nextModels = Array.isArray(activeGlobalIntegration.models)
        ? activeGlobalIntegration.models
        : previous.models ?? [];
      const nextModelsUpdatedAt = activeGlobalIntegration.modelsUpdatedAt ?? previous.modelsUpdatedAt ?? null;
      const nextApiKeyStored = activeGlobalIntegration.apiKeyStored ?? previous.apiKeyStored ?? false;

      return {
        ...previous,
        providerId: activeGlobalIntegration.providerId,
        apiKeyStored: nextApiKeyStored,
        apiKeyPreview:
          activeGlobalIntegration.apiKeyPreview ??
          (previous.apiKeyStored ? previous.apiKeyPreview ?? null : previous.apiKeyPreview ?? null),
        apiKey: !previous.apiKeyModified && nextApiKeyStored ? '' : previous.apiKey ?? '',
        apiKeyModified: nextApiKeyStored ? false : previous.apiKeyModified ?? false,
        exampleRequest: activeGlobalIntegration.exampleRequest ?? previous.exampleRequest,
        exampleResponseMapping: activeGlobalIntegration.exampleResponseMapping ?? previous.exampleResponseMapping,
        models: nextModels,
        modelsUpdatedAt: nextModelsUpdatedAt,
        enabled: typeof activeGlobalIntegration.enabled === 'boolean' ? activeGlobalIntegration.enabled : (previous.enabled ?? true),
        isDefault: activeGlobalIntegration.isDefault ?? previous.isDefault ?? false,
        extra:
          typeof activeGlobalIntegration.extra === 'object' && activeGlobalIntegration.extra !== null
            ? { ...activeGlobalIntegration.extra }
            : previous.extra ?? {},
      };
    });
  }, [activeGlobalIntegration]);

  const handleSelectIntegration = useCallback((integrationId: string | null) => {
    try {
      console.log('handleSelectIntegration called with:', integrationId);
      setActiveGlobalIntegrationId(integrationId);
      setStatusMessage(null);
      
      if (integrationId) {
        const integration = integrations.find(i => i.id === integrationId);
        console.log('Found integration:', integration);
        
        if (!integration) {
          console.error('Integration not found:', integrationId);
          setStatusMessage('Интеграция не найдена');
          setShowEditModal(false);
          return;
        }
        
        if (!integration.providerId) {
          console.error('Integration missing providerId:', integration);
          setStatusMessage('Некорректные данные интеграции');
          setShowEditModal(false);
          return;
        }
        
        const providerConfig = PROVIDERS.find(p => p.id === integration.providerId);
        console.log('Found provider config:', providerConfig);
        
        if (!providerConfig) {
          console.error('Provider config not found:', integration.providerId);
          setStatusMessage('Провайдер не найден');
          setShowEditModal(false);
          return;
        }
        
        onSelect?.(providerConfig);
        
        // Set draft and open edit modal for existing integration
        const draft: IntegrationDraft = {
          id: integration.id,
          providerId: integration.providerId,
          name: integration.name || 'Unnamed Integration',
          description: integration.description ?? '',
          apiKey: '',
          apiKeyStored: integration.apiKeyStored ?? false,
          apiKeyPreview: integration.apiKeyPreview ?? null,
          apiKeyModified: false,
          baseUrl: integration.baseUrl ?? '',
          organization: integration.organization ?? '',
          webhookContract: integration.webhookContract ?? '',
          systemPrompt: integration.systemPrompt ?? '',
          inputFields: Array.isArray(integration.inputFields) ? integration.inputFields : [],
          exampleRequest: integration.exampleRequest,
          exampleResponseMapping: integration.exampleResponseMapping,
          models: Array.isArray(integration.models) ? integration.models : [],
          modelsUpdatedAt: integration.modelsUpdatedAt ?? null,
          enabled: integration.enabled ?? true,
          isDefault: integration.isDefault ?? false,
          extra:
            (typeof integration.extra === 'object' && integration.extra !== null
              ? { ...integration.extra }
              : {}),
        };
        
        console.log('Setting integration draft:', draft);
        setIntegrationDraft(draft);
        setShowEditModal(true);
      } else {
        onSelect?.(null);
        setShowEditModal(false);
        setIntegrationDraft(null);
      }
    } catch (error) {
      console.error('Error in handleSelectIntegration:', error);
      setStatusMessage('Ошибка при открытии настроек интеграции');
      setShowEditModal(false);
      setIntegrationDraft(null);
    }
  }, [integrations, onSelect]);

  const handleCreateNewIntegration = useCallback((providerConfig: ProviderConfig) => {
    setIntegrationDraft({
      providerId: providerConfig.id,
      name: `New ${providerConfig.name} Integration`,
      description: providerConfig.description,
      apiKey: '',
      apiKeyStored: false,
      apiKeyPreview: null,
      apiKeyModified: false,
      baseUrl: '',
      organization: '',
      webhookContract: providerConfig.webhookContract,
      systemPrompt: providerConfig.pythonHelper,
      inputFields: [
        ...providerConfig.credentials.map(cred => ({ id: cred.key, label: cred.label, key: cred.key, type: 'text' as const, placeholder: cred.placeholder ?? '' })),
        ...(providerConfig.inputFields ?? []),
      ],
      exampleRequest: null,
      exampleResponseMapping: null,
      models: [],
      modelsUpdatedAt: null,
      enabled: true,
      isDefault: false,
      extra:
        providerConfig.id === 'midjourney_proxy'
          ? { midjourney_mode: 'photo' }
          : {},
    });
    setShowCreateModal(true);
    setActiveGlobalIntegrationId(null);
    onSelect?.(null);
  }, [onSelect]);

  const handleSaveIntegration = useCallback(async () => {
    if (!integrationDraft || !integrationDraft.providerId) return;

    setStatusMessage(null);
    try {
      const { apiKeyStored, apiKeyPreview, apiKeyModified, ...draftWithoutMeta } = integrationDraft;
      const dataToSave = {
        ...draftWithoutMeta,
        enabled: integrationDraft.enabled ?? true,
        isDefault: integrationDraft.isDefault ?? false,
      };

      if (!apiKeyModified) {
        delete (dataToSave as { apiKey?: string }).apiKey;
      }

      if (integrationDraft.id) {
        // Update existing integration
        await updateIntegration(integrationDraft.id, dataToSave);
        setStatusMessage('Настройки сохранены.');
      } else {
        // Create new integration
        const newIntegration = await addIntegration(dataToSave);
        if (newIntegration) {
          setActiveGlobalIntegrationId(newIntegration.id);
          setStatusMessage('Интеграция создана.');
        }
      }
      setShowCreateModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Ошибка: ${message}`);
    }
  }, [integrationDraft, addIntegration, updateIntegration]);

  const handleRefreshModels = useCallback(async (options?: { limit?: number }) => {
    if (!integrationDraft || !integrationDraft.providerId) {
      return;
    }
    if (!integrationDraft.id) {
      setStatusMessage('Сохраните интеграцию, чтобы обновить список моделей.');
      return;
    }

    const providerLabel =
      integrationDraft.providerId === 'openai_gpt'
        ? 'OpenAI'
        : integrationDraft.providerId === 'replicate'
          ? 'Replicate'
          : integrationDraft.providerId === 'google_workspace'
            ? 'Google Workspace'
            : 'Google AI';

    setRefreshingModels(true);
    setStatusMessage(`Загружаем список моделей из ${providerLabel}...`);
    try {
      const payload: IntegrationModelSyncPayload = {
        baseUrl: integrationDraft.baseUrl,
        limit: options?.limit,
        organization: integrationDraft.organization,
      };
      if (integrationDraft.apiKeyModified && integrationDraft.apiKey) {
        const trimmedKey = integrationDraft.apiKey.trim();
        if (trimmedKey) {
          payload.apiKey = trimmedKey;
        }
      } else if (integrationDraft.apiKeyStored) {
        payload.apiKey = '__USE_STORED_API_KEY__';
      }
      const result = await refreshIntegrationModels(
        integrationDraft.id,
        integrationDraft.providerId,
        payload,
      );
      if (!result) {
        setStatusMessage('Не удалось обновить список моделей.');
        return;
      }
      const nextModels = Array.isArray(result.models) ? result.models : [];
      const updatedAt = result.modelsUpdatedAt ?? new Date().toISOString();
      setIntegrationDraft((prev) =>
        prev
          ? {
              ...prev,
              models: nextModels,
              modelsUpdatedAt: updatedAt,
            }
          : prev,
      );
      setStatusMessage(
        nextModels.length > 0
          ? `Список моделей обновлён (${nextModels.length}).`
          : `Модели не найдены для указанного ключа (${providerLabel}).`,
      );
      // Update draft with apiKeyStored status from result
      setIntegrationDraft((prev) =>
        prev
          ? {
              ...prev,
              apiKeyStored: result.apiKeyStored ?? prev.apiKeyStored ?? false,
              apiKeyPreview: result.apiKeyPreview ?? prev.apiKeyPreview ?? null,
              apiKey: '',
              apiKeyModified: false,
            }
          : prev,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Ошибка при загрузке моделей: ${message}`);
    } finally {
      setRefreshingModels(false);
    }
  }, [integrationDraft, refreshIntegrationModels]);

  const handleDeleteIntegration = useCallback(async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Удалить интеграцию?',
      message: 'Интеграция будет удалена безвозвратно. Все связанные с ней настройки будут потеряны.',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      type: 'danger'
    });
    
    if (confirmed) {
      try {
        await removeIntegration(id);
        setActiveGlobalIntegrationId(null);
        setStatusMessage('Интеграция удалена.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Ошибка: ${message}`);
      }
    }
  }, [removeIntegration]);

  const supportsModelSync =
    !!integrationDraft &&
    ['replicate', 'openai_gpt', 'google_ai_studio', 'google_gemini', 'google_workspace'].includes(
      integrationDraft.providerId,
    );

  if (loading) return <p>Загрузка интеграций...</p>;
  if (error) return <p className="text-red-500">Ошибка: {error}</p>;

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-100">Global Integrations</h2>
        <p className="text-sm text-slate-400">
          Manage API credentials and configurations for all your projects.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 gap-4">
        <nav className="w-48 overflow-y-auto pr-2">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">Configured Integrations</h3>
          <ul className="space-y-2 text-sm">
            {integrations.map((integration) => {
              const isActive = integration.id === activeGlobalIntegrationId;
              const isDisabled = integration.enabled === false;
              const providerConfig = PROVIDERS.find(p => p.id === integration.providerId);
              return (
                <li key={integration.id} className="flex items-center justify-between group">
                  <button
                    type="button"
                    className={`w-full rounded px-3 py-2 text-left transition ${
                      isActive
                        ? 'bg-slate-800 text-primary'
                        : isDisabled
                          ? 'bg-slate-900/40 text-slate-500 hover:bg-slate-900/50'
                          : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => handleSelectIntegration(integration.id)}
                  >
                    <div className="font-medium">{integration.name}</div>
                    <div className="text-xs text-slate-500">{providerConfig?.name || integration.providerId}</div>
                    {isDisabled && (
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-amber-400">Выключена</div>
                    )}
                  </button>
                  <button
                    type="button"
                    className="ml-2 p-1 rounded-full text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteIntegration(integration.id)}
                    title="Delete Integration"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-4 mb-2 text-xs uppercase tracking-wide text-slate-400">Add New Integration</h3>
          <ul className="space-y-2 text-sm">
            {PROVIDERS.map((provider) => (
              <li key={provider.id}>
                <button
                  type="button"
                  className="w-full rounded border border-dashed border-slate-700 px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-400 hover:border-primary/60 hover:text-primary"
                  onClick={() => handleCreateNewIntegration(provider)}
                >
                  + {provider.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {showCreateModal && integrationDraft && activeProviderConfig && (
        <Modal
          title={`Create ${activeProviderConfig.name} Integration`}
          onClose={() => setShowCreateModal(false)}
          actions={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-primary px-4 py-1 text-xs font-semibold text-white hover:bg-primary/90"
                onClick={handleSaveIntegration}
                disabled={!integrationDraft.name || !integrationDraft.providerId}
              >
                Create
              </button>
            </div>
          }
        >
          <GlobalIntegrationForm
            integration={integrationDraft}
            providerConfig={activeProviderConfig}
            onUpdate={(patch) => setIntegrationDraft(d => d ? { ...d, ...patch } : null)}
          />
        </Modal>
      )}

      {showEditModal && integrationDraft && activeProviderConfig ? (
        <Modal
          title={`Edit ${activeGlobalIntegration?.name || activeProviderConfig.name} Integration`}
          onClose={() => {
            setShowEditModal(false);
            setIntegrationDraft(null);
            setStatusMessage(null);
          }}
          actions={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                onClick={() => {
                  setShowEditModal(false);
                  setIntegrationDraft(null);
                  setStatusMessage(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-primary px-4 py-1 text-xs font-semibold text-white hover:bg-primary/90"
                onClick={handleSaveIntegration}
                disabled={!integrationDraft?.name || !integrationDraft?.providerId}
              >
                Save Changes
              </button>
            </div>
          }
        >
          <GlobalIntegrationDetails
            integration={integrationDraft}
            providerConfig={activeProviderConfig}
            onUpdate={(patch) => setIntegrationDraft(d => d ? { ...d, ...patch } : null)}
            onSave={handleSaveIntegration}
            statusMessage={statusMessage}
            onRefreshModels={supportsModelSync ? handleRefreshModels : undefined}
            refreshingModels={refreshingModels}
            onNotify={setStatusMessage}
          />
        </Modal>
      ) : showEditModal && (
        <Modal
          title="Ошибка загрузки интеграции"
          onClose={() => {
            setShowEditModal(false);
            setIntegrationDraft(null);
            setStatusMessage(null);
          }}
          actions={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
                onClick={() => {
                  setShowEditModal(false);
                  setIntegrationDraft(null);
                  setStatusMessage(null);
                }}
              >
                Закрыть
              </button>
            </div>
          }
        >
          <div className="text-red-400 p-4 text-center">
            <p className="mb-2">Не удалось загрузить данные интеграции</p>
            <p className="text-sm text-slate-400">
              Интеграция: {integrationDraft ? 'найдена' : 'не найдена'}<br/>
              Провайдер: {activeProviderConfig ? 'найден' : 'не найден'}
            </p>
          </div>
        </Modal>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </div>
  );
}

interface GlobalIntegrationDetailsProps {
  integration: IntegrationDraft;
  providerConfig: ProviderConfig;
  onUpdate: (patch: Partial<IntegrationDraft>) => void;
  onSave: () => void;
  statusMessage: string | null;
  onRefreshModels?: (options?: { limit?: number }) => Promise<void> | void;
  refreshingModels?: boolean;
  onNotify?: (message: string) => void;
}

function GlobalIntegrationDetails({
  integration,
  providerConfig,
  onUpdate,
  onSave,
  statusMessage,
  onRefreshModels,
  refreshingModels = false,
  onNotify,
}: GlobalIntegrationDetailsProps) {
  // Добавляем защитные проверки
  if (!integration) {
    return (
      <div className="text-red-400 p-4">
        <p>Ошибка: данные интеграции не загружены</p>
      </div>
    );
  }

  if (!providerConfig) {
    return (
      <div className="text-red-400 p-4">
        <p>Ошибка: конфигурация провайдера не найдена</p>
      </div>
    );
  }

  const providerId = providerConfig.id;
  const isEnabled = integration.enabled !== false;
  const isReplicate = providerId === 'replicate';
  const isOpenAi = providerId === 'openai_gpt';
  const isGoogle =
    providerId === 'google_ai_studio' || providerId === 'google_gemini' || providerId === 'google_workspace';
  const supportsModelSync = isReplicate || isOpenAi || isGoogle;

  const providerDefaultModels = useMemo(
    () => (isReplicate ? DEFAULT_REPLICATE_MODELS : []),
    [isReplicate],
  );

  const storedModels = Array.isArray(integration.models) ? integration.models : [];
  const hasStoredModels = storedModels.length > 0;
  const displayModels = hasStoredModels ? storedModels : providerDefaultModels;
  const usingDefaults = !hasStoredModels && providerDefaultModels.length > 0;
  const modelsKey = useMemo(() => displayModels.join('\n'), [displayModels]);
  const [bulkModelsInput, setBulkModelsInput] = useState(modelsKey);
  const [newModelValue, setNewModelValue] = useState('');
  const [modelSyncLimit, setModelSyncLimit] = useState('200');

  const modelSectionTitle = isOpenAi
    ? 'OpenAI Models'
    : isGoogle
      ? 'Google Models'
      : 'Replicate Models';
  const modelSectionDescription = isOpenAi
    ? 'Список моделей OpenAI используется в узлах ИИ для выбора целевой модели.'
    : isGoogle
      ? 'Список моделей Google (Gemini / Workspace) будет доступен в настройках узлов.'
      : 'Этот список используется в узлах ИИ, если модели не загружаются динамически.';
  const refreshButtonLabel = isOpenAi
    ? 'Обновить из OpenAI'
    : isGoogle
      ? 'Обновить из Google'
      : 'Обновить из Replicate';
  const modelPlaceholder = isOpenAi
    ? 'gpt-4.1-mini'
    : isGoogle
      ? 'models/gemini-2.0-flash'
      : 'owner/model:version-id';
  const apiKeyPlaceholder = isGoogle ? 'AIza...' : isReplicate ? 'r8_xxxxxxxxxxxxx' : 'sk-***';
  const baseUrlPlaceholder = isReplicate
    ? 'https://api.replicate.com'
    : isGoogle
      ? 'https://generativelanguage.googleapis.com'
      : 'https://api.openai.com/v1';
  const baseUrlLabel = isGoogle ? 'Endpoint (optional)' : 'Base URL (optional)';
  const emptyListMessage =
    'Список моделей пуст. Добавьте модель вручную или обновите список из провайдера.';

  useEffect(() => {
    setBulkModelsInput(modelsKey);
  }, [integration.id, modelsKey]);

  const handledCredentialTargets = new Set<CredentialTarget>();
  const credentialBindings = providerConfig.credentials
    .map((credential) => {
      const binding = createCredentialBinding(credential, integration, onUpdate);
      if (binding) {
        handledCredentialTargets.add(binding.target);
      }
      return binding;
    })
    .filter((binding): binding is CredentialBinding => Boolean(binding));

  if (!handledCredentialTargets.has('apiKey')) {
    const fallbackBinding = createCredentialBinding(
      { label: 'API Key', key: 'API_KEY', placeholder: apiKeyPlaceholder },
      integration,
      onUpdate,
    );
    if (fallbackBinding) {
      fallbackBinding.key = '__fallback_api_key__';
      credentialBindings.push(fallbackBinding);
      handledCredentialTargets.add('apiKey');
    }
  }

  if (!handledCredentialTargets.has('baseUrl')) {
    const fallbackBinding = createCredentialBinding(
      { label: baseUrlLabel, key: 'BASE_URL', placeholder: baseUrlPlaceholder },
      integration,
      onUpdate,
    );
    if (fallbackBinding) {
      fallbackBinding.key = '__fallback_base_url__';
      credentialBindings.push(fallbackBinding);
      handledCredentialTargets.add('baseUrl');
    }
  }

  if (!handledCredentialTargets.has('organization') && isOpenAi) {
    const fallbackBinding = createCredentialBinding(
      { label: 'Organization ID (optional)', key: 'ORG_ID', placeholder: 'org-...' },
      integration,
      onUpdate,
    );
    if (fallbackBinding) {
      fallbackBinding.key = '__fallback_org__';
      credentialBindings.push(fallbackBinding);
      handledCredentialTargets.add('organization');
    }
  }

  const uniqueCredentialBindings = credentialBindings.filter(
    (binding, index, array) => array.findIndex((candidate) => candidate.key === binding.key) === index,
  );

  const renderCredentialBinding = (binding: CredentialBinding) => (
    <label key={binding.key} className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {binding.label}
      </span>
      {binding.component === 'textarea' ? (
        <textarea
          className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={binding.value}
          onChange={(event) => binding.onChange(event.target.value)}
          placeholder={binding.placeholder}
        />
      ) : binding.component === 'select' ? (
        <select
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={binding.value}
          onChange={(event) => binding.onChange(event.target.value)}
        >
          {(binding.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={binding.inputType ?? 'text'}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={binding.value}
          onChange={(event) => binding.onChange(event.target.value)}
          placeholder={binding.placeholder}
        />
      )}
      {binding.helperText && (
        <span className="text-xs text-slate-500">{binding.helperText}</span>
      )}
      {binding.onReset && (
        <button
          type="button"
          className="self-start text-[11px] text-emerald-400 hover:text-emerald-300"
          onClick={binding.onReset}
        >
          Сменить значение
        </button>
      )}
    </label>
  );

  const formattedModelsUpdatedAt = useMemo(() => {
    if (!integration.modelsUpdatedAt) {
      return null;
    }
    const date = new Date(integration.modelsUpdatedAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  }, [integration.modelsUpdatedAt]);

  const hasBulkChanges = useMemo(() => {
    const normalizedCurrent = modelsKey.replace(/\r/g, '').trim();
    const normalizedInput = bulkModelsInput.replace(/\r/g, '').trim();
    return normalizedCurrent !== normalizedInput;
  }, [bulkModelsInput, modelsKey]);

  const updateModels = useCallback(
    (nextModels: string[]) => {
      const unique = Array.from(
        new Set(
          nextModels
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      ).slice(0, 400);
      setBulkModelsInput(unique.join('\n'));
      onUpdate({
        models: unique,
        modelsUpdatedAt: new Date().toISOString(),
      });
    },
    [onUpdate],
  );

  const handleApplyBulkModels = useCallback(() => {
    updateModels(bulkModelsInput.split(/\r?\n/));
    onNotify?.('Список моделей обновлён вручную.');
  }, [bulkModelsInput, onNotify, updateModels]);

  const handleAddModel = useCallback(() => {
    const candidate = newModelValue.trim();
    if (!candidate) {
      return;
    }
    const baseModels = hasStoredModels ? storedModels : providerDefaultModels;
    updateModels([...baseModels, candidate]);
    setNewModelValue('');
    onNotify?.('Модель добавлена в список. Не забудьте сохранить изменения.');
  }, [hasStoredModels, storedModels, providerDefaultModels, newModelValue, onNotify, updateModels]);

  const handleRemoveModel = useCallback(
    (value: string) => {
      const baseModels = hasStoredModels ? storedModels : providerDefaultModels;
      updateModels(baseModels.filter((model) => model !== value));
      onNotify?.('Модель удалена из списка.');
    },
    [hasStoredModels, storedModels, providerDefaultModels, onNotify, updateModels],
  );

  const handleClearModels = useCallback(() => {
    updateModels([]);
    setNewModelValue('');
    const message = providerDefaultModels.length > 0
      ? 'Список моделей очищен. Будет использован набор по умолчанию.'
      : 'Список моделей очищен. Добавьте модели вручную или обновите список из провайдера.';
    onNotify?.(message);
  }, [onNotify, updateModels, providerDefaultModels]);

  const handleUseDefaultModels = useCallback(() => {
    if (providerDefaultModels.length === 0) {
      updateModels([]);
      onNotify?.('Для этого провайдера нет списка моделей по умолчанию.');
      return;
    }
    updateModels(providerDefaultModels);
    onNotify?.('Загружен список моделей по умолчанию.');
  }, [providerDefaultModels, updateModels, onNotify]);

  const handleRefreshClick = useCallback(async () => {
    if (!onRefreshModels) {
      onNotify?.('Сохраните интеграцию и укажите API ключ, чтобы обновить список моделей.');
      return;
    }
    const parsedLimit = Number.parseInt(modelSyncLimit, 10);
    const limit = Number.isNaN(parsedLimit) || parsedLimit <= 0 ? undefined : parsedLimit;
    await Promise.resolve(onRefreshModels({ limit }));
  }, [modelSyncLimit, onNotify, onRefreshModels]);

  return (
    <div className="space-y-4">
      <header className="border-b border-slate-800 pb-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">Provider: {providerConfig.name}</p>
        <input
          type="text"
          className="w-full bg-transparent text-xl font-semibold text-slate-100 focus:outline-none"
          value={integration.name || ''}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Integration Name"
        />
        <textarea
          className="w-full bg-transparent text-sm text-slate-400 focus:outline-none mt-1"
          value={integration.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Description (optional)"
          rows={2}
        />
      </header>

      <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Статус интеграции</p>
          <p className="text-sm text-slate-200">{isEnabled ? 'Включена' : 'Отключена'}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            checked={isEnabled}
            onChange={(event) => onUpdate({ enabled: event.target.checked })}
          />
          <span>{isEnabled ? 'Включена' : 'Отключена'}</span>
        </label>
      </div>

      {/* Default Provider Toggle */}
      <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Интеграция по умолчанию</p>
          <p className="text-xs text-slate-400">Новые AI-ноды будут использовать этот провайдер</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            checked={integration.isDefault === true}
            onChange={(event) => onUpdate({ isDefault: event.target.checked })}
          />
          <span className="text-xl">{integration.isDefault ? '♥' : '♡'}</span>
        </label>
      </div>

      {/* Simplified Credentials Section - Only user configurable fields */}
      <section>
        <h4 className="text-xs uppercase tracking-wide text-slate-400 mb-3">Configuration</h4>
        <div className="space-y-3">
          {uniqueCredentialBindings.map(renderCredentialBinding)}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">System Prompt Template (optional)</span>
            <textarea
              className="min-h-[80px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
              value={integration.systemPrompt || ''}
              onChange={(event) => onUpdate({ systemPrompt: event.target.value })}
              placeholder="You are an assistant..."
            />
          </label>
        </div>
      </section>

      {supportsModelSync && (
        <section className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-xs uppercase tracking-wide text-slate-400">{modelSectionTitle}</h4>
              <p className="text-[11px] text-slate-500">{modelSectionDescription}</p>
              {formattedModelsUpdatedAt && (
                <p className="text-[11px] text-slate-500">
                  Обновлено: <span className="text-slate-300">{formattedModelsUpdatedAt}</span>
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                Моделей: {displayModels.length}
                {usingDefaults && ' (по умолчанию)'}
              </p>
              {usingDefaults && isReplicate && (
                <p className="text-[11px] text-slate-500">
                  Используется базовый список. Отредактируйте значения выше и нажмите «Применить список», чтобы сохранить его.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                  Лимит
                  <input
                    type="number"
                    min={1}
                    max={400}
                    value={modelSyncLimit}
                    onChange={(event) => setModelSyncLimit(event.target.value)}
                    className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  className="rounded bg-blue-500/20 px-3 py-1 text-xs text-blue-200 hover:bg-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={handleRefreshClick}
                  disabled={!onRefreshModels || refreshingModels}
                >
                  {refreshingModels ? 'Обновляем...' : refreshButtonLabel}
                </button>
                {providerDefaultModels.length > 0 && (
                  <button
                    type="button"
                    className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={handleUseDefaultModels}
                    disabled={refreshingModels}
                  >
                    По умолчанию
                  </button>
                )}
                <button
                  type="button"
                  className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={handleClearModels}
                  disabled={!hasStoredModels || refreshingModels}
              >
                Очистить
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              Список моделей (по одной на строку)
              <textarea
                className="min-h-[120px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                value={bulkModelsInput}
                onChange={(event) => setBulkModelsInput(event.target.value)}
                placeholder={modelPlaceholder}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-primary/80 px-3 py-1 text-xs text-white hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleApplyBulkModels}
                disabled={!hasBulkChanges}
              >
                Применить список
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => setBulkModelsInput(modelsKey)}
                disabled={!hasBulkChanges}
              >
                Отменить изменения
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                onClick={() => {
                  const stripped = bulkModelsInput
                    .split(/\r?\n/)
                    .map((value) => value.trim().split(':')[0] ?? '')
                    .filter((value) => value.length > 0)
                    .join('\n');
                  setBulkModelsInput(stripped);
                  onNotify?.('Удалены версии из списка моделей. Проверьте и примените изменения.');
                }}
              >
                Последняя версия
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              className="flex-1 min-w-[200px] rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-primary focus:outline-none"
              value={newModelValue}
              onChange={(event) => setNewModelValue(event.target.value)}
              placeholder={modelPlaceholder}
            />
            <button
              type="button"
              className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleAddModel}
              disabled={newModelValue.trim().length === 0}
            >
              Добавить модель
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {displayModels.length === 0 ? (
              <span className="text-xs text-slate-500">
                {emptyListMessage}
              </span>
            ) : (
              displayModels.map((model) => (
                <span
                  key={model}
                  className="group flex items-center gap-2 rounded border border-slate-700 bg-slate-800/70 px-2 py-1 text-xs text-slate-200"
                >
                  {model}
                  <button
                    type="button"
                    className="rounded bg-slate-700/50 px-1 text-[10px] uppercase tracking-wide text-slate-300 hover:bg-rose-500/30 hover:text-rose-200"
                    onClick={() => handleRemoveModel(model)}
                  >
                    Удалить
                  </button>
                </span>
              ))
            )}
          </div>
        </section>
      )}

      {/* Custom Fields Section */}
      <IntegrationFieldsEditor
        fields={Array.isArray(integration.inputFields) ? integration.inputFields : []}
        onChange={(fields) => onUpdate({ inputFields: fields })}
      />
      
      {statusMessage && (
        <p className="text-xs text-emerald-300">{statusMessage}</p>
      )}
      
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded bg-primary px-4 py-1 text-xs font-semibold text-white hover:bg-primary/90"
          onClick={onSave}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

interface GlobalIntegrationFormProps {
  integration: IntegrationDraft;
  providerConfig: ProviderConfig;
  onUpdate: (patch: Partial<IntegrationDraft>) => void;
}

function GlobalIntegrationForm({ integration, providerConfig, onUpdate }: GlobalIntegrationFormProps) {
  const handledTargets = new Set<CredentialTarget>();

  const credentialBindings = providerConfig.credentials
    .map((credential) => {
      const binding = createCredentialBinding(credential, integration, onUpdate);
      if (binding) {
        handledTargets.add(binding.target);
      }
      return binding;
    })
    .filter((binding): binding is CredentialBinding => Boolean(binding));

  const renderBindingControl = (binding: CredentialBinding) => (
    <label key={binding.key} className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {binding.label}
      </span>
      {binding.component === 'textarea' ? (
        <textarea
          className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={binding.value}
          onChange={(event) => binding.onChange(event.target.value)}
          placeholder={binding.placeholder}
        />
      ) : binding.component === 'select' ? (
        <select
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={binding.value}
          onChange={(event) => binding.onChange(event.target.value)}
        >
          {(binding.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={binding.inputType ?? 'text'}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={binding.value}
          onChange={(event) => binding.onChange(event.target.value)}
          placeholder={binding.placeholder}
        />
      )}
      {binding.helperText && (
        <span className="text-xs text-slate-500">{binding.helperText}</span>
      )}
      {binding.onReset && (
        <button
          type="button"
          className="self-start text-[11px] text-emerald-400 hover:text-emerald-300"
          onClick={binding.onReset}
        >
          Сменить значение
        </button>
      )}
    </label>
  );

  if (!handledTargets.has('apiKey')) {
    const fallbackBinding = createCredentialBinding(
      { label: 'API Key', key: 'API_KEY', placeholder: 'sk-***' },
      integration,
      onUpdate,
    );
    if (fallbackBinding) {
      fallbackBinding.key = '__fallback_api_key__';
      credentialBindings.push(fallbackBinding);
      handledTargets.add('apiKey');
    }
  }

  if (!handledTargets.has('baseUrl')) {
    const fallbackBinding = createCredentialBinding(
      { label: 'Base URL (optional)', key: 'BASE_URL', placeholder: 'https://api.example.com' },
      integration,
      onUpdate,
    );
    if (fallbackBinding) {
      fallbackBinding.key = '__fallback_base_url__';
      credentialBindings.push(fallbackBinding);
      handledTargets.add('baseUrl');
    }
  }

  if (!handledTargets.has('organization') && providerConfig.id === 'openai_gpt') {
    const fallbackBinding = createCredentialBinding(
      { label: 'Organization ID (optional)', key: 'ORG_ID', placeholder: 'org-...' },
      integration,
      onUpdate,
    );
    if (fallbackBinding) {
      fallbackBinding.key = '__fallback_org__';
      credentialBindings.push(fallbackBinding);
      handledTargets.add('organization');
    }
  }

  const uniqueBindings = credentialBindings.filter(
    (binding, index, self) => self.findIndex((candidate) => candidate.key === binding.key) === index,
  );

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Integration Name</span>
        <input
          type="text"
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={integration.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="My Custom OpenAI Integration"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description</span>
        <textarea
          className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
          value={integration.description ?? ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="A short description of this integration"
          rows={2}
        />
      </label>

      <label className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
        <span>Интеграция включена</span>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-600 bg-slate-900"
          checked={integration.enabled !== false}
          onChange={(event) => onUpdate({ enabled: event.target.checked })}
        />
      </label>

      <div className="space-y-3 pt-2">
        {uniqueBindings.map(renderBindingControl)}
      </div>
    </div>
  );
}

function IntegrationFieldsEditor({
  fields,
  onChange,
}: {
  fields: IntegrationFieldConfig[];
  onChange: (fields: IntegrationFieldConfig[]) => void;
}) {
  const updateField = (id: string, patch: Partial<IntegrationFieldConfig>) => {
    onChange(
      fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  };

  const removeField = (id: string) => {
    onChange(fields.filter((field) => field.id !== id));
  };

  const addField = () => {
    onChange([
      ...fields,
      {
        id: `field_${Date.now()}`,
        label: 'New Field',
        key: `field_${fields.length + 1}`,
        type: 'text',
        placeholder: '',
        description: '',
        required: false,
        default_value: '',
      },
    ]);
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Integration Fields</h4>
          <p className="text-xs text-slate-400">
            These fields appear in the agent node. Use them as input forms.
          </p>
        </div>
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
          onClick={addField}
        >
          + Add Field
        </button>
      </header>
      {fields.length === 0 && (
        <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400">
          No fields yet. Add at least one to guide users on what to fill in.
        </p>
      )}
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={String(field.id ?? field.key)} className="rounded border border-slate-700 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-semibold text-slate-200">{field.label || `Field ${index + 1}`}</h5>
              <button
                type="button"
                className="rounded bg-slate-800 px-2 py-1 text-xs text-rose-200 hover:bg-rose-600/20"
                onClick={() => removeField(field.id)}
              >
                Delete
              </button>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Label
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.label}
                  onChange={(event) => updateField(field.id, { label: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Key
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.key}
                  onChange={(event) => updateField(field.id, { key: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Type
                <select
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.type}
                  onChange={(event) => updateField(field.id, { type: event.target.value as IntegrationFieldConfig['type'] })}
                >
                  <option value="text">Text</option>
                  <option value="textarea">Textarea</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Placeholder
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.placeholder ?? ''}
                  onChange={(event) => updateField(field.id, { placeholder: event.target.value })}
                />
              </label>
            </div>
            <label className="mt-2 flex flex-col gap-1 text-xs text-slate-300">
              Description
              <textarea
                className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                value={field.description ?? ''}
                onChange={(event) => updateField(field.id, { description: event.target.value })}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(event) => updateField(field.id, { required: event.target.checked })}
                />
                Required
              </label>
              <label className="flex flex-col gap-1">
                Default Value
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.default_value ?? ''}
                  onChange={(event) => updateField(field.id, { default_value: event.target.value })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ProviderPanel;
