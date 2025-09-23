import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import { PROVIDERS, type ProviderConfig } from '../../data/providers';
import type { GlobalIntegration, IntegrationFieldConfig } from '../../state/api';
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
  baseUrl?: string;
  organization?: string;
  webhookContract?: string;
  systemPrompt?: string;
  inputFields: IntegrationFieldConfig[];
}

function ProviderPanel({ onSelect }: ProviderPanelProps) {
  const { integrations, loading, error, fetchIntegrations, addIntegration, updateIntegration, removeIntegration } = useGlobalIntegrationsStore();

  const [activeGlobalIntegrationId, setActiveGlobalIntegrationId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false); // New state for editing modal
  const [integrationDraft, setIntegrationDraft] = useState<IntegrationDraft | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
    if (activeGlobalIntegration) {
      setIntegrationDraft({
        id: activeGlobalIntegration.id,
        providerId: activeGlobalIntegration.providerId,
        name: activeGlobalIntegration.name,
        description: activeGlobalIntegration.description ?? '',
        apiKey: activeGlobalIntegration.apiKey ?? '',
        baseUrl: activeGlobalIntegration.baseUrl ?? '',
        organization: activeGlobalIntegration.organization ?? '',
        webhookContract: activeGlobalIntegration.webhookContract ?? '',
        systemPrompt: activeGlobalIntegration.systemPrompt ?? '',
        inputFields: activeGlobalIntegration.inputFields ?? [],
      });
    } else {
      setIntegrationDraft(null);
    }
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
        const draft = {
          id: integration.id,
          providerId: integration.providerId,
          name: integration.name || 'Unnamed Integration',
          description: integration.description ?? '',
          apiKey: integration.apiKey ?? '',
          baseUrl: integration.baseUrl ?? '',
          organization: integration.organization ?? '',
          webhookContract: integration.webhookContract ?? '',
          systemPrompt: integration.systemPrompt ?? '',
          inputFields: Array.isArray(integration.inputFields) ? integration.inputFields : [],
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
      baseUrl: '',
      organization: '',
      webhookContract: providerConfig.webhookContract,
      systemPrompt: providerConfig.pythonHelper, // Use pythonHelper as initial system prompt
      inputFields: providerConfig.credentials.map(cred => ({ id: cred.key, label: cred.label, key: cred.key, type: 'text', placeholder: cred.placeholder ?? '' }))
    });
    setShowCreateModal(true);
    setActiveGlobalIntegrationId(null);
    onSelect?.(null);
  }, [onSelect]);

  const handleSaveIntegration = useCallback(async () => {
    if (!integrationDraft || !integrationDraft.providerId) return;

    setStatusMessage(null);
    try {
      if (integrationDraft.id) {
        // Update existing integration
        await updateIntegration(integrationDraft.id, integrationDraft);
        setStatusMessage('Настройки сохранены.');
      } else {
        // Create new integration
        const newIntegration = await addIntegration(integrationDraft);
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

  const handleDeleteIntegration = useCallback(async (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить эту интеграцию?')) {
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
              const providerConfig = PROVIDERS.find(p => p.id === integration.providerId);
              return (
                <li key={integration.id} className="flex items-center justify-between group">
                  <button
                    type="button"
                    className={`w-full rounded px-3 py-2 text-left transition ${
                      isActive ? 'bg-slate-800 text-primary' : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => handleSelectIntegration(integration.id)}
                  >
                    <div className="font-medium">{integration.name}</div>
                    <div className="text-xs text-slate-500">{providerConfig?.name || integration.providerId}</div>
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
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-100">
          <p className="text-slate-400">Select an integration or add a new one.</p>
        </div>
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
    </div>
  );
}

interface GlobalIntegrationDetailsProps {
  integration: IntegrationDraft;
  providerConfig: ProviderConfig;
  onUpdate: (patch: Partial<IntegrationDraft>) => void;
  onSave: () => void;
  statusMessage: string | null;
}

function GlobalIntegrationDetails({ integration, providerConfig, onUpdate, onSave, statusMessage }: GlobalIntegrationDetailsProps) {
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
      
      {/* Simplified Credentials Section - Only user configurable fields */}
      <section>
        <h4 className="text-xs uppercase tracking-wide text-slate-400 mb-3">Configuration</h4>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">API Key</span>
            <textarea
              className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
              value={integration.apiKey || ''}
              onChange={(event) => onUpdate({ apiKey: event.target.value })}
              placeholder="sk-***"
            />
          </label>
          
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Base URL (optional)</span>
            <input
              type="text"
              className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
              value={integration.baseUrl || ''}
              onChange={(event) => onUpdate({ baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Organization ID (optional)</span>
            <input
              type="text"
              className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
              value={integration.organization || ''}
              onChange={(event) => onUpdate({ organization: event.target.value })}
              placeholder="org-..."
            />
          </label>
          
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
      
      {/* Basic setup fields for new integration */}
      <div className="space-y-3 pt-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">API Key</span>
          <textarea
            className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
            value={integration.apiKey ?? ''}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder="sk-***"
          />
        </label>
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
