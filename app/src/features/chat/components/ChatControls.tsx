import { Settings } from 'lucide-react';
import type { ChatSettings } from '../types';
import type { AiProviderOption } from '../../nodes/FlowNodeCard';
import type { AgentPreset } from '../../../state/api';
import { isGenerationModel } from '../types';

interface ChatControlsProps {
  chatSettings: ChatSettings;
  providers: AiProviderOption[];
  mode: string;
  agentPresets?: AgentPreset[];
  agentPresetId?: string | null;
  onSettingChange: (key: string, value: any) => void;
  onAgentSelect?: (agentId: string | null) => void;
  onShowSettings: () => void;
  getEffectivePromptType: () => string;
}

export function ChatControls({
  chatSettings,
  providers,
  mode,
  agentPresets,
  agentPresetId,
  onSettingChange,
  onAgentSelect,
  onShowSettings,
  getEffectivePromptType,
}: ChatControlsProps) {
  const selectCls = 'px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500';

  const renderModelSelector = () => {
    let currentProvider = providers.find(p => p.id === chatSettings?.provider);
    if (!currentProvider && providers.length > 0) {
      currentProvider = providers.find(p => p.available) || providers[0];
    }
    const availableModels = currentProvider?.models || [];

    return (
      <select
        value={chatSettings?.model || chatSettings?.selected_model || ''}
        onChange={(e) => { onSettingChange('model', e.target.value); onSettingChange('selected_model', e.target.value); }}
        className={`flex-1 min-w-0 ${selectCls}`}
        title="Model"
      >
        {availableModels.length === 0
          ? <option value="">No models available</option>
          : availableModels.map(modelId => <option key={modelId} value={modelId}>{modelId}</option>)
        }
      </select>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {renderModelSelector()}

      <div className="flex items-center gap-2 flex-shrink-0">
        {agentPresets && agentPresets.length > 0 ? (
          <>
            <select value={agentPresetId || 'custom'}
              onChange={(e) => onAgentSelect?.(e.target.value === 'custom' ? null : e.target.value)}
              className={selectCls} title="Select Agent">
              <option value="custom">Custom</option>
              <option disabled>----------</option>
              {agentPresets.map(agent => (
                <option key={agent.preset_id} value={agent.preset_id}>{agent.icon || ''} {agent.title}</option>
              ))}
            </select>
            <button onClick={onShowSettings}
              className="w-10 px-2 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors flex items-center justify-center flex-shrink-0"
              title="Agent Settings">
              <Settings size={16} />
            </button>
          </>
        ) : (
          <>
            <select value={chatSettings?.agent_mode || mode || 'ask'}
              onChange={(e) => onSettingChange('agent_mode', e.target.value)}
              className={selectCls} title="Agent Mode">
              <option value="agent">Agent</option>
              <option value="edit">Edit</option>
              <option value="ask">Ask</option>
            </select>

            {!isGenerationModel(chatSettings?.selected_model) && (
              <select value={getEffectivePromptType()}
                onChange={(e) => onSettingChange('system_prompt_type', e.target.value)}
                className={selectCls} title="Prompt Type">
                <option value="default">Default</option>
                {getEffectivePromptType() === 'custom' && <option value="custom">Custom</option>}
                <option value="empty">Empty</option>
              </select>
            )}

            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400 whitespace-nowrap">Ctx:</span>
              <select
                value={chatSettings?.context_level ?? (isGenerationModel(chatSettings?.selected_model) ? 0 : 2)}
                onChange={(e) => onSettingChange('context_level', parseInt(e.target.value))}
                className={`${selectCls} w-12`}
                title="Context Level">
                <option value={0}>0</option>
                <option value={1}>1</option>
                {!isGenerationModel(chatSettings?.selected_model) && (
                  <><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option></>
                )}
              </select>
            </div>

            <button onClick={onShowSettings}
              className="w-10 px-2 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors flex items-center justify-center flex-shrink-0"
              title="Settings">
              <Settings size={16} />
            </button>

            {isGenerationModel(chatSettings?.selected_model) && (
              <span className="text-xs text-blue-400 italic whitespace-nowrap">Gen</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
