import { useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import { PROVIDERS, type ProviderConfig } from '../../data/providers';

type IntegrationManagerProps = {
  open: boolean;
  mode: 'view' | 'create';
  onClose: () => void;
};

function IntegrationManager({ open, mode, onClose }: IntegrationManagerProps) {
  const [activeProviderId, setActiveProviderId] = useState<string>(PROVIDERS[0]?.id ?? '');
  const activeProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.id === activeProviderId) ?? null,
    [activeProviderId],
  );

  if (!open) return null;

  if (mode === 'create') {
    return (
      <Modal
        title="Create Integration"
        onClose={onClose}
        actions={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
              onClick={onClose}
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
          Provider creation is not persisted yet. Paste credentials, limits, and webhook contract in the template below
          to share with teammates.
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
    );
  }

  return (
    <Modal
      title="Select Integration"
      onClose={onClose}
      actions={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
            onClick={() => setActiveProviderId(PROVIDERS[0]?.id ?? '')}
          >
            Reset
          </button>
        </div>
      }
    >
      <div className="flex gap-4">
        <aside className="w-48 space-y-2 overflow-y-auto pr-2 text-sm">
          {PROVIDERS.map((provider) => {
            const isActive = provider.id === activeProviderId;
            return (
              <button
                key={provider.id}
                type="button"
                className={`block w-full rounded px-3 py-2 text-left transition ${
                  isActive ? 'bg-slate-800 text-primary' : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                }`}
                onClick={() => setActiveProviderId(provider.id)}
              >
                <div className="font-medium">{provider.name}</div>
                <div className="text-xs text-slate-500">{provider.category}</div>
              </button>
            );
          })}
        </aside>
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-100">
          {activeProvider ? <ProviderDetails provider={activeProvider} /> : <p>No providers defined.</p>}
        </div>
      </div>
    </Modal>
  );
}

function ProviderDetails({ provider }: { provider: ProviderConfig }) {
  return (
    <div className="space-y-4">
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

export default IntegrationManager;
