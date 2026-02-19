import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import {
  PROVIDERS,
  type ProviderConfig,
} from '../../data/providers';
import type { IntegrationModelSyncPayload } from '../../state/api';
import { useGlobalIntegrationsStore } from '../../state/globalIntegrationsStore';
import type { IntegrationDraft } from './components/credentialBindings';
import { GlobalIntegrationDetails } from './components/GlobalIntegrationDetails';
import { GlobalIntegrationForm } from './components/GlobalIntegrationForm';

type ProviderPanelProps = {
  onSelect?: (provider: ProviderConfig | null) => void;
};

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
  const [showEditModal, setShowEditModal] = useState(false);
  const [integrationDraft, setIntegrationDraft] = useState<IntegrationDraft | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);

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
      setActiveGlobalIntegrationId(integrationId);
      setStatusMessage(null);

      if (!integrationId) {
        onSelect?.(null);
        setShowEditModal(false);
        setIntegrationDraft(null);
        return;
      }

      const integration = integrations.find(i => i.id === integrationId);
      if (!integration || !integration.providerId) {
        setStatusMessage(integration ? 'Invalid integration data' : 'Integration not found');
        setShowEditModal(false);
        return;
      }

      const providerConfig = PROVIDERS.find(p => p.id === integration.providerId);
      if (!providerConfig) {
        setStatusMessage('Provider not found');
        setShowEditModal(false);
        return;
      }

      onSelect?.(providerConfig);
      setIntegrationDraft({
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
        extra: (typeof integration.extra === 'object' && integration.extra !== null
          ? { ...integration.extra } : {}),
      });
      setShowEditModal(true);
    } catch {
      setStatusMessage('Error opening integration settings');
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
        await updateIntegration(integrationDraft.id, dataToSave);
        setStatusMessage('Settings saved.');
      } else {
        const newIntegration = await addIntegration(dataToSave);
        if (newIntegration) {
          setActiveGlobalIntegrationId(newIntegration.id);
          setStatusMessage('Integration created.');
        }
      }
      setShowCreateModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Error: ${message}`);
    }
  }, [integrationDraft, addIntegration, updateIntegration]);

  const handleRefreshModels = useCallback(async (options?: { limit?: number }) => {
    if (!integrationDraft || !integrationDraft.providerId) {
      return;
    }
    if (!integrationDraft.id) {
      setStatusMessage('Save integration to update the model list.');
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
    setStatusMessage(`Loading model list from ${providerLabel}...`);
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
        setStatusMessage('Failed to update model list.');
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
          ? `Model list updated (${nextModels.length}).`
          : `No models found for the specified key (${providerLabel}).`,
      );
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
      setStatusMessage(`Error loading models: ${message}`);
    } finally {
      setRefreshingModels(false);
    }
  }, [integrationDraft, refreshIntegrationModels]);

  const handleDeleteIntegration = useCallback(async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Delete integration?',
      message: 'Integration will be permanently deleted. All related settings will be lost.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });

    if (confirmed) {
      try {
        await removeIntegration(id);
        setActiveGlobalIntegrationId(null);
        setStatusMessage('Integration deleted.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Error: ${message}`);
      }
    }
  }, [removeIntegration]);

  const supportsModelSync = !!integrationDraft &&
    ['replicate', 'openai_gpt', 'google_ai_studio', 'google_gemini', 'google_workspace'].includes(integrationDraft.providerId);

  const closeEditModal = useCallback(() => {
    setShowEditModal(false);
    setIntegrationDraft(null);
    setStatusMessage(null);
  }, []);

  if (loading) return <p>Loading integrations...</p>;
  if (error) return <p className="text-red-500">Error: {error}</p>;

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
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-amber-400">Disabled</div>
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
          onClose={closeEditModal}
          actions={
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500" onClick={closeEditModal}>Cancel</button>
              <button type="button" className="rounded bg-primary px-4 py-1 text-xs font-semibold text-white hover:bg-primary/90" onClick={handleSaveIntegration} disabled={!integrationDraft?.name || !integrationDraft?.providerId}>Save Changes</button>
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
        <Modal title="Integration loading error" onClose={closeEditModal} actions={
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700" onClick={closeEditModal}>Close</button>
          </div>
        }>
          <div className="text-red-400 p-4 text-center">
            <p className="mb-2">Failed to load integration data</p>
            <p className="text-sm text-slate-400">
              Integration: {integrationDraft ? 'found' : 'not found'}<br/>
              Provider: {activeProviderConfig ? 'found' : 'not found'}
            </p>
          </div>
        </Modal>
      )}

      <ConfirmDialog />
    </div>
  );
}

export default ProviderPanel;
