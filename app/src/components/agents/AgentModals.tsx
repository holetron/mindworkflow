import React from 'react';
import { AiSettingsModal } from '../../ui/AiSettingsModal';
import { QuickCreateAgentModal } from '../../ui/QuickCreateAgentModal';
import { ShareAgentModal } from '../../ui/ShareAgentModal';
import { ChatPanel } from '../../features/chat/ChatPanel';
import { MessageSquare } from 'lucide-react';
import type { AgentsState, AgentsActions } from './types';

interface AgentModalsProps {
  state: AgentsState;
  actions: AgentsActions;
}

export function AgentModals({ state, actions }: AgentModalsProps) {
  const {
    showQuickCreate,
    setShowQuickCreate,
    editingAgentForQuickModal,
    setEditingAgentForQuickModal,
    editingNode,
    setEditingNode,
    isCreatingNew,
    setIsCreatingNew,
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
    providerOptions,
    presets,
    loading,
  } = state;

  const { handleQuickCreateSubmit, handleSaveAgent, confirmDelete } = actions;

  return (
    <>
      {/* Quick Create Modal */}
      {showQuickCreate && (
        <QuickCreateAgentModal
          onSave={handleQuickCreateSubmit}
          onCancel={() => {
            setShowQuickCreate(false);
            setEditingAgentForQuickModal(null);
          }}
          providerOptions={providerOptions}
          existingAgent={editingAgentForQuickModal || undefined}
        />
      )}

      {/* Full Settings Modal */}
      {editingNode && (
        <AiSettingsModal
          node={editingNode}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          providers={providerOptions}
          loading={loading}
          dynamicModels={{}}
          loadingModels={{}}
          allNodes={[]}
          sources={[]}
          targets={[]}
          edges={[]}
          onClose={async () => {
            if (editingNode) {
              try {
                await handleSaveAgent(editingNode);
              } catch (err) {
                console.error('Failed to save agent:', err);
              }
            }
            setEditingNode(null);
            setIsCreatingNew(false);
            setActiveTab('ai_config');
          }}
          onChangeAi={(nodeId, ai) => {
            setEditingNode((() => {
              if (!editingNode) return null;
              const updated = { ...editingNode, ai: ai as Record<string, unknown> };
              handleSaveAgent(updated).catch(console.error);
              return updated;
            })());
          }}
          onUpdateNodeMeta={(nodeId, patch) => {
            setEditingNode((() => {
              if (!editingNode) return null;

              const updated = { ...editingNode };

              if ('title' in patch && typeof patch.title === 'string') {
                updated.title = patch.title;
              }
              if ('content' in patch && typeof patch.content === 'string') {
                updated.content = patch.content;
              }
              if ('icon' in patch) {
                updated.meta = { ...updated.meta, icon: patch.icon };
              }
              if ('tags' in patch && Array.isArray(patch.tags)) {
                updated.meta = { ...updated.meta, tags: patch.tags };
              }
              if ('color' in patch && typeof patch.color === 'string') {
                updated.ui = { ...updated.ui, color: patch.color };
              }

              handleSaveAgent(updated).catch(console.error);
              return updated;
            })());
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-white mb-3">
              {'\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435'}
            </h3>
            <p className="text-slate-300 mb-6">
              {'\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u0430 '}<span className="font-medium text-white">"{deleteConfirm.title}"</span>?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm({ show: false, presetId: null, title: '' })}
                className="px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition"
              >
                {'\u041E\u0442\u043C\u0435\u043D\u0430'}
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition"
              >
                {'\u0423\u0434\u0430\u043B\u0438\u0442\u044C'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Agent Modal */}
      {shareAgent && (
        <ShareAgentModal
          agent={shareAgent}
          onClose={() => setShareAgent(null)}
        />
      )}

      {/* Floating Chat Button */}
      <div className="fixed bottom-5 right-5 z-50">
        <button
          onClick={() => setShowChatPanel(true)}
          className="rounded-full bg-blue-600/90 backdrop-blur-sm border border-blue-500/50 p-3 text-white hover:bg-blue-500/90 hover:border-blue-400 transition-all duration-200 shadow-lg hover:shadow-xl"
          title={'\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0447\u0430\u0442 \u0441 AI \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442\u043E\u043C'}
        >
          <MessageSquare size={20} />
        </button>
      </div>

      {/* Chat Panel */}
      <ChatPanel
        isOpen={showChatPanel}
        onClose={() => {
          setShowChatPanel(false);
          setSelectedAgentForChat(null);
        }}
        providers={providerOptions}
        projectId="__agents__"
        agentPresets={presets}
        initialAgentId={selectedAgentForChat?.preset_id || null}
      />
    </>
  );
}
