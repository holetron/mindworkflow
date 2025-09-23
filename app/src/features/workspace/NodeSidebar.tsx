import { useMemo, useState, type DragEvent } from 'react';
import type { ProjectFlow, FlowNode } from '../../state/api';
import { NODE_DEFAULT_COLOR } from '../../constants/nodeDefaults';

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
  parser: '🧩',
  python: '🐍',
  file: '📁',
  image_gen: '🖼️',
  audio_gen: '🔊',
  video_gen: '🎬',
};

function NodeSidebar({ 
  project, 
  selectedNodeId, 
  onSelectNode, 
  onCopyNode,
  onOpenNodeModal,
  collapsed = false,
  onToggleCollapse 
}: NodeSidebarProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const nodes = project?.nodes ?? [];

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => {
      const titleA = a.title || '';
      const titleB = b.title || '';
      return titleA.localeCompare(titleB, 'ru');
    }),
    [nodes],
  );

  // Функция для получения входящих и исходящих нод
  const getNodeConnections = (nodeId: string) => {
    if (!project) return { incoming: [], outgoing: [] };
    
    const incoming = project.edges
      .filter(edge => edge.to === nodeId)
      .map(edge => project.nodes.find(node => node.node_id === edge.from))
      .filter(Boolean) as FlowNode[];
      
    const outgoing = project.edges
      .filter(edge => edge.from === nodeId)
      .map(edge => project.nodes.find(node => node.node_id === edge.to))
      .filter(Boolean) as FlowNode[];
      
    return { incoming, outgoing };
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, node: FlowNode) => {
    console.log('Drag started for node:', node.node_id, node.title);
    // Передаем данные ноды для копирования
    const nodeData = JSON.stringify(node);
    event.dataTransfer.setData('application/reactflow-node-copy', nodeData);
    event.dataTransfer.effectAllowed = 'copy';
    console.log('Node data set in dataTransfer:', nodeData);
  };

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col bg-slate-800 rounded-lg shadow">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-12 w-12 items-center justify-center text-slate-300 hover:bg-slate-700 rounded-t-lg bg-transparent border-0 p-0"
          style={{ 
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            boxShadow: 'none'
          }}
          title="Развернуть панель нод"
        >
          ☰
        </button>
        <div className="flex-1 flex flex-col items-center py-2 gap-1 overflow-y-auto">
          {sortedNodes.slice(0, 8).map((node) => {
            const icon = TYPE_ICONS[node.type] ?? '⚙️';
            const isSelected = node.node_id === selectedNodeId;
            const nodeColor = node.ui?.color || NODE_DEFAULT_COLOR;
            return (
              <button
                key={node.node_id}
                type="button"
                onClick={() => onSelectNode(node.node_id)}
                className="relative w-8 h-8 flex items-center justify-center rounded text-xs transition overflow-hidden bg-transparent border-0 p-0"
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${nodeColor}40`,
                  backdropFilter: 'blur(10px)',
                  boxShadow: isSelected 
                    ? `0 0 0 1px ${nodeColor}, 0 4px 12px ${nodeColor}20`
                    : `0 2px 6px rgba(0,0,0,0.1)`,
                  backgroundImage: 'none'
                }}
                title={node.title}
              >
                <div 
                  className="flex items-center justify-center w-6 h-6 rounded text-xs"
                  style={{ 
                    backgroundColor: 'transparent',
                    color: 'white'
                  }}
                >
                  {icon}
                </div>
              </button>
            );
          })}
          {sortedNodes.length > 8 && (
            <div className="text-xs text-slate-400 mt-1">+{sortedNodes.length - 8}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-slate-800 p-4 shadow">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Ноды</h2>
          <p className="text-xs text-slate-400">{nodes.length} узлов</p>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 rounded transition bg-transparent border-0 p-0"
          style={{ 
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            boxShadow: 'none'
          }}
          title="Свернуть панель"
        >
          ☰
        </button>
      </header>
      
      <ul className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
        {sortedNodes.map((node) => {
          const icon = TYPE_ICONS[node.type] ?? '⚙️';
          const isSelected = node.node_id === selectedNodeId;
          const isExpanded = expandedNodes.has(node.node_id);
          const nodeColor = node.ui?.color || NODE_DEFAULT_COLOR;
          const connections = getNodeConnections(node.node_id);

          return (
            <li key={node.node_id}>
              <div
                className="relative rounded-lg overflow-hidden cursor-move"
                draggable
                onDragStart={(e) => handleDragStart(e, node)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${nodeColor}40`,
                  backdropFilter: 'blur(10px)',
                  boxShadow: isSelected 
                    ? `0 0 0 1px ${nodeColor}, 0 4px 12px ${nodeColor}20`
                    : `0 2px 6px rgba(0,0,0,0.1)`,
                }}
              >
                <div
                  className="flex items-center justify-between p-3 transition"
                  style={{
                    backgroundColor: 'transparent',
                    borderBottom: (connections.incoming.length > 0 || connections.outgoing.length > 0) && isExpanded 
                      ? `1px solid ${nodeColor}40` 
                      : 'none',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectNode(node.node_id)}
                    className="flex items-center gap-3 flex-1 text-left bg-transparent hover:bg-transparent p-0 border-0"
                    style={{ 
                      backgroundColor: 'transparent',
                      backgroundImage: 'none',
                      boxShadow: 'none'
                    }}
                  >
                    <div 
                      className="flex items-center justify-center w-8 h-8 rounded text-sm"
                      style={{ 
                        backgroundColor: 'transparent',
                        color: 'white'
                      }}
                    >
                      {icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{node.title}</p>
                      <p className="text-[11px] text-slate-400">{node.node_id}</p>
                    </div>
                  </button>
                  
                  {(connections.incoming.length > 0 || connections.outgoing.length > 0) && (
                    <button
                      type="button"
                      onClick={() => toggleNodeExpanded(node.node_id)}
                      className="ml-2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 rounded transition text-xs bg-transparent border-0 p-0"
                      style={{ 
                        backgroundColor: 'transparent',
                        backgroundImage: 'none',
                        boxShadow: 'none'
                      }}
                      title={isExpanded ? "Свернуть связи" : "Показать связи"}
                    >
                      {isExpanded ? '−' : '+'}
                    </button>
                  )}
                </div>
                
                {isExpanded && (connections.incoming.length > 0 || connections.outgoing.length > 0) && (
                  <div 
                    className="p-3"
                    style={{
                      backgroundColor: 'transparent',
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-slate-400 mb-2 font-medium">Входящие:</div>
                        {connections.incoming.length === 0 ? (
                          <div className="text-slate-500 italic">Нет</div>
                        ) : (
                          connections.incoming.map(inNode => (
                            <button
                              key={inNode.node_id}
                              type="button"
                              onClick={() => onOpenNodeModal?.(inNode.node_id)}
                              className="block text-emerald-300 hover:text-emerald-200 transition truncate w-full text-left mb-1 hover:underline bg-transparent border-0 p-0"
                              style={{ 
                                backgroundColor: 'transparent',
                                backgroundImage: 'none',
                                boxShadow: 'none'
                              }}
                              title={inNode.title}
                            >
                              {inNode.title}
                            </button>
                          ))
                        )}
                      </div>
                      <div>
                        <div className="text-slate-400 mb-2 font-medium">Исходящие:</div>
                        {connections.outgoing.length === 0 ? (
                          <div className="text-slate-500 italic">Нет</div>
                        ) : (
                          connections.outgoing.map(outNode => (
                            <button
                              key={outNode.node_id}
                              type="button"
                              onClick={() => onOpenNodeModal?.(outNode.node_id)}
                              className="block text-cyan-300 hover:text-cyan-200 transition truncate w-full text-left mb-1 hover:underline bg-transparent border-0 p-0"
                              style={{ 
                                backgroundColor: 'transparent',
                                backgroundImage: 'none',
                                boxShadow: 'none'
                              }}
                              title={outNode.title}
                            >
                              {outNode.title}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {sortedNodes.length === 0 && (
          <li className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-sm text-slate-400">
            Нет доступных нод.
          </li>
        )}
      </ul>
    </section>
  );
}

export default NodeSidebar;
