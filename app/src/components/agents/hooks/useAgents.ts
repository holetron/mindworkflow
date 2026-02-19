import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  fetchAgentPresets,
  createAgentPreset,
  updateAgentPreset,
  deleteAgentPreset,
  toggleAgentFavorite,
  type AgentPreset,
  type FlowNode,
} from '../../../state/api';
import type {
  FilterMode,
  ViewMode,
  DeleteConfirmState,
  QuickCreateData,
  AgentsState,
  AgentsActions,
} from '../types';
import { useProviderOptions } from './useProviderOptions';

/**
 * Central hook for the AgentsPage: manages state, CRUD operations,
 * import/export, and filtering logic. Provider options are delegated
 * to the useProviderOptions hook.
 */
export function useAgents(): { state: AgentsState; actions: AgentsActions } {
  const providerOptions = useProviderOptions();

  // --------------- Core state ---------------
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [editingAgentForQuickModal, setEditingAgentForQuickModal] = useState<AgentPreset | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request'>('ai_config');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    show: false,
    presetId: null,
    title: '',
  });
  const [shareAgent, setShareAgent] = useState<AgentPreset | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [selectedAgentForChat, setSelectedAgentForChat] = useState<AgentPreset | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --------------- Load presets ---------------
  const loadPresets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAgentPresets();
      setPresets(data);
    } catch (err) {
      console.error('Failed to load agent presets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  // --------------- Derived data ---------------
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    presets.forEach(preset => {
      preset.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [presets]);

  const filteredPresets = presets.filter(preset => {
    const matchesSearch =
      preset.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesFilter =
      filterMode === 'all' ||
      (filterMode === 'favorites' && preset.is_favorite);

    const matchesTag =
      !selectedTag || preset.tags?.includes(selectedTag);

    return matchesSearch && matchesFilter && matchesTag;
  }).sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1;
    if (!a.is_favorite && b.is_favorite) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // --------------- Handlers ---------------

  const handleCreateAgent = useCallback(() => {
    setShowQuickCreate(true);
  }, []);

  const handleEditAgent = useCallback((preset: AgentPreset) => {
    const node: FlowNode = {
      node_id: preset.preset_id,
      type: 'ai',
      title: preset.title || 'Unnamed Agent',
      content: preset.description || '',
      ui: preset.node_template?.ui || {
        bbox: { x1: 0, y1: 0, x2: 450, y2: 200 },
        color: '#8b5cf6',
      },
      ai: preset.node_template?.ai || {},
      ai_visible: true,
      connections: { incoming: [], outgoing: [] },
      meta: {
        icon: preset.icon,
        tags: preset.tags,
        is_favorite: preset.is_favorite,
      },
      created_at: preset.created_at,
      updated_at: preset.updated_at,
    };

    setEditingNode(node);
    setIsCreatingNew(false);
    setActiveTab('ai_config');
    setActiveMenu(null);
  }, []);

  const handleSaveAgent = useCallback(async (node: FlowNode) => {
    try {
      const presetData = {
        title: node.title || 'Unnamed Agent',
        description: node.content || '',
        icon: (node.meta?.icon as string) || '\u{1F916}',
        node_template: node,
        tags: (node.meta?.tags as string[]) || [],
      };

      console.log('[AgentsPage] Saving agent preset:', {
        node_id: node.node_id,
        input_fields: node.ai?.input_fields,
        field_mapping: node.ai?.field_mapping,
      });

      if (isCreatingNew) {
        await createAgentPreset(presetData);
      } else {
        await updateAgentPreset(node.node_id, presetData);
      }

      setEditingNode(null);
      setIsCreatingNew(false);
      await loadPresets();

      console.log('[AgentsPage] Agent preset saved successfully');
    } catch (err) {
      console.error('Failed to save agent:', err);
      alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u0430');
    }
  }, [isCreatingNew, loadPresets]);

  const handleDeleteAgent = useCallback((presetId: string, title: string) => {
    setDeleteConfirm({ show: true, presetId, title });
    setActiveMenu(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm.presetId) return;

    try {
      await deleteAgentPreset(deleteConfirm.presetId);
      await loadPresets();
      setDeleteConfirm({ show: false, presetId: null, title: '' });
    } catch (err) {
      console.error('Failed to delete agent:', err);
      alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u0430');
    }
  }, [deleteConfirm.presetId, loadPresets]);

  const handleDuplicateAgent = useCallback(async (preset: AgentPreset) => {
    try {
      const duplicateData = {
        title: `${preset.title || 'Agent'} (\u043A\u043E\u043F\u0438\u044F)`,
        description: preset.description,
        icon: preset.icon,
        node_template: preset.node_template,
        tags: preset.tags,
      };

      await createAgentPreset(duplicateData);
      await loadPresets();
      setActiveMenu(null);
    } catch (err) {
      console.error('Failed to duplicate agent:', err);
      alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0434\u0443\u0431\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u0430');
    }
  }, [loadPresets]);

  const handleToggleFavorite = useCallback(async (presetId: string) => {
    try {
      await toggleAgentFavorite(presetId);
      await loadPresets();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [loadPresets]);

  const handleExportAll = useCallback(() => {
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      agents: presets.map(preset => ({
        title: preset.title,
        description: preset.description || '',
        icon: preset.icon,
        node_template: preset.node_template,
        tags: preset.tags || [],
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `all_agents_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [presets]);

  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        const agentsToImport = data.agents ? data.agents : [data];

        let imported = 0;
        for (const agentData of agentsToImport) {
          try {
            await createAgentPreset({
              title: agentData.title,
              description: agentData.description || '',
              icon: agentData.icon,
              node_template: agentData.node_template,
              tags: agentData.tags || [],
            });
            imported++;
          } catch (err) {
            console.error('Failed to import agent:', agentData.title, err);
          }
        }

        await loadPresets();
        alert(`\u2705 \u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0430\u0433\u0435\u043D\u0442\u043E\u0432: ${imported} \u0438\u0437 ${agentsToImport.length}`);
      } catch (err) {
        console.error('Failed to parse import file:', err);
        alert('\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0438\u043C\u043F\u043E\u0440\u0442\u0435 \u0430\u0433\u0435\u043D\u0442\u043E\u0432. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u043E\u0440\u043C\u0430\u0442 \u0444\u0430\u0439\u043B\u0430.');
      }

      if (event.target) {
        event.target.value = '';
      }
    };

    reader.readAsText(file);
  }, [loadPresets]);

  const handleQuickEditAgent = useCallback((preset: AgentPreset) => {
    setEditingAgentForQuickModal(preset);
    setShowQuickCreate(true);
    setActiveMenu(null);
  }, []);

  const handleQuickCreateSubmit = useCallback(async (data: QuickCreateData, openAiSettings = false) => {
    try {
      const tagsArray = data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

      if (editingAgentForQuickModal) {
        const updatedTemplate = {
          ...editingAgentForQuickModal.node_template,
          title: data.title,
          content: data.description,
          ui: {
            ...editingAgentForQuickModal.node_template?.ui,
            color: data.color,
          },
          ai: {
            ...editingAgentForQuickModal.node_template?.ai,
            provider: data.provider,
            model: data.model,
          },
          meta: {
            ...editingAgentForQuickModal.node_template?.meta,
            icon: data.icon || '\u{1F916}',
            tags: tagsArray,
          },
        };

        const updateData = {
          title: data.title,
          description: data.description,
          icon: data.icon || '\u{1F916}',
          node_template: updatedTemplate,
          tags: tagsArray,
        };

        await updateAgentPreset(editingAgentForQuickModal.preset_id, updateData);

        if (openAiSettings) {
          const updatedNode: FlowNode = {
            node_id: editingAgentForQuickModal.preset_id,
            type: 'ai',
            title: data.title,
            content: data.description,
            ui: updatedTemplate.ui || {
              bbox: { x1: 0, y1: 0, x2: 450, y2: 200 },
              color: data.color,
            },
            ai: updatedTemplate.ai || {},
            ai_visible: true,
            connections: { incoming: [], outgoing: [] },
            meta: updatedTemplate.meta || {},
            created_at: editingAgentForQuickModal.created_at,
            updated_at: Date.now(),
          };

          setEditingNode(updatedNode);
          setActiveTab('ai_config');
        }

        setEditingAgentForQuickModal(null);
      } else {
        const presetData = {
          title: data.title,
          description: data.description,
          icon: data.icon || '\u{1F916}',
          node_template: {
            node_id: `agent-${Date.now()}`,
            type: 'ai' as const,
            title: data.title,
            content: data.description,
            ui: {
              bbox: { x1: 0, y1: 0, x2: 450, y2: 200 },
              color: data.color,
            },
            ai: {
              enabled: true,
              provider: data.provider,
              model: data.model,
              temperature: 0.7,
              max_tokens: 2000,
              system_prompt: '',
              input_mode: 'all_inputs',
            },
            ai_visible: true,
            connections: { incoming: [], outgoing: [] },
            meta: { icon: data.icon || '\u{1F916}', tags: tagsArray, is_favorite: false },
          },
          tags: tagsArray,
        };

        const newPreset = await createAgentPreset(presetData);

        if (openAiSettings) {
          const newNode: FlowNode = {
            node_id: newPreset.preset_id,
            type: 'ai',
            title: newPreset.title || 'Unnamed Agent',
            content: newPreset.description || '',
            ui: newPreset.node_template?.ui || {
              bbox: { x1: 0, y1: 0, x2: 450, y2: 200 },
              color: data.color,
            },
            ai: newPreset.node_template?.ai || {},
            ai_visible: true,
            connections: { incoming: [], outgoing: [] },
            meta: {
              icon: newPreset.icon,
              tags: newPreset.tags,
              is_favorite: newPreset.is_favorite,
            },
            created_at: newPreset.created_at,
            updated_at: newPreset.updated_at,
          };

          setEditingNode(newNode);
          setActiveTab('ai_config');
        }
      }

      await loadPresets();
      setShowQuickCreate(false);
    } catch (err) {
      console.error('Failed to save agent:', err);
      alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u0430');
    }
  }, [editingAgentForQuickModal, loadPresets]);

  // --------------- Assemble return ---------------

  const state: AgentsState = {
    presets,
    loading,
    searchQuery,
    setSearchQuery,
    filterMode,
    setFilterMode,
    selectedTag,
    setSelectedTag,
    tagDropdownOpen,
    setTagDropdownOpen,
    viewMode,
    setViewMode,
    editingNode,
    setEditingNode,
    isCreatingNew,
    setIsCreatingNew,
    showQuickCreate,
    setShowQuickCreate,
    editingAgentForQuickModal,
    setEditingAgentForQuickModal,
    activeMenu,
    setActiveMenu,
    activeTab,
    setActiveTab,
    deleteConfirm,
    setDeleteConfirm,
    shareAgent,
    setShareAgent,
    showChatPanel,
    setShowChatPanel,
    selectedAgentForChat,
    setSelectedAgentForChat,
    fileInputRef,
    providerOptions,
    allTags,
    filteredPresets,
  };

  const actions: AgentsActions = {
    handleCreateAgent,
    handleEditAgent,
    handleSaveAgent,
    handleDeleteAgent,
    confirmDelete,
    handleDuplicateAgent,
    handleToggleFavorite,
    handleExportAll,
    handleImport,
    handleQuickEditAgent,
    handleQuickCreateSubmit,
    loadPresets,
  };

  return { state, actions };
}
