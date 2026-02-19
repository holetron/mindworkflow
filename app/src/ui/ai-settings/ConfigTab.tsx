import type { AiSettingsSharedState } from './types';

interface ConfigTabProps {
  state: AiSettingsSharedState;
}

export function ConfigTab({ state }: ConfigTabProps) {
  const {
    node,
    loading,
    currentProvider,
    selectedProvider,
    availableModels,
    dynamicModels,
    loadingModels,
    midjourneyMode,
    providers,
    handleProviderSelect,
    handleModelChange,
    handleMidjourneyModeChange,
    getModelLabel,
    replicateStatusColor,
    replicateStatusLabel,
    replicatePredictionUrl,
    replicatePredictionApiUrl,
    replicatePredictionIdMasked,
    metaRecord,
  } = state;

  const replicatePredictionId =
    typeof metaRecord['replicate_prediction_id'] === 'string'
      ? (metaRecord['replicate_prediction_id'] as string)
      : '';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 font-medium text-slate-300">Configuration</h3>
        <div className="space-y-4">
          {providers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Operator</label>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={currentProvider || String(node.ai?.provider || '')}
                onChange={(event) => handleProviderSelect(event.target.value)}
                disabled={loading || providers.length === 0}
              >
                <option value="" disabled>
                  Select provider
                </option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id} disabled={!provider.available}>
                    {provider.name}
                    {!provider.available && provider.reason ? ` (${provider.reason})` : ''}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                After changing the operator, the model resets to default.
              </div>
            </div>
          )}

          {selectedProvider && (
            <div className="space-y-4">
              {selectedProvider.id.startsWith('midjourney_') && selectedProvider.modelFamilies && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-400 mb-2">Midjourney Mode</label>
                  <div className="flex gap-2">
                    {selectedProvider.modelFamilies.map((family) => {
                      const isActive = family.id === midjourneyMode;
                      return (
                        <button
                          key={family.id}
                          type="button"
                          className={`rounded px-3 py-1 text-sm transition border ${
                            isActive
                              ? 'border-blue-500/60 bg-blue-500/20 text-blue-100'
                              : 'border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-blue-500/40 hover:text-blue-100'
                          }`}
                          onClick={() => handleMidjourneyModeChange(family.id as 'photo' | 'video')}
                        >
                          {family.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Switch mode to select Midjourney photo or video models.
                  </div>
                </div>
              )}

              {/* Model right after operator */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-400 mb-2">Model</label>
                <select
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={String(node.ai?.model || availableModels[0] || '')}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={loading || availableModels.length === 0}
                >
                  {availableModels.length === 0 ? (
                    <option value="" disabled>
                      No available models
                    </option>
                  ) : (
                    availableModels.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {getModelLabel(modelId)}
                      </option>
                    ))
                  )}
                </select>
                <div className="text-[11px] text-slate-500">
                  Select a model for this AI node. See the "ℹ️ Model" tab for details.
                </div>
                {selectedProvider && dynamicModels[selectedProvider.id] && (
                  <div className="text-[11px] text-slate-400">
                    Dynamic models loaded: {dynamicModels[selectedProvider.id].length}
                  </div>
                )}
              </div>

              {/* Status for Replicate */}
              {selectedProvider.id === 'replicate' && (
                <ReplicateStatus
                  replicateStatusColor={replicateStatusColor}
                  replicateStatusLabel={replicateStatusLabel}
                  replicatePredictionUrl={replicatePredictionUrl}
                  replicatePredictionApiUrl={replicatePredictionApiUrl}
                  replicatePredictionId={replicatePredictionId}
                  replicatePredictionIdMasked={replicatePredictionIdMasked}
                  metaRecord={metaRecord}
                />
              )}
            </div>
          )}

          {/* Current Configuration Summary */}
          <div className="border-t border-slate-700 pt-4">
            <h4 className="text-sm font-medium text-slate-300 mb-2">📊 Current Configuration</h4>
            <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🤖 Operator:</span>
                  <span className="font-medium truncate" title={String(currentProvider || node.ai?.provider || 'Not set')}>
                    {String(currentProvider || node.ai?.provider || 'Not set')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🧠 Model:</span>
                  <span className="font-medium truncate" title={String(node.ai?.model || 'Not set')}>
                    {String(node.ai?.model || 'Not set')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🌡️ Temperature:</span>
                  <span className="font-medium">{String(node.ai?.temperature || 0.7)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🔌 Context Mode:</span>
                  <span className="font-medium">{String(node.ai?.context_mode || 'simple')}</span>
                </div>
                {selectedProvider?.id?.startsWith('midjourney_') && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">🎛️ Midjourney mode:</span>
                    <span className="font-medium">
                      {midjourneyMode === 'video' ? 'Video' : 'Photo'}
                    </span>
                  </div>
                )}
                {node.ai?.auto_ports && node.ai.auto_ports.length > 0 && (
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-slate-400">⚡ Auto-ports:</span>
                    <span className="font-medium">{node.ai.auto_ports.length} ports</span>
                    <span className="text-xs text-slate-500">
                      ({node.ai.auto_ports.filter((p: any) => p.required).length} required)
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">✅ Available:</span>
                  <span className="font-medium">{providers.filter(p => p.available).length}/{providers.length} providers</span>
                </div>
                {selectedProvider && dynamicModels[selectedProvider.id] && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">📚 Dynamic models:</span>
                    <span className="font-medium">{dynamicModels[selectedProvider.id].length}</span>
                  </div>
                )}
                {selectedProvider && loadingModels[selectedProvider.id] && (
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-blue-400">⏳ Status:</span>
                    <span className="text-blue-300 animate-pulse">Loading models...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== Sub-component: ReplicateStatus ==========

function ReplicateStatus({
  replicateStatusColor,
  replicateStatusLabel,
  replicatePredictionUrl,
  replicatePredictionApiUrl,
  replicatePredictionId,
  replicatePredictionIdMasked,
  metaRecord,
}: {
  replicateStatusColor: string;
  replicateStatusLabel: string;
  replicatePredictionUrl: string;
  replicatePredictionApiUrl: string;
  replicatePredictionId: string;
  replicatePredictionIdMasked: string;
  metaRecord: Record<string, unknown>;
}) {
  return (
    <div className="rounded border border-slate-600/60 bg-slate-900/40 p-3 text-xs text-slate-200 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="uppercase text-[0.65rem] tracking-wide text-slate-500">Status</div>
          <div className={`text-sm font-medium ${replicateStatusColor}`}>{replicateStatusLabel}</div>
        </div>
        {replicatePredictionId && (
          <div className="text-right">
            <div className="uppercase text-[0.65rem] tracking-wide text-slate-500">Prediction</div>
            <div className="font-mono text-sm text-slate-300">{replicatePredictionIdMasked}</div>
          </div>
        )}
      </div>
      {replicatePredictionUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={replicatePredictionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[0.7rem] text-blue-200 transition hover:bg-blue-500/20"
          >
            🔗 Open prediction
          </a>
          {replicatePredictionApiUrl && (
            <a
              href={replicatePredictionApiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-slate-500/40 bg-slate-700/30 px-2 py-1 text-[0.7rem] text-slate-200 transition hover:bg-slate-700/50"
            >
              API
            </a>
          )}
          {typeof metaRecord['replicate_last_run_at'] === 'string' && (
            <span className="text-[0.7rem] text-slate-400">
              Updated: {new Date(metaRecord['replicate_last_run_at'] as string).toLocaleString()}
            </span>
          )}
        </div>
      ) : (
        <div className="text-[0.7rem] text-slate-500">Prediction will appear after the first agent run.</div>
      )}
    </div>
  );
}
