import type { ProviderConfig } from '../../../data/providers';
import {
  type IntegrationDraft,
  type CredentialTarget,
  type CredentialBinding,
  createCredentialBinding,
} from './credentialBindings';

export interface GlobalIntegrationFormProps {
  integration: IntegrationDraft;
  providerConfig: ProviderConfig;
  onUpdate: (patch: Partial<IntegrationDraft>) => void;
}

export function GlobalIntegrationForm({ integration, providerConfig, onUpdate }: GlobalIntegrationFormProps) {
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
          Change value
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
        <span>Integration enabled</span>
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
