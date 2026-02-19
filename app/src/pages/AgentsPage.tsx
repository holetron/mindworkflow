import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AgentsHeader,
  AgentsLoading,
  AgentsEmptyState,
  AgentCard,
  AgentListItem,
  AgentModals,
  useAgents,
} from '../components/agents';

export function AgentsPage() {
  const navigate = useNavigate();
  const { state, actions } = useAgents();

  const {
    loading,
    filteredPresets,
    searchQuery,
    filterMode,
    viewMode,
    showChatPanel,
    activeMenu,
    setActiveMenu,
    setShareAgent,
    setSelectedAgentForChat,
    setShowChatPanel,
  } = state;

  const {
    handleCreateAgent,
    handleEditAgent,
    handleDeleteAgent,
    handleDuplicateAgent,
    handleToggleFavorite,
    handleQuickEditAgent,
  } = actions;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Content wrapper with transition */}
      <div
        className="transition-all duration-300"
        style={{ marginRight: showChatPanel ? '600px' : '0' }}
      >
        {/* Header */}
        <AgentsHeader
          state={state}
          actions={actions}
          onNavigateHome={() => navigate('/')}
        />

        {/* Main content */}
        <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {loading ? (
            <AgentsLoading />
          ) : filteredPresets.length === 0 ? (
            <AgentsEmptyState
              searchQuery={searchQuery}
              filterMode={filterMode}
              onCreateAgent={handleCreateAgent}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredPresets.map((preset) => (
                <AgentCard
                  key={preset.preset_id}
                  preset={preset}
                  onEdit={handleEditAgent}
                  onDelete={handleDeleteAgent}
                  onDuplicate={handleDuplicateAgent}
                  onToggleFavorite={handleToggleFavorite}
                  onQuickEdit={handleQuickEditAgent}
                  onShare={(p) => setShareAgent(p)}
                  onChatWith={(p) => {
                    setSelectedAgentForChat(p);
                    setShowChatPanel(true);
                  }}
                  activeMenu={activeMenu}
                  setActiveMenu={setActiveMenu}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPresets.map((preset) => (
                <AgentListItem
                  key={preset.preset_id}
                  preset={preset}
                  onEdit={handleEditAgent}
                  onDelete={handleDeleteAgent}
                  onDuplicate={handleDuplicateAgent}
                  onToggleFavorite={handleToggleFavorite}
                  onQuickEdit={handleQuickEditAgent}
                  onShare={(p) => setShareAgent(p)}
                  onChatWith={(p) => {
                    setSelectedAgentForChat(p);
                    setShowChatPanel(true);
                  }}
                  activeMenu={activeMenu}
                  setActiveMenu={setActiveMenu}
                />
              ))}
            </div>
          )}
        </main>
      </div>
      {/* End of content wrapper */}

      {/* All modals + chat panel + floating button */}
      <AgentModals state={state} actions={actions} />
    </div>
  );
}
