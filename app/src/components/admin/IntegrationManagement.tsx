import { Edit3, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { AdminIntegration, AdminUserSummary } from '../../state/api';
import { PROVIDERS } from '../../data/providers';
import type { AdminIntegrationFormState } from './types';
import { formatDateTime } from './constants';

interface IntegrationManagementProps {
  integrations: AdminIntegration[];
  integrationsError: string | null;
  integrationsLoading: boolean;
  users: AdminUserSummary[];

  // Selection + form
  selectedIntegration: AdminIntegration | null;
  integrationForm: AdminIntegrationFormState | null;
  integrationSubmitting: boolean;
  providerMap: Map<string, { id: string; name: string; [key: string]: unknown }>;

  // Actions
  onSelectIntegration: (integration: AdminIntegration) => void;
  onNewIntegration: () => void;
  onIntegrationFormChange: (field: keyof AdminIntegrationFormState, value: string | boolean) => void;
  onSaveIntegration: () => Promise<void>;
  onDeleteIntegration: (integration: AdminIntegration) => Promise<void>;
  onRefreshIntegrations: () => void;
  onCancelIntegrationEdit: () => void;

  // Direct form setter for apiKey reset
  setIntegrationForm: React.Dispatch<React.SetStateAction<AdminIntegrationFormState | null>>;
}

export function IntegrationManagement({
  integrations,
  integrationsError,
  integrationsLoading,
  users,
  selectedIntegration,
  integrationForm,
  integrationSubmitting,
  providerMap,
  onSelectIntegration,
  onNewIntegration,
  onIntegrationFormChange,
  onSaveIntegration,
  onDeleteIntegration,
  onRefreshIntegrations,
  onCancelIntegrationEdit,
  setIntegrationForm,
}: IntegrationManagementProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {/* Left panel: list */}
      <div className="lg:col-span-1 space-y-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">Global Integrations</h2>
              <p className="text-xs text-slate-500">API Key storage for providers</p>
            </div>
            <button
              type="button"
              onClick={onRefreshIntegrations}
              className="rounded-full border border-slate-700 p-2 text-slate-300 transition hover:border-primary hover:text-primary"
            >
              <RefreshCw className={`h-4 w-4 ${integrationsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <button
            type="button"
            onClick={onNewIntegration}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            New integration
          </button>

          {integrationsError && (
            <div className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              Failed to load integrations: {integrationsError}
            </div>
          )}

          <div className="mt-4 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '26rem' }}>
            {integrationsLoading && !integrations.length ? (
              <div className="rounded border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
                Loading integrations...
              </div>
            ) : integrations.length === 0 ? (
              <div className="rounded border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
                No integrations found.
              </div>
            ) : (
              integrations.map((integration) => {
                const isActive = selectedIntegration?.id === integration.id;
                const provider = providerMap.get(integration.providerId);
                return (
                  <button
                    key={integration.id}
                    type="button"
                    onClick={() => onSelectIntegration(integration)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition hover:border-primary/70 hover:bg-primary/5 ${
                      isActive ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10' : 'border-slate-800 bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {integration.name || provider?.name || integration.providerId}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {provider?.name ?? integration.providerId} &middot; {integration.user.email ?? integration.user.id}
                        </div>
                      </div>
                      <div
                        className={`text-xs font-medium ${integration.enabled ? 'text-emerald-300' : 'text-amber-300'}`}
                      >
                        {integration.enabled ? 'Active' : 'Disabled'}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Updated: {formatDateTime(integration.updatedAt)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right panel: form */}
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                {integrationForm?.id ? 'Editing integration' : integrationForm ? 'New integration' : 'Select integration'}
              </h2>
              <p className="text-xs text-slate-500">
                Specify the owner, API keys and provider availability status
              </p>
            </div>
            {integrationForm && (
              <button
                type="button"
                onClick={onCancelIntegrationEdit}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Reset
              </button>
            )}
          </div>

          {integrationForm ? (
            <form
              className="mt-4 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void onSaveIntegration();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  User
                  <select
                    value={integrationForm.userId}
                    onChange={(event) => onIntegrationFormChange('userId', event.target.value)}
                    disabled={Boolean(integrationForm.id) || integrationSubmitting}
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  >
                    <option value="">-- Select user --</option>
                    {users.map((user) => (
                      <option key={user.user_id} value={user.user_id}>
                        {user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Provider
                  <select
                    value={integrationForm.providerId}
                    onChange={(event) => onIntegrationFormChange('providerId', event.target.value)}
                    disabled={Boolean(integrationForm.id) || integrationSubmitting}
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  >
                    {PROVIDERS.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Integration Name
                <input
                  value={integrationForm.name}
                  onChange={(event) => onIntegrationFormChange('name', event.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  placeholder="e.g., OpenAI Prod"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Description
                <textarea
                  value={integrationForm.description}
                  onChange={(event) => onIntegrationFormChange('description', event.target.value)}
                  className="h-20 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  placeholder="Brief description of integration purpose"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  API Key / token
                  <input
                    value={integrationForm.apiKey}
                    onChange={(event) => onIntegrationFormChange('apiKey', event.target.value)}
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    placeholder={integrationForm.apiKeyStored && !integrationForm.apiKeyModified ? '\u2022\u2022\u2022\u2022\u2022\u2022' : 'sk-...'}
                  />
                  {integrationForm.apiKeyStored && !integrationForm.apiKeyModified && (
                    <button
                      type="button"
                      className="self-start text-[11px] text-emerald-400 hover:text-emerald-300"
                      onClick={() => {
                        setIntegrationForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                apiKey: '',
                                apiKeyStored: false,
                                apiKeyPreview: null,
                                apiKeyModified: false,
                              }
                            : prev,
                        );
                      }}
                    >
                      Key saved &bull; Change
                    </button>
                  )}
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Base URL
                  <input
                    value={integrationForm.baseUrl}
                    onChange={(event) => onIntegrationFormChange('baseUrl', event.target.value)}
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    placeholder="https://api.example.com"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Organization / account
                  <input
                    value={integrationForm.organization}
                    onChange={(event) => onIntegrationFormChange('organization', event.target.value)}
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    placeholder="org-..."
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  System Prompt
                  <input
                    value={integrationForm.systemPrompt}
                    onChange={(event) => onIntegrationFormChange('systemPrompt', event.target.value)}
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    placeholder="Default prompt"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 px-4 py-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={integrationForm.enabled}
                    onChange={(event) => onIntegrationFormChange('enabled', event.target.checked)}
                    disabled={integrationSubmitting}
                    className="h-4 w-4"
                  />
                  Integration active
                </label>
                <div className="text-xs text-slate-500">
                  Updated: {selectedIntegration ? formatDateTime(selectedIntegration.updatedAt) : '\u2014'}
                </div>
              </div>

              {selectedIntegration?.models && selectedIntegration.models.length > 0 && (
                <div className="rounded border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Available models ({selectedIntegration.models.length})
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                    {selectedIntegration.models.map((model) => (
                      <span key={model} className="rounded-full bg-slate-800 px-2 py-1">
                        {model}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Models updated: {selectedIntegration.modelsUpdatedAt ? formatDateTime(selectedIntegration.modelsUpdatedAt) : 'never loaded'}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={integrationSubmitting}
                  className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:bg-primary/40"
                >
                  {integrationSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
                  Save
                </button>
                {integrationForm.id && (
                  <button
                    type="button"
                    onClick={() => selectedIntegration && onDeleteIntegration(selectedIntegration)}
                    disabled={integrationSubmitting}
                    className="flex items-center gap-2 rounded-full border border-rose-600 px-4 py-2 text-sm text-rose-200 transition hover:border-rose-500 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="mt-6 rounded border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
              Select an integration on the left or create a new one.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
