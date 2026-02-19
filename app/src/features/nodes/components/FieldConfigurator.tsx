import { useState } from 'react';
import type { NodeFieldConfig } from './nodeTypes';

interface FieldConfiguratorProps {
  nodeId: string;
  nodeType: string;
  currentFields: NodeFieldConfig[];
  onFieldsChange: (fields: NodeFieldConfig[]) => void;
  disabled: boolean;
}

function getDefaultFields(type: string): NodeFieldConfig[] {
  const commonFields: NodeFieldConfig[] = [
    { id: 'title', label: 'Title', type: 'text', visible: true, order: 0 },
    { id: 'content', label: 'Content', type: 'textarea', visible: true, order: 1 },
  ];

  if (type === 'ai') {
    return [
      { id: 'htmlUrl', label: 'URL', type: 'text', visible: true, order: 0 },
      { id: 'screenWidth', label: 'Screen Width', type: 'select', visible: true, order: 1 },
    ];
  }
  return commonFields;
}

export function FieldConfigurator({ nodeId, nodeType, currentFields, onFieldsChange, disabled }: FieldConfiguratorProps) {
  const [fields, setFields] = useState<NodeFieldConfig[]>(currentFields.length > 0 ? currentFields : getDefaultFields(nodeType));

  const handleFieldToggle = (fieldId: string) => {
    const updatedFields = fields.map(field =>
      field.id === fieldId ? { ...field, visible: !field.visible } : field
    );
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const handleFieldOrderChange = (fieldId: string, direction: 'up' | 'down') => {
    const fieldIndex = fields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) return;

    const newFields = [...fields];
    const targetIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;

    if (targetIndex >= 0 && targetIndex < newFields.length) {
      [newFields[fieldIndex], newFields[targetIndex]] = [newFields[targetIndex], newFields[fieldIndex]];
      newFields.forEach((field, index) => {
        field.order = index;
      });
      setFields(newFields);
      onFieldsChange(newFields);
    }
  };

  const addCustomField = () => {
    const newField: NodeFieldConfig = {
      id: `custom_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      visible: true,
      order: fields.length,
      placeholder: 'Enter value...',
    };
    const updatedFields = [...fields, newField];
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const removeField = (fieldId: string) => {
    const updatedFields = fields.filter(f => f.id !== fieldId);
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const updateFieldLabel = (fieldId: string, label: string) => {
    const updatedFields = fields.map(field =>
      field.id === fieldId ? { ...field, label } : field
    );
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60">
          Configure which fields to display in the node slider
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
          onClick={addCustomField}
          disabled={disabled}
        >
          + Field
        </button>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2 p-2 bg-black/10 rounded border border-white/5">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="text-xs text-white/40 hover:text-white/60 disabled:opacity-30"
                onClick={() => handleFieldOrderChange(field.id, 'up')}
                disabled={disabled || index === 0}
              >
                \u25B2
              </button>
              <button
                type="button"
                className="text-xs text-white/40 hover:text-white/60 disabled:opacity-30"
                onClick={() => handleFieldOrderChange(field.id, 'down')}
                disabled={disabled || index === fields.length - 1}
              >
                \u25BC
              </button>
            </div>

            <label className="flex items-center gap-2 flex-1">
              <input
                type="checkbox"
                checked={field.visible}
                onChange={() => handleFieldToggle(field.id)}
                disabled={disabled}
                className="w-4 h-4"
              />
              <input
                type="text"
                value={field.label}
                onChange={(e) => updateFieldLabel(field.id, e.target.value)}
                disabled={disabled}
                className="flex-1 bg-transparent text-xs text-white/80 border-none outline-none"
              />
            </label>

            <span className="text-xs text-white/40 px-2 py-1 bg-black/20 rounded">
              {field.type}
            </span>

            {field.id.startsWith('custom_') && (
              <button
                type="button"
                className="text-xs text-red-400 hover:text-red-300 p-1"
                onClick={() => removeField(field.id)}
                disabled={disabled}
              >
                \u00D7
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="text-xs text-white/50 p-2 bg-black/5 rounded">
        Visible fields will be displayed in the slider in the specified order
      </div>
    </div>
  );
}
