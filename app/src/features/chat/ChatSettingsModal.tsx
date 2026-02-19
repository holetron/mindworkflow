import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../ui/Modal';
import { ModelInfoModal } from '../ai/ModelInfoModal';
import type { ChatSettings } from './types';
import type { AiProviderOption } from '../nodes/FlowNodeCard';
import { defaultChatSettings } from './types';
import { searchPromptPresets, fetchModelSchema, type ModelSchemaInput } from '../../state/api';
import { AiConfigTab } from './components/AiConfigTab';
import { SettingsTab } from './components/SettingsTab';
import { ContextTab } from './components/ContextTab';

interface ChatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ChatSettings;
  onSave: (settings: ChatSettings) => void;
  providers: AiProviderOption[];
  projectId: string | null;
  inputFieldsData?: Record<string, any>;
}

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
    if (projectId) initial.project_id = projectId;
    return initial;
  });
  const [activeTab, setActiveTab] = useState<'ai_config' | 'settings' | 'model_info' | 'context'>('ai_config');

  // Model schema state
  const [modelInputs, setModelInputs] = useState<ModelSchemaInput[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Field mapping targets
  const [systemPromptTarget, setSystemPromptTarget] = useState<string>('prompt');
  const [outputExampleTarget, setOutputExampleTarget] = useState<string>('prompt');
  const [temperatureTarget, setTemperatureTarget] = useState<string>('temperature');
  const [maxTokensTarget, setMaxTokensTarget] = useState<string>('max_tokens');
  const [additionalFieldsValues, setAdditionalFieldsValues] = useState<Record<string, string>>({});
  const [additionalFieldsMapping, setAdditionalFieldsMapping] = useState<Record<string, { target: string }>>({});

  // Agent mode prompts state
  const [agentModePrompts, setAgentModePrompts] = useState<{ agent?: string; edit?: string; ask?: string }>({});
  const [promptsLoading, setPromptsLoading] = useState(false);

  // Load agent mode prompts from library on mount
  useEffect(() => {
    const loadAgentModePrompts = async () => {
      setPromptsLoading(true);
      try {
        const results = await searchPromptPresets({ category: 'system_prompt', search: 'Chat', limit: 10 });
        const agentPrompt = results.find(p => p.label.includes('Agent Mode') && p.label.includes('Full Access'));
        const editPrompt = results.find(p => p.label.includes('Edit Mode') && p.label.includes('Content Only'));
        const askPrompt = results.find(p => p.label.includes('Ask Mode') && p.label.includes('Read-Only'));
        setAgentModePrompts({ agent: agentPrompt?.content, edit: editPrompt?.content, ask: askPrompt?.content });
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
    const isAgentModePrompt = currentPrompt === agentModePrompts.agent || currentPrompt === agentModePrompts.edit || currentPrompt === agentModePrompts.ask;
    if (isAgentModePrompt || !currentPrompt || currentPrompt.trim() === '') {
      const newPrompt = agentModePrompts[localSettings.agent_mode];
      if (newPrompt && newPrompt !== currentPrompt) {
        setLocalSettings(prev => ({ ...prev, system_prompt: newPrompt }));
      }
    }
  }, [localSettings.agent_mode, agentModePrompts, promptsLoading]);

  // Sync with external settings and auto-select available provider
  useEffect(() => {
    const updatedSettings = { ...settings };
    if (projectId) updatedSettings.project_id = projectId;
    setLocalSettings(updatedSettings);

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

    if (settings.field_mapping) {
      if (settings.field_mapping.system_prompt?.target) setSystemPromptTarget(settings.field_mapping.system_prompt.target);
      if (settings.field_mapping.output_example?.target) setOutputExampleTarget(settings.field_mapping.output_example.target);
      if (settings.field_mapping.temperature?.target) setTemperatureTarget(settings.field_mapping.temperature.target);
      if (settings.field_mapping.max_tokens?.target) setMaxTokensTarget(settings.field_mapping.max_tokens.target);
      if (settings.field_mapping.additional_fields) setAdditionalFieldsMapping(settings.field_mapping.additional_fields);
    }
    if (settings.additional_fields_values) setAdditionalFieldsValues(settings.additional_fields_values);
  }, [settings, providers, projectId]);

  // Load model schema when provider or model changes
  useEffect(() => {
    const loadSchema = async () => {
      if (!localSettings.provider || !localSettings.model) { setModelInputs([]); return; }
      setSchemaLoading(true);
      try {
        const schema = await fetchModelSchema(localSettings.provider, localSettings.model);
        setModelInputs(schema && Array.isArray(schema.inputs) ? schema.inputs : []);
      } catch { setModelInputs([]); }
      finally { setSchemaLoading(false); }
    };
    loadSchema();
  }, [localSettings.provider, localSettings.model]);

  // Auto-detect system_prompt target based on model schema
  useEffect(() => {
    if (schemaLoading || modelInputs.length === 0) return;
    const hasManualMapping = localSettings.field_mapping?.system_prompt?.target;
    if (hasManualMapping && systemPromptTarget !== 'prompt') return;
    const systemInstructionField = modelInputs.find(input => input.name === 'system_instruction');
    const systemPromptField = modelInputs.find(input => input.name === 'system_prompt' || input.name === 'system' || input.name === 'system_message');
    if (systemInstructionField) setSystemPromptTarget('system_instruction');
    else if (systemPromptField) setSystemPromptTarget(systemPromptField.name);
    else setSystemPromptTarget('prompt');
  }, [modelInputs, schemaLoading, localSettings.field_mapping?.system_prompt?.target]);

  const selectedProvider = providers.find((p) => p.id === localSettings.provider);
  const availableModels = selectedProvider?.models || [];

  // Ensure selected model is valid
  useEffect(() => {
    if (selectedProvider && availableModels.length > 0) {
      if (!localSettings.model || !availableModels.includes(localSettings.model)) {
        const defaultModel = selectedProvider.defaultModel || availableModels[0];
        setLocalSettings((prev) => ({ ...prev, model: defaultModel }));
      }
    }
  }, [localSettings.provider, availableModels, selectedProvider, localSettings.model]);

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (provider) {
      setLocalSettings({ ...localSettings, provider: providerId, model: provider.defaultModel || provider.models[0] });
    }
  };

  const handleSave = () => {
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

  const handleReset = () => setLocalSettings(defaultChatSettings);

  const getModelInfoProvider = (providerId: string): 'replicate' | 'openai' | 'google' | 'anthropic' => {
    if (providerId.includes('openai')) return 'openai';
    if (providerId.includes('google') || providerId.includes('gemini')) return 'google';
    if (providerId.includes('anthropic') || providerId.includes('claude')) return 'anthropic';
    if (providerId.includes('replicate')) return 'replicate';
    return 'openai';
  };

  if (!isOpen) return null;

  const tabCls = (tab: string) => `px-4 py-2 rounded text-sm font-medium transition ${
    activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`;

  return (
    <Modal onClose={onClose} title={t('chat.chat_settings')}>
      <div className="flex flex-col h-full max-h-[600px]">
        <div className="flex gap-2 flex-wrap mb-4">
          <button onClick={() => setActiveTab('ai_config')} className={tabCls('ai_config')}>Configuration</button>
          <button onClick={() => setActiveTab('settings')} className={tabCls('settings')}>Settings</button>
          <button onClick={() => setActiveTab('model_info')} className={tabCls('model_info')}>About Model</button>
          <button onClick={() => setActiveTab('context')} className={tabCls('context')}>Context</button>
        </div>

        <div className="flex-grow overflow-y-auto px-1">
          {activeTab === 'ai_config' && (
            <AiConfigTab
              localSettings={localSettings}
              setLocalSettings={setLocalSettings}
              providers={providers}
              selectedProvider={selectedProvider}
              availableModels={availableModels}
              handleProviderChange={handleProviderChange}
              schemaLoading={schemaLoading}
              modelInputs={modelInputs}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              localSettings={localSettings}
              setLocalSettings={setLocalSettings}
              modelInputs={modelInputs}
              schemaLoading={schemaLoading}
              agentModePrompts={agentModePrompts}
              systemPromptTarget={systemPromptTarget}
              setSystemPromptTarget={setSystemPromptTarget}
              outputExampleTarget={outputExampleTarget}
              setOutputExampleTarget={setOutputExampleTarget}
              temperatureTarget={temperatureTarget}
              setTemperatureTarget={setTemperatureTarget}
              maxTokensTarget={maxTokensTarget}
              setMaxTokensTarget={setMaxTokensTarget}
              additionalFieldsValues={additionalFieldsValues}
              setAdditionalFieldsValues={setAdditionalFieldsValues}
              additionalFieldsMapping={additionalFieldsMapping}
              setAdditionalFieldsMapping={setAdditionalFieldsMapping}
            />
          )}

          {activeTab === 'model_info' && selectedProvider && localSettings.model && (
            <ModelInfoModal
              isOpen={true}
              onClose={() => {}}
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

          {activeTab === 'context' && (
            <ContextTab localSettings={localSettings} setLocalSettings={setLocalSettings} />
          )}
        </div>

        <div className="flex justify-between pt-4 border-t border-slate-700 mt-4">
          <button onClick={handleReset} className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 rounded hover:bg-slate-600 transition-colors">Reset to Default</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 rounded hover:bg-slate-600 transition-colors">{t('common.cancel')}</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors">{t('common.save')}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
