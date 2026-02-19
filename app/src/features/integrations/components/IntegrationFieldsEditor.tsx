import type { IntegrationFieldConfig } from '../../../state/api';

interface IntegrationFieldsEditorProps {
  fields: IntegrationFieldConfig[];
  onChange: (fields: IntegrationFieldConfig[]) => void;
}

export function IntegrationFieldsEditor({ fields, onChange }: IntegrationFieldsEditorProps) {
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
