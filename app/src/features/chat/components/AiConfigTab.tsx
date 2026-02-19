import type { ChatSettings } from '../types';
import type { AiProviderOption } from '../../nodes/FlowNodeCard';
import type { ModelSchemaInput } from '../../../state/api';

interface AiConfigTabProps {
  localSettings: ChatSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
  providers: AiProviderOption[];
  selectedProvider: AiProviderOption | undefined;
  availableModels: string[];
  handleProviderChange: (providerId: string) => void;
  schemaLoading: boolean;
  modelInputs: ModelSchemaInput[];
}

export function AiConfigTab({
  localSettings,
  setLocalSettings,
  providers,
  selectedProvider,
  availableModels,
  handleProviderChange,
  schemaLoading,
  modelInputs,
}: AiConfigTabProps) {
  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-400 mb-2">Operator</label>
        <select
          value={localSettings.provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id} disabled={!provider.available}>
              {provider.name} {!provider.available && `(${provider.reason || 'unavailable'})`}
            </option>
          ))}
        </select>
        <div className="mt-1 text-[11px] text-slate-500">
          After changing the operator, the model resets to default.
        </div>
      </div>

      {selectedProvider && (
        <>
          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Model</label>
            <select
              value={localSettings.model}
              onChange={(e) => setLocalSettings({ ...localSettings, model: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            <div className="text-[11px] text-slate-500 mt-1">
              Select a model for the chat. See details in the tab "About Model".
            </div>
            {availableModels.length > 0 && (
              <div className="text-[11px] text-slate-400 mt-1">
                Dynamic models loaded: {availableModels.length}
              </div>
            )}
          </div>

          {/* Current Configuration Summary */}
          <div className="border-t border-slate-700 pt-4">
            <h4 className="text-sm font-medium text-slate-300 mb-2">Current Configuration</h4>
            <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Operator:</span>
                  <span className="font-medium">{localSettings.provider}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Model:</span>
                  <span className="font-medium truncate" title={localSettings.model}>{localSettings.model}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Temperature:</span>
                  <span className="font-medium">{localSettings.temperature}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Available:</span>
                  <span className="font-medium">{providers.filter(p => p.available).length}/{providers.length} providers</span>
                </div>
                {availableModels.length > 0 && (
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-slate-400">Dynamic models:</span>
                    <span className="font-medium">{availableModels.length}</span>
                  </div>
                )}
              </div>

              {/* Warnings based on model schema */}
              {!schemaLoading && modelInputs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                  {!modelInputs.some(input =>
                    input.name === 'system_instruction' ||
                    input.name === 'system_prompt' ||
                    input.name === 'system' ||
                    input.name === 'system_message'
                  ) && (
                    <div className="flex items-start gap-2 text-amber-400">
                      <span className="text-base">!</span>
                      <div className="flex-1">
                        <div className="font-medium">System instructions not supported</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          This model does not have a separate field for system instructions. They will be added to the general prompt.
                        </div>
                      </div>
                    </div>
                  )}

                  {(localSettings.model.includes('flux') ||
                    localSettings.model.includes('stable-diffusion') ||
                    localSettings.model.includes('sdxl') ||
                    localSettings.model.includes('midjourney') ||
                    modelInputs.some(input => input.type === 'image' && (input.name === 'output' || input.name === 'image'))) && (
                    <div className="flex items-start gap-2 text-blue-400">
                      <span className="text-base">i</span>
                      <div className="flex-1">
                        <div className="font-medium">Image generation model</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Message history not supported. Each request is processed independently.
                        </div>
                      </div>
                    </div>
                  )}

                  {schemaLoading && (
                    <div className="flex items-center gap-2 text-slate-400 animate-pulse">
                      <span>Loading model information...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
