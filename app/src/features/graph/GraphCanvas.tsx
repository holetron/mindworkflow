import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import ReactFlow, {
  Background,
  Controls,
  ControlButton,
  MarkerType,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  useReactFlow,
} from 'reactflow';
import LoadingIndicator from './LoadingIndicator';
import type { ProjectFlow, FlowNode, NodeUI } from '../../state/api';
import FlowNodeCard, {
  type AiProviderOption,
  type FlowNodeCardData,
} from '../nodes/FlowNodeCard';
import {
  NODE_DEFAULT_WIDTH,
  NODE_DEFAULT_HEIGHT,
  NODE_MIN_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MAX_HEIGHT,
  NODE_DEFAULT_COLOR,
} from '../../constants/nodeDefaults';
import { SmartBezierEdge, SmartConnectionLine } from './EdgeRenderer';

const nodeTypes = { flowNode: FlowNodeCard };
const edgeTypes = { smart: SmartBezierEdge };
const SNAP_GRID: [number, number] = [20, 20];

interface GraphCanvasProps {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onRunNode: (nodeId: string) => void;
  onRegenerateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddNodeFromPalette: (slug: string, position: { x: number; y: number }) => void | Promise<void>;
  onCopyNode?: (node: FlowNode, position: { x: number; y: number }) => void | Promise<void>;
  onChangeNodeMeta: (nodeId: string, patch: Record<string, unknown>) => void;
  onChangeNodeContent: (nodeId: string, content: string) => void;
  onChangeNodeTitle: (nodeId: string, title: string) => void;
  onChangeNodeAi: (
    nodeId: string,
    ai: Record<string, unknown>,
    options?: { replace?: boolean },
  ) => void;
  onChangeNodeUi: (nodeId: string, patch: Partial<NodeUI>) => void;
  onCreateEdge?: (edge: { from: string; to: string }) => void;
  onRemoveEdges?: (edges: Array<{ from: string; to: string }>) => void;
  providerOptions?: AiProviderOption[];
  loading?: boolean;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  generatingNodes?: Set<string>; // Ноды, которые сейчас генерируют ответы
  generatingEdges?: Map<string, string>; // Мапа sourceNodeId -> targetNodeId для генерирующихся связей
}

interface BuildGraphArgs {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  providerOptions: AiProviderOption[];
  loading: boolean;
  isLocked: boolean;
  draggingId: string | null;
  onRunNode: GraphCanvasProps['onRunNode'];
  onRegenerateNode: GraphCanvasProps['onRegenerateNode'];
  onDeleteNode: GraphCanvasProps['onDeleteNode'];
  onChangeNodeMeta: GraphCanvasProps['onChangeNodeMeta'];
  onChangeNodeContent: GraphCanvasProps['onChangeNodeContent'];
  onChangeNodeTitle: GraphCanvasProps['onChangeNodeTitle'];
  onChangeNodeAi: GraphCanvasProps['onChangeNodeAi'];
  onChangeNodeUi: GraphCanvasProps['onChangeNodeUi'];
  currentNodeSizes?: Map<string, { width: number; height: number }>;
  generatingNodes?: Set<string>;
}

interface GraphElements {
  nodes: Node<FlowNodeCardData>[];
  edges: Edge[];
}

