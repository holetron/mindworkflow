import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../ui/Modal';
import { ModelInfoModal } from '../ai/ModelInfoModal';
import type { ChatSettings } from './types';
import type { AiProviderOption } from '../nodes/FlowNodeCard';
import { defaultChatSettings, isGenerationModel } from './types';
import { searchPromptPresets, type PromptPreset, fetchModelSchema, type ModelSchemaInput } from '../../state/api';

interface ChatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ChatSettings;
  onSave: (settings: ChatSettings) => void;
  providers: AiProviderOption[];
  projectId: string | null;
  inputFieldsData?: Record<string, any>; // Current input fields values from chat
}

/**
 * Мемоизированный компонент для редактирования system_prompt
 */
const SystemPromptEditor = memo(
  ({
    value,
    onChange,
    onBlur,
    disabled,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    disabled?: boolean;
    placeholder?: string;
  }) => {
    return (
      <textarea
        className="w-full h-40 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
        placeholder={placeholder || 'Введите системные инструкции (system_instruction)...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        spellCheck={false}
      />
    );
  }
);
SystemPromptEditor.displayName = 'SystemPromptEditor';

export function ChatSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  providers,
  projectId,
}: ChatSettingsModalProps) {
  const { t } = useTranslation();

  const [localSettings, setLocalSettings] = useState<ChatSettings>(() => {
    const initial = { ...settings };
    if (projectId) {
      initial.project_id = projectId;
    }
    return initial;
  });
  const [activeTab, setActiveTab] = useState<'ai_config' | 'settings' | 'model_info' | 'context'>('ai_config');
  
  // Prompt search state
  const [promptSearchTerm, setPromptSearchTerm] = useState('');
  const [promptSearchResults, setPromptSearchResults] = useState<PromptPreset[]>([]);
  const [promptSearchLoading, setPromptSearchLoading] = useState(false);
  const [promptSearchError, setPromptSearchError] = useState<string | null>(null);

  // Model schema state
  const [modelInputs, setModelInputs] = useState<ModelSchemaInput[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  
  // Additional fields mapping and values
  const [systemPromptTarget, setSystemPromptTarget] = useState<string>('prompt');
  const [outputExampleTarget, setOutputExampleTarget] = useState<string>('prompt');
  const [temperatureTarget, setTemperatureTarget] = useState<string>('temperature');
  const [maxTokensTarget, setMaxTokensTarget] = useState<string>('max_tokens');
  const [additionalFieldsValues, setAdditionalFieldsValues] = useState<Record<string, string>>({});
  const [additionalFieldsMapping, setAdditionalFieldsMapping] = useState<Record<string, { target: string }>>({});

  // Agent mode prompts state
  const [agentModePrompts, setAgentModePrompts] = useState<{
    agent?: string;
    edit?: string;
    ask?: string;
  }>({});
  const [promptsLoading, setPromptsLoading] = useState(false);

  // Context preview state
  const [contextPreview, setContextPreview] = useState<string>('');
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState<string | null>(null);

  // API Preview state
  const [showApiPreview, setShowApiPreview] = useState(false);
  const [apiPreviewPayload, setApiPreviewPayload] = useState<string>('');

  // Load context preview when project_id or level changes
  const loadContextPreview = useCallback(async () => {
    // loadContextPreview called
    
    if (!localSettings.project_id) {
      setContextPreview('');
      setContextPreviewError('Project ID не указан. Выберите проект для просмотра контекста.');
      return;
    }

    setContextPreviewLoading(true);
    setContextPreviewError(null);

    try {
      const response = await fetch('/api/chats/preview-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: localSettings.project_id,
          mode: localSettings.agent_mode || 'ask',
          context_level: localSettings.context_level ?? 2,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setContextPreview(data.preview || '');
    } catch (error) {
      console.error('[ChatSettings] Failed to load context preview:', error);
      setContextPreviewError('Не удалось загрузить превью контекста');
      setContextPreview('');
    } finally {
      setContextPreviewLoading(false);
    }
  }, [localSettings.project_id, localSettings.agent_mode, localSettings.context_level]);

  // Load agent mode prompts from library on mount
  useEffect(() => {
    const loadAgentModePrompts = async () => {
      setPromptsLoading(true);
      try {
        // Search for chat agent prompts
        const results = await searchPromptPresets({ 
          category: 'system_prompt',
          search: 'Chat',
          limit: 10 
        });
        
        // Find the three mode prompts
        const agentPrompt = results.find(p => p.label.includes('Agent Mode') && p.label.includes('Full Access'));
        const editPrompt = results.find(p => p.label.includes('Edit Mode') && p.label.includes('Content Only'));
        const askPrompt = results.find(p => p.label.includes('Ask Mode') && p.label.includes('Read-Only'));
        
        setAgentModePrompts({
          agent: agentPrompt?.content,
          edit: editPrompt?.content,
          ask: askPrompt?.content,
        });
      } catch (error) {
        console.error('Failed to load agent mode prompts:', error);
      } finally {
        setPromptsLoading(false);
      }
    };
    
    loadAgentModePrompts();
  }, []);

  // Auto-update system instructions when agent mode changes
  useEffect(() => {
    if (promptsLoading || !localSettings.agent_mode) return;
    
    const currentPrompt = localSettings.system_prompt;
    const currentMode = localSettings.agent_mode;
    
    // Check if current prompt is one of our agent mode prompts
    const isAgentModePrompt = 
      currentPrompt === agentModePrompts.agent ||
      currentPrompt === agentModePrompts.edit ||
      currentPrompt === agentModePrompts.ask;
    
    // Only auto-update if current prompt is an agent mode prompt or empty
    if (isAgentModePrompt || !currentPrompt || currentPrompt.trim() === '') {
      const newPrompt = agentModePrompts[currentMode];
      if (newPrompt && newPrompt !== currentPrompt) {
        setLocalSettings(prev => ({
          ...prev,
          system_prompt: newPrompt,
        }));
      }
    }
  }, [localSettings.agent_mode, agentModePrompts, promptsLoading]);

  // Auto-load context preview when switching to context tab or when context_level changes
  useEffect(() => {
    if (activeTab === 'context' && localSettings.project_id) {
      loadContextPreview();
    }
  }, [activeTab, localSettings.project_id, loadContextPreview, localSettings.context_level]);

  // Sync with external settings and auto-select available provider
  useEffect(() => {
    const updatedSettings = { ...settings };
    if (projectId) {
      updatedSettings.project_id = projectId;
    }
    setLocalSettings(updatedSettings);
    
    // If current provider is not available, switch to first available one
    const currentProvider = providers.find(p => p.id === settings.provider);
    if (providers.length > 0 && (!currentProvider || !currentProvider.available)) {
      const firstAvailable = providers.find(p => p.available);
      if (firstAvailable) {
        setLocalSettings(prev => ({
          ...prev,
          provider: firstAvailable.id,
          model: firstAvailable.defaultModel || firstAvailable.models[0] || '',
        }));
      }
    }
    
    // Initialize field mapping from settings
    if (settings.field_mapping) {
      if (settings.field_mapping.system_prompt?.target) {
        setSystemPromptTarget(settings.field_mapping.system_prompt.target);
      }
      if (settings.field_mapping.output_example?.target) {
        setOutputExampleTarget(settings.field_mapping.output_example.target);
      }
      if (settings.field_mapping.temperature?.target) {
        setTemperatureTarget(settings.field_mapping.temperature.target);
      }
      if (settings.field_mapping.max_tokens?.target) {
        setMaxTokensTarget(settings.field_mapping.max_tokens.target);
      }
      if (settings.field_mapping.additional_fields) {
        setAdditionalFieldsMapping(settings.field_mapping.additional_fields);
      }
    }
    
    // Initialize additional field values
    if (settings.additional_fields_values) {
      setAdditionalFieldsValues(settings.additional_fields_values);
    }
  }, [settings, providers, projectId]);

  // Load model schema when provider or model changes
  useEffect(() => {
    const loadSchema = async () => {
      if (!localSettings.provider || !localSettings.model) {
        setModelInputs([]);
        return;
      }

      setSchemaLoading(true);
      try {
        const schema = await fetchModelSchema(localSettings.provider, localSettings.model);
        if (schema && Array.isArray(schema.inputs)) {
          setModelInputs(schema.inputs);
        } else {
          setModelInputs([]);
        }
      } catch (error) {
        console.error('Failed to load model schema:', error);
        setModelInputs([]);
      } finally {
        setSchemaLoading(false);
      }
    };

    loadSchema();
  }, [localSettings.provider, localSettings.model]);

  // Auto-detect and set system_prompt target based on model schema
  useEffect(() => {
    if (schemaLoading || modelInputs.length === 0) return;

    // Check if user has manually set the target (don't override if they did)
    const hasManualMapping = localSettings.field_mapping?.system_prompt?.target;
    if (hasManualMapping && systemPromptTarget !== 'prompt') {
      // User already has a custom mapping, don't override
      return;
    }

    // Priority order for system instruction fields
    const systemInstructionField = modelInputs.find(
      input => input.name === 'system_instruction'
    );
    const systemPromptField = modelInputs.find(
      input => input.name === 'system_prompt' || input.name === 'system' || input.name === 'system_message'
    );

    // Auto-select the appropriate field
    if (systemInstructionField) {
      setSystemPromptTarget('system_instruction');
    } else if (systemPromptField) {
      setSystemPromptTarget(systemPromptField.name);
    } else {
      // No system field found, will be merged into prompt
      setSystemPromptTarget('prompt');
    }
  }, [modelInputs, schemaLoading, localSettings.field_mapping?.system_prompt?.target]);

  // Get available models for selected provider
  const selectedProvider = providers.find((p) => p.id === localSettings.provider);
  const availableModels = selectedProvider?.models || [];
  
  // Debug: selected provider and model counts

  // Ensure selected model is valid - also handles initial modal open
  useEffect(() => {
    if (selectedProvider && availableModels.length > 0) {
      // If model is not set OR not in the available list, set default
      if (!localSettings.model || !availableModels.includes(localSettings.model)) {
        const defaultModel = selectedProvider.defaultModel || availableModels[0];
  // setting default model
        setLocalSettings((prev) => ({
          ...prev,
          model: defaultModel,
        }));
      }
    }
  }, [localSettings.provider, availableModels, selectedProvider, localSettings.model]);

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (provider) {
      setLocalSettings({
        ...localSettings,
        provider: providerId,
        model: provider.defaultModel || provider.models[0],
      });
    }
  };

  const handleSave = () => {
    // Save settings with field mapping
    const updatedSettings: ChatSettings = {
      ...localSettings,
      field_mapping: {
        system_prompt: { target: systemPromptTarget },
        output_example: { target: outputExampleTarget },
        temperature: { target: temperatureTarget },
        max_tokens: { target: maxTokensTarget },
        additional_fields: additionalFieldsMapping,
      },
      additional_fields_values: additionalFieldsValues,
    };
    
    onSave(updatedSettings);
    onClose();
  };

  const handleReset = () => {
    setLocalSettings(defaultChatSettings);
  };

  // Search prompts when search term changes
  useEffect(() => {
    const term = promptSearchTerm.trim();
    if (term.length < 2) {
      setPromptSearchResults([]);
      setPromptSearchError(null);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setPromptSearchLoading(true);
      setPromptSearchError(null);
      try {
        const results = await searchPromptPresets({ search: term, limit: 10 });
        setPromptSearchResults(results);
      } catch (error) {
        console.error('Prompt search error:', error);
        setPromptSearchError('Ошибка поиска промптов');
        setPromptSearchResults([]);
      } finally {
        setPromptSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [promptSearchTerm]);

  // Map provider ID to ModelInfoModal format
  const getModelInfoProvider = (providerId: string): 'replicate' | 'openai' | 'google' | 'anthropic' => {
    if (providerId.includes('openai')) return 'openai';
    if (providerId.includes('google') || providerId.includes('gemini')) return 'google';
    if (providerId.includes('anthropic') || providerId.includes('claude')) return 'anthropic';
    if (providerId.includes('replicate')) return 'replicate';
    return 'openai'; // default fallback
  };

  if (!isOpen) return null;

  return (
    <Modal onClose={onClose} title={t('chat.chat_settings')}>
      <div className="flex flex-col h-full max-h-[600px]">
        {/* Tabs */}
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => setActiveTab('ai_config')}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'ai_config'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Конфигурация
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Настройки
          </button>
          <button
            onClick={() => setActiveTab('model_info')}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'model_info'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            О модели
          </button>
          <button
            onClick={() => setActiveTab('context')}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'context'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Контекст
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto px-1">
          {activeTab === 'ai_config' && (
            <div className="space-y-4">
              {/* Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Оператор</label>
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
                  После смены оператора модель сбрасывается на значение по умолчанию.
                </div>
              </div>

              {selectedProvider && (
                <>
                  {/* Model Selection */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Модель</label>
                    <select
                      value={localSettings.model}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          model: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      {availableModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Выберите модель для чата. Подробную информацию см. во вкладке "ℹ️ О модели".
                    </div>
                    {availableModels.length > 0 && (
                      <div className="text-[11px] text-slate-400 mt-1">
                        Загружено динамических моделей: {availableModels.length}
                      </div>
                    )}
                  </div>

                  {/* Current Configuration Summary */}
                  <div className="border-t border-slate-700 pt-4">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">📊 Текущая конфигурация</h4>
                    <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs">
                      {/* Two columns layout */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">🤖 Оператор:</span> 
                          <span className="font-medium">{localSettings.provider}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">🧠 Модель:</span> 
                          <span className="font-medium truncate" title={localSettings.model}>{localSettings.model}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">🌡️ Температура:</span> 
                          <span className="font-medium">{localSettings.temperature}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">✅ Доступно:</span> 
                          <span className="font-medium">{providers.filter(p => p.available).length}/{providers.length} провайдеров</span>
                        </div>
                        {availableModels.length > 0 && (
                          <div className="flex items-center gap-2 col-span-2">
                            <span className="text-slate-400">📚 Динамических моделей:</span>
                            <span className="font-medium">{availableModels.length}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Warnings based on model schema */}
                      {!schemaLoading && modelInputs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                          {/* Show warning only if system instruction fields are NOT supported */}
                          {!modelInputs.some(input => 
                            input.name === 'system_instruction' || 
                            input.name === 'system_prompt' || 
                            input.name === 'system' || 
                            input.name === 'system_message'
                          ) && (
                            <div className="flex items-start gap-2 text-amber-400">
                              <span className="text-base">⚠️</span>
                              <div className="flex-1">
                                <div className="font-medium">Системные инструкции не поддерживаются</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Эта модель не имеет отдельного поля для системных инструкций. Они будут добавлены в общий prompt.
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Check if model is image generation (likely doesn't support history) */}
                          {(localSettings.model.includes('flux') || 
                            localSettings.model.includes('stable-diffusion') || 
                            localSettings.model.includes('sdxl') ||
                            localSettings.model.includes('midjourney') ||
                            modelInputs.some(input => input.type === 'image' && (input.name === 'output' || input.name === 'image'))) && (
                            <div className="flex items-start gap-2 text-blue-400">
                              <span className="text-base">ℹ️</span>
                              <div className="flex-1">
                                <div className="font-medium">Модель генерации изображений</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  История сообщений не поддерживается. Каждый запрос обрабатывается независимо.
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Loading indicator */}
                          {schemaLoading && (
                            <div className="flex items-center gap-2 text-slate-400 animate-pulse">
                              <span>🔄</span>
                              <span>Загрузка информации о модели...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Agent Mode Selection */}
              <div className="bg-slate-900 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-medium text-slate-300 mb-3">🤖 Режим агента</h4>
                <p className="text-xs text-slate-400 mb-3">
                  Определяет уровень доступа AI к workflow проекта
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const modePrompt = agentModePrompts.agent;
                      setLocalSettings({
                        ...localSettings,
                        agent_mode: 'agent',
                        // Auto-update prompt only if it's currently a mode prompt (not custom)
                        system_prompt: (
                          localSettings.system_prompt === agentModePrompts.agent ||
                          localSettings.system_prompt === agentModePrompts.edit ||
                          localSettings.system_prompt === agentModePrompts.ask ||
                          !localSettings.system_prompt
                        ) && modePrompt ? modePrompt : localSettings.system_prompt,
                      });
                    }}
                    className={`px-3 py-3 rounded text-sm font-medium transition-colors ${
                      (localSettings.agent_mode ?? 'ask') === 'agent'
                        ? 'bg-green-600 text-white ring-2 ring-green-400'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <div className="font-bold mb-1">🔓 Agent</div>
                    <div className="text-[10px] opacity-80">Полный доступ</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const modePrompt = agentModePrompts.edit;
                      setLocalSettings({
                        ...localSettings,
                        agent_mode: 'edit',
                        system_prompt: (
                          localSettings.system_prompt === agentModePrompts.agent ||
                          localSettings.system_prompt === agentModePrompts.edit ||
                          localSettings.system_prompt === agentModePrompts.ask ||
                          !localSettings.system_prompt
                        ) && modePrompt ? modePrompt : localSettings.system_prompt,
                      });
                    }}
                    className={`px-3 py-3 rounded text-sm font-medium transition-colors ${
                      localSettings.agent_mode === 'edit'
                        ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <div className="font-bold mb-1">✏️ Edit</div>
                    <div className="text-[10px] opacity-80">Только контент</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const modePrompt = agentModePrompts.ask;
                      setLocalSettings({
                        ...localSettings,
                        agent_mode: 'ask',
                        system_prompt: (
                          localSettings.system_prompt === agentModePrompts.agent ||
                          localSettings.system_prompt === agentModePrompts.edit ||
                          localSettings.system_prompt === agentModePrompts.ask ||
                          !localSettings.system_prompt
                        ) && modePrompt ? modePrompt : localSettings.system_prompt,
                      });
                    }}
                    className={`px-3 py-3 rounded text-sm font-medium transition-colors ${
                      (localSettings.agent_mode ?? 'ask') === 'ask'
                        ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <div className="font-bold mb-1">👁️ Ask</div>
                    <div className="text-[10px] opacity-80">Только чтение</div>
                  </button>
                </div>

                {/* Mode Description */}
                <div className="mt-3 p-3 bg-slate-800/50 rounded text-xs text-slate-300">
                  {(localSettings.agent_mode ?? 'ask') === 'agent' && (
                    <>
                      <strong className="text-green-400">Agent режим:</strong> AI может создавать, удалять и изменять ноды, 
                      создавать связи между нодами, видит полный контекст workflow.
                    </>
                  )}
                  {localSettings.agent_mode === 'edit' && (
                    <>
                      <strong className="text-amber-400">Edit режим:</strong> AI может только редактировать содержимое 
                      существующих нод. Не может создавать, удалять ноды или менять структуру.
                    </>
                  )}
                  {(localSettings.agent_mode ?? 'ask') === 'ask' && (
                    <>
                      <strong className="text-blue-400">Ask режим:</strong> AI работает в режиме чтения. Может отвечать 
                      на вопросы о workflow, но не может ничего изменять.
                    </>
                  )}
                </div>
              </div>

              {/* System Instructions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Системные инструкции
                    {/* Badge if using agent mode prompt */}
                    {localSettings.system_prompt && (
                      localSettings.system_prompt === agentModePrompts.agent ||
                      localSettings.system_prompt === agentModePrompts.edit ||
                      localSettings.system_prompt === agentModePrompts.ask
                    ) && (
                      <span className="ml-2 text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                        🤖 Режимный промпт
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    {/* Button to restore agent mode prompt */}
                    {localSettings.agent_mode && agentModePrompts[localSettings.agent_mode] && (
                      localSettings.system_prompt !== agentModePrompts[localSettings.agent_mode]
                    ) && (
                      <button
                        type="button"
                        onClick={() => {
                          const modePrompt = agentModePrompts[localSettings.agent_mode!];
                          if (modePrompt) {
                            setLocalSettings({
                              ...localSettings,
                              system_prompt: modePrompt,
                            });
                          }
                        }}
                        className="text-xs px-2 py-1 bg-blue-600/20 text-blue-400 rounded border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
                        title="Восстановить промпт режима агента"
                      >
                        🔄 Вернуть промпт режима
                      </button>
                    )}
                    {/* TARGET: Куда идут системные инструкции */}
                    <select
                      value={systemPromptTarget}
                      onChange={(e) => setSystemPromptTarget(e.target.value)}
                      className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      title="В какое API поле отправляются системные инструкции (system_instruction, system_prompt и т.д.)"
                    >
                      <option value="prompt">📝 В Prompt (общий)</option>
                      {modelInputs.filter(i => i.type === 'string' || i.type === 'text').map(input => (
                        <option key={input.name} value={input.name}>
                          📤 В {input.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Search bar */}
                <div className="relative mb-2">
                  <input
                    type="search"
                    value={promptSearchTerm}
                    onChange={(e) => setPromptSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setPromptSearchTerm('');
                        setPromptSearchResults([]);
                        setPromptSearchError(null);
                      }
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Поиск по библиотеке промптов..."
                  />
                  {promptSearchTerm.trim().length >= 2 && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
                      {promptSearchLoading && (
                        <div className="px-3 py-2 text-sm text-slate-400">Поиск...</div>
                      )}
                      {promptSearchError && !promptSearchLoading && (
                        <div className="px-3 py-2 text-sm text-rose-400">{promptSearchError}</div>
                      )}
                      {!promptSearchLoading && !promptSearchError && promptSearchResults.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-400">Ничего не найдено</div>
                      )}
                      {!promptSearchLoading && promptSearchResults.map((preset) => (
                        <button
                          key={preset.preset_id}
                          type="button"
                          className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-700/70"
                          onClick={() => {
                            setLocalSettings({
                              ...localSettings,
                              system_prompt: preset.content,
                            });
                            setPromptSearchTerm('');
                            setPromptSearchResults([]);
                            setPromptSearchError(null);
                          }}
                        >
                          <span className="text-sm text-slate-200">{preset.label}</span>
                          {preset.description && (
                            <span className="text-xs text-slate-400">{preset.description}</span>
                          )}
                          {preset.tags.length > 0 && (
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">
                              {preset.tags.join(' • ')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <SystemPromptEditor
                  value={localSettings.system_prompt}
                  onChange={(value) => {
                    // Check if this is a manual edit (not from preset/mode selection)
                    const isManualEdit = value !== agentModePrompts.agent && 
                                        value !== agentModePrompts.edit && 
                                        value !== agentModePrompts.ask;
                    
                    setLocalSettings({
                      ...localSettings,
                      system_prompt: value,
                      // Mark as custom if manually edited and not empty
                      system_prompt_type: value.trim() === '' ? 'empty' : (isManualEdit ? 'custom' : 'default'),
                    });
                  }}
                  onBlur={() => {}}
                  placeholder="Введите системные инструкции для AI (system_instruction)..."
                />
              </div>

              {/* Output Format */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Формат вывода
                </label>
                <select
                  value={localSettings.output_format || 'text'}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      output_format: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="json">JSON</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>

              {/* Temperature */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    🌡️ Температура
                  </label>
                  <select
                    value={temperatureTarget}
                    onChange={(e) => setTemperatureTarget(e.target.value)}
                    className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    title="В какое API поле отправляется температура"
                  >
                    <option value="temperature">📤 В temperature (default)</option>
                    {modelInputs.filter(i => i.type === 'number' || i.type === 'integer').map(input => (
                      <option key={input.name} value={input.name}>
                        📤 В {input.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localSettings.temperature}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        temperature: Number(e.target.value),
                      })
                    }
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-sm text-slate-300 min-w-[3ch]">{localSettings.temperature.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Точно</span>
                  <span>Сбалансировано</span>
                  <span>Креативно</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Чем выше значение, тем более креативные ответы. 0 = детерминированный, 1 = сбалансированный, 2 = максимум творчества.
                </p>
              </div>

              {/* Max Tokens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Максимум токенов
                  </label>
                  <select
                    value={maxTokensTarget}
                    onChange={(e) => setMaxTokensTarget(e.target.value)}
                    className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    title="В какое API поле отправляется максимум токенов"
                  >
                    <option value="max_tokens">📤 В max_tokens (default)</option>
                    <option value="max_completion_tokens">📤 В max_completion_tokens (OpenAI)</option>
                    {modelInputs.filter(i => i.type === 'number' || i.type === 'integer').map(input => (
                      <option key={input.name} value={input.name}>
                        📤 В {input.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="number"
                  min="1"
                  max="128000"
                  value={localSettings.max_tokens || 4096}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      max_tokens: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Максимальное количество токенов в ответе. Используется для max_tokens или max_completion_tokens в зависимости от модели.
                </p>
              </div>

              {/* Top P */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Top P ({(localSettings.top_p || 1).toFixed(2)})
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={localSettings.top_p || 1}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      top_p: Number(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Frequency Penalty */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Frequency Penalty ({(localSettings.frequency_penalty || 0).toFixed(2)})
                </label>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={localSettings.frequency_penalty || 0}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      frequency_penalty: Number(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Presence Penalty */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Presence Penalty ({(localSettings.presence_penalty || 0).toFixed(2)})
                </label>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={localSettings.presence_penalty || 0}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      presence_penalty: Number(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Stream */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="stream"
                  checked={localSettings.stream || false}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      stream: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="stream" className="ml-2 text-sm text-slate-300">
                  Потоковый вывод (Stream)
                </label>
              </div>

              {/* Дополнительные поля из схемы модели */}
              {schemaLoading ? (
                <div className="text-xs text-slate-500 italic animate-pulse">
                  Загрузка схемы модели...
                </div>
              ) : (() => {
                // Фильтруем поля: исключаем те, что уже есть в основных настройках
                const mainFields = [
                  'prompt', 
                  'system_prompt', 
                  'temperature', 
                  'max_tokens', 
                  'max_completion_tokens', // OpenAI новый параметр - дублирует max_tokens
                  'top_p', 
                  'frequency_penalty', 
                  'presence_penalty', 
                  'stream'
                ];
                const additionalFields = modelInputs.filter(input => 
                  !mainFields.includes(input.name)
                );
                
                if (additionalFields.length === 0) {
                  return null;
                }
                
                return (
                  <div className="pt-4 mt-4 border-t border-slate-700">
                    <h4 className="text-sm font-medium text-slate-300 mb-3">Дополнительные параметры модели</h4>
                    <div className="space-y-4">
                      {additionalFields.map(field => {
                        const fieldKey = field.name;
                        const mapping = additionalFieldsMapping[fieldKey];
                        const targetValue = mapping?.target || field.name;
                        // Значение поля из локального state
                        const fieldValue = additionalFieldsValues[fieldKey] || field.default || '';
                        
                        return (
                          <div key={fieldKey} className="border-t border-slate-600 pt-4 first:border-0 first:pt-0">
                            {/* Заголовок с названием, типом и селектом */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-slate-300">
                                  {field.name}
                                </label>
                                <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">
                                  {field.type}
                                </span>
                                {field.required && (
                                  <span className="text-xs text-rose-400">✓ Обязательно</span>
                                )}
                              </div>
                              
                              {/* SELECT: Target (куда отправить) */}
                              <select
                                value={targetValue}
                                onChange={(e) => {
                                  setAdditionalFieldsMapping(prev => ({
                                    ...prev,
                                    [fieldKey]: { target: e.target.value }
                                  }));
                                }}
                                className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              >
                                <option value={field.name}>📤 В {field.name}</option>
                                {(field.type === 'string' || field.type === 'text') && (
                                  <option value="prompt">📝 В Prompt (общий)</option>
                                )}
                              </select>
                            </div>
                            
                            {/* Описание поля */}
                            {field.description && (
                              <p className="text-xs text-slate-400 mb-2">{field.description}</p>
                            )}
                            
                            {/* Поле ввода в зависимости от типа */}
                            {(field.type === 'string' || field.type === 'text') && (
                              <input
                                type="text"
                                value={fieldValue}
                                onChange={(e) => {
                                  setAdditionalFieldsValues(prev => ({
                                    ...prev,
                                    [fieldKey]: e.target.value
                                  }));
                                }}
                                placeholder={`Введите ${field.name}...`}
                                className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            )}
                            
                            {(field.type === 'number' || field.type === 'integer') && (
                              <input
                                type="number"
                                value={fieldValue}
                                onChange={(e) => {
                                  setAdditionalFieldsValues(prev => ({
                                    ...prev,
                                    [fieldKey]: e.target.value
                                  }));
                                }}
                                placeholder={`Введите ${field.name}...`}
                                step={field.type === 'integer' ? '1' : 'any'}
                                className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            )}
                            
                            {field.type === 'boolean' && (
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={fieldValue === 'true' || fieldValue === true}
                                  onChange={(e) => {
                                    setAdditionalFieldsValues(prev => ({
                                      ...prev,
                                      [fieldKey]: e.target.checked ? 'true' : 'false'
                                    }));
                                  }}
                                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
                                />
                                <label className="ml-2 text-sm text-slate-300">
                                  Включить {field.name}
                                </label>
                              </div>
                            )}
                            
                            {field.type === 'image' && (
                              <textarea
                                value={fieldValue}
                                onChange={(e) => {
                                  setAdditionalFieldsValues(prev => ({
                                    ...prev,
                                    [fieldKey]: e.target.value
                                  }));
                                }}
                                placeholder={`Введите ${field.name}...`}
                                rows={3}
                                className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Model Info Tab */}
          {activeTab === 'model_info' && selectedProvider && localSettings.model && (
            <ModelInfoModal
              isOpen={true}
              onClose={() => {}} // Tab stays open, close handled by parent modal
              provider={getModelInfoProvider(selectedProvider.id)}
              modelId={localSettings.model}
              nodeId="chat-settings"
              currentMappings={{}}
              onSaveMappings={() => {}}
              inline={true}
              enabledPorts={[]}
              onTogglePort={() => {}}
            />
          )}

          {/* Context Tab */}
          {activeTab === 'context' && (
            <div className="space-y-6">
              {/* Context Level Settings */}
              <div className="bg-slate-900 p-4 rounded border border-slate-700">
                <h4 className="text-sm font-medium text-slate-300 mb-3">📊 Уровень контекста</h4>
                <p className="text-xs text-slate-400 mb-3">
                  Детализация информации о нодах проекта для AI
                </p>
                
                <div className="space-y-4">
                  {/* Context Level Selector */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">
                      Уровень контекста (0=нет, 1=описание, 2=compact, 3=text, 4=json, 5=full json)
                    </label>
                    <select
                      value={localSettings.context_level ?? 2}
                      onChange={(e) => {
                        const newLevel = Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5;
                        setLocalSettings({
                          ...localSettings,
                          context_level: newLevel,
                        });
                      }}
                      className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={0}>0 - Без контекста</option>
                      <option value={1}>1 - Только описание проекта</option>
                      {!isGenerationModel(localSettings.model) && (
                        <>
                          <option value={2}>2 - Clean (компактный текст)</option>
                          <option value={3}>3 - Simple (расширенный текст)</option>
                          <option value={4}>4 - JSON упрощённый</option>
                          <option value={5}>5 - JSON полный (все данные)</option>
                        </>
                      )}
                    </select>
                    {isGenerationModel(localSettings.selected_model) && (
                      <p className="text-xs text-amber-400 mt-2">
                        ⚠️ Для генерационных моделей (фото/видео) доступны только уровни 0 и 1
                      </p>
                    )}
                  </div>


                </div>
              </div>

              {/* Context Preview */}
              <div className="bg-slate-900 p-4 rounded border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-medium text-slate-300">Контекст для агента</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Контекст автоматически обновляется при изменении режима отображения или содержимого входящих нод.
                    </p>
                  </div>
                  <button
                    onClick={loadContextPreview}
                    disabled={contextPreviewLoading || !localSettings.project_id}
                    className="px-3 py-1 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {contextPreviewLoading ? '⏳ Загрузка...' : '🔄 Обновить'}
                  </button>
                </div>
                
                <div className="bg-slate-900/50 border border-slate-700/50 rounded p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">Превью контекста</span>
                    <span className="text-xs text-slate-400">
                      <span className="font-mono">{contextPreview.length.toLocaleString()}</span> символов
                    </span>
                  </div>
                  {contextPreviewError ? (
                    <div className="bg-amber-900/20 border border-amber-700/50 rounded p-3 text-xs text-amber-300">
                      {contextPreviewError}
                    </div>
                  ) : contextPreview ? (
                    <div className="bg-slate-900 p-3 rounded border border-slate-700 overflow-auto max-h-96 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {contextPreview}
                    </div>
                  ) : (
                    <div className="bg-slate-900 p-4 rounded border border-dashed border-slate-700 text-xs text-slate-500 text-center">
                      Контекст отсутствует — выберите проект или нажмите "Обновить"
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-slate-700 mt-4">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
          >
            Reset to Default
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
