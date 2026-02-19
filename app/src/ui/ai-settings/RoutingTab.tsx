import type { AiSettingsSharedState, FlowNode } from './types';

interface RoutingTabProps {
  state: AiSettingsSharedState;
}

export function RoutingTab({ state }: RoutingTabProps) {
  const {
    node,
    onChangeAi,
    onUpdateNodeMeta,
    incomingNodes,
    outgoingNodes,
    contextPreview,
    contextCharCount,
    contextLimit,
    getNodesAtDepth,
    getNodeContentPreview,
  } = state;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 font-medium text-slate-300">Routing Configuration</h3>
        <div className="space-y-4">
          <div className="text-slate-400 text-sm">
            <p className="mb-2">Routing settings determine how data flows in and out of the node.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Input Context (left) */}
            <InputContextPanel
              node={node}
              onChangeAi={onChangeAi}
              incomingNodes={incomingNodes}
              contextLimit={contextLimit}
              getNodesAtDepth={getNodesAtDepth}
              getNodeContentPreview={getNodeContentPreview}
            />

            {/* Node Output (right) */}
            <OutputContextPanel
              node={node}
              onChangeAi={onChangeAi}
              outgoingNodes={outgoingNodes}
              getNodesAtDepth={getNodesAtDepth}
              getNodeContentPreview={getNodeContentPreview}
            />
          </div>

          {/* Required Parameters Routing */}
          <RequiredParamsRouting
            node={node}
            incomingNodes={incomingNodes}
            onUpdateNodeMeta={onUpdateNodeMeta}
          />

          {/* Context Preview */}
          <div className="border-t border-slate-700 pt-4 mt-4">
            <div className="bg-slate-900/50 border border-slate-700/50 rounded p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-300">
                  Context Preview for agent
                </h4>
                <div className="text-xs text-slate-400">
                  <span className="font-mono">{contextCharCount.toLocaleString()}</span> characters
                </div>
              </div>
              {contextPreview ? (
                <div className="bg-slate-900 p-3 rounded border border-slate-700">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                    {contextPreview}
                  </pre>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic">
                  No incoming nodes for context formation
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== Input Context Panel ==========

function InputContextPanel({
  node, onChangeAi, incomingNodes, contextLimit, getNodesAtDepth, getNodeContentPreview,
}: {
  node: FlowNode;
  onChangeAi: AiSettingsSharedState['onChangeAi'];
  incomingNodes: FlowNode[];
  contextLimit: number;
  getNodesAtDepth: AiSettingsSharedState['getNodesAtDepth'];
  getNodeContentPreview: AiSettingsSharedState['getNodeContentPreview'];
}) {
  const filteredIncoming = getNodesAtDepth(Number(node.ai?.context_left_depth ?? 1), 'incoming');

  return (
    <div className="bg-slate-900 p-4 rounded border border-slate-700 space-y-3">
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">Input Context</h4>
        <div className="text-xs text-slate-400 mb-1">
          Number of incoming nodes: {incomingNodes.length}
        </div>
      </div>

      {/* Left context depth slider */}
      <div className="border-t border-slate-700 pt-3">
        <label className="block text-xs font-medium text-slate-300 mb-2">Context depth (levels)</label>
        <div className="flex items-center gap-3">
          <input
            type="range" min="0" max="10" step="1"
            value={Number(node.ai?.context_left_depth ?? 1)}
            onChange={(e) => {
              onChangeAi?.(node.node_id, { ...node.ai, context_left_depth: Number(e.target.value) });
            }}
            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-xs font-medium text-slate-300 min-w-[3rem]">
            {Number(node.ai?.context_left_depth ?? 1)}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Number of node levels on the left visible in context</p>
      </div>

      {/* Context usage progress bar */}
      <div className="border-t border-slate-700 pt-3">
        <div className="text-xs text-slate-300 mb-1">Context usage:</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all ${
                ((incomingNodes.length * 100) / contextLimit) > 80 ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, (incomingNodes.length * 100) / contextLimit)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 min-w-[80px] text-right">
            {incomingNodes.length * 100} / {(contextLimit / 1000).toFixed(1)}K tokens
          </span>
        </div>
      </div>

      {/* Incoming nodes list */}
      {filteredIncoming.length > 0 ? (
        <div className="border-t border-slate-700 pt-2 space-y-2">
          {filteredIncoming.map((n) => (
            <NodeListItem key={n.node_id} node={n} getNodeContentPreview={getNodeContentPreview} />
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-500 italic pt-2 border-t border-slate-700">No incoming nodes</div>
      )}
    </div>
  );
}

// ========== Output Context Panel ==========

function OutputContextPanel({
  node, onChangeAi, outgoingNodes, getNodesAtDepth, getNodeContentPreview,
}: {
  node: FlowNode;
  onChangeAi: AiSettingsSharedState['onChangeAi'];
  outgoingNodes: FlowNode[];
  getNodesAtDepth: AiSettingsSharedState['getNodesAtDepth'];
  getNodeContentPreview: AiSettingsSharedState['getNodeContentPreview'];
}) {
  const filteredOutgoing = getNodesAtDepth(Number(node.ai?.context_right_depth ?? 0), 'outgoing');

  return (
    <div className="bg-slate-900 p-4 rounded border border-slate-700 space-y-3">
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">Node Output</h4>
        <div className="text-xs text-slate-400 mb-1">
          Number of outgoing nodes: {outgoingNodes.length}
        </div>
      </div>

      {/* Right context depth slider */}
      <div className="border-t border-slate-700 pt-3">
        <label className="block text-xs font-medium text-slate-300 mb-2">Context depth (levels)</label>
        <div className="flex items-center gap-3">
          <input
            type="range" min="0" max="10" step="1"
            value={Number(node.ai?.context_right_depth ?? 0)}
            onChange={(e) => {
              onChangeAi?.(node.node_id, { ...node.ai, context_right_depth: Number(e.target.value) });
            }}
            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-xs font-medium text-slate-300 min-w-[3rem]">
            {Number(node.ai?.context_right_depth ?? 0)}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Number of node levels on the right visible in context</p>
      </div>

      {/* Outgoing nodes list */}
      {filteredOutgoing.length > 0 ? (
        <div className="border-t border-slate-700 pt-2 space-y-2">
          {filteredOutgoing.map((n) => (
            <NodeListItem key={n.node_id} node={n} getNodeContentPreview={getNodeContentPreview} />
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-500 italic pt-2 border-t border-slate-700">No outgoing nodes</div>
      )}
    </div>
  );
}

// ========== Shared Node List Item ==========

function NodeListItem({ node, getNodeContentPreview }: { node: FlowNode; getNodeContentPreview: (n: FlowNode) => React.ReactNode }) {
  return (
    <div className="bg-slate-800 p-2 rounded text-xs">
      <div className="flex items-center gap-2">
        <span className="text-slate-500 font-mono text-[10px] uppercase flex-shrink-0">{node.type}</span>
        <span className="text-slate-400 font-mono text-[9px] flex-shrink-0">({node.node_id})</span>
        <span className="text-slate-300 font-medium flex-1 truncate" title={node.title}>{node.title}</span>
      </div>
      <div className="text-slate-400 text-[11px] leading-relaxed truncate">
        {getNodeContentPreview(node)}
      </div>
    </div>
  );
}

// ========== Required Parameters Routing ==========

function RequiredParamsRouting({
  node, incomingNodes, onUpdateNodeMeta,
}: {
  node: FlowNode;
  incomingNodes: FlowNode[];
  onUpdateNodeMeta: AiSettingsSharedState['onUpdateNodeMeta'];
}) {
  const requiredPorts = (node.ai?.auto_ports || []).filter((p: any) => p.required && p.position === 'right');

  if (requiredPorts.length === 0) return null;

  return (
    <div className="border-t border-slate-700 pt-4 mt-4">
      <h3 className="mb-3 font-medium text-slate-300">Required Parameters Routing</h3>
      <div className="bg-slate-900 p-4 rounded border border-slate-700">
        <div className="space-y-3">
          {requiredPorts.map((port: any) => (
            <div key={port.id} className="space-y-1">
              <label className="block text-xs font-medium text-red-400">
                {port.label} <span className="text-red-500">*</span>
              </label>
              {port.description && (
                <div className="text-[10px] text-slate-500 mb-1">{port.description}</div>
              )}
              <select
                value={node.meta?.input_mappings?.[port.id] || ''}
                onChange={(e) => {
                  const newMappings = { ...(node.meta?.input_mappings as Record<string, string> || {}) };
                  if (e.target.value) {
                    newMappings[port.id] = e.target.value;
                  } else {
                    delete newMappings[port.id];
                  }
                  onUpdateNodeMeta?.(node.node_id, { ...node.meta, input_mappings: newMappings });
                }}
                className="w-full bg-slate-700 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-600 focus:border-red-500 focus:outline-none"
              >
                <option value="">-- Select source --</option>
                {incomingNodes.map((n) => (
                  <option key={n.node_id} value={n.node_id}>
                    {n.type}: {n.title}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
