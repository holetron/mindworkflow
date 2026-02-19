import type { AiSettingsSharedState } from './types';

interface ContextTabProps {
  state: AiSettingsSharedState;
}

export function ContextTab({ state }: ContextTabProps) {
  const {
    node,
    onChangeAi,
    contextPreview,
    contextCharCount,
    autoInputsPreview,
    allNodes,
  } = state;

  return (
    <div className="space-y-6">
      {/* Context Mode Selection */}
      <ContextModeSelector node={node} onChangeAi={onChangeAi} />

      {/* Context Preview */}
      <section>
        <h3 className="mb-3 font-medium text-slate-300">Context for Agent</h3>
        <p className="text-sm text-slate-400 mb-4">
          Context is automatically updated when the display mode or content of incoming nodes changes.
        </p>
        <div className="bg-slate-900/50 border border-slate-700/50 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">Context Preview</span>
            <span className="text-xs text-slate-400">
              <span className="font-mono">{contextCharCount.toLocaleString()}</span> characters
            </span>
          </div>
          {contextPreview ? (
            <div className="bg-slate-900 p-3 rounded border border-slate-700 overflow-auto max-h-96 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {contextPreview}
            </div>
          ) : (
            <div className="bg-slate-900 p-4 rounded border border-dashed border-slate-700 text-xs text-slate-500 text-center">
              No context — connect incoming nodes or enable the necessary ports.
            </div>
          )}
        </div>
      </section>

      {/* Active Auto-Ports */}
      <section className="space-y-3">
        <h4 className="text-sm font-medium text-slate-300">Active Auto-Ports</h4>
        {autoInputsPreview.length > 0 ? (
          <div className="grid gap-3">
            {autoInputsPreview.map(({ port, sourceNode, value, hasValue }) => (
              <div key={port.id} className="bg-slate-900/60 border border-slate-700 rounded p-3 text-xs text-slate-300 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{port.label}</span>
                  <span className="text-slate-500">{port.type}</span>
                </div>
                <div className="text-slate-400">
                  Source:{' '}
                  {sourceNode
                    ? `\u00AB${sourceNode.title || sourceNode.node_id}\u00BB (${sourceNode.type})`
                    : '\u2014 not connected \u2014'}
                </div>
                <div className="text-slate-400">
                  Value:{' '}
                  {hasValue ? (
                    <span className="text-slate-300 break-all">{value}</span>
                  ) : (
                    <span className="text-rose-400">no data — connect a node</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            No automatic inputs configured. Enable ports in the "Configuration" tab.
          </div>
        )}
      </section>
    </div>
  );
}

// ========== Context Mode Selector ==========

function ContextModeSelector({
  node,
  onChangeAi,
}: {
  node: AiSettingsSharedState['node'];
  onChangeAi: AiSettingsSharedState['onChangeAi'];
}) {
  const modes = [
    { id: 'simple', label: 'Simplified' },
    { id: 'clean', label: 'Clean' },
    { id: 'simple_json', label: 'Simplified JSON' },
    { id: 'full_json', label: 'Full JSON' },
  ] as const;

  return (
    <div className="bg-slate-900 p-4 rounded border border-slate-700">
      <h4 className="text-sm font-medium text-slate-300 mb-3">Context Mode</h4>
      <div className="grid grid-cols-4 gap-2">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => {
              onChangeAi?.(node.node_id, {
                ...node.ai,
                context_mode: mode.id,
              });
            }}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              (node.ai?.context_mode ?? 'simple') === mode.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
