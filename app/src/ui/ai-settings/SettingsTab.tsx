import type { AiSettingsSharedState } from './types';
import { SystemPromptEditor, OutputExampleEditor } from './MemoizedEditors';
import { getMidjourneyVersion } from './utilities';
import { V7_INCOMPATIBLE_PORTS, V6_INCOMPATIBLE_PORTS } from './types';
import { PortDataPreview, PortDataListPreview, ManualFieldInput } from './PortPreviews';

interface SettingsTabProps {
  state: AiSettingsSharedState;
}

export function SettingsTab({ state }: SettingsTabProps) {
  const {
    node,
    loading,
    currentProvider,
    modelInputs,
    systemPromptValue,
    systemPromptTarget,
    setSystemPromptTarget,
    systemPromptSource,
    setSystemPromptSource,
    outputExampleValue,
    outputExampleTarget,
    setOutputExampleTarget,
    outputExampleSource,
    setOutputExampleSource,
    temperatureTarget,
    setTemperatureTarget,
    temperatureSource,
    setTemperatureSource,
    additionalFieldsMapping,
    setAdditionalFieldsMapping,
    additionalFieldsValues,
    setAdditionalFieldsValues,
    quickSystemPrompts,
    quickOutputExamples,
    promptSearchTerm,
    setPromptSearchTerm,
    promptSearchResults,
    setPromptSearchResults,
    promptSearchLoading,
    promptSearchError,
    setPromptSearchError,
    fileDeliveryFormat,
    handleFileDeliveryFormatChange,
    handleTemperatureChange,
    updateSystemPrompt,
    updateOutputExample,
    handleSystemPromptBlur,
    handleOutputExampleBlur,
    setHasChanges,
    pendingEnabledPorts,
    setPendingEnabledPorts,
    getPortData,
    getPortDataList,
  } = state;

  return (
    <div className="space-y-6">
      {/* System Prompt */}
      <SystemPromptSection state={state} />

      {/* Output Example Section */}
      <OutputExampleSection state={state} />

      {/* File Delivery Format */}
      <div className="border-t border-slate-700 pt-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">File Transfer Format</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleFileDeliveryFormatChange('url')}
            disabled={loading || fileDeliveryFormat === 'url'}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              fileDeliveryFormat === 'url'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🔗 URL
          </button>
          <button
            type="button"
            onClick={() => handleFileDeliveryFormatChange('base64')}
            disabled={loading || fileDeliveryFormat === 'base64'}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              fileDeliveryFormat === 'base64'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🧬 Base64
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          URL is the preferred option: files remain lightweight, can be cached and reused.
          Select Base64 only if the model cannot load a file by URL.
        </p>
      </div>

      {/* Temperature Control */}
      <TemperatureSection state={state} />

      {/* Additional fields from model schema */}
      <AdditionalFieldsSection state={state} />
    </div>
  );
}

// ========== System Prompt Sub-component ==========

