import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_REPLICATE_MODELS } from '../../../data/defaultReplicateModels';
import type { ProviderConfig } from '../../../data/providers';
import {
  type IntegrationDraft,
  type CredentialTarget,
  type CredentialBinding,
  createCredentialBinding,
} from './credentialBindings';
import { IntegrationFieldsEditor } from './IntegrationFieldsEditor';
import type { IntegrationFieldConfig } from '../../../state/api';

export interface GlobalIntegrationDetailsProps {
  integration: IntegrationDraft;
  providerConfig: ProviderConfig;
  onUpdate: (patch: Partial<IntegrationDraft>) => void;
  onSave: () => void;
  statusMessage: string | null;
  onRefreshModels?: (options?: { limit?: number }) => Promise<void> | void;
  refreshingModels?: boolean;
  onNotify?: (message: string) => void;
}

export function GlobalIntegrationDetails({
  integration,
  providerConfig,
  onUpdate,
  onSave,
  statusMessage,
  onRefreshModels,
  refreshingModels = false,
  onNotify,
}: GlobalIntegrationDetailsProps) {
  if (!integration) {
    return (
      <div className="text-red-400 p-4">
        <p>Error: integration data not loaded</p>
      </div>
    );
  }

  if (!providerConfig) {
    return (
      <div className="text-red-400 p-4">
        <p>Error: provider config not found</p>
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
    ? 'OpenAI model list is used in AI nodes for target model selection.'
    : isGoogle
      ? 'Google model list (Gemini / Workspace) will be available in node settings.'
      : 'This list is used in AI nodes if models are not loaded dynamically.';
  const refreshButtonLabel = isOpenAi
    ? 'Update from OpenAI'
    : isGoogle
      ? 'Update from Google'
      : 'Update from Replicate';
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
    'Model list is empty. Add a model manually or update from provider.';

  useEffect(() => {
    setBulkModelsInput(modelsKey);
  }, [integration.id, modelsKey]);

  const handledTargets = new Set<CredentialTarget>();
  const bindings = providerConfig.credentials
    .map((c) => { const b = createCredentialBinding(c, integration, onUpdate); if (b) handledTargets.add(b.target); return b; })
    .filter((b): b is CredentialBinding => Boolean(b));

  const addFallback = (target: CredentialTarget, label: string, key: string, placeholder: string, fallbackKey: string) => {
    if (handledTargets.has(target)) return;
    const fb = createCredentialBinding({ label, key, placeholder }, integration, onUpdate);
    if (fb) { fb.key = fallbackKey; bindings.push(fb); handledTargets.add(target); }
  };
  addFallback('apiKey', 'API Key', 'API_KEY', apiKeyPlaceholder, '__fallback_api_key__');
  addFallback('baseUrl', baseUrlLabel, 'BASE_URL', baseUrlPlaceholder, '__fallback_base_url__');
  if (isOpenAi) addFallback('organization', 'Organization ID (optional)', 'ORG_ID', 'org-...', '__fallback_org__');

  const uniqueCredentialBindings = bindings.filter(
    (b, i, arr) => arr.findIndex((c) => c.key === b.key) === i,
  );

  const inputCls = 'rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none';
  const renderCredentialBinding = (b: CredentialBinding) => (
    <label key={b.key} className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{b.label}</span>
      {b.component === 'textarea' ? (
        <textarea className={`min-h-[60px] ${inputCls}`} value={b.value} onChange={(e) => b.onChange(e.target.value)} placeholder={b.placeholder} />
      ) : b.component === 'select' ? (
        <select className={inputCls} value={b.value} onChange={(e) => b.onChange(e.target.value)}>
          {(b.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={b.inputType ?? 'text'} className={inputCls} value={b.value} onChange={(e) => b.onChange(e.target.value)} placeholder={b.placeholder} />
      )}
      {b.helperText && <span className="text-xs text-slate-500">{b.helperText}</span>}
      {b.onReset && (
        <button type="button" className="self-start text-[11px] text-emerald-400 hover:text-emerald-300" onClick={b.onReset}>Change value</button>
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
    onNotify?.('Model list updated manually.');
  }, [bulkModelsInput, onNotify, updateModels]);

  const handleAddModel = useCallback(() => {
    const candidate = newModelValue.trim();
    if (!candidate) {
      return;
    }
    const baseModels = hasStoredModels ? storedModels : providerDefaultModels;
    updateModels([...baseModels, candidate]);
    setNewModelValue('');
    onNotify?.('Model added to list. Don\'t forget to save changes.');
  }, [hasStoredModels, storedModels, providerDefaultModels, newModelValue, onNotify, updateModels]);

  const handleRemoveModel = useCallback(
    (value: string) => {
      const baseModels = hasStoredModels ? storedModels : providerDefaultModels;
      updateModels(baseModels.filter((model) => model !== value));
      onNotify?.('Model removed from list.');
    },
    [hasStoredModels, storedModels, providerDefaultModels, onNotify, updateModels],
  );

  const handleClearModels = useCallback(() => {
    updateModels([]);
    setNewModelValue('');
    const message = providerDefaultModels.length > 0
      ? 'Model list cleared. Default set will be used.'
      : 'Model list cleared. Add models manually or update from provider.';
    onNotify?.(message);
  }, [onNotify, updateModels, providerDefaultModels]);

  const handleUseDefaultModels = useCallback(() => {
    if (providerDefaultModels.length === 0) {
      updateModels([]);
      onNotify?.('This provider has no default model list.');
      return;
    }
    updateModels(providerDefaultModels);
    onNotify?.('Default model list loaded.');
  }, [providerDefaultModels, updateModels, onNotify]);

  const handleRefreshClick = useCallback(async () => {
    if (!onRefreshModels) {
      onNotify?.('Save integration and provide an API key to update the model list.');
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
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Integration Status</p>
          <p className="text-sm text-slate-200">{isEnabled ? 'Enabled' : 'Disabled'}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            checked={isEnabled}
            onChange={(event) => onUpdate({ enabled: event.target.checked })}
          />
          <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Default Integration</p>
          <p className="text-xs text-slate-400">New AI nodes will use this provider</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            checked={integration.isDefault === true}
            onChange={(event) => onUpdate({ isDefault: event.target.checked })}
          />
          <span className="text-xl">{integration.isDefault ? '\u2665' : '\u2661'}</span>
        </label>
      </div>

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
                  Updated: <span className="text-slate-300">{formattedModelsUpdatedAt}</span>
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                Models: {displayModels.length}
                {usingDefaults && ' (default)'}
              </p>
              {usingDefaults && isReplicate && (
                <p className="text-[11px] text-slate-500">
                  Using default list. Edit values above and click 'Apply list' to save.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                Limit
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
                {refreshingModels ? 'Updating...' : refreshButtonLabel}
              </button>
              {providerDefaultModels.length > 0 && (
                <button
                  type="button"
                  className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={handleUseDefaultModels}
                  disabled={refreshingModels}
                >
                  Default
                </button>
              )}
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleClearModels}
                disabled={!hasStoredModels || refreshingModels}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              Model list (one per line)
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
                Apply list
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => setBulkModelsInput(modelsKey)}
                disabled={!hasBulkChanges}
              >
                Cancel changes
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
                  onNotify?.('Versions removed from model list. Review and apply changes.');
                }}
              >
                Latest version
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
              Add model
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
                    Delete
                  </button>
                </span>
              ))
            )}
          </div>
        </section>
      )}

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
