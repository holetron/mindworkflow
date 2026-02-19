import { useState } from 'react';
import { findPreviousNodes, findNextNodes } from '../../state/store';
import type { ProjectFlow, FlowNode } from '../../state/api';
import type { AiProviderOption } from '../../features/nodes/FlowNodeCard';
import { COLOR_PALETTE, TYPE_ICONS } from './constants';
import type { WorkspaceState } from './hooks/useWorkspaceState';
import type { WorkspaceActions } from './hooks/useWorkspaceActions';

interface NodeModalProps {
  ws: WorkspaceState;
  actions: WorkspaceActions;
}

export function NodeModal({ ws, actions }: NodeModalProps) {
  const { project, showNodeModal, modalNode, providerOptions, loading, generatingNodeSet } = ws;

  if (!showNodeModal || !project || !modalNode) return null;

  const incomingNodes = findPreviousNodes(project, showNodeModal);
  const outgoingNodes = findNextNodes(project, showNodeModal);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
      onClick={() => ws.setShowNodeModal(null)}
    >
      <div
        className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl flex"
        style={{ maxWidth: '1200px', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar - Incoming nodes */}
        <NodeNavigationBar
          nodes={incomingNodes}
          onNavigate={(id) => ws.setShowNodeModal(id)}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <NodeModalHeader
            node={modalNode}
            onClose={() => ws.setShowNodeModal(null)}
          />
          <NodeModalBody
            node={modalNode}
            providerOptions={providerOptions}
            actions={actions}
          />
          <NodeModalFooter
            node={modalNode}
            loading={loading}
            generatingNodes={generatingNodeSet}
            onSelectOnCanvas={(nodeId) => {
              ws.selectNode(nodeId);
              ws.setShowNodeModal(null);
            }}
            onOpenAiSettings={(nodeId) => {
              ws.setShowNodeAiSettings(nodeId);
              ws.setShowNodeModal(null);
            }}
            onRunNode={(nodeId) => {
              actions.handleRunNode(nodeId);
              ws.setShowNodeModal(null);
            }}
            onClose={() => ws.setShowNodeModal(null)}
          />
        </div>

        {/* Right sidebar - Outgoing nodes */}
        <NodeNavigationBar
          nodes={outgoingNodes}
          onNavigate={(id) => ws.setShowNodeModal(id)}
        />
      </div>
    </div>
  );
}

// --------------- Sub-components ---------------

function NodeNavigationBar({
  nodes,
  onNavigate,
}: {
  nodes: FlowNode[];
  onNavigate: (nodeId: string) => void;
}) {
  return (
    <div className="w-16 border-r border-slate-800 bg-slate-900/50 overflow-y-auto flex-shrink-0">
      <div className="p-2 space-y-2">
        {nodes.map((node) => (
          <button
            key={node.node_id}
            onClick={() => onNavigate(node.node_id)}
            className="w-full aspect-square rounded-lg flex items-center justify-center text-2xl transition-all hover:scale-110 hover:shadow-lg"
            style={{
              backgroundColor: node.ui?.color || '#3b82f6',
              opacity: 0.9,
            }}
            title={node.title}
          >
            {TYPE_ICONS[node.type] || '\u{1F4C4}'}
          </button>
        ))}
      </div>
    </div>
  );
}