function SystemPromptSection({ state }: { state: AiSettingsSharedState }) {
  const {
    node, loading, modelInputs, systemPromptValue, systemPromptTarget,
    setSystemPromptTarget, systemPromptSource, setSystemPromptSource,
    quickSystemPrompts, promptSearchTerm, setPromptSearchTerm,
    promptSearchResults, setPromptSearchResults, promptSearchLoading,
    promptSearchError, setPromptSearchError, updateSystemPrompt,
    handleSystemPromptBlur, setHasChanges, setPendingEnabledPorts, getPortData,
  } = state;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-300">System prompt</label>
        <div className="flex gap-3 items-center">
          <select
            value={systemPromptTarget}
            onChange={(e) => { setSystemPromptTarget(e.target.value); setHasChanges(true); }}
            className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={loading}
            title="Which API field the system prompt is sent to"
          >
            <option value="prompt">📝 To Prompt (general)</option>
            {modelInputs.filter(i => i.type === 'string' || i.type === 'text').map(input => (
              <option key={input.name} value={input.name}>📤 To {input.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={systemPromptSource === 'port'}
              onChange={(e) => {
                const newSource = e.target.checked ? 'port' : 'manual';
                setSystemPromptSource(newSource);
                setHasChanges(true);
                setPendingEnabledPorts(prev => {
                  if (newSource === 'port') {
                    return prev.includes('system_prompt') ? prev : [...prev, 'system_prompt'];
                  } else {
                    return prev.filter(p => p !== 'system_prompt');
                  }
                });
              }}
              className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
              disabled={loading}
            />
            <span className="text-xs text-slate-300">From incoming node</span>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="flex flex-wrap gap-2">
          {quickSystemPrompts.map((preset) => (
            <button
              key={preset.preset_id}
              type="button"
              onClick={() => { updateSystemPrompt(preset.content); setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); }}
              className="px-3 py-1.5 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
              disabled={loading}
              title={preset.description ?? undefined}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="search"
            value={promptSearchTerm}
            onChange={(event) => setPromptSearchTerm(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); } }}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search prompt library..."
            disabled={loading}
          />
          {promptSearchTerm.trim().length >= 2 && (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
              {promptSearchLoading && <div className="px-3 py-2 text-sm text-slate-400">Searching...</div>}
              {promptSearchError && !promptSearchLoading && <div className="px-3 py-2 text-sm text-rose-400">{promptSearchError}</div>}
              {!promptSearchLoading && !promptSearchError && promptSearchResults.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Nothing found</div>}
              {!promptSearchLoading && promptSearchResults.map((preset) => (
                <button
                  key={preset.preset_id}
                  type="button"
                  className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-700/70"
                  onClick={() => { updateSystemPrompt(preset.content); setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); }}
                  disabled={loading}
                >
                  <span className="text-sm text-slate-200">{preset.label}</span>
                  {preset.description && <span className="text-xs text-slate-400">{preset.description}</span>}
                  {preset.tags.length > 0 && <span className="text-[11px] uppercase tracking-wide text-slate-500">{preset.tags.join(' • ')}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {systemPromptSource === 'manual' ? (
        <SystemPromptEditor value={systemPromptValue} onChange={updateSystemPrompt} onBlur={handleSystemPromptBlur} disabled={loading} placeholder="Enter system prompt for AI..." />
      ) : (
        <PortDataPreview portId="system_prompt" label="System Prompt" getPortData={getPortData} />
      )}
    </div>
  );
}

// ========== Output Example Sub-component ==========

function OutputExampleSection({ state }: { state: AiSettingsSharedState }) {
  const {
    loading, modelInputs, outputExampleValue, outputExampleTarget,
    setOutputExampleTarget, outputExampleSource, setOutputExampleSource,
    quickOutputExamples, updateOutputExample, handleOutputExampleBlur,
    setHasChanges, setPendingEnabledPorts, getPortData,
  } = state;

  return (
    <div className="border-t border-slate-600 pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-300">Output Example</label>
        <div className="flex gap-3 items-center">
          <select
            value={outputExampleTarget}
            onChange={(e) => { setOutputExampleTarget(e.target.value); setHasChanges(true); }}
            className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={loading}
            title="Which API field the example is sent to"
          >
            <option value="prompt">📝 To Prompt (general)</option>
            {modelInputs.filter(i => i.type === 'string' || i.type === 'text').map(input => (
              <option key={input.name} value={input.name}>📤 To {input.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={outputExampleSource === 'port'}
              onChange={(e) => {
                const newSource = e.target.checked ? 'port' : 'manual';
                setOutputExampleSource(newSource);
                setHasChanges(true);
                setPendingEnabledPorts(prev => {
                  if (newSource === 'port') {
                    return prev.includes('output_example') ? prev : [...prev, 'output_example'];
                  } else {
                    return prev.filter(p => p !== 'output_example');
                  }
                });
              }}
              className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
              disabled={loading}
            />
            <span className="text-xs text-slate-300">From incoming node</span>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {quickOutputExamples.map((preset) => (
          <button
            key={preset.preset_id}
            type="button"
            onClick={() => updateOutputExample(preset.content)}
            className="px-3 py-1 text-xs bg-purple-600/20 border border-purple-500/50 text-purple-300 hover:bg-purple-600/30 rounded transition"
            disabled={loading}
            title={preset.description ?? undefined}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {outputExampleSource === 'manual' ? (
        <OutputExampleEditor
          value={outputExampleValue}
          onChange={updateOutputExample}
          onBlur={handleOutputExampleBlur}
          disabled={loading}
          placeholder='E.g.: {"nodes": [{"type": "text", "title": "...", "content": "..."}]}'
        />
      ) : (
        <PortDataPreview portId="output_example" label="Output Example" getPortData={getPortData} />
      )}
    </div>
  );
}

// ========== Temperature Sub-component ==========

function TemperatureSection({ state }: { state: AiSettingsSharedState }) {
  const {
    node, loading, modelInputs, temperatureTarget, setTemperatureTarget,
    temperatureSource, setTemperatureSource, handleTemperatureChange,
    setHasChanges, setPendingEnabledPorts, getPortDataList,
  } = state;

  return (
    <div className="border-t border-slate-600 pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-300">🌡️ Temperature</label>
        <div className="flex gap-3 items-center">
          <select
            value={temperatureTarget}
            onChange={(e) => { setTemperatureTarget(e.target.value); setHasChanges(true); }}
            className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={loading}
            title="Which API field temperature is sent to"
          >
            {modelInputs.filter(i => i.type === 'number' || i.type === 'integer').map(input => (
              <option key={input.name} value={input.name}>📤 To {input.name}</option>
            ))}
            {!modelInputs.some(i => i.name === 'temperature') && (
              <option value="temperature">📤 To temperature (default)</option>
            )}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={temperatureSource === 'port'}
              onChange={(e) => {
                const newSource = e.target.checked ? 'port' : 'manual';
                setTemperatureSource(newSource);
                setHasChanges(true);
                setPendingEnabledPorts(prev => {
                  if (newSource === 'port') {
                    return prev.includes('temperature') ? prev : [...prev, 'temperature'];
                  } else {
                    return prev.filter(p => p !== 'temperature');
                  }
                });
              }}
              className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
              disabled={loading}
            />
            <span className="text-xs text-slate-300">From incoming node</span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {temperatureSource === 'manual' ? (
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={Number(node.ai?.temperature || 0.7)}
            onChange={(e) => handleTemperatureChange(parseFloat(e.target.value) || 0.7)}
            className="w-32 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={loading}
          />
        ) : (
          <PortDataListPreview portId="temperature" label="Temperature" getPortDataList={getPortDataList} />
        )}
      </div>
      {temperatureSource === 'manual' && (
        <p className="text-xs text-slate-400 mt-2">
          The higher the value, the more creative the responses. 0 = deterministic, 1 = balanced, 2 = maximum creativity.
        </p>
      )}
    </div>
  );
}

// ========== Additional Fields Sub-component ==========

function AdditionalFieldsSection({ state }: { state: AiSettingsSharedState }) {
  const {
    node, loading, currentProvider, modelInputs, additionalFieldsMapping,
    setAdditionalFieldsMapping, additionalFieldsValues, setAdditionalFieldsValues,
    setHasChanges, setPendingEnabledPorts, getPortDataList,
  } = state;

  const mainFields = ['prompt', 'system_prompt', 'temperature', 'version'];
  let additionalFields = modelInputs.filter(input => !mainFields.includes(input.name));

  if (currentProvider.startsWith('midjourney_')) {
    const currentModel = String(node.ai?.model || '');
    const mjVersion = getMidjourneyVersion(currentModel);
    if (mjVersion === 7) {
      additionalFields = additionalFields.filter(field => !V7_INCOMPATIBLE_PORTS.includes(field.name));
    } else if (mjVersion === 6) {
      additionalFields = additionalFields.filter(field => !V6_INCOMPATIBLE_PORTS.includes(field.name));
    }
  }

  if (additionalFields.length === 0) {
    return (
      <div className="pt-4 mt-4">
        <div className="text-xs text-slate-500 italic">No additional fields for this model</div>
      </div>
    );
  }

  return (
    <div className="pt-4 mt-4">
      <div className="space-y-4">
        {additionalFields.map(field => {
          const fieldKey = field.name;
          const mapping = additionalFieldsMapping[fieldKey];
          const targetValue = mapping?.target || field.name;
          const sourceValue = mapping?.source || 'manual';
          const fieldValue = additionalFieldsValues[fieldKey] || '';

          return (
            <div key={fieldKey} className="border-t border-slate-600 pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-300">{field.name}</label>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-400">{field.type}</span>
                  {field.required && <span className="text-xs text-rose-400">✓ Required</span>}
                </div>
                <div className="flex gap-3 items-center">
                  <select
                    value={targetValue}
                    onChange={(e) => {
                      setHasChanges(true);
                      setAdditionalFieldsMapping(prev => ({ ...prev, [fieldKey]: { target: e.target.value, source: prev[fieldKey]?.source || 'manual' } }));
                    }}
                    className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    disabled={loading}
                  >
                    <option value={field.name}>📤 To {field.name}</option>
                    {field.type === 'string' || field.type === 'text' ? <option value="prompt">📝 To Prompt (general)</option> : null}
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourceValue === 'port'}
                      onChange={(e) => {
                        const newSource = e.target.checked ? 'port' : 'manual';
                        setHasChanges(true);
                        setAdditionalFieldsMapping(prev => ({ ...prev, [fieldKey]: { target: prev[fieldKey]?.target || field.name, source: newSource } }));
                        setPendingEnabledPorts(prev => newSource === 'port' ? (prev.includes(fieldKey) ? prev : [...prev, fieldKey]) : prev.filter(p => p !== fieldKey));
                      }}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                      disabled={loading}
                    />
                    <span className="text-xs text-slate-300">From incoming node</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {sourceValue === 'manual' ? (
                  <ManualFieldInput field={field} fieldKey={fieldKey} fieldValue={fieldValue} loading={loading} setHasChanges={setHasChanges} setAdditionalFieldsValues={setAdditionalFieldsValues} />
                ) : (
                  <PortDataListPreview portId={fieldKey} label={field.name} getPortDataList={getPortDataList} />
                )}
              </div>
              {field.description && <p className="text-xs text-slate-400 mt-2">{field.description}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

