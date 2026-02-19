import { useState, useCallback } from 'react';
import type { AgentRoutingConfig, OutputRoute, OutputType } from './agentRouting';
import { DEFAULT_ROUTING_CONFIGS, getIconForOutputType } from './agentRouting';

interface AgentRoutingEditorProps {
  config: AgentRoutingConfig;
  onChange: (config: AgentRoutingConfig) => void;
  onClose: () => void;
}

const OUTPUT_TYPE_OPTIONS: Array<{ value: OutputType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'code', label: 'Code' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'csv', label: 'CSV' }
];

export function AgentRoutingEditor({ config, onChange, onClose }: AgentRoutingEditorProps) {
  const [localConfig, setLocalConfig] = useState<AgentRoutingConfig>(config);

  const handleSave = useCallback(() => {
    onChange(localConfig);
    onClose();
  }, [localConfig, onChange, onClose]);

  const addOutputRoute = useCallback(() => {
    const newRoute: OutputRoute = {
      id: `route_${Date.now()}`,
      type: 'text',
      label: 'New output',
      contentType: 'text/plain',
      enabled: true,
      description: ''
    };
    
    setLocalConfig(prev => ({
      ...prev,
      outputs: [...prev.outputs, newRoute]
    }));
  }, []);

  const updateOutputRoute = useCallback((index: number, updates: Partial<OutputRoute>) => {
    setLocalConfig(prev => ({
      ...prev,
      outputs: prev.outputs.map((route, i) => 
        i === index ? { ...route, ...updates } : route
      )
    }));
  }, []);

  const removeOutputRoute = useCallback((index: number) => {
    setLocalConfig(prev => ({
      ...prev,
      outputs: prev.outputs.filter((_, i) => i !== index)
    }));
  }, []);

  const loadPreset = useCallback((presetName: string) => {
    const preset = DEFAULT_ROUTING_CONFIGS[presetName];
    if (preset) {
      setLocalConfig(preset);
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-200">
            🔀 Agent routing configuration
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Presets */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-slate-300 mb-3">Configuration Templates</h3>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(DEFAULT_ROUTING_CONFIGS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => loadPreset(key)}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300 transition-colors"
              >
                {key === 'universal' && '🌐 Universal'}
                {key === 'coding' && '💻 Programming'}
                {key === 'analysis' && '📊 Analysis'}
                {key === 'creative' && '🎨 Creativity'}
              </button>
            ))}
          </div>
        </div>

        {/* Output Routes */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-slate-300">Agent Outputs</h3>
            <button
              onClick={addOutputRoute}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white transition-colors"
            >
              + Add output
            </button>
          </div>
          
          <div className="space-y-3">
            {localConfig.outputs.map((route, index) => (
              <div key={route.id} className="bg-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg">{getIconForOutputType(route.type)}</span>
                  
                  <input
                    type="text"
                    value={route.label}
                    onChange={(e) => updateOutputRoute(index, { label: e.target.value })}
                    className="flex-1 bg-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
                    placeholder="Output name"
                  />
                  
                  <select
                    value={route.type}
                    onChange={(e) => updateOutputRoute(index, { 
                      type: e.target.value as OutputType,
                      contentType: getContentTypeForType(e.target.value as OutputType)
                    })}
                    className="bg-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
                  >
                    {OUTPUT_TYPE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  
                  <label className="flex items-center gap-1 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={route.enabled}
                      onChange={(e) => updateOutputRoute(index, { enabled: e.target.checked })}
                      className="rounded"
                    />
                    Enabled
                  </label>
                  
                  <button
                    onClick={() => removeOutputRoute(index)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    value={route.description || ''}
                    onChange={(e) => updateOutputRoute(index, { description: e.target.value })}
                    className="bg-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
                    placeholder="Output description"
                  />
                  
                  <input
                    type="text"
                    value={route.contentType}
                    onChange={(e) => updateOutputRoute(index, { contentType: e.target.value })}
                    className="bg-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
                    placeholder="Content-Type"
                  />
                </div>

                {/* Route Conditions */}
                <details className="mt-2">
                  <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                    Routing conditions
                  </summary>
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={route.conditions?.contains?.join(', ') || ''}
                      onChange={(e) => updateOutputRoute(index, {
                        conditions: {
                          ...route.conditions,
                          contains: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        }
                      })}
                      className="w-full bg-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
                      placeholder="Keywords (comma-separated)"
                    />
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>

        {/* General Settings */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-slate-300 mb-3">General Settings</h3>
          
          <div className="bg-slate-700 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Default output
              </label>
              <select
                value={localConfig.defaultOutput}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, defaultOutput: e.target.value }))}
                className="w-full bg-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
              >
                {localConfig.outputs.map(route => (
                  <option key={route.id} value={route.id}>
                    {route.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={localConfig.autoRouting.enabled}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    autoRouting: { ...prev.autoRouting, enabled: e.target.checked }
                  }))}
                  className="rounded"
                />
                Automatic routing
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Automatically detect content type and route to the appropriate output
              </p>
            </div>

            {localConfig.autoRouting.enabled && (
              <div className="ml-6 space-y-2">
                {Object.entries(localConfig.autoRouting.rules).map(([rule, enabled]) => (
                  <label key={rule} className="flex items-center gap-2 text-sm text-slate-400">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setLocalConfig(prev => ({
                        ...prev,
                        autoRouting: {
                          ...prev.autoRouting,
                          rules: { ...prev.autoRouting.rules, [rule]: e.target.checked }
                        }
                      }))}
                      className="rounded"
                    />
                    {rule === 'detectJson' && 'Detect JSON'}
                    {rule === 'detectCode' && 'Detect code'}
                    {rule === 'detectMarkdown' && 'Detect Markdown'}
                    {rule === 'detectHtml' && 'Detect HTML'}
                  </label>
                ))}
              </div>
            )}

            <div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={localConfig.multiOutput.enabled}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    multiOutput: { ...prev.multiOutput, enabled: e.target.checked }
                  }))}
                  className="rounded"
                />
                Multiple outputs
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Generate response in multiple formats simultaneously
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function getContentTypeForType(type: OutputType): string {
  const contentTypes: Record<OutputType, string> = {
    text: 'text/plain',
    json: 'application/json',
    markdown: 'text/markdown',
    html: 'text/html',
    code: 'text/plain',
    yaml: 'application/x-yaml',
    xml: 'application/xml',
    csv: 'text/csv'
  };
  return contentTypes[type] || 'text/plain';
}