import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessage } from './ChatMessage';
import { ChatSettingsModal } from './ChatSettingsModal';
import { AiSettingsModal } from '../../ui/AiSettingsModal';
import type { ChatMessage as ChatMessageType, ChatMode, ChatSettings, AgentInputField } from './types';
import type { AiProviderOption } from '../nodes/FlowNodeCard';
import type { AgentPreset } from '../../state/api';
import { isGenerationModel } from './types';
import { searchPromptPresets } from '../../state/api';
import { ChatInputPanel } from './components/ChatInputPanel';
import { ChatControls } from './components/ChatControls';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputFieldsData, setInputFieldsData] = useState<Record<string, any>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const selectedAgent = agentPresets?.find(a => a.preset_id === agentPresetId);

  const inputFields = useMemo((): AgentInputField[] => {
    if (!agentPresetId || !agentPresets) return [];
    const agent = agentPresets.find(a => a.preset_id === agentPresetId);
    if (!agent) return [];
    return (agent?.node_template?.ai?.input_fields as AgentInputField[]) || [];
  }, [agentPresetId, agentPresets]);

  useEffect(() => {
    if (inputFields.length > 0) {
      const initialData: Record<string, any> = {};
      inputFields.forEach(field => { initialData[field.name] = field.defaultValue ?? ''; });
      setInputFieldsData(initialData);
    } else {
      setInputFieldsData({});
    }
  }, [inputFields]);

  useEffect(() => { setChatSettings(settings); }, [settings]);

  useEffect(() => {
    if (agentPresetId && agentPresets) {
      const agent = agentPresets.find(a => a.preset_id === agentPresetId);
      if (agent?.node_template?.ai) {
        const aiConfig = agent.node_template.ai;
        const newSettings = { ...chatSettings, provider: aiConfig.provider || 'openai_gpt', model: aiConfig.model || 'gpt-4o', selected_model: aiConfig.model || 'gpt-4o', temperature: aiConfig.temperature ?? 0.7, max_tokens: aiConfig.max_tokens ?? 2000, system_prompt: aiConfig.system_prompt || '', agent_mode: 'agent' as const };
        setChatSettings(newSettings);
        onSettingsLoaded?.(newSettings);
      }
    }
  }, [agentPresetId, agentPresets]);

  useEffect(() => {
    const loadAgentModePrompts = async () => {
      try {
        const results = await searchPromptPresets({ category: 'system_prompt', search: 'Chat', limit: 10 });
        setAgentModePrompts({
          agent: results.find(p => p.label.includes('Agent Mode') && p.label.includes('Full Access'))?.content,
          edit: results.find(p => p.label.includes('Edit Mode') && p.label.includes('Content Only'))?.content,
          ask: results.find(p => p.label.includes('Ask Mode') && p.label.includes('Read-Only'))?.content,
        });
      } catch (error) { console.error('Failed to load agent mode prompts:', error); }
    };
    loadAgentModePrompts();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!chatId) { setMessages([]); return; }
    const loadMessages = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/chats/${chatId}/messages`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages) {
            setMessages(data.messages);
            if (data.settings) { const ls = { ...chatSettings, ...data.settings }; setChatSettings(ls); onSettingsLoaded?.(ls); }
            if (data.agent_preset_id && onAgentSelect) onAgentSelect(data.agent_preset_id);
          } else { setMessages(data); }
        }
      } catch (error) { console.error('Failed to load messages:', error); }
      finally { setLoading(false); }
    };
    loadMessages();
  }, [chatId]);

  const getEffectivePromptType = useCallback(() => {
    const cp = chatSettings?.system_prompt;
    if (!cp || cp.trim() === '') return 'empty';
    if (cp === agentModePrompts.agent || cp === agentModePrompts.edit || cp === agentModePrompts.ask) return 'default';
    return 'custom';
  }, [chatSettings?.system_prompt, agentModePrompts]);

  const handleSettingChange = useCallback(async (key: string, value: any) => {
    setChatSettings(prev => {
      const ns = { ...prev, [key]: value };
      if (key === 'selected_model' && isGenerationModel(value)) { ns.context_level = 0; ns.system_prompt_type = 'empty'; ns.system_prompt = ''; }
      if (key === 'system_prompt_type') {
        if (value === 'default') { const mp = agentModePrompts[prev?.agent_mode || 'ask']; if (mp) ns.system_prompt = mp; }
        else if (value === 'empty') ns.system_prompt = '';
      }
      if (key === 'agent_mode') {
        const cp = prev?.system_prompt;
        const isDefault = cp === agentModePrompts.agent || cp === agentModePrompts.edit || cp === agentModePrompts.ask;
        if (!cp || cp.trim() === '' || isDefault) { const mp = agentModePrompts[value as ChatMode]; if (mp) ns.system_prompt = mp; }
      }
      onSettingsLoaded?.(ns);
      return ns;
    });
    if (chatId) {
      try { await fetch(`/api/chats/${chatId}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) }); }
      catch (error) { console.error('Failed to save chat settings:', error); }
    }
  }, [chatId, agentModePrompts, onSettingsLoaded]);

  const handleSaveSettings = useCallback(async (newSettings: ChatSettings) => {
    setChatSettings(newSettings);
    onSettingsLoaded?.(newSettings);
    setShowSettings(false);
    if (chatId) {
      try { await fetch(`/api/chats/${chatId}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) }); }
      catch (error) { console.error('Failed to save chat settings:', error); }
    }
  }, [chatId, onSettingsLoaded]);

  const generatePreviewPayload = useCallback(() => {
    const agent = agentPresets?.find(a => a.preset_id === agentPresetId);
    if (!agent) return null;
    const aiConfig = agent.node_template?.ai || {};
    const preview: any = { version: aiConfig.model || 'unknown', input: { prompt: input.trim() || 'Example prompt', ...inputFieldsData } };
    if (aiConfig.temperature) preview.input.temperature = aiConfig.temperature;
    if (aiConfig.max_tokens) preview.input.max_tokens = aiConfig.max_tokens;
    if (aiConfig.top_p) preview.input.top_p = aiConfig.top_p;
    return preview;
  }, [agentPresetId, agentPresets, input, inputFieldsData]);

  const uploadFiles = async (files: File[]) => {
    if (!chatId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      const response = await fetch(`/api/chats/${chatId}/upload`, { method: 'POST', body: formData });
      if (response.ok) { const data = await response.json(); setUploadedFiles(prev => [...prev, ...data.files]); }
      else throw new Error('Upload failed');
    } catch (error) { console.error('Failed to upload files:', error); }
    finally { setUploading(false); }
  };

  const handleSend = async () => {
    const userMessage = input.trim();
    setInput('');
    setSending(true);
    let activeChatId = chatId;

    if (!activeChatId) {
      try {
        const createResponse = await fetch('/api/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Chat ${new Date().toLocaleString()}`, settings: chatSettings, project_id: projectId, agent_preset_id: agentPresetId }) });
        if (createResponse.ok) { const newChat = await createResponse.json(); activeChatId = newChat.id; onChatCreated?.(activeChatId); }
        else throw new Error('Failed to create chat');
      } catch (error) { console.error('Failed to create chat:', error); setSending(false); setInput(userMessage); return; }
    }

    const tempUserMessage: ChatMessageType = { id: `temp-${Date.now()}`, chat_id: activeChatId!, role: 'user', content: userMessage, created_at: Date.now() };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await fetch(`/api/chats/${activeChatId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: userMessage, mode, project_id: projectId, attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined, settings: chatSettings, input_fields: Object.keys(inputFieldsData).length > 0 ? inputFieldsData : undefined }) });
      if (response.ok) { const data = await response.json(); setAttachedFiles([]); setUploadedFiles([]); setMessages(prev => { const filtered = prev.filter(m => m.id !== tempUserMessage.id); return [...filtered, data.user_message, data.assistant_message]; }); }
      else throw new Error('Failed to send message');
    } catch (error) { console.error('Failed to send message:', error); setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id)); }
    finally { setSending(false); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { const files = Array.from(e.target.files); setAttachedFiles(prev => [...prev, ...files]); if (chatId) await uploadFiles(files); }
  };
  const handleRemoveFile = (index: number) => { setAttachedFiles(prev => prev.filter((_, i) => i !== index)); setUploadedFiles(prev => prev.filter((_, i) => i !== index)); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); const files = Array.from(e.dataTransfer.files); if (files.length > 0) { setAttachedFiles(prev => [...prev, ...files]); if (chatId) await uploadFiles(files); } };

  const settingsModal = agentPresets && agentPresets.length > 0 ? (
    showSettings ? (
      <AiSettingsModal
        node={selectedAgent?.node_template || { node_id: 'chat-custom', type: 'ai', title: 'Custom Chat', content: '', ai: { enabled: true, provider: chatSettings?.provider || 'openai_gpt', model: chatSettings?.selected_model || chatSettings?.model || 'gpt-4o', temperature: chatSettings?.temperature ?? 0.7, max_tokens: chatSettings?.max_tokens ?? 2000, system_prompt: chatSettings?.system_prompt || '' }, ui: { bbox: { x1: 0, y1: 0, x2: 400, y2: 200 }, color: '#6B7280' }, connections: { incoming: [], outgoing: [] } }}
        onClose={() => setShowSettings(false)}
        activeTab={activeSettingsTab}
        onTabChange={setActiveSettingsTab}
        onChangeAi={(_nodeId, ai) => {
          const ns = { ...chatSettings, provider: (ai.provider as string) || 'openai_gpt', model: (ai.model as string) || 'gpt-4o', selected_model: (ai.model as string) || 'gpt-4o', temperature: (ai.temperature as number) ?? 0.7, max_tokens: (ai.max_tokens as number) ?? 2000, system_prompt: (ai.system_prompt as string) || '' };
          setChatSettings(ns);
          onSettingsLoaded?.(ns);
        }}
        providers={providers}
      />
    ) : null
  ) : (
    <ChatSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={chatSettings} onSave={handleSaveSettings} providers={providers} projectId={projectId} inputFieldsData={inputFieldsData} />
  );

  const dragOverlay = isDragging && (
    <div className="absolute inset-0 bg-blue-500/20 border-4 border-dashed border-blue-400 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-slate-800 px-6 py-4 rounded-lg shadow-2xl"><p className="text-lg font-medium text-blue-300">Drop files here</p></div>
    </div>
  );

  const inputPanel = (
    <div className="flex-shrink-0 border-t border-slate-700 p-3 bg-slate-900">
      <ChatInputPanel input={input} setInput={setInput} sending={sending} attachedFiles={attachedFiles} uploadedFiles={uploadedFiles} uploading={uploading}
        inputFields={inputFields} inputFieldsData={inputFieldsData} setInputFieldsData={setInputFieldsData} agentPresetId={agentPresetId}
        onSend={handleSend} onFileSelect={handleFileSelect} onRemoveFile={handleRemoveFile} onShowPreview={() => setShowPreviewModal(true)}
        compact={!!chatId} />
      <ChatControls chatSettings={chatSettings} providers={providers} mode={mode} agentPresets={agentPresets} agentPresetId={agentPresetId}
        onSettingChange={handleSettingChange} onAgentSelect={onAgentSelect} onShowSettings={() => setShowSettings(true)} getEffectivePromptType={getEffectivePromptType} />
    </div>
  );

  const previewModal = showPreviewModal && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setShowPreviewModal(false)}>
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-medium text-slate-300">API Request Preview</h3>
          <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-300">x</button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          <pre className="bg-slate-900 p-4 rounded text-sm text-slate-300 overflow-x-auto">{JSON.stringify(generatePreviewPayload(), null, 2)}</pre>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          <button onClick={() => { const p = generatePreviewPayload(); if (p) navigator.clipboard.writeText(JSON.stringify(p, null, 2)); }}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded">Copy JSON</button>
          <button onClick={() => setShowPreviewModal(false)} className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded">Close</button>
        </div>
      </div>
    </div>
  );

  if (!chatId) {
    return (
      <>
        <div className="flex-grow flex flex-col h-full overflow-hidden relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          {dragOverlay}
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
            <div className="text-center text-slate-400 text-sm py-4">Start a new conversation!</div>
          </div>
          {inputPanel}
        </div>
        {settingsModal}
      </>
    );
  }

  return (
    <div className="flex-grow flex flex-col h-full overflow-hidden relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragOverlay}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {loading ? (
          <div className="text-center text-slate-400 text-sm py-4">{t('common.loading')}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-4">No messages yet. Start a conversation!</div>
        ) : (
          messages.map(message => <ChatMessage key={message.id} message={message} chatId={chatId} projectId={projectId} onAddToWorkflow={onAddToWorkflow} />)
        )}
        <div ref={messagesEndRef} />
      </div>
      {inputPanel}
      {settingsModal}
      {previewModal}
    </div>
  );
}
