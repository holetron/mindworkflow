import type { AgentPreset, FlowNode } from '../../state/api';

// --------------- View & Filter ---------------

export type ViewMode = 'grid' | 'list';
export type FilterMode = 'all' | 'favorites';

// --------------- Provider Options ---------------

export interface AiProviderOption {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  available: boolean;
  reason?: string;
  description?: string;
  supportsFiles?: boolean;
  supportedFileTypes?: string[];
  modelFamilies?: Array<{
    id: string;
    label: string;
    defaultModel: string;
    models: Array<{ id: string; label: string }>;
  }>;
}

// --------------- Delete Confirmation ---------------

export interface DeleteConfirmState {
  show: boolean;
  presetId: string | null;
  title: string;
}

// --------------- Model Type ---------------

export interface ModelTypeInfo {
  type: string;
  emoji: string;
  color: string;
}

// --------------- Agent Card / List Item Props ---------------

export interface AgentItemProps {
  preset: AgentPreset;
  onEdit: (preset: AgentPreset) => void;
  onDelete: (id: string, title: string) => void;
  onDuplicate: (preset: AgentPreset) => void;
  onToggleFavorite: (id: string) => void;
  onQuickEdit: (preset: AgentPreset) => void;
  onShare: (preset: AgentPreset) => void;
  onChatWith: (preset: AgentPreset) => void;
  activeMenu: string | null;
  setActiveMenu: (id: string | null) => void;
}

// --------------- Quick Create Data ---------------

export interface QuickCreateData {
  title: string;
  description: string;
  tags: string;
  color: string;
  provider: string;
  model: string;
  icon?: string;
}

// --------------- Agents Hook Return ---------------

export interface AgentsState {
  presets: AgentPreset[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterMode: FilterMode;
  setFilterMode: (mode: FilterMode) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  tagDropdownOpen: boolean;
  setTagDropdownOpen: (open: boolean) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  editingNode: FlowNode | null;
  setEditingNode: (node: FlowNode | null) => void;
  isCreatingNew: boolean;
  setIsCreatingNew: (v: boolean) => void;
  showQuickCreate: boolean;
  setShowQuickCreate: (v: boolean) => void;
  editingAgentForQuickModal: AgentPreset | null;
  setEditingAgentForQuickModal: (a: AgentPreset | null) => void;
  activeMenu: string | null;
  setActiveMenu: (id: string | null) => void;
  activeTab: 'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request';
  setActiveTab: (tab: 'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request') => void;
  deleteConfirm: DeleteConfirmState;
  setDeleteConfirm: (state: DeleteConfirmState) => void;
  shareAgent: AgentPreset | null;
  setShareAgent: (agent: AgentPreset | null) => void;
  showChatPanel: boolean;
  setShowChatPanel: (v: boolean) => void;
  selectedAgentForChat: AgentPreset | null;
  setSelectedAgentForChat: (agent: AgentPreset | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  providerOptions: AiProviderOption[];
  allTags: string[];
  filteredPresets: AgentPreset[];
}

export interface AgentsActions {
  handleCreateAgent: () => void;
  handleEditAgent: (preset: AgentPreset) => void;
  handleSaveAgent: (node: FlowNode) => Promise<void>;
  handleDeleteAgent: (presetId: string, title: string) => void;
  confirmDelete: () => Promise<void>;
  handleDuplicateAgent: (preset: AgentPreset) => Promise<void>;
  handleToggleFavorite: (presetId: string) => Promise<void>;
  handleExportAll: () => void;
  handleImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleQuickEditAgent: (preset: AgentPreset) => void;
  handleQuickCreateSubmit: (data: QuickCreateData, openAiSettings?: boolean) => Promise<void>;
  loadPresets: () => Promise<void>;
}

// --------------- Helper ---------------

/** Determine model type (text, image, video, etc.) from model name */
export function getModelType(modelName: string): ModelTypeInfo {
  const model = modelName.toLowerCase();

  // Image generation models
  if (
    model.includes('flux') || model.includes('sdxl') || model.includes('stable-diffusion') ||
    model.includes('midjourney') || model.includes('dall-e') || model.includes('ideogram') ||
    model.includes('recraft') || model.includes('playground') || model.includes('kandinsky')
  ) {
    return { type: 'image', emoji: '\u{1F3A8}', color: 'text-purple-400' };
  }

  // Video generation models
  if (
    model.includes('video') || model.includes('runway') || model.includes('pika') ||
    model.includes('gen-2') || model.includes('gen-3')
  ) {
    return { type: 'video', emoji: '\u{1F3AC}', color: 'text-pink-400' };
  }

  // 3D models
  if (model.includes('3d') || model.includes('mesh') || model.includes('shap-e')) {
    return { type: '3d', emoji: '\u{1F3B2}', color: 'text-cyan-400' };
  }

  // Audio models
  if (
    model.includes('audio') || model.includes('music') || model.includes('sound') ||
    model.includes('whisper') || model.includes('bark')
  ) {
    return { type: 'audio', emoji: '\u{1F3B5}', color: 'text-green-400' };
  }

  // Vision models (multimodal)
  if (
    model.includes('vision') || model.includes('gpt-4o') || model.includes('gpt-4-turbo') ||
    model.includes('claude-3') || model.includes('gemini-pro-vision')
  ) {
    return { type: 'multi', emoji: '\u{1F441}\uFE0F', color: 'text-blue-400' };
  }

  // Text models (default)
  return { type: 'text', emoji: '\u{1F4DD}', color: 'text-slate-400' };
}
