/**
 * AiSettingsModal — thin shell component.
 *
 * All state management lives in useAiSettingsState hook.
 * Tab content is rendered by dedicated sub-components under ./ai-settings/.
 */
import Modal from './Modal';
import { useConfirmDialog } from './ConfirmDialog';
import { ModelInfoModal } from '../features/ai/ModelInfoModal';

import type { AiSettingsModalProps } from './ai-settings/types';
import { useAiSettingsState } from './ai-settings/useAiSettingsState';
import { generateAutoPorts } from './ai-settings/utilities';
import { ConfigTab } from './ai-settings/ConfigTab';
import { SettingsTab } from './ai-settings/SettingsTab';
import { ContextTab } from './ai-settings/ContextTab';
import { RoutingTab } from './ai-settings/RoutingTab';
import { RequestPreviewTab } from './ai-settings/RequestPreviewTab';

// Re-export types so existing imports continue to work
export type { AiSettingsModalProps, AiProviderOption } from './ai-settings/types';

export function AiSettingsModal(props: AiSettingsModalProps) {
  const { onClose, activeTab, onTabChange } = props;

  const state = useAiSettingsState(props);
  const {
    node, loading, handleSave, handleSavePreset,
    selectedProvider, pendingEnabledPorts, invalidPortsWithEdges,
    modelInputs, pendingAutoPorts, setPendingAutoPorts,
    setPendingEnabledPorts, setHasChanges, onUpdateNodeMeta,
  } = state;

  // Access isInitializing from the extended return type
  const isInitializing = (state as any).isInitializing as boolean;

  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  const handleClose = async () => {
    if (state.hasChanges) {
      handleSave();
    }
    onClose();
  };

  // Tab navigation with auto-save
  const switchTab = (tab: typeof activeTab) => {
    handleSave();
    onTabChange(tab);
  };

  const tabs = [
    { id: 'ai_config' as const, label: 'Configuration' },
    { id: 'settings' as const, label: 'Settings' },
    { id: 'model_info' as const, label: 'Model' },
    { id: 'context' as const, label: 'Context' },
    { id: 'routing' as const, label: 'Routing' },
    { id: 'request' as const, label: 'Output' },
  ];

  return (
    <Modal
      title={`AI Settings: ${node.title} (${String(node.ai?.model || 'model not selected')})`}
      onClose={handleClose}
      actions={
        <div className="flex justify-between items-center w-full">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSavePreset}
              className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30 rounded transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              disabled={loading}
              title="Save agent to library with favorite mark"
            >
              Save Agent
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={handleSave}
              disabled={loading}
            >
              Save
            </button>
            <button
              type="button"
              className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600"
              onClick={handleClose}
              title="Close without saving unsaved changes"
            >
              Close without saving
            </button>
            <button
              type="button"
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              onClick={handleClose}
            >
              Close
            </button>
          </div>
        </div>
      }
    >
      {/* Loading overlay on modal initialization */}
      {isInitializing && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-lg z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-sm text-slate-300">Loading model parameters...</p>
          </div>
        </div>
      )}

      <div
        className="flex flex-col gap-6 p-6 h-[500px] overflow-y-auto"
        style={{ opacity: isInitializing ? 0.5 : 1, pointerEvents: isInitializing ? 'none' : 'auto' }}
      >
        {/* Tab Navigation */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              onClick={() => switchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'ai_config' && <ConfigTab state={state} />}
        {activeTab === 'settings' && <SettingsTab state={state} />}
        {activeTab === 'context' && <ContextTab state={state} />}
        {activeTab === 'routing' && <RoutingTab state={state} />}
        {activeTab === 'request' && <RequestPreviewTab state={state} />}

        {activeTab === 'model_info' && node.ai?.model && selectedProvider && (
          <div className="space-y-6">
            <ModelInfoModal
              isOpen={true}
              onClose={() => {}}
              provider={selectedProvider.id as 'replicate' | 'openai' | 'google' | 'anthropic'}
              modelId={String(node.ai.model)}
              nodeId={node.node_id}
              currentMappings={node.meta?.input_mappings as Record<string, string>}
              onSaveMappings={(mappings) => {
                if (onUpdateNodeMeta) {
                  onUpdateNodeMeta(node.node_id, {
                    ...node.meta,
                    input_mappings: mappings,
                  });
                }
              }}
              inline={true}
              enabledPorts={pendingEnabledPorts}
              invalidPortsWithEdges={invalidPortsWithEdges}
              onTogglePort={(portId, enabled) => {
                const newPorts = enabled
                  ? [...pendingEnabledPorts, portId]
                  : pendingEnabledPorts.filter((p) => p !== portId);
                setPendingEnabledPorts(newPorts);
                const updatedAutoPorts = generateAutoPorts(modelInputs, newPorts);
                setPendingAutoPorts(updatedAutoPorts);
                setHasChanges(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </Modal>
  );
}