function NodeModalHeader({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  return (
    <header className="border-b border-slate-800">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{TYPE_ICONS[node.type] || '\u{1F4C4}'}</span>
          <div>
            <h2 className="text-xl font-semibold text-white">
              {node.title || '\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F'}
            </h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {node.type} {'\u2022'} {node.node_id.slice(0, 8)}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition"
        >
          {'\u2715'}
        </button>
      </div>
    </header>
  );
}

function NodeModalBody({
  node,
  providerOptions,
  actions,
}: {
  node: FlowNode;
  providerOptions: AiProviderOption[];
  actions: WorkspaceActions;
}) {
  const [colorOpen, setColorOpen] = useState(false);

  return (
    <div className="max-h-[calc(85vh-200px)] overflow-y-auto px-6 py-6">
      <div className="space-y-6">
        {/* Title + short description */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {'\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043D\u043E\u0434\u044B'}
            </label>
            <input
              type="text"
              value={node.title || ''}
              onChange={(e) => actions.handleUpdateNodeTitle(node.node_id, e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              placeholder={'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435...'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {'\u041A\u0440\u0430\u0442\u043A\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435'}
            </label>
            <input
              type="text"
              value={
                ((node.meta as Record<string, unknown> | undefined)?.short_description as string) || ''
              }
              onChange={(e) => {
                const updatedMeta = { ...(node.meta || {}), short_description: e.target.value };
                actions.handleUpdateNodeMeta(node.node_id, updatedMeta);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              placeholder={'\u041A\u0440\u0430\u0442\u043A\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0443\u0437\u043B\u0430...'}
            />
          </div>
        </div>

        {/* Color, Tags, Provider, Model */}
        <div className="flex gap-4">
          <ColorPicker
            currentColor={node.ui?.color || '#3b82f6'}
            colorOpen={colorOpen}
            setColorOpen={setColorOpen}
            onColorChange={(color) => actions.handleUpdateNodeUi(node.node_id, { color })}
          />

          <div className="flex-1" style={{ marginLeft: '10px' }}>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {'\u0422\u0435\u0433\u0438 (\u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E)'}
            </label>
            <input
              type="text"
              value={((node.meta as Record<string, unknown> | undefined)?.tags as string) || ''}
              onChange={(e) => {
                const updatedMeta = { ...(node.meta || {}), tags: e.target.value };
                actions.handleUpdateNodeMeta(node.node_id, updatedMeta);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              placeholder="tag1, tag2, tag3"
            />
          </div>

          {(node.type === 'ai' || node.type === 'ai_improved') && (
            <>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {'\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440'}
                </label>
                <select
                  value={node.ai?.provider || ''}
                  onChange={(e) => {
                    const newProvider = e.target.value;
                    const provider = providerOptions.find((p) => p.id === newProvider);
                    actions.handleUpdateNodeAi(node.node_id, {
                      ...node.ai,
                      provider: newProvider,
                      model: provider?.defaultModel || '',
                    });
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                >
                  {providerOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {'\u041C\u043E\u0434\u0435\u043B\u044C'}
                </label>
                <select
                  value={node.ai?.model || ''}
                  onChange={(e) => {
                    actions.handleUpdateNodeAi(node.node_id, { ...node.ai, model: e.target.value });
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                >
                  {(() => {
                    const provider = providerOptions.find((p) => p.id === node.ai?.provider);
                    return (provider?.models || []).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        {node.content !== undefined && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {'\u0421\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435'}
            </label>
            <textarea
              value={node.content}
              onChange={(e) => actions.handleCommitNodeContent(node.node_id, e.target.value)}
              className="w-full h-96 rounded-md border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition"
              placeholder={'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435...'}
              spellCheck={false}
            />
            <div className="text-xs text-slate-500 mt-1">
              {node.content.length} {'\u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ColorPicker({
  currentColor,
  colorOpen,
  setColorOpen,
  onColorChange,
}: {
  currentColor: string;
  colorOpen: boolean;
  setColorOpen: (open: boolean) => void;
  onColorChange: (color: string) => void;
}) {
  return (
    <div className="flex-shrink-0">
      <label className="block text-sm font-medium text-slate-300 mb-2">{'\u0426\u0432\u0435\u0442'}</label>
      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setColorOpen(!colorOpen)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 transition"
          title={'\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0446\u0432\u0435\u0442'}
        >
          <div
            className="w-6 h-6 rounded-full border-2 border-slate-600"
            style={{ backgroundColor: currentColor }}
          />
          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {colorOpen && (
          <div
            className="absolute left-0 top-full mt-2 p-2.5 rounded-lg border border-slate-700 bg-slate-800 shadow-2xl z-50"
            style={{ minWidth: '280px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-8 gap-1.5">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    onColorChange(color);
                    setColorOpen(false);
                  }}
                  className={`w-7 h-7 rounded-full transition-all hover:scale-110 ${
                    currentColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeModalFooter({
  node,
  loading,
  generatingNodes,
  onSelectOnCanvas,
  onOpenAiSettings,
  onRunNode,
  onClose,
}: {
  node: FlowNode;
  loading: boolean;
  generatingNodes: Set<string>;
  onSelectOnCanvas: (nodeId: string) => void;
  onOpenAiSettings: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onClose: () => void;
}) {
  return (
    <footer className="border-t border-slate-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSelectOnCanvas(node.node_id)}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition"
          >
            {'\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043D\u0430 \u043A\u0430\u043D\u0432\u0435'}
          </button>

          {(node.type === 'ai' || node.type === 'ai_improved') && (
            <button
              type="button"
              onClick={() => onOpenAiSettings(node.node_id)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition"
            >
              {'\u2699\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 AI'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {(node.type === 'ai' || node.type === 'ai_improved' || node.type === 'python') && (
            <button
              type="button"
              onClick={() => onRunNode(node.node_id)}
              disabled={loading || generatingNodes.has(node.node_id)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {generatingNodes.has(node.node_id) ? '\u23F3' : '\u25B6'}{' '}
              {'\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition"
          >
            {'\u0417\u0430\u043A\u0440\u044B\u0442\u044C'}
          </button>
        </div>
      </div>
    </footer>
  );
}
