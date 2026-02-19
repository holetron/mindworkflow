import { useState, useEffect, useCallback, memo } from 'react';
import type { ChatSettings } from '../types';
import type { ModelSchemaInput } from '../../../state/api';
import { searchPromptPresets, type PromptPreset } from '../../../state/api';

const SystemPromptEditor = memo(
  ({ value, onChange, onBlur, disabled, placeholder }: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <textarea
      className="w-full h-40 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
      placeholder={placeholder || 'Enter system instructions (system_instruction)...'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      spellCheck={false}
    />
  )
);
SystemPromptEditor.displayName = 'SystemPromptEditor';

interface SettingsTabProps {
  localSettings: ChatSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
  modelInputs: ModelSchemaInput[];
  schemaLoading: boolean;
  agentModePrompts: { agent?: string; edit?: string; ask?: string };
  systemPromptTarget: string;
  setSystemPromptTarget: (v: string) => void;
  outputExampleTarget: string;
  setOutputExampleTarget: (v: string) => void;
  temperatureTarget: string;
  setTemperatureTarget: (v: string) => void;
  maxTokensTarget: string;
  setMaxTokensTarget: (v: string) => void;
  additionalFieldsValues: Record<string, string>;
  setAdditionalFieldsValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  additionalFieldsMapping: Record<string, { target: string }>;
  setAdditionalFieldsMapping: React.Dispatch<React.SetStateAction<Record<string, { target: string }>>>;
}

export function SettingsTab({
  localSettings,
  setLocalSettings,
  modelInputs,
  schemaLoading,
  agentModePrompts,
  systemPromptTarget,
  setSystemPromptTarget,
  temperatureTarget,
  setTemperatureTarget,
  maxTokensTarget,
  setMaxTokensTarget,
  additionalFieldsValues,
  setAdditionalFieldsValues,
  additionalFieldsMapping,
  setAdditionalFieldsMapping,
}: SettingsTabProps) {
  const [promptSearchTerm, setPromptSearchTerm] = useState('');
  const [promptSearchResults, setPromptSearchResults] = useState<PromptPreset[]>([]);
  const [promptSearchLoading, setPromptSearchLoading] = useState(false);
  const [promptSearchError, setPromptSearchError] = useState<string | null>(null);

  useEffect(() => {
    const term = promptSearchTerm.trim();
    if (term.length < 2) { setPromptSearchResults([]); setPromptSearchError(null); return; }
    const searchTimeout = setTimeout(async () => {
      setPromptSearchLoading(true);
      setPromptSearchError(null);
      try {
        const results = await searchPromptPresets({ search: term, limit: 10 });
        setPromptSearchResults(results);
      } catch { setPromptSearchError('Prompt search error'); setPromptSearchResults([]); }
      finally { setPromptSearchLoading(false); }
    }, 300);
    return () => clearTimeout(searchTimeout);
  }, [promptSearchTerm]);

  const isCurrentModePrompt = localSettings.system_prompt === agentModePrompts.agent ||
    localSettings.system_prompt === agentModePrompts.edit ||
    localSettings.system_prompt === agentModePrompts.ask;

  const handleModeChange = useCallback((mode: 'agent' | 'edit' | 'ask') => {
    const modePrompt = agentModePrompts[mode];
    setLocalSettings(prev => ({
      ...prev,
      agent_mode: mode,
      system_prompt: (isCurrentModePrompt || !prev.system_prompt) && modePrompt ? modePrompt : prev.system_prompt,
    }));
  }, [agentModePrompts, isCurrentModePrompt, setLocalSettings]);

  const inputCls = 'w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
  const selectTargetCls = 'text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  const currentMode = localSettings.agent_mode ?? 'ask';

  return (
    <div className="space-y-4">
      {/* Agent Mode Selection */}
      <div className="bg-slate-900 p-4 rounded border border-slate-700">
        <h4 className="text-sm font-medium text-slate-300 mb-3">Agent Mode</h4>
        <p className="text-xs text-slate-400 mb-3">Determines AI access level to the project workflow</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { mode: 'agent' as const, label: 'Agent', sub: 'Full Access', color: 'green' },
            { mode: 'edit' as const, label: 'Edit', sub: 'Content Only', color: 'amber' },
            { mode: 'ask' as const, label: 'Ask', sub: 'Read Only', color: 'blue' },
          ] as const).map(({ mode, label, sub, color }) => (
            <button key={mode} type="button" onClick={() => handleModeChange(mode)}
              className={`px-3 py-3 rounded text-sm font-medium transition-colors ${
                currentMode === mode ? `bg-${color}-600 text-white ring-2 ring-${color}-400` : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}>
              <div className="font-bold mb-1">{label}</div>
              <div className="text-[10px] opacity-80">{sub}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 p-3 bg-slate-800/50 rounded text-xs text-slate-300">
          {currentMode === 'agent' && <><strong className="text-green-400">Agent mode:</strong> AI can create, delete, and modify nodes, create connections between nodes, and sees the full workflow context.</>}
          {currentMode === 'edit' && <><strong className="text-amber-400">Edit mode:</strong> AI can only edit the content of existing nodes. Cannot create, delete nodes, or change structure.</>}
          {currentMode === 'ask' && <><strong className="text-blue-400">Ask mode:</strong> AI operates in read mode. Can answer questions about the workflow but cannot make any changes.</>}
        </div>
      </div>

      {/* System Instructions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-300">
            System Instructions
            {isCurrentModePrompt && (
              <span className="ml-2 text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">Mode Prompt</span>
            )}
          </label>
          <div className="flex items-center gap-2">
            {localSettings.agent_mode && agentModePrompts[localSettings.agent_mode] &&
              localSettings.system_prompt !== agentModePrompts[localSettings.agent_mode] && (
              <button type="button" onClick={() => {
                const modePrompt = agentModePrompts[localSettings.agent_mode!];
                if (modePrompt) setLocalSettings(prev => ({ ...prev, system_prompt: modePrompt }));
              }} className="text-xs px-2 py-1 bg-blue-600/20 text-blue-400 rounded border border-blue-500/30 hover:bg-blue-600/30 transition-colors">
                Restore mode prompt
              </button>
            )}
            <select value={systemPromptTarget} onChange={(e) => setSystemPromptTarget(e.target.value)} className={selectTargetCls}
              title="Which API field system instructions are sent to">
              <option value="prompt">To Prompt (general)</option>
              {modelInputs.filter(i => i.type === 'string' || i.type === 'text').map(input => (
                <option key={input.name} value={input.name}>To {input.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-2">
          <input type="search" value={promptSearchTerm} onChange={(e) => setPromptSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); } }}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search prompt library..."
          />
          {promptSearchTerm.trim().length >= 2 && (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
              {promptSearchLoading && <div className="px-3 py-2 text-sm text-slate-400">Searching...</div>}
              {promptSearchError && !promptSearchLoading && <div className="px-3 py-2 text-sm text-rose-400">{promptSearchError}</div>}
              {!promptSearchLoading && !promptSearchError && promptSearchResults.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Nothing found</div>}
              {!promptSearchLoading && promptSearchResults.map((preset) => (
                <button key={preset.preset_id} type="button" className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-700/70"
                  onClick={() => { setLocalSettings(prev => ({ ...prev, system_prompt: preset.content })); setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); }}>
                  <span className="text-sm text-slate-200">{preset.label}</span>
                  {preset.description && <span className="text-xs text-slate-400">{preset.description}</span>}
                  {preset.tags.length > 0 && <span className="text-[11px] uppercase tracking-wide text-slate-500">{preset.tags.join(' . ')}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <SystemPromptEditor
          value={localSettings.system_prompt}
          onChange={(value) => {
            const isManualEdit = value !== agentModePrompts.agent && value !== agentModePrompts.edit && value !== agentModePrompts.ask;
            setLocalSettings(prev => ({
              ...prev, system_prompt: value,
              system_prompt_type: value.trim() === '' ? 'empty' : (isManualEdit ? 'custom' : 'default'),
            }));
          }}
          onBlur={() => {}}
          placeholder="Enter system instructions for AI (system_instruction)..."
        />
      </div>

      {/* Output Format */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Output Format</label>
        <select value={localSettings.output_format || 'text'} onChange={(e) => setLocalSettings(prev => ({ ...prev, output_format: e.target.value }))}
          className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
          <option value="text">Text</option>
          <option value="json">JSON</option>
          <option value="markdown">Markdown</option>
        </select>
      </div>

      {/* Temperature */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-300">Temperature</label>
          <select value={temperatureTarget} onChange={(e) => setTemperatureTarget(e.target.value)} className={selectTargetCls} title="Which API field temperature is sent to">
            <option value="temperature">To temperature (default)</option>
            {modelInputs.filter(i => i.type === 'number' || i.type === 'integer').map(input => (
              <option key={input.name} value={input.name}>To {input.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input type="range" min="0" max="2" step="0.1" value={localSettings.temperature}
            onChange={(e) => setLocalSettings(prev => ({ ...prev, temperature: Number(e.target.value) }))} className="flex-1 accent-blue-500" />
          <span className="text-sm text-slate-300 min-w-[3ch]">{localSettings.temperature.toFixed(1)}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1"><span>Precise</span><span>Balanced</span><span>Creative</span></div>
        <p className="text-xs text-slate-400 mt-2">The higher the value, the more creative the responses. 0 = deterministic, 1 = balanced, 2 = maximum creativity.</p>
      </div>

      {/* Max Tokens */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-300">Max Tokens</label>
          <select value={maxTokensTarget} onChange={(e) => setMaxTokensTarget(e.target.value)} className={selectTargetCls} title="Which API field max tokens is sent to">
            <option value="max_tokens">To max_tokens (default)</option>
            <option value="max_completion_tokens">To max_completion_tokens (OpenAI)</option>
            {modelInputs.filter(i => i.type === 'number' || i.type === 'integer').map(input => (
              <option key={input.name} value={input.name}>To {input.name}</option>
            ))}
          </select>
        </div>
        <input type="number" min="1" max="128000" value={localSettings.max_tokens || 4096}
          onChange={(e) => setLocalSettings(prev => ({ ...prev, max_tokens: Number(e.target.value) }))} className={inputCls} />
        <p className="text-xs text-slate-400 mt-1">Maximum number of tokens in response.</p>
      </div>

      {/* Top P */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Top P ({(localSettings.top_p || 1).toFixed(2)})</label>
        <input type="range" min="0" max="1" step="0.01" value={localSettings.top_p || 1}
          onChange={(e) => setLocalSettings(prev => ({ ...prev, top_p: Number(e.target.value) }))} className="w-full accent-blue-500" />
      </div>

      {/* Frequency Penalty */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Frequency Penalty ({(localSettings.frequency_penalty || 0).toFixed(2)})</label>
        <input type="range" min="-2" max="2" step="0.1" value={localSettings.frequency_penalty || 0}
          onChange={(e) => setLocalSettings(prev => ({ ...prev, frequency_penalty: Number(e.target.value) }))} className="w-full accent-blue-500" />
      </div>

      {/* Presence Penalty */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Presence Penalty ({(localSettings.presence_penalty || 0).toFixed(2)})</label>
        <input type="range" min="-2" max="2" step="0.1" value={localSettings.presence_penalty || 0}
          onChange={(e) => setLocalSettings(prev => ({ ...prev, presence_penalty: Number(e.target.value) }))} className="w-full accent-blue-500" />
      </div>

      {/* Stream */}
      <div className="flex items-center">
        <input type="checkbox" id="stream" checked={localSettings.stream || false}
          onChange={(e) => setLocalSettings(prev => ({ ...prev, stream: e.target.checked }))}
          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500" />
        <label htmlFor="stream" className="ml-2 text-sm text-slate-300">Streaming Output (Stream)</label>
      </div>

      {/* Additional model parameters */}
      {schemaLoading ? (
        <div className="text-xs text-slate-500 italic animate-pulse">Loading model schema...</div>
      ) : (() => {
        const mainFields = ['prompt', 'system_prompt', 'temperature', 'max_tokens', 'max_completion_tokens', 'top_p', 'frequency_penalty', 'presence_penalty', 'stream'];
        const additionalFields = modelInputs.filter(input => !mainFields.includes(input.name));
        if (additionalFields.length === 0) return null;

        return (
          <div className="pt-4 mt-4 border-t border-slate-700">
            <h4 className="text-sm font-medium text-slate-300 mb-3">Additional model parameters</h4>
            <div className="space-y-4">
              {additionalFields.map(field => {
                const fieldKey = field.name;
                const mapping = additionalFieldsMapping[fieldKey];
                const targetValue = mapping?.target || field.name;
                const fieldValue = additionalFieldsValues[fieldKey] || field.default || '';

                return (
                  <div key={fieldKey} className="border-t border-slate-600 pt-4 first:border-0 first:pt-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-slate-300">{field.name}</label>
                        <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">{field.type}</span>
                        {field.required && <span className="text-xs text-rose-400">Required</span>}
                      </div>
                      <select value={targetValue} onChange={(e) => setAdditionalFieldsMapping(prev => ({ ...prev, [fieldKey]: { target: e.target.value } }))} className={selectTargetCls}>
                        <option value={field.name}>To {field.name}</option>
                        {(field.type === 'string' || field.type === 'text') && <option value="prompt">To Prompt (general)</option>}
                      </select>
                    </div>
                    {field.description && <p className="text-xs text-slate-400 mb-2">{field.description}</p>}
                    {(field.type === 'string' || field.type === 'text') && (
                      <input type="text" value={fieldValue} onChange={(e) => setAdditionalFieldsValues(prev => ({ ...prev, [fieldKey]: e.target.value }))} placeholder={`Enter ${field.name}...`} className={inputCls} />
                    )}
                    {(field.type === 'number' || field.type === 'integer') && (
                      <input type="number" value={fieldValue} onChange={(e) => setAdditionalFieldsValues(prev => ({ ...prev, [fieldKey]: e.target.value }))} placeholder={`Enter ${field.name}...`} step={field.type === 'integer' ? '1' : 'any'} className={inputCls} />
                    )}
                    {field.type === 'boolean' && (
                      <div className="flex items-center">
                        <input type="checkbox" checked={fieldValue === 'true' || fieldValue === true}
                          onChange={(e) => setAdditionalFieldsValues(prev => ({ ...prev, [fieldKey]: e.target.checked ? 'true' : 'false' }))}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500" />
                        <label className="ml-2 text-sm text-slate-300">Enable {field.name}</label>
                      </div>
                    )}
                    {field.type === 'image' && (
                      <textarea value={fieldValue} onChange={(e) => setAdditionalFieldsValues(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                        placeholder={`Enter ${field.name}...`} rows={3} className={`${inputCls} font-mono resize-vertical`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