function GraphCanvasInner({
  project,
  selectedNodeId,
  onSelectNode,
  onRunNode,
  onRegenerateNode,
  onDeleteNode,
  onAddNodeFromPalette,
  onCopyNode,
  onChangeNodeMeta,
  onChangeNodeContent,
  onChangeNodeTitle,
  onChangeNodeAi,
  onChangeNodeUi,
  onCreateEdge,
  onRemoveEdges,
  providerOptions = [],
  loading = false,
  sidebarCollapsed = false,
  sidebarWidth = 300,
  generatingNodes = new Set(),
  generatingEdges = new Map(),
}: GraphCanvasProps) {
  const reactFlow = useReactFlow<FlowNodeCardData>();
  const [nodes, setNodes] = useState<Node<FlowNodeCardData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const initialFitRef = useRef(true);

  // Function to forcefully clear selection
  const clearSelection = useCallback(() => {
    // Clear our app state first
    onSelectNode(null);
    // Force update nodes to deselect
    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        selected: false,
      })),
    );
  }, [onSelectNode]);



  useEffect(() => {
    const storedIsLocked = localStorage.getItem('lc-flow-is-locked');
    if (storedIsLocked) {
      setIsLocked(JSON.parse(storedIsLocked));
    }
  }, []);

  useEffect(() => {
    console.log('Saving lock state to localStorage:', isLocked);
    localStorage.setItem('lc-flow-is-locked', JSON.stringify(isLocked));
  }, [isLocked]);

  const projectSignature = useMemo(() => {
    if (!project) return 'empty';
    return `${project.project_id}:${project.updated_at}:${project.nodes.length}:${project.edges.length}`;
  }, [project]);

  // Restore lock state after any project change that might cause re-render
  useEffect(() => {
    const storedIsLocked = localStorage.getItem('lc-flow-is-locked');
    if (storedIsLocked) {
      const lockState = JSON.parse(storedIsLocked);
      if (lockState !== isLocked) {
        console.log('Restoring lock state after project change:', lockState);
        setIsLocked(lockState);
      }
    }
  }, [projectSignature, isLocked]); // Re-check lock state when project changes

  useEffect(() => {
    if (!project) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Preserve current node sizes before rebuilding
    const currentNodeSizes = new Map<string, { width: number; height: number }>();
    nodes.forEach(node => {
      if (node.style?.width && node.style?.height) {
        currentNodeSizes.set(node.id, {
          width: typeof node.style.width === 'number' ? node.style.width : parseInt(String(node.style.width)) || NODE_DEFAULT_WIDTH,
          height: typeof node.style.height === 'number' ? node.style.height : parseInt(String(node.style.height)) || NODE_DEFAULT_HEIGHT,
        });
      }
    });

    const next = buildGraphElements({
      project,
      selectedNodeId,
      providerOptions,
      loading,
      isLocked,
      draggingId: null,
      onRunNode,
      onRegenerateNode,
      onDeleteNode,
      onChangeNodeMeta,
      onChangeNodeContent,
      onChangeNodeTitle,
      onChangeNodeAi,
      onChangeNodeUi,
      currentNodeSizes, // Pass current sizes
      generatingNodes,
    });

    setNodes(next.nodes);
    setEdges(next.edges);

    if (initialFitRef.current && next.nodes.length > 0) {
      initialFitRef.current = false;
      requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.2, duration: 220 });
      });
    }
    // WARNING: DO NOT ADD MORE DEPENDENCIES HERE.
    // This hook is intentionally designed to only run when the project's
    // fundamental structure changes. Adding reactive props that change
    // during user interactions (like dragging) will cause severe
    // performance issues by re-rendering the entire graph.
  }, [projectSignature, isLocked]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    );
  }, [selectedNodeId]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Let ReactFlow handle the state update for smooth interaction
      setNodes((prev) => applyNodeChanges(changes, prev));

      // Debounce dimension changes to avoid excessive updates
      changes.forEach((change) => {
        if (change.type === 'dimensions' && change.dimensions) {
          const node = reactFlow.getNode(change.id);
          if (!node) return;

          const baseX = node.position.x;
          const baseY = node.position.y;
          
          // Preserve current dimensions if new dimensions are not provided
          const currentWidth = node.width || NODE_DEFAULT_WIDTH;
          const currentHeight = node.height || NODE_DEFAULT_HEIGHT;
          
          const width = Math.max(
            NODE_MIN_WIDTH,
            Math.min(NODE_MAX_WIDTH, Math.round(change.dimensions.width ?? currentWidth)),
          );
          const height = Math.max(
            NODE_MIN_HEIGHT,
            Math.min(NODE_MAX_HEIGHT, Math.round(change.dimensions.height ?? currentHeight)),
          );
          onChangeNodeUi(change.id, {
            bbox: {
              x1: baseX,
              y1: baseY,
              x2: baseX + width,
              y2: baseY + height,
            },
          });
        }
      });
    },
    [reactFlow, onChangeNodeUi],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const handleEdgesDelete = useCallback(
    (removed: Edge[]) => {
      if (removed.length === 0) return;
      onRemoveEdges?.(removed.map((edge) => ({ from: edge.source, to: edge.target })));
    },
    [onRemoveEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      
      // Check if edge already exists in project to avoid server conflicts
      const edgeExists = project?.edges.some(edge => 
        edge.from === connection.source && edge.to === connection.target
      );
      
      if (edgeExists) {
        console.warn(`Edge ${connection.source} -> ${connection.target} already exists in project`);
        return;
      }
      
      setEdges((prev) => {
        if (!connection.target || !connection.source) return prev;
        const exists = prev.some((edge) => edge.source === connection.source && edge.target === connection.target);
        if (exists) return prev;
        const newEdge: Edge = {
          id: `${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          type: 'smart',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
        };
        return addEdge(newEdge, prev);
      });
      onCreateEdge?.({ from: connection.source, to: connection.target });
    },
    [onCreateEdge, project?.edges],
  );

  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: Node<FlowNodeCardData>) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node<FlowNodeCardData>[]; edges: Edge[] }) => {
      if (selected.length > 0) {
        onSelectNode(selected[0].id);
      } else {
        onSelectNode(null);
      }
    },
    [onSelectNode],
  );

  // The `onNodeDragStart` handler is no longer needed to manage dragging state.
  const handleNodeDragStart = useCallback(() => {
    // No-op. We let ReactFlow manage the dragging state internally.
  }, []);

  const handleNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: Node<FlowNodeCardData>) => {
      const x1 = node.position.x;
      const y1 = node.position.y;
      const width = Math.max(NODE_MIN_WIDTH, NODE_DEFAULT_WIDTH);
      const height = Math.max(NODE_MIN_HEIGHT, NODE_DEFAULT_HEIGHT);
      onChangeNodeUi(node.id, {
        bbox: {
          x1,
          y1,
          x2: x1 + width,
          y2: y1 + height,
        },
      });
    },
    [onChangeNodeUi],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Always allow drop for palette items and node copies
    const hasNodeData = event.dataTransfer.types.includes('application/reactflow-node-copy');
    const hasSlugData = event.dataTransfer.types.includes('application/reactflow-node');
    
    if (hasNodeData || hasSlugData) {
      event.dataTransfer.dropEffect = 'copy';
    } else {
      // Still allow drop for unknown data types to be safe
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      
      console.log('Drop event triggered');
      console.log('DataTransfer types:', event.dataTransfer.types);
      console.log('DataTransfer items:', [...event.dataTransfer.items].map(item => item.type));
      
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Проверяем, это drag from palette или copy from sidebar
      const slug = event.dataTransfer.getData('application/reactflow-node');
      const nodeCopyData = event.dataTransfer.getData('application/reactflow-node-copy');
      
      console.log('Drop data - slug:', slug, 'nodeCopyData length:', nodeCopyData?.length);

      if (slug && slug.trim()) {
        // Drag from palette - создаем новую ноду
        console.log('Creating new node from palette:', slug);
        try {
          void onAddNodeFromPalette(slug, {
            x: Math.round(position.x),
            y: Math.round(position.y),
          });
        } catch (err) {
          console.error('Error creating node from palette:', err);
        }
      } else if (nodeCopyData && nodeCopyData.trim()) {
        // Copy from sidebar - копируем существующую ноду
        try {
          const nodeData = JSON.parse(nodeCopyData);
          console.log('Copying node:', nodeData.node_id, nodeData.title);
          if (onCopyNode) {
            console.log('Calling onCopyNode with position:', position);
            onCopyNode(nodeData, {
              x: Math.round(position.x),
              y: Math.round(position.y),
            });
          } else {
            console.error('onCopyNode function not provided');
          }
        } catch (err) {
          console.error('Failed to parse node copy data:', err);
        }
      } else {
        console.log('No valid drag data found. Available types:', event.dataTransfer.types);
        console.log('All available data:', [...event.dataTransfer.types].map(type => {
          return { type, data: event.dataTransfer.getData(type) };
        }));
      }
    },
    [onAddNodeFromPalette, onCopyNode, reactFlow],
  );

  return (
    <div className="relative h-full w-full" onDrop={handleDrop} onDragOver={handleDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onEdgesDelete={handleEdgesDelete}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        panOnScroll={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesDraggable={!isLocked}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={['Delete']}
        minZoom={0.3}
        maxZoom={2}
        snapToGrid={!isLocked}
        snapGrid={SNAP_GRID}
        connectionLineComponent={SmartConnectionLine}
        defaultEdgeOptions={{ type: 'smart', markerEnd: { type: MarkerType.ArrowClosed } }}
        proOptions={{ hideAttribution: true }}
        className="bg-slate-900"
      >
        <Background color="#1e293b" gap={20} />
        <Controls 
          showFitView={false}
          showZoom={false}
          showInteractive={false}
          position="bottom-left"
          className="!bottom-4 !gap-1"
          style={{
            left: sidebarCollapsed ? '66px' : `${sidebarWidth + 82}px`, // +50px to the right
            display: 'flex',
            flexDirection: 'column',
            gap: '6px', // четверть высоты кнопки (24px * 0.25 = 6px)
          }}
        >
          {/* Custom Fit View Button */}
          <ControlButton
            onClick={() => reactFlow.fitView({ padding: 0.2, duration: 220 })}
            title="Уместить все ноды в видимую область"
            className="!bg-slate-800/80 !text-slate-300 !h-6 !w-6 !min-h-6 !min-w-6"
          >
            📐
          </ControlButton>
          
          {/* Custom Zoom In Button */}
          <ControlButton
            onClick={() => reactFlow.zoomIn({ duration: 200 })}
            title="Увеличить масштаб"
            className="!bg-slate-800/80 !text-slate-300 !h-6 !w-6 !min-h-6 !min-w-6"
          >
            ➕
          </ControlButton>
          
          {/* Custom Zoom Out Button */}
          <ControlButton
            onClick={() => reactFlow.zoomOut({ duration: 200 })}
            title="Уменьшить масштаб"
            className="!bg-slate-800/80 !text-slate-300 !h-6 !w-6 !min-h-6 !min-w-6"
          >
            ➖
          </ControlButton>
          
          {/* Lock/Unlock Button */}
          <ControlButton
            onClick={() => {
              const newLockState = !isLocked;
              console.log('Lock button clicked, changing state:', isLocked, '->', newLockState);
              setIsLocked(newLockState);
            }}
            title={isLocked ? 'Разблокировать узлы' : 'Заблокировать узлы'}
            className={`${isLocked ? '!bg-orange-500/20 !text-orange-300' : '!bg-slate-800/80 !text-slate-300'} !h-6 !w-6 !min-h-6 !min-w-6`}
          >
            {isLocked ? '🔒' : '🔓'}
          </ControlButton>
          
          {/* MiniMap Toggle Button */}
          <ControlButton
            onClick={() => setShowMiniMap(!showMiniMap)}
            title={showMiniMap ? 'Скрыть обзор' : 'Показать обзор рабочего процесса'}
            className={`${showMiniMap ? '!bg-slate-700/80 !text-emerald-300' : '!bg-slate-800/80 !text-slate-300'} !h-6 !w-6 !min-h-6 !min-w-6 hover:!bg-slate-600/80 transition-colors`}
          >
            🗺️
          </ControlButton>
        </Controls>
        {showMiniMap && (
          <MiniMap 
            position="bottom-left"
            className="!bottom-4 !w-48 !h-32 !bg-slate-900/90 !border-2 !border-slate-500 !rounded-md !shadow-lg"
            style={{
              left: sidebarCollapsed ? '118px' : `${sidebarWidth + 134}px`, // -50px to the left from controls
            }}
            nodeColor={(node) => {
              const nodeData = node.data as FlowNodeCardData;
              switch (nodeData.node.type) {
                case 'input': return '#10b981';
                case 'output': return '#f59e0b';
                case 'ai': return '#8b5cf6';
                default: return '#64748b';
              }
            }}
            maskColor="rgba(15, 23, 42, 0.8)"
          />
        )}
      </ReactFlow>
      {(!project || project.nodes.length === 0) && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400">
          <p className="rounded-lg bg-slate-900/80 px-5 py-3 text-sm shadow">
            Перетащите ноду из магазина, чтобы начать
          </p>
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-slate-900/70 px-4 py-2 text-sm text-slate-200 shadow">
            Выполняется операция...
          </div>
        </div>
      )}
    </div>
  );
}

export default function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function buildGraphElements({
  project,
  selectedNodeId,
  providerOptions,
  loading,
  isLocked,
  onRunNode,
  onRegenerateNode,
  onDeleteNode,
  onChangeNodeMeta,
  onChangeNodeContent,
  onChangeNodeTitle,
  onChangeNodeAi,
  onChangeNodeUi,
  currentNodeSizes,
  generatingNodes = new Set(),
}: BuildGraphArgs): GraphElements {
  if (!project) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node<FlowNodeCardData>[] = project.nodes.map((node) => {
    const position = getStoredPosition(node);
    // Use current size if available, otherwise calculate from node data
    const currentSize = currentNodeSizes?.get(node.node_id);
    const width = currentSize?.width ?? getNodeWidth(node);
    const height = currentSize?.height ?? getNodeHeight(node);

    const data: FlowNodeCardData = {
      node,
      projectId: project.project_id,
      onRun: onRunNode,
      onRegenerate: onRegenerateNode,
      onDelete: onDeleteNode,
      onChangeMeta: onChangeNodeMeta,
      onChangeContent: onChangeNodeContent,
      onChangeTitle: onChangeNodeTitle,
      onChangeAi: onChangeNodeAi,
      onChangeUi: onChangeNodeUi,
      providers: providerOptions,
      sources: project.edges
        .filter((edge) => edge.to === node.node_id)
        .map((edge) => project.nodes.find((item) => item.node_id === edge.from))
        .filter((edgeNode): edgeNode is FlowNode => Boolean(edgeNode))
        .map((sourceNode) => ({
          node_id: sourceNode.node_id,
          title: sourceNode.title,
          type: sourceNode.type,
        })),
      disabled: loading,
      isGenerating: generatingNodes?.has(node.node_id) || false,
    };

    return {
      id: node.node_id,
      type: 'flowNode',
      position,
      data,
      draggable: !loading && !isLocked,
      selected: node.node_id === selectedNodeId,
      style: {
        width,
        height,
        minWidth: NODE_MIN_WIDTH,
        minHeight: NODE_MIN_HEIGHT,
        maxWidth: NODE_MAX_WIDTH,
        maxHeight: NODE_MAX_HEIGHT,
        border: `1px solid ${node.ui?.color ?? NODE_DEFAULT_COLOR}`,
        backgroundColor: '#1e293b',
      },
    } satisfies Node<FlowNodeCardData>;
  });

  const edges: Edge[] = project.edges.map((edge, index) => {
    // Find the source node to get its color
    const sourceNode = project.nodes.find(node => node.node_id === edge.from);
    const sourceColor = sourceNode?.ui?.color ?? NODE_DEFAULT_COLOR;
    
    return {
      id: `${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      type: 'smart',
      style: {
        stroke: sourceColor,
      },
      markerEnd: { 
        type: MarkerType.ArrowClosed, 
        color: sourceColor 
      },
    };
  });

  return { nodes, edges };
}

function getStoredPosition(node: FlowNode): { x: number; y: number } {
  const bbox = node.ui?.bbox;
  if (!bbox) {
    return { x: 0, y: 0 };
  }
  return {
    x: Number.isFinite(bbox.x1) ? bbox.x1 : 0,
    y: Number.isFinite(bbox.y1) ? bbox.y1 : 0,
  };
}

function getNodeWidth(node: FlowNode): number {
  const bbox = node.ui?.bbox;
  if (!bbox) return NODE_DEFAULT_WIDTH;
  const width = bbox.x2 - bbox.x1;
  if (!Number.isFinite(width) || width <= 0) {
    return NODE_DEFAULT_WIDTH;
  }
  return Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, width));
}

function getNodeHeight(node: FlowNode): number {
  const bbox = node.ui?.bbox;
  if (!bbox) return NODE_DEFAULT_HEIGHT;
  const height = bbox.y2 - bbox.y1;
  if (!Number.isFinite(height) || height <= 0) {
    return NODE_DEFAULT_HEIGHT;
  }
  return Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, height));
}
