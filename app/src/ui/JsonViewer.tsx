import { useMemo, useState } from 'react';
import Ajv from 'ajv';

interface JsonViewerProps {
  value: string;
  schema?: Record<string, unknown>;
  collapsible?: boolean;
}

const ajv = new Ajv({ allErrors: true, strict: false });

function JsonViewer({ value, schema, collapsible = false }: JsonViewerProps) {
  const [collapsed, setCollapsed] = useState(collapsible);

  const parsed = useMemo(() => {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }, [value]);

  const validation = useMemo(() => {
    if (!schema || typeof parsed !== 'object') return null;
    const validate = ajv.compile(schema);
    const valid = validate(parsed);
    return { valid, errors: validate.errors };
  }, [parsed, schema]);

  const content = useMemo(() => {
    if (typeof parsed === 'string') return parsed;
    return JSON.stringify(parsed, null, 2);
  }, [parsed]);

  return (
    <div className="rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100">
      {collapsible && (
        <button
          className="mb-2 rounded bg-slate-700 px-2 py-1 text-xs"
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? 'Показать' : 'Скрыть'} JSON
        </button>
      )}
      {validation && (
        <p className={`mb-2 text-xs ${validation.valid ? 'text-emerald-300' : 'text-amber-300'}`}>
          {validation.valid ? 'JSON валиден' : 'JSON не прошёл валидацию'}
        </p>
      )}
      {!collapsed && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{content}</pre>
      )}
    </div>
  );
}

export default JsonViewer;
