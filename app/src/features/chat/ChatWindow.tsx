import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, X, Send, Settings, ChevronDown } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatSettingsModal } from './ChatSettingsModal';
import { AiSettingsModal } from '../../ui/AiSettingsModal';
import { AgentInputFields } from './AgentInputFields';
import type { ChatMessage as ChatMessageType, ChatMode, ChatSettings, AgentInputField } from './types';
import type { AiProviderOption } from '../nodes/FlowNodeCard';
import type { AgentPreset } from '../../state/api';
import { isGenerationModel } from './types';
import { searchPromptPresets } from '../../state/api';

interface ChatWindowProps {
  chatId: string | null;
  mode: ChatMode;
  settings: ChatSettings;
  projectId: string | null;
  agentPresetId?: string | null;
  agentPresets?: AgentPreset[];
  providers: AiProviderOption[];
  onAddToWorkflow?: (nodeId: string) => void;
  onChatCreated?: (chatId: string) => void;
  onSettingsLoaded?: (settings: ChatSettings) => void;
  onAgentSelect?: (agentId: string | null) => void;
}

export function ChatWindow({ chatId, mode, settings, projectId, agentPresetId, agentPresets, providers, onAddToWorkflow, onChatCreated, onSettingsLoaded, onAgentSelect }: ChatWindowProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSettings>(settings);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request'>('ai_config');
  const [agentModePrompts, setAgentModePrompts] = useState<{ agent?: string; edit?: string; ask?: string }>({});
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ✅ NEW: Input fields data for agent chat
  const [inputFieldsData, setInputFieldsData] = useState<Record<string, any>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Get selected agent
  const selectedAgent = agentPresets?.find(a => a.preset_id === agentPresetId);

  // ✅ NEW: Get input fields from agent preset
  const inputFields = useMemo((): AgentInputField[] => {
    console.log('[ChatWindow] useMemo recalculating input fields:', {
      agentPresetId,
      agentPresetsLength: agentPresets?.length,
      hasAgentPresets: !!agentPresets,
    });
    
    if (!agentPresetId || !agentPresets) {
      console.log('[ChatWindow] No agentPresetId or agentPresets, returning empty array');
      return [];
    }
    
    const agent = agentPresets.find(a => a.preset_id === agentPresetId);
    if (!agent) {
      console.log('[ChatWindow] Agent not found in agentPresets:', agentPresetId);
      return [];
    }
    
    const fields = (agent?.node_template?.ai?.input_fields as AgentInputField[]) || [];
    
    console.log('[ChatWindow] Input fields loaded:', {
      agentPresetId,
      agent: agent?.title,
      input_fields: fields,
      field_mapping: agent?.node_template?.ai?.field_mapping,
    });
    
    return fields;
  }, [agentPresetId, agentPresets]);

  // ✅ Initialize input fields data with default values when agent changes
  useEffect(() => {
    if (inputFields.length > 0) {
      const initialData: Record<string, any> = {};
      inputFields.forEach(field => {
        // Initialize all fields (even without defaultValue) to ensure proper form state
        initialData[field.name] = field.defaultValue ?? '';
      });
      setInputFieldsData(initialData);
    } else {
      setInputFieldsData({});
    }
  }, [inputFields]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height based on content, max ~4 rows (approx 96px)
      const newHeight = Math.min(textarea.scrollHeight, 96);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  // ✅ Update local state when settings prop changes
  useEffect(() => {
    setChatSettings(settings);
  }, [settings]);

  // Auto-select default agent if none selected - DISABLED, default to Custom mode
  // useEffect(() => {
  //   if (agentPresets && agentPresets.length > 0 && !agentPresetId && onAgentSelect) {
  //     const favoriteAgents = agentPresets.filter(a => a.is_favorite);
  //     const defaultAgent = favoriteAgents.length > 0 
  //       ? favoriteAgents[0]
  //       : agentPresets[0];
  //     
  //     if (defaultAgent) {
  //       onAgentSelect(defaultAgent.preset_id);
  //     }
  //   }
  // }, [agentPresets, agentPresetId, onAgentSelect]);

  // Apply agent settings when agent changes
  useEffect(() => {
    if (agentPresetId && agentPresets) {
      const agent = agentPresets.find(a => a.preset_id === agentPresetId);
      if (agent?.node_template?.ai) {
        const aiConfig = agent.node_template.ai;
        const newSettings = {
          ...chatSettings,
          provider: aiConfig.provider || 'openai_gpt',
          model: aiConfig.model || 'gpt-4o',
          selected_model: aiConfig.model || 'gpt-4o',
          temperature: aiConfig.temperature ?? 0.7,
          max_tokens: aiConfig.max_tokens ?? 2000,
          system_prompt: aiConfig.system_prompt || '',
          agent_mode: 'agent',
        };
        setChatSettings(newSettings);
        if (onSettingsLoaded) {
          onSettingsLoaded(newSettings);
        }
      }
    }
  }, [agentPresetId, agentPresets]);

  // Load agent mode prompts on mount
  useEffect(() => {
    const loadAgentModePrompts = async () => {
      try {
        const results = await searchPromptPresets({ 
          category: 'system_prompt',
          search: 'Chat',
          limit: 10 
        });
        
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
      }
    };
    
    loadAgentModePrompts();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load messages for current chat
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/chats/${chatId}/messages`);
        if (response.ok) {
          const data = await response.json();
          // Handle new format: { messages, settings, agent_preset_id }
          if (data.messages) {
            setMessages(data.messages);
            // ✅ Load and apply saved settings
            if (data.settings) {
              const loadedSettings = {
                ...chatSettings,
                ...data.settings,
              };
              setChatSettings(loadedSettings);
              if (onSettingsLoaded) {
                onSettingsLoaded(loadedSettings);
              }
            }
            // ✅ NEW: Load agent_preset_id from chat
            if (data.agent_preset_id && onAgentSelect) {
              console.log('[ChatWindow] Loading agent from chat:', data.agent_preset_id);
              onAgentSelect(data.agent_preset_id);
            }
          } else {
            // Fallback for old format (just array of messages)
            setMessages(data);
          }
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [chatId]);

  // Helper: Check if current system_prompt matches any mode prompt
  const getEffectivePromptType = useCallback(() => {
    const currentPrompt = chatSettings?.system_prompt;
    
    // Empty prompt = empty
    if (!currentPrompt || currentPrompt.trim() === '') return 'empty';
    
    // Matches mode prompt = default
    if (currentPrompt === agentModePrompts.agent) return 'default';
    if (currentPrompt === agentModePrompts.edit) return 'default';
    if (currentPrompt === agentModePrompts.ask) return 'default';
    
    // Modified/different = custom
    return 'custom';
  }, [chatSettings?.system_prompt, agentModePrompts]);

  // ✅ NEW: Handle chat settings change (from quick selects)
  const handleSettingChange = useCallback(async (key: string, value: any) => {
    setChatSettings(prevSettings => {
      const newSettings = { ...prevSettings, [key]: value };

      // If selecting a generation model, force context_level=0 and system_prompt_type='empty'
      if (key === 'selected_model' && isGenerationModel(value)) {
        newSettings.context_level = 0;
        newSettings.system_prompt_type = 'empty';
        newSettings.system_prompt = '';
      }

      // If changing system_prompt_type selector
      if (key === 'system_prompt_type') {
        if (value === 'default') {
          // Set to current mode prompt
          const currentMode = prevSettings?.agent_mode || 'ask';
          const modePrompt = agentModePrompts[currentMode];
          if (modePrompt) {
            newSettings.system_prompt = modePrompt;
          }
        } else if (value === 'empty') {
          // Clear prompt
          newSettings.system_prompt = '';
        }
        // If 'custom' - do nothing, user needs to edit in modal
      }

      // If changing agent_mode, update system_prompt only if it's currently a mode prompt (not custom)
      if (key === 'agent_mode') {
        const currentPrompt = prevSettings?.system_prompt;
        const isDefaultPrompt = currentPrompt === agentModePrompts.agent ||
                                currentPrompt === agentModePrompts.edit ||
                                currentPrompt === agentModePrompts.ask;
        
        if (!currentPrompt || currentPrompt.trim() === '' || isDefaultPrompt) {
          const newModePrompt = agentModePrompts[value as ChatMode];
          if (newModePrompt) {
            newSettings.system_prompt = newModePrompt;
          }
        }
        // If custom prompt, don't change it
      }

      if (onSettingsLoaded) {
        onSettingsLoaded(newSettings);
      }

      return newSettings;
    });

    // Save to DB (async, don't block UI)
    if (chatId) {
      try {
        await fetch(`/api/chats/${chatId}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [key]: value,
            ...(key === 'selected_model' && isGenerationModel(value) ? {
              context_level: 0,
              system_prompt_type: 'empty',
            } : {}),
          }),
        });
      } catch (error) {
        console.error('Failed to save chat settings:', error);
      }
    }
  }, [chatId, agentModePrompts, onSettingsLoaded]);

  // ✅ NEW: Handle settings save from modal
  const handleSaveSettings = useCallback(async (newSettings: ChatSettings) => {
    setChatSettings(newSettings);
    if (onSettingsLoaded) {
      onSettingsLoaded(newSettings);
    }
    setShowSettings(false);

    // Save to DB
    if (chatId) {
      try {
        await fetch(`/api/chats/${chatId}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSettings),
        });
      } catch (error) {
        console.error('Failed to save chat settings:', error);
      }
    }
  }, [chatId, onSettingsLoaded]);

  // ✅ Generate API request preview for agent chat
  const generatePreviewPayload = useCallback(() => {
    const agent = agentPresets?.find(a => a.preset_id === agentPresetId);
    if (!agent) return null;

    const aiConfig = agent.node_template?.ai || {};
    const preview: any = {
      version: aiConfig.model || 'unknown',
      input: {
        prompt: input.trim() || 'Example prompt',
        ...inputFieldsData, // Add current input fields values
      }
    };

    // Add standard parameters
    if (aiConfig.temperature) preview.input.temperature = aiConfig.temperature;
    if (aiConfig.max_tokens) preview.input.max_tokens = aiConfig.max_tokens;
    if (aiConfig.top_p) preview.input.top_p = aiConfig.top_p;
    
    return preview;
  }, [agentPresetId, agentPresets, input, inputFieldsData]);


  const handleSend = async () => {

    const userMessage = input.trim();
    
    // Input fields are sent separately, not in message content
    const messageContent = userMessage;
    
    setInput('');
    setSending(true);

    let activeChatId = chatId;

    // If no chat exists, create one first
    if (!activeChatId) {
      try {
        const createResponse = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title: `Chat ${new Date().toLocaleString()}`,
            settings: chatSettings,
            project_id: projectId,  // Add project_id to bind chat to project
            agent_preset_id: agentPresetId  // Add agent_preset_id to bind chat to agent
          }),
        });

        if (createResponse.ok) {
          const newChat = await createResponse.json();
          activeChatId = newChat.id;
          if (onChatCreated) {
            onChatCreated(activeChatId);
          }
        } else {
          throw new Error('Failed to create chat');
        }
      } catch (error) {
        console.error('Failed to create chat:', error);
        alert('Failed to create chat. Please try again.');
        setSending(false);
        setInput(userMessage);
        return;
      }
    }

    // Optimistically add user message
    const tempUserMessage: ChatMessageType = {
      id: `temp-${Date.now()}`,
      chat_id: activeChatId,
      role: 'user',
      content: messageContent,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const response = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: messageContent,
          mode,
          project_id: projectId,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
          settings: chatSettings, // Pass current chat settings with selected model, context level, etc.
          input_fields: Object.keys(inputFieldsData).length > 0 ? inputFieldsData : undefined, // ✅ Pass input fields separately
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Clear attachments after successful send
        setAttachedFiles([]);
        setUploadedFiles([]);
        // Replace temp message with real ones
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempUserMessage.id);
          return [
            ...filtered,
            data.user_message,
            data.assistant_message,
          ];
        });
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachedFiles((prev) => [...prev, ...files]);
      
      // Upload files immediately
      if (chatId) {
        await uploadFiles(files);
      }
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!chatId) return;
    
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch(`/api/chats/${chatId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedFiles((prev) => [...prev, ...data.files]);
        console.log('[CHAT] Uploaded files:', data.files);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Failed to upload files:', error);
      alert('Failed to upload files. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setAttachedFiles((prev) => [...prev, ...files]);
      
      // Upload files if chat exists
      if (chatId) {
        await uploadFiles(files);
      }
    }
  };

  // Render modals FIRST (before checking chatId, so they're always available)
  const settingsModal = agentPresets && agentPresets.length > 0 ? (
    // For AgentsPage: use AiSettingsModal with current agent or mock node
    showSettings ? (
      <AiSettingsModal
        node={selectedAgent?.node_template || {
          node_id: 'chat-custom',
          type: 'ai',
          title: 'Custom Chat',
          content: '',
          ai: {
            enabled: true,
            provider: chatSettings?.provider || 'openai_gpt',
            model: chatSettings?.selected_model || chatSettings?.model || 'gpt-4o',
            temperature: chatSettings?.temperature ?? 0.7,
            max_tokens: chatSettings?.max_tokens ?? 2000,
            system_prompt: chatSettings?.system_prompt || '',
          },
          ui: { bbox: { x1: 0, y1: 0, x2: 400, y2: 200 }, color: '#6B7280' },
          connections: { incoming: [], outgoing: [] },
        }}
        onClose={() => setShowSettings(false)}
        activeTab={activeSettingsTab}
        onTabChange={setActiveSettingsTab}
        onChangeAi={(nodeId, ai) => {
          // Apply AI config to chat settings
          const newSettings = {
            ...chatSettings,
            provider: (ai.provider as string) || 'openai_gpt',
            model: (ai.model as string) || 'gpt-4o',
            selected_model: (ai.model as string) || 'gpt-4o',
            temperature: (ai.temperature as number) ?? 0.7,
            max_tokens: (ai.max_tokens as number) ?? 2000,
            system_prompt: (ai.system_prompt as string) || '',
          };
          setChatSettings(newSettings);
          if (onSettingsLoaded) {
            onSettingsLoaded(newSettings);
          }
        }}
        providers={providers}
      />
    ) : null
  ) : (
    // For WorkspacePage: use ChatSettingsModal
    <ChatSettingsModal
      isOpen={showSettings}
      onClose={() => setShowSettings(false)}
      settings={chatSettings}
      onSave={handleSaveSettings}
      providers={providers}
      projectId={projectId}
      inputFieldsData={inputFieldsData}
    />
  );

  if (!chatId) {
    return (
      <>
        <div 
          className="flex-grow flex flex-col h-full overflow-hidden relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/20 border-4 border-dashed border-blue-400 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-800 px-6 py-4 rounded-lg shadow-2xl">
              <p className="text-lg font-medium text-blue-300">📎 Перетащите файлы сюда</p>
            </div>
          </div>
        )}

        {/* Empty messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          <div className="text-center text-slate-400 text-sm py-4">
            Start a new conversation!
          </div>
        </div>

        {/* Input panel with controls */}
        <div className="flex-shrink-0 border-t border-slate-700 p-3 bg-slate-900">
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {uploading && (
                <div className="px-2 py-1 bg-blue-500/20 border border-blue-500 rounded text-xs text-blue-300">
                  Uploading...
                </div>
              )}
              {attachedFiles.map((file, index) => {
                const isImage = file.type.startsWith('image/');
                const uploaded = uploadedFiles[index];
                
                return (
                  <div
                    key={index}
                    className="relative flex items-center gap-2 px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 border border-slate-600"
                  >
                    {isImage && uploaded ? (
                      <img 
                        src={uploaded.url} 
                        alt={file.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 flex items-center justify-center bg-slate-600 rounded">
                        📄
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="truncate max-w-[120px] font-medium">{file.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 hover:bg-red-600 rounded-full text-white text-xs"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Message input row with file attach and send button */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-2 py-2 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors disabled:opacity-50"
              title="Attach files"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.type_message')}
              rows={1}
              disabled={sending}
              className="flex-grow px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm disabled:opacity-50 overflow-y-auto"
              style={{ minHeight: '40px', maxHeight: '96px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-[52px] px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              title={sending ? 'Sending...' : 'Send message'}
            >
              {sending ? '...' : <Send size={18} />}
            </button>
          </div>

          {/* ✅ NEW: Dynamic input fields for agent chat - BELOW message input */}
          {(() => {
            console.log('[ChatWindow] Render check - inputFields:', inputFields, 'length:', inputFields?.length, 'agentPresetId:', agentPresetId);
            
            // Show input fields if they exist
            const hasInputFields = inputFields.length > 0;
            
            // Show preview button if agent is selected
            const showPreview = !!agentPresetId;
            
            if (!hasInputFields && !showPreview) return null;
            
            return (
              <div className="space-y-2">
                {hasInputFields && (
                  <AgentInputFields
                    fields={inputFields}
                    values={inputFieldsData}
                    onChange={setInputFieldsData}
                  />
                )}
                {/* Preview button - show if agent selected */}
                {showPreview && (
                  <button
                    onClick={() => setShowPreviewModal(true)}
                    className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5"
                  >
                    <span>👁️</span>
                    Превью API запроса
                  </button>
                )}
              </div>
            );
          })()}

          {/* Controls row: model, mode, prompt type, context level, settings */}
          <div className="flex items-center gap-2">
            {/* Model selector - takes all remaining space */}
            <select
              value={chatSettings?.model || chatSettings?.selected_model || ''}
              onChange={(e) => {
                handleSettingChange('model', e.target.value);
                handleSettingChange('selected_model', e.target.value);
              }}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500 min-w-0"
              title="Model"
            >
              {(() => {
                let currentProvider = providers.find(p => p.id === chatSettings?.provider);
                if (!currentProvider && providers.length > 0) {
                  currentProvider = providers.find(p => p.available) || providers[0];
                }
                
                const availableModels = currentProvider?.models || [];
                
                if (availableModels.length === 0) {
                  return <option value="">No models available</option>;
                }
                
                return availableModels.map(modelId => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ));
              })()}
            </select>

            {/* Right side: fixed-width block */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* For AgentsPage (with agentPresets): show agent selector and Settings button */}
              {agentPresets && agentPresets.length > 0 ? (
                <>
                  {/* Agent selector with Custom mode */}
                  <select
                    value={agentPresetId || 'custom'}
                    onChange={(e) => {
                      if (onAgentSelect) {
                        onAgentSelect(e.target.value === 'custom' ? null : e.target.value);
                      }
                    }}
                    className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500"
                    title="Select Agent"
                  >
                    <option value="custom">⚙️ Custom</option>
                    <option disabled>──────────</option>
                    {agentPresets.map(agent => (
                      <option key={agent.preset_id} value={agent.preset_id}>
                        {agent.icon || '🤖'} {agent.title}
                      </option>
                    ))}
                  </select>

                  {/* Settings button */}
                  <button
                    onClick={() => {
                      console.log('[ChatWindow] Opening agent settings, agentPresetId:', agentPresetId);
                      setShowSettings(true);
                    }}
                    className="w-10 px-2 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors flex items-center justify-center flex-shrink-0"
                    title="Agent Settings"
                  >
                    <Settings size={16} />
                  </button>
                </>
              ) : (
                /* Full controls for WorkspacePage */
                <>
                  {/* Agent mode selector */}
                  <select
                    value={chatSettings?.agent_mode || mode || 'ask'}
                    onChange={(e) => handleSettingChange('agent_mode', e.target.value)}
                    className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500"
                    title="Agent Mode"
                  >
                    <option value="agent">🤖 Agent</option>
                    <option value="edit">✏️ Edit</option>
                    <option value="ask">🔍 Ask</option>
                  </select>

                  {/* System prompt selector (hidden in generation mode) */}
                  {!isGenerationModel(chatSettings?.selected_model) && (
                    <select
                      value={getEffectivePromptType()}
                      onChange={(e) => handleSettingChange('system_prompt_type', e.target.value)}
                      className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500"
                      title="Prompt Type"
                    >
                      <option value="default">Default</option>
                      {getEffectivePromptType() === 'custom' && <option value="custom">Custom</option>}
                      <option value="empty">Empty</option>
                    </select>
                  )}

                  {/* Context level selector */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 whitespace-nowrap">Ctx:</span>
                    <select
                      value={chatSettings?.context_level ?? (isGenerationModel(chatSettings?.selected_model) ? 0 : 2)}
                      onChange={(e) => handleSettingChange('context_level', parseInt(e.target.value))}
                      className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500 w-12"
                      title={isGenerationModel(chatSettings?.selected_model) ? "Context Level (0=None, 1=Project Brief)" : "Context Level"}
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      {!isGenerationModel(chatSettings?.selected_model) && (
                        <>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                          <option value={5}>5</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Settings button */}
                  <button
                    onClick={() => {
                      console.log('[ChatWindow] Opening settings, projectId:', projectId);
                      setShowSettings(true);
                    }}
                    className="w-10 px-2 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors flex items-center justify-center flex-shrink-0"
                    title="Settings"
                  >
                    <Settings size={16} />
                  </button>

                  {/* Generation mode info */}
                  {isGenerationModel(chatSettings?.selected_model) && (
                    <span className="text-xs text-blue-400 italic whitespace-nowrap">
                      🔒 Gen
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
        {settingsModal}
      </>
    );
  }

  return (
    <div 
      className="flex-grow flex flex-col h-full overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 border-4 border-dashed border-blue-400 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-800 px-6 py-4 rounded-lg shadow-2xl">
            <p className="text-lg font-medium text-blue-300">📎 Перетащите файлы сюда</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {loading ? (
          <div className="text-center text-slate-400 text-sm py-4">{t('common.loading')}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-4">
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              chatId={chatId}
              projectId={projectId}
              onAddToWorkflow={onAddToWorkflow}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input panel with controls */}
      <div className="flex-shrink-0 border-t border-slate-700 p-3 bg-slate-900">
        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1 px-2 py-1 bg-slate-700 rounded text-xs text-slate-300"
              >
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="hover:text-red-400"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Message input row with file attach and send button */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-10 px-2 py-2 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors flex items-center justify-center"
            title="Attach files"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.type_message')}
            rows={1}
            disabled={sending}
            className="flex-grow px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm disabled:opacity-50 overflow-y-auto"
            style={{ minHeight: '40px', maxHeight: '96px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            title={sending ? 'Sending...' : 'Send message'}
          >
            {sending ? '...' : <Send size={18} />}
          </button>
        </div>

        {/* ✅ NEW: Dynamic input fields for agent chat - BELOW message input */}
        {inputFields.length > 0 && (
          <AgentInputFields
            fields={inputFields}
            values={inputFieldsData}
            onChange={setInputFieldsData}
          />
        )}

        {/* Controls row: model on left (flex), mode/prompt/context/settings on right (fixed) */}
        <div className="flex items-center gap-2">
          {/* Model selector - takes all remaining space */}
          <select
              value={chatSettings?.model || chatSettings?.selected_model || ''}
              onChange={(e) => {
                handleSettingChange('model', e.target.value);
                handleSettingChange('selected_model', e.target.value);
              }}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500 min-w-0"
              title="Model"
            >
              {(() => {
                let currentProvider = providers.find(p => p.id === chatSettings?.provider);
                if (!currentProvider && providers.length > 0) {
                  currentProvider = providers.find(p => p.available) || providers[0];
                }
                
                const availableModels = currentProvider?.models || [];
                
                if (availableModels.length === 0) {
                  return <option value="">No models available</option>;
                }
                
                return availableModels.map(modelId => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ));
              })()}
            </select>

          {/* Right side: fixed-width block with mode, prompt, context, settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* For AgentsPage (with agentPresets): show agent selector and Settings button */}
            {agentPresets && agentPresets.length > 0 ? (
              <>
                {/* Agent selector with Custom mode */}
                <select
                  value={agentPresetId || 'custom'}
                  onChange={(e) => {
                    if (onAgentSelect) {
                      onAgentSelect(e.target.value === 'custom' ? null : e.target.value);
                    }
                  }}
                  className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500"
                  title="Select Agent"
                >
                  <option value="custom">⚙️ Custom</option>
                  <option disabled>──────────</option>
                  {agentPresets.map(agent => (
                    <option key={agent.preset_id} value={agent.preset_id}>
                      {agent.icon || '🤖'} {agent.title}
                    </option>
                  ))}
                </select>

                {/* Settings button */}
                <button
                  onClick={() => {
                    console.log('[ChatWindow] Opening agent settings, agentPresetId:', agentPresetId);
                    setShowSettings(true);
                  }}
                  className="w-10 px-2 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors flex items-center justify-center flex-shrink-0"
                  title="Agent Settings"
                >
                  <Settings size={16} />
                </button>
              </>
            ) : (
              /* Full controls for WorkspacePage */
              <>
                {/* Agent mode selector */}
                <select
                  value={chatSettings?.agent_mode || mode || 'ask'}
                  onChange={(e) => handleSettingChange('agent_mode', e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500"
                  title="Agent Mode"
                >
                  <option value="agent">🤖 Agent</option>
                  <option value="edit">✏️ Edit</option>
                  <option value="ask">🔍 Ask</option>
                </select>

                {/* System prompt selector (hidden in generation mode) */}
                {!isGenerationModel(chatSettings?.selected_model) && (
                  <select
                    value={getEffectivePromptType()}
                    onChange={(e) => handleSettingChange('system_prompt_type', e.target.value)}
                    className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500"
                    title="Prompt Type"
                  >
                    <option value="default">Default</option>
                    {getEffectivePromptType() === 'custom' && <option value="custom">Custom</option>}
                    <option value="empty">Empty</option>
                  </select>
                )}

                {/* Context level selector */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400 whitespace-nowrap">Ctx:</span>
                  <select
                    value={chatSettings?.context_level ?? (isGenerationModel(chatSettings?.selected_model) ? 0 : 2)}
                    onChange={(e) => handleSettingChange('context_level', parseInt(e.target.value))}
                    className="px-2 py-1.5 text-xs rounded border border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500 focus:border-blue-500 w-12"
                    title={isGenerationModel(chatSettings?.selected_model) ? "Context Level (0=None, 1=Project Brief)" : "Context Level"}
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    {!isGenerationModel(chatSettings?.selected_model) && (
                      <>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Settings button - same width and height as Send button */}
                <button
                  onClick={() => {
                    console.log('[ChatWindow] Opening settings (existing chat), projectId:', projectId);
                    setShowSettings(true);
                  }}
                  className="w-10 px-2 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors flex items-center justify-center flex-shrink-0"
                  title="Settings"
                >
                  <Settings size={16} />
                </button>

                {/* Generation mode info */}
                {isGenerationModel(chatSettings?.selected_model) && (
                  <span className="text-xs text-blue-400 italic whitespace-nowrap">
                    🔒 Gen
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings modal */}
      {settingsModal}

      {/* Preview API Request Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setShowPreviewModal(false)}>
          <div className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="font-medium text-slate-300">Превью API запроса</h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
              <pre className="bg-slate-900 p-4 rounded text-sm text-slate-300 overflow-x-auto">
                {JSON.stringify(generatePreviewPayload(), null, 2)}
              </pre>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => {
                  const payload = generatePreviewPayload();
                  if (payload) {
                    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                  }
                }}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
              >
                📋 Copy JSON
              </button>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
