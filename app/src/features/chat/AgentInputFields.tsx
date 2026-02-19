import { useTranslation } from 'react-i18next';
import type { AgentInputField } from './types';

interface AgentInputFieldsProps {
  fields: AgentInputField[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
}

export function AgentInputFields({ fields, values, onChange }: AgentInputFieldsProps) {
  const { t } = useTranslation();

  console.log('[AgentInputFields] Render:', { fields, values, fieldsCount: fields?.length });

  if (!fields || fields.length === 0) {
    console.log('[AgentInputFields] No fields to display');
    return null;
  }

  const handleFieldChange = (fieldName: string, value: any) => {
    onChange({
      ...values,
      [fieldName]: value,
    });
  };

  return (
    <div className="mb-3 space-y-2">
      <div className="space-y-2">
        {fields.map(field => (
          <div key={field.name} className="flex items-center gap-2">
            <label 
              className="text-xs text-slate-300 w-24 flex-shrink-0 cursor-help" 
              title={field.label}
            >
              {field.name}
              {field.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            
            {field.type === 'textarea' ? (
              <textarea
                value={values[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[32px] resize-y"
                rows={1}
              />
            ) : field.type === 'number' ? (
              <input
                type="number"
                value={values[field.name] ?? ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder={field.placeholder}
                step="0.1"
                className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : field.type === 'select' && field.options ? (
              <select
                value={values[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={values[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
