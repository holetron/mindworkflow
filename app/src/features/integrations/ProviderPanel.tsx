import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import { PROVIDERS, type ProviderConfig } from '../../data/providers';
import {
  fetchProject,
  updateProjectSettingsRemote,
  type ProjectSummary,
  type IntegrationFieldConfig,
} from '../../state/api';

type ProviderPanelProps = {
  onSelect?: (provider: ProviderConfig | null) => void;
  projects?: ProjectSummary[];
};

interface IntegrationDraft {
  apiKey: string;
  baseUrl: string;
  organization: string;
  webhookContract: string;
  systemPrompt: string;
  inputFields: IntegrationFieldDraft[];
}

interface IntegrationFieldDraft {
  id: string;
  label: string;
  key: string;
  type: 'text' | 'textarea';
  placeholder?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

function ProviderPanel({ onSelect, projects = [] }: ProviderPanelProps) {
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.project_id ?? null);
  const [integrationDraft, setIntegrationDraft] = useState<IntegrationDraft | null>(null);
  const [loadingIntegration, setLoadingIntegration] = useState(false);
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.id === activeProviderId) ?? null,
    [activeProviderId],
  );

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].project_id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!activeProvider || !selectedProjectId) {
      setIntegrationDraft(null);
      return;
    }

    setLoadingIntegration(true);
    setStatusMessage(null);
    fetchProject(selectedProjectId)
      .then((project) => {
        const integrations =
          project.settings && typeof project.settings === 'object'
            ? ((project.settings as { integrations?: Record<string, unknown> }).integrations ?? {})
            : {};
        const integrationKey = activeProvider.integrationKey ?? activeProvider.id;
        const providerSettings =
          integrations && typeof integrations === 'object'
            ? ((integrations as Record<string, unknown>)[integrationKey] as Record<string, unknown> | undefined)
            : undefined;
        const draft: IntegrationDraft = buildIntegrationDraft(providerSettings);
        setIntegrationDraft(draft);
      })
      .catch((error) => {
        console.error(error);
        setIntegrationDraft(buildIntegrationDraft(undefined));
      })
      .finally(() => setLoadingIntegration(false));
  }, [activeProvider, selectedProjectId]);

  const handlePick = (provider: ProviderConfig | null) => {
    onSelect?.(provider);
    setActiveProviderId(provider?.id ?? null);
    setStatusMessage(null);
    if (!provider) {
      setIntegrationDraft(null);
    }
  };

  const handleSaveIntegration = useCallback(
    async (provider: ProviderConfig) => {
      if (!integrationDraft || !selectedProjectId) return;
      try {
        setSavingIntegration(true);
        setStatusMessage(null);
        const payload = buildIntegrationPayload(integrationDraft);
        const integrationKey = provider.integrationKey ?? provider.id;
        await updateProjectSettingsRemote(selectedProjectId, {
          integrations: { [integrationKey]: payload },
        });
        setStatusMessage('Настройки сохранены.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Ошибка: ${message}`);
      } finally {
        setSavingIntegration(false);
      }
    },
    [integrationDraft, selectedProjectId],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-100">Integration Catalog</h2>
        <p className="text-sm text-slate-400">
          Register API credentials, quotas, and webhook contracts. Agents reuse these presets inside nodes.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 gap-4">
        <nav className="w-48 overflow-y-auto pr-2">
          <ul className="space-y-2 text-sm">
            {PROVIDERS.map((provider) => {
              const isActive = provider.id === activeProviderId;
              return (
                <li key={provider.id}>
                  <button
                    type="button"
                    className={`w-full rounded px-3 py-2 text-left transition ${
                      isActive ? 'bg-slate-800 text-primary' : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => handlePick(provider)}
                  >
                    <div className="font-medium">{provider.name}</div>
                    <div className="text-xs text-slate-500">{provider.category}</div>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="mt-4 w-full rounded border border-dashed border-slate-700 px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-400 hover:border-primary/60 hover:text-primary"
            onClick={() => {
              setShowCreate(true);
              setActiveProviderId(null);
              onSelect?.(null);
            }}
          >
            Add Integration
          </button>
        </nav>
      </div>
      {activeProvider && (
        <Modal
          title={activeProvider.name}
          onClose={() => handlePick(null)}
          actions={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                onClick={() => handlePick(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="rounded bg-primary px-4 py-1 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
                onClick={() => handleSaveIntegration(activeProvider)}
                disabled={savingIntegration || !integrationDraft || !selectedProjectId}
              >
                {savingIntegration ? 'Saving…' : 'Save' }
              </button>
            </div>
          }
        >
          <ProviderDetails provider={activeProvider} />
          <hr className="my-4 border-slate-800" />
          <section className="space-y-3 text-sm text-slate-200">
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">Project Access</h3>
                <p className="text-xs text-slate-400">
                  Сохраните реальные ключи и подсказки, которые будут использовать ноды агента.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <span>Project</span>
                <select
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={selectedProjectId ?? ''}
                  onChange={(event) => setSelectedProjectId(event.target.value || null)}
                >
                  {projects.map((project) => (
                    <option key={project.project_id} value={project.project_id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
            </header>
            {loadingIntegration && <p className="text-xs text-slate-400">Загрузка настроек…</p>}
            {!loadingIntegration && integrationDraft && (
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">API Key</span>
                  <textarea
                    className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                    value={integrationDraft.apiKey}
                    onChange={(event) =>
                      setIntegrationDraft((draft) => (draft ? { ...draft, apiKey: event.target.value } : draft))
                    }
                    placeholder="sk-***"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Base URL</span>
                  <input
                    type="text"
                    className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                    value={integrationDraft.baseUrl}
                    onChange={(event) =>
                      setIntegrationDraft((draft) => (draft ? { ...draft, baseUrl: event.target.value } : draft))
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Organization ID</span>
                  <input
                    type="text"
                    className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                    value={integrationDraft.organization}
                    onChange={(event) =>
                      setIntegrationDraft((draft) => (draft ? { ...draft, organization: event.target.value } : draft))
                    }
                    placeholder="org-..."
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Webhook Contract</span>
                  <textarea
                    className="min-h-[120px] rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-200 focus:border-primary focus:outline-none"
                    value={integrationDraft.webhookContract}
                    onChange={(event) =>
                      setIntegrationDraft((draft) => (draft ? { ...draft, webhookContract: event.target.value } : draft))
                    }
                    placeholder={`{
  "headers": { ... },
  "body": { ... }
}`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">System Prompt Template</span>
                  <textarea
                    className="min-h-[120px] rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                    value={integrationDraft.systemPrompt}
                    onChange={(event) =>
                      setIntegrationDraft((draft) => (draft ? { ...draft, systemPrompt: event.target.value } : draft))
                    }
                    placeholder="You are an assistant..."
                  />
                </label>
                <IntegrationFieldsEditor
                  fields={integrationDraft.inputFields}
                  disabled={savingIntegration}
                  onChange={(fields) =>
                    setIntegrationDraft((draft) => (draft ? { ...draft, inputFields: fields } : draft))
                  }
                />
                {statusMessage && (
                  <p className="text-xs text-emerald-300">{statusMessage}</p>
                )}
              </div>
            )}
          </section>
        </Modal>
      )}
      {showCreate && (
        <Modal
          title="Create Integration"
          onClose={() => setShowCreate(false)}
          actions={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-primary px-4 py-1 text-xs font-semibold text-white hover:bg-primary/90"
              >
                Save draft
              </button>
            </div>
          }
        >
          <p className="text-sm text-slate-300">
            Provider creation is not persisted yet. Paste credentials, limits, and webhook contract in the template
            below to share with teammates.
          </p>
          <textarea
            className="mt-4 h-56 w-full rounded border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100 focus:border-primary focus:outline-none"
            defaultValue={`{
  "id": "my_provider",
  "name": "Custom Provider",
  "category": "text_to_text",
  "description": "",
  "credentials": [],
  "limits": [],
  "webhookContract": "",
  "pythonHelper": ""
}`}
          />
        </Modal>
      )}
    </div>
  );
}

function buildIntegrationDraft(settings: Record<string, unknown> | undefined): IntegrationDraft {
  const fieldsRaw = Array.isArray((settings as { input_fields?: IntegrationFieldConfig[] } | undefined)?.input_fields)
    ? ((settings as { input_fields?: IntegrationFieldConfig[] }).input_fields ?? [])
    : [];
  return {
    apiKey: typeof settings?.api_key === 'string' ? String(settings.api_key) : '',
    baseUrl: typeof settings?.base_url === 'string' ? String(settings.base_url) : '',
    organization: typeof settings?.organization === 'string' ? String(settings.organization) : '',
    webhookContract: typeof settings?.webhook_contract === 'string' ? String(settings.webhook_contract) : '',
    systemPrompt: typeof settings?.system_prompt_template === 'string' ? String(settings.system_prompt_template) : '',
    inputFields: fieldsRaw.map((field) => ({
      id: field.id ?? field.key,
      label: field.label,
      key: field.key,
      type: field.type ?? 'text',
      placeholder: field.placeholder,
      description: field.description,
      required: field.required,
      defaultValue: field.default_value,
    })),
  };
}

function buildIntegrationPayload(draft: IntegrationDraft): Record<string, unknown> {
  const fields = draft.inputFields
    .filter((field) => field.label.trim().length > 0 && field.key.trim().length > 0)
    .map((field) => ({
      id: field.id,
      label: field.label.trim(),
      key: field.key.trim(),
      type: field.type,
      placeholder: field.placeholder?.trim() || undefined,
      description: field.description?.trim() || undefined,
      required: Boolean(field.required),
      default_value: field.defaultValue?.trim() || undefined,
    }));

  return {
    api_key: draft.apiKey.trim(),
    base_url: draft.baseUrl.trim(),
    organization: draft.organization.trim(),
    webhook_contract: draft.webhookContract,
    system_prompt_template: draft.systemPrompt,
    input_fields: fields,
  };
}

function IntegrationFieldsEditor({
  fields,
  disabled,
  onChange,
}: {
  fields: IntegrationFieldDraft[];
  disabled: boolean;
  onChange: (fields: IntegrationFieldDraft[]) => void;
}) {
  const updateField = (id: string, patch: Partial<IntegrationFieldDraft>) => {
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
        label: 'Новое поле',
        key: `field_${fields.length + 1}`,
        type: 'text',
        placeholder: '',
        description: '',
        required: false,
        defaultValue: '',
      },
    ]);
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Integration Fields</h4>
          <p className="text-xs text-slate-400">
            Эти поля отображаются в ноде агента. Используйте их как форму ввода.
          </p>
        </div>
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
          onClick={addField}
          disabled={disabled}
        >
          + Добавить
        </button>
      </header>
      {fields.length === 0 && (
        <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400">
          Пока нет полей. Добавьте хотя бы одно, чтобы подсказать пользователям, что нужно заполнить.
        </p>
      )}
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={String(field.id ?? field.key)} className="rounded border border-slate-700 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-semibold text-slate-200">{field.label || `Поле ${index + 1}`}</h5>
              <button
                type="button"
                className="rounded bg-slate-800 px-2 py-1 text-xs text-rose-200 hover:bg-rose-600/20"
                onClick={() => removeField(field.id)}
                disabled={disabled}
              >
                Удалить
              </button>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Название
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.label}
                  onChange={(event) => updateField(field.id, { label: event.target.value })}
                  disabled={disabled}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Ключ
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.key}
                  onChange={(event) => updateField(field.id, { key: event.target.value })}
                  disabled={disabled}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Тип
                <select
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.type}
                  onChange={(event) => updateField(field.id, { type: event.target.value as IntegrationFieldDraft['type'] })}
                  disabled={disabled}
                >
                  <option value="text">Текст</option>
                  <option value="textarea">Многострочный</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Placeholder
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.placeholder ?? ''}
                  onChange={(event) => updateField(field.id, { placeholder: event.target.value })}
                  disabled={disabled}
                />
              </label>
            </div>
            <label className="mt-2 flex flex-col gap-1 text-xs text-slate-300">
              Описание
              <textarea
                className="min-h-[60px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                value={field.description ?? ''}
                onChange={(event) => updateField(field.id, { description: event.target.value })}
                disabled={disabled}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(event) => updateField(field.id, { required: event.target.checked })}
                  disabled={disabled}
                />
                Обязательное
              </label>
              <label className="flex flex-col gap-1">
                Значение по умолчанию
                <input
                  type="text"
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  value={field.defaultValue ?? ''}
                  onChange={(event) => updateField(field.id, { defaultValue: event.target.value })}
                  disabled={disabled}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderDetails({ provider }: { provider: ProviderConfig }) {
  return (
    <div className="space-y-4 text-sm text-slate-100">
      <header className="border-b border-slate-800 pb-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">Category: {provider.category}</p>
        <h3 className="mt-1 text-xl font-semibold">{provider.name}</h3>
        <p className="text-sm text-slate-400">{provider.description}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h4 className="text-xs uppercase tracking-wide text-slate-400">Credentials</h4>
          <div className="mt-2 space-y-2">
            {provider.credentials.map((credential) => (
              <div key={credential.key} className="rounded border border-slate-700 bg-slate-900 p-3">
                <p className="text-sm font-semibold text-slate-100">{credential.label}</p>
                <p className="text-xs text-slate-400">Env key: {credential.key}</p>
                {credential.placeholder && (
                  <p className="text-xs text-slate-500">Example: {credential.placeholder}</p>
                )}
              </div>
            ))}
          </div>
        </section>
        <section>
          <h4 className="text-xs uppercase tracking-wide text-slate-400">Quotas & Limits</h4>
          <ul className="mt-2 space-y-2">
            {provider.limits.map((limit) => (
              <li key={limit.label} className="rounded border border-slate-700 bg-slate-900 p-3">
                <p className="text-sm font-semibold text-slate-100">{limit.label}</p>
                <p className="text-xs text-slate-400">{limit.desc}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-wide text-slate-400">Webhook Contract</h4>
        <p className="text-xs text-slate-500">Use this shape for inbound/outbound calls.</p>
        <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-emerald-200">
{provider.webhookContract}
        </pre>
      </section>
      <section className="space-y-3">
        <h4 className="text-xs uppercase tracking-wide text-slate-400">Python Helper</h4>
        <p className="text-xs text-slate-500">Copy into your sandbox scripts for consistent requests.</p>
        <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-emerald-200">
{provider.pythonHelper}
        </pre>
      </section>
      {provider.notes && (
        <section>
          <h4 className="text-xs uppercase tracking-wide text-slate-400">Notes</h4>
          <p className="text-xs text-slate-300">{provider.notes}</p>
        </section>
      )}
    </div>
  );
}

export default ProviderPanel;
