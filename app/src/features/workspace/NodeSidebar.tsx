import { useMemo, useState, useEffect, type DragEvent } from 'react';
import type { FlowNode, ProjectFlow } from '../../state/api';
import { NODE_DEFAULT_COLOR } from '../../constants/nodeDefaults';

interface AgentPreset {
  preset_id: string;
  title: string;
  description?: string;
  icon?: string;
  node_template: {
    type: string;
    ui?: {
      color?: string;
    };
    ai?: {
      model?: string;
    };
  };
  is_favorite?: boolean;
}

interface NodeSidebarProps {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onCopyNode?: (node: FlowNode, position: { x: number; y: number }) => void;
  onOpenNodeModal?: (nodeId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  text: '📝',
  ai: '🤖',
  ai_improved: '🧠',
  parser: '🧩',
  python: '🐍',
  file: '📁',
  image: '🖼️',
  image_gen: '🖼️',
  audio_gen: '🔊',
  video: '🎬',
  video_gen: '🎬',
  html: '🌐',
  html_editor: '✉️',
};

function NodeSidebar({
  project,
  selectedNodeId,
  onSelectNode,
  onCopyNode,
  onOpenNodeModal,
  collapsed = false,
  onToggleCollapse,
}: NodeSidebarProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState<AgentPreset[]>([]);

  // Loading agents
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const response = await fetch('/api/agent-presets');
        if (!response.ok) return;
        const data = await response.json();
        setAgents(data);
      } catch (error) {
        console.error('Failed to load agents:', error);
      }
    };
    
    loadAgents();
  }, []);

  const nodes = project?.nodes ?? [];
  const edges = project?.edges ?? [];
  const normalizedQuery = search.trim().toLowerCase();

  const sortedNodes = useMemo(
    () =>
      [...nodes].sort((a, b) => {
        const titleA = (a.title || a.node_id || '').toLowerCase();
        const titleB = (b.title || b.node_id || '').toLowerCase();
        return titleA.localeCompare(titleB, 'ru');
      }),
    [nodes],
  );

  const filteredNodes = useMemo(() => {
    if (!normalizedQuery) return sortedNodes;
    return sortedNodes.filter((node) => {
      const haystack = `${node.title ?? ''} ${node.node_id} ${node.type}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, sortedNodes]);

  const getNodeConnections = (nodeId: string) => {
    if (!project) {
      return { incoming: [] as FlowNode[], outgoing: [] as FlowNode[] };
    }

    const incoming = edges
      .filter((edge) => edge.to === nodeId)
      .map((edge) => nodes.find((node) => node.node_id === edge.from))
      .filter(Boolean) as FlowNode[];

    const outgoing = edges
      .filter((edge) => edge.from === nodeId)
      .map((edge) => nodes.find((node) => node.node_id === edge.to))
      .filter(Boolean) as FlowNode[];

    return { incoming, outgoing };
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, node: FlowNode) => {
    if (!onCopyNode) {
      event.preventDefault();
      return;
    }
    const nodeData = JSON.stringify(node);
    event.dataTransfer.setData('application/reactflow-node-copy', nodeData);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleCopyNode = (node: FlowNode) => {
    if (!onCopyNode) return;
    const bbox = node.ui?.bbox;
    const position = bbox ? { x: bbox.x1 + 40, y: bbox.y1 + 40 } : { x: 120, y: 120 };
    onCopyNode(node, position);
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col rounded-lg bg-slate-800/90 backdrop-blur-sm border border-slate-600/50 shadow-lg overflow-x-hidden">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-12 w-12 items-center justify-center rounded-t-lg bg-slate-800/90 backdrop-blur-sm border-b border-slate-600/50 text-slate-300 transition-all duration-200 hover:bg-slate-700/90 hover:text-white hover:border-slate-500 flex-shrink-0"
          title="Expand nodes panel"
        >
          ☰
        </button>

        <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-1 no-scrollbar">
          {filteredNodes.map((node) => {
            const icon = TYPE_ICONS[node.type] ?? '⚙️';
            const isSelected = node.node_id === selectedNodeId;
            const nodeColor = node.ui?.color ?? NODE_DEFAULT_COLOR;

            return (
              <button
                key={node.node_id}
                type="button"
                onClick={() => onSelectNode(node.node_id)}
                className="relative flex items-center justify-center rounded-md border text-xs text-white transition-all duration-200 hover:scale-105 flex-shrink-0"
                style={{
                  width: '32px',
                  height: '32px',
                  borderColor: isSelected ? nodeColor : `${nodeColor}40`,
                  boxShadow: isSelected
                    ? `0 0 0 1px ${nodeColor}, 0 4px 12px ${nodeColor}33`
                    : `0 2px 6px ${nodeColor}15`,
                  backgroundColor: `${nodeColor}20`,
                }}
                title={node.title || 'Untitled'}
              >
                {icon}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-slate-800 p-4 shadow">
      <header className="mb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Project Nodes</h2>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 rounded transition bg-transparent border-0 p-0"
            style={{
              backgroundColor: 'transparent',
              backgroundImage: 'none',
              boxShadow: 'none',
            }}
            title="Collapse panel"
          >
            ☰
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search nodes..."
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-slate-400">
          {filteredNodes.length} of {nodes.length} • connections: {edges.length}
        </p>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1 text-sm">
        {filteredNodes.length === 0 && (
          <div className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-xs text-slate-400">
            Nothing found.
          </div>
        )}

        {filteredNodes.map((node) => {
          const icon = TYPE_ICONS[node.type] ?? '⚙️';
          const isSelected = node.node_id === selectedNodeId;
          const isExpanded = expandedNodes.has(node.node_id);
          const nodeColor = node.ui?.color ?? NODE_DEFAULT_COLOR;
          const connections = getNodeConnections(node.node_id);
          const hasConnections = connections.incoming.length > 0 || connections.outgoing.length > 0;

          return (
            <div
              key={node.node_id}
              className={`rounded-lg p-3 transition h-auto w-full cursor-pointer hover:opacity-80 ${
                isSelected ? 'ring-2 ring-blue-500 ring-inset' : ''
              }`}
              style={{
                border: `1px solid ${nodeColor}40`,
                backgroundColor: `${nodeColor}10`,
              }}
              draggable={Boolean(onCopyNode)}
              onDragStart={(event) => handleDragStart(event, node)}
              onClick={() => {
                onSelectNode(node.node_id);
                if (onOpenNodeModal) {
                  onOpenNodeModal(node.node_id);
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 text-xl">
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm truncate leading-tight mb-1">
                    {node.title || 'Untitled'}
                  </div>
                  
                  <div className="text-[10px] opacity-70 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span className="uppercase tracking-wide text-slate-300">
                        {node.type}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="font-mono text-slate-400">
                        {node.node_id.slice(0, 8)}
                      </span>
                    </div>
                    {hasConnections && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-300">
                          ↙{connections.incoming.length}
                        </span>
                        <span className="text-slate-300">
                          ↗{connections.outgoing.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-shrink-0 gap-1">
                  {onCopyNode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyNode(node);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded bg-slate-700/50 text-xs text-slate-300 transition hover:bg-slate-600/50 hover:text-white focus:outline-none"
                      title="Copy"
                    >
                      ⧉
                    </button>
                  )}
                  {hasConnections && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleNodeExpanded(node.node_id);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded bg-slate-700/50 text-xs text-slate-300 transition hover:bg-slate-600/50 hover:text-white focus:outline-none"
                      title={isExpanded ? 'Hide connections' : 'Show connections'}
                    >
                      {isExpanded ? '−' : '+'}
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && hasConnections && (
                <div className="mt-3 border-t border-slate-700/50 pt-3 text-xs space-y-2">
                  {connections.incoming.length > 0 && (
                    <div>
                      <div className="text-slate-400 mb-1 font-semibold">↙ Incoming:</div>
                      <div className="space-y-1">
                        {connections.incoming.map((inNode) => (
                          <button
                            key={inNode.node_id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(inNode.node_id);
                              if (onOpenNodeModal) {
                                onOpenNodeModal(inNode.node_id);
                              }
                            }}
                            className="block w-full truncate rounded bg-slate-700/30 px-2 py-1 text-left text-slate-200 transition hover:bg-slate-700/50 focus:outline-none"
                            title={inNode.title}
                          >
                            {TYPE_ICONS[inNode.type] ?? '⚙️'} {inNode.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {connections.outgoing.length > 0 && (
                    <div>
                      <div className="text-slate-400 mb-1 font-semibold">↗ Outgoing:</div>
                      <div className="space-y-1">
                        {connections.outgoing.map((outNode) => (
                          <button
                            key={outNode.node_id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(outNode.node_id);
                              if (onOpenNodeModal) {
                                onOpenNodeModal(outNode.node_id);
                              }
                            }}
                            className="block w-full truncate rounded bg-slate-700/30 px-2 py-1 text-left text-slate-200 transition hover:bg-slate-700/50 focus:outline-none"
                            title={outNode.title}
                          >
                            {TYPE_ICONS[outNode.type] ?? '⚙️'} {outNode.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default NodeSidebar;
