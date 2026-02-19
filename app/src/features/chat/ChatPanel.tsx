import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import type { ChatMode, ChatSettings, Chat } from './types';
import type { AiProviderOption } from '../nodes/FlowNodeCard';
import type { AgentPreset } from '../../state/api';
import { defaultChatSettings } from './types';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  providers: AiProviderOption[];
  projectId: string | null;
  agentPresets?: AgentPreset[];
  initialAgentId?: string | null;
  onAddToWorkflow?: (nodeId: string) => void;
}

export function ChatPanel({ isOpen, onClose, providers, projectId, agentPresets, initialAgentId, onAddToWorkflow }: ChatPanelProps) {
  const { t } = useTranslation();
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatSettings, setChatSettings] = useState<ChatSettings>(defaultChatSettings);
  const [chats, setChats] = useState<Chat[]>([]);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialAgentId || null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  // Update selected agent when initialAgentId changes OR when panel opens
  useEffect(() => {
    if (isOpen && initialAgentId && agentPresets) {
      setSelectedAgentId(initialAgentId);
      // Clear current chat to start fresh with new agent
      setCurrentChatId(null);
      
      // Apply agent settings immediately
      const agent = agentPresets.find(a => a.preset_id === initialAgentId);
      if (agent?.node_template?.ai) {
        const aiConfig = agent.node_template.ai;
        setChatSettings({
          ...chatSettings,
          provider: aiConfig.provider || 'openai_gpt',
          model: aiConfig.model || 'gpt-4o',
          selected_model: aiConfig.model || 'gpt-4o',
          temperature: aiConfig.temperature ?? 0.7,
          max_tokens: aiConfig.max_tokens ?? 2000,
          system_prompt: aiConfig.system_prompt || '',
          agent_mode: 'agent',
        });
      }
    }
  }, [initialAgentId, isOpen, agentPresets]);

  // ✅ NEW: Update settings when selectedAgentId changes (from agent selector)
  useEffect(() => {
    console.log('[ChatPanel] selectedAgentId changed:', selectedAgentId);
    if (selectedAgentId && agentPresets) {
      const agent = agentPresets.find(a => a.preset_id === selectedAgentId);
      console.log('[ChatPanel] Found agent:', agent?.title, 'input_fields:', agent?.node_template?.ai?.input_fields);
      if (agent?.node_template?.ai) {
        const aiConfig = agent.node_template.ai;
        console.log('[ChatPanel] Updating settings for agent:', agent.title, aiConfig);
        setChatSettings(prev => ({
          ...prev,
          provider: aiConfig.provider || 'openai_gpt',
          model: aiConfig.model || 'gpt-4o',
          selected_model: aiConfig.model || 'gpt-4o',
          temperature: aiConfig.temperature ?? 0.7,
          max_tokens: (aiConfig.max_tokens as number) ?? 2000,
          system_prompt: aiConfig.system_prompt || '',
          agent_mode: 'agent',
        }));
      }
    } else if (selectedAgentId === null) {
      // Custom mode - reset to defaults
      console.log('[ChatPanel] Switching to Custom mode');
      setChatSettings(defaultChatSettings);
    }
  }, [selectedAgentId, agentPresets]);

  // Get mode from chatSettings, with fallback to 'ask'
  const mode = chatSettings.agent_mode ?? 'ask';

  // Load chats when panel opens (NO filter by agent for AgentsPage)
  useEffect(() => {
    if (isOpen) {
      const loadChats = async () => {
        try {
          // Build URL with filters - for AgentsPage, only filter by project (not by agent)
          const params = new URLSearchParams();
          if (projectId) params.append('project_id', projectId);
          
          const url = params.toString() 
            ? `/api/chats?${params.toString()}`
            : '/api/chats';
          
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            setChats(data);
            
            if (data.length > 0 && !currentChatId) {
              // Use most recent chat
              setCurrentChatId(data[0].id);
            }
          }
        } catch (error) {
          console.error('Failed to load chats:', error);
        }
      };
      
      loadChats();
    }
  }, [isOpen, projectId]);

  const handleNewChat = useCallback(async () => {
    // Just clear current chat ID to show empty input
    setCurrentChatId(null);
  }, []);

  const handleSaveSettings = useCallback((settings: ChatSettings) => {
    setChatSettings(settings);
    // TODO: Save settings to backend/localStorage
  }, []);

  const handleChatCreated = useCallback((newChatId: string) => {
    setCurrentChatId(newChatId);
    // Reload chats to show in history (NO filter by agent for AgentsPage)
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    
    const url = params.toString() 
      ? `/api/chats?${params.toString()}`
      : '/api/chats';
    
    fetch(url)
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch((err) => console.error('Failed to reload chats:', err));
  }, [projectId]);

  const handleSettingsLoaded = useCallback((loadedSettings: ChatSettings) => {
    console.log('[ChatPanel] Loaded settings from chat:', loadedSettings);
    setChatSettings(loadedSettings);
  }, []);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Remove from list
        setChats(prev => prev.filter(c => c.id !== chatId));
        // If deleted current chat, clear it
        if (currentChatId === chatId) {
          setCurrentChatId(null);
        }
        setChatToDelete(null);
      } else {
        throw new Error('Failed to delete chat');
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
      alert('Failed to delete chat. Please try again.');
    }
  }, [currentChatId]);

  return (
    <>
      {/* Delete confirmation modal */}
      {chatToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setChatToDelete(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Delete Chat?</h3>
            <p className="text-sm text-slate-400 mb-6">
              Are you sure you want to delete this chat? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setChatToDelete(null)}
                className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteChat(chatToDelete)}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out panel (right side) - full width without sidebar */}
      <div
        className={`fixed right-0 top-0 h-full w-[600px] bg-slate-900 border-l border-slate-700 shadow-2xl z-50 transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header with chat selector (Comet style) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800">
          <div className="flex items-center gap-2 flex-grow">
            {/* Chat selector dropdown */}
            <div className="relative flex-grow">
              <button
                onClick={() => setShowChatMenu(!showChatMenu)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200 transition-colors h-9"
              >
                <span className="truncate">
                  {currentChatId 
                    ? chats.find(c => c.id === currentChatId)?.title || 'Current Chat'
                    : 'New Chat'
                  }
                </span>
                <ChevronDown size={16} className="ml-2 flex-shrink-0" />
              </button>

              {/* Dropdown menu */}
              {showChatMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-lg max-h-64 overflow-y-auto z-10">
                  {/* New chat button */}
                  <button
                    onClick={() => {
                      handleNewChat();
                      setShowChatMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700 text-sm text-slate-200 transition-colors border-b border-slate-700"
                  >
                    <Plus size={16} />
                    <span>{t('chat.new_chat')}</span>
                  </button>

                  {/* Chat list */}
                  {chats.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400 text-center">No chats yet</div>
                  ) : (
                    chats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-700 text-xs transition-colors flex items-center justify-between group ${
                          currentChatId === chat.id ? 'bg-slate-700 text-blue-400' : 'text-slate-200'
                        }`}
                        title={chat.title}
                      >
                        <div 
                          className="truncate flex-1 cursor-pointer"
                          onClick={() => {
                            setCurrentChatId(chat.id);
                            setShowChatMenu(false);
                          }}
                        >
                          {chat.title}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatToDelete(chat.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 ml-2 p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-all"
                          title="Delete chat"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="ml-2 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0 h-9 w-9 flex items-center justify-center rounded hover:bg-slate-700"
            title={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Chat window - takes full space */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ChatWindow
            chatId={currentChatId}
            mode={mode}
            settings={chatSettings}
            projectId={projectId}
            agentPresetId={selectedAgentId}
            agentPresets={agentPresets}
            providers={providers}
            onAddToWorkflow={onAddToWorkflow}
            onChatCreated={handleChatCreated}
            onSettingsLoaded={handleSettingsLoaded}
            onAgentSelect={setSelectedAgentId}
          />
        </div>
      </div>
    </>
  );
}
