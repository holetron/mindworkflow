/**
 * Shared port data preview components used by SettingsTab and other tab components.
 */

// ========== Port Data Preview (single value) ==========

export function PortDataPreview({
  portId,
  label,
  getPortData,
}: {
  portId: string;
  label: string;
  getPortData: (id: string, type?: string) => string;
}) {
  const portData = getPortData(portId);
  return (
    <div className="w-full min-h-24 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2">
      <div className="text-xs text-blue-400 mb-2">
        Data comes through port &quot;{label}&quot;
      </div>
      {portData ? (
        <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
          {portData.length > 200 ? portData.substring(0, 200) + '...' : portData}
        </div>
      ) : (
        <div className="text-xs text-slate-500 italic">
          (port not connected - data will be available after connection)
        </div>
      )}
    </div>
  );
}

// ========== Port Data List Preview (multiple values) ==========

export function PortDataListPreview({
  portId,
  label,
  getPortDataList,
}: {
  portId: string;
  label: string;
  getPortDataList: (id: string, type?: string) => string[];
}) {
  const portDataList = getPortDataList(portId);
  return (
    <div className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2">
      <div className="text-xs text-blue-400 mb-1">
        Value comes through port &quot;{label}&quot;
      </div>
      {portDataList && portDataList.length > 0 ? (
        <div className="text-sm text-slate-300 font-mono space-y-1">
          {portDataList.length === 1 ? (
            <div>
              {portDataList[0].length > 100
                ? portDataList[0].substring(0, 100) + '...'
                : portDataList[0]}
            </div>
          ) : (
            <div>
              <div className="text-xs text-slate-400 mb-1">
                array ({portDataList.length} items)
              </div>
              {portDataList.map((item, idx) => (
                <div
                  key={idx}
                  className="text-xs text-slate-300 ml-2 flex items-start gap-2"
                >
                  <span className="text-slate-500">[{idx}]</span>
                  <span className="break-all">
                    {item.length > 80 ? item.substring(0, 80) + '...' : item}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-500 italic">(port not connected)</div>
      )}
    </div>
  );
}

// ========== Manual Field Input ==========

export function ManualFieldInput({
  field,
  fieldKey,
  fieldValue,
  loading,
  setHasChanges,
  setAdditionalFieldsValues,
}: {
  field: any;
  fieldKey: string;
  fieldValue: string;
  loading: boolean;
  setHasChanges: (v: boolean) => void;
  setAdditionalFieldsValues: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
}) {
  const onChange = (val: string) => {
    setHasChanges(true);
    setAdditionalFieldsValues((prev) => ({ ...prev, [fieldKey]: val }));
  };

  if (field.options && field.options.length > 0) {
    return (
      <select
        value={fieldValue || field.default || ''}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        disabled={loading}
      >
        <option value="">Select {field.name}</option>
        {field.options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (
    (field.type === 'number' || field.type === 'integer') &&
    field.min !== undefined &&
    field.max !== undefined
  ) {
    return (
      <div className="flex-1 space-y-2">
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={
            field.type === 'integer' ? 1 : (field.max - field.min) / 100
          }
          value={fieldValue || field.default || field.min}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          disabled={loading}
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>{field.min}</span>
          <span className="text-slate-200 font-medium">
            {fieldValue || field.default || field.min}
          </span>
          <span>{field.max}</span>
        </div>
      </div>
    );
  }

  return (
    <input
      type={
        field.type === 'number' || field.type === 'integer' ? 'number' : 'text'
      }
      value={fieldValue}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      disabled={loading}
      placeholder={`Enter ${field.name}...`}
      min={field.min}
      max={field.max}
    />
  );
}
