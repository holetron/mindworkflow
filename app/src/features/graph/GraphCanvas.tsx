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
  updateEdge,
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
function getNodeDimensions(node: Node<FlowNodeCardData>): {
  width: number;
  height: number;
} {
  const rawWidth =
    (typeof node.width === 'number' && Number.isFinite(node.width) && node.width) ||
    (typeof node.style?.width === 'number' && Number.isFinite(node.style.width) && node.style.width) ||
    (typeof node.data?.node?.ui?.bbox?.x2 === 'number' &&
      typeof node.data?.node?.ui?.bbox?.x1 === 'number' &&
      node.data.node.ui.bbox.x2 - node.data.node.ui.bbox.x1) ||
    NODE_DEFAULT_WIDTH;

  const rawHeight =
    (typeof node.height === 'number' && Number.isFinite(node.height) && node.height) ||
    (typeof node.style?.height === 'number' && Number.isFinite(node.style.height) && node.style.height) ||
    (typeof node.data?.node?.ui?.bbox?.y2 === 'number' &&
      typeof node.data?.node?.ui?.bbox?.y1 === 'number' &&
      node.data.node.ui.bbox.y2 - node.data.node.ui.bbox.y1) ||
    NODE_DEFAULT_HEIGHT;

  return {
    width: Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, Math.round(rawWidth))),
    height: Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, Math.round(rawHeight))),
  };
}

interface GraphCanvasProps {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onRunNode: (nodeId: string) => void;
  onRegenerateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void | Promise<void>;
  onAddNodeFromPalette: (slug: string, position: { x: number; y: number }) => void | Promise<void>;
  onCopyNode?: (node: FlowNode, position: { x: number; y: number }) => void | Promise<void>;
  onChangeNodeMeta: (nodeId: string, patch: Record<string, unknown>) => void;
  onChangeNodeContent: (nodeId: string, content: string) => void;
  onCommitNodeContent: (nodeId: string, content: string) => Promise<void> | void;
  onChangeNodeTitle: (nodeId: string, title: string) => void;
  onChangeNodeAi: (
    nodeId: string,
    ai: Record<string, unknown>,
    options?: { replace?: boolean },
  ) => void;
  onChangeNodeUi: (nodeId: string, patch: Partial<NodeUI>) => void;
  onCreateEdge?: (edge: { from: string; to: string; sourceHandle?: string | null; targetHandle?: string | null }) => void;
  onRemoveEdges?: (edges: Array<{ from: string; to: string }>) => void;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => void | Promise<void>;
  providerOptions?: AiProviderOption[];
  loading?: boolean;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  generatingNodes?: Set<string>; // Ноды, которые сейчас генерируют ответы
  generatingEdges?: Map<string, string>; // Мапа sourceNodeId -> targetNodeId для генерирующихся связей
  readOnly?: boolean;
  // Viewport state management
  defaultViewport?: { x: number; y: number; zoom: number };
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  onMoveNodeToFolder?: (nodeId: string, folderId: string, options?: { index?: number | null }) => void | Promise<void>;
  onRemoveNodeFromFolder?: (
    nodeId: string,
    folderId?: string,
    position?: { x: number; y: number },
  ) => void | Promise<void>;
  onImportFilesToFolder?: (
    folderId: string,
    files: File[],
    position: { x: number; y: number },
  ) => void | Promise<void>;
  onSplitTextNode?: FlowNodeCardData['onSplitText'];
}

interface BuildGraphArgs {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  providerOptions: AiProviderOption[];
  loading: boolean;
  isLocked: boolean;
  readOnly: boolean;
  draggingId: string | null;
  onRunNode: GraphCanvasProps['onRunNode'];
  onRegenerateNode: GraphCanvasProps['onRegenerateNode'];
  onDeleteNode: GraphCanvasProps['onDeleteNode'];
  onChangeNodeMeta: GraphCanvasProps['onChangeNodeMeta'];
  onChangeNodeContent: GraphCanvasProps['onChangeNodeContent'];
  onCommitNodeContent: GraphCanvasProps['onCommitNodeContent'];
  onChangeNodeTitle: GraphCanvasProps['onChangeNodeTitle'];
  onChangeNodeAi: GraphCanvasProps['onChangeNodeAi'];
  onChangeNodeUi: GraphCanvasProps['onChangeNodeUi'];
  currentNodeSizes?: Map<string, { width: number; height: number }>;
  generatingNodes?: Set<string>;
  onMoveNodeToFolder?: GraphCanvasProps['onMoveNodeToFolder'];
  onRemoveNodeFromFolder?: GraphCanvasProps['onRemoveNodeFromFolder'];
  onRemoveInvalidPorts?: GraphCanvasProps['onRemoveInvalidPorts'];
  onSplitTextNode?: GraphCanvasProps['onSplitTextNode'];
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
  onCommitNodeContent,
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
  readOnly = false,
  defaultViewport,
  onViewportChange,
  onMoveNodeToFolder,
  onRemoveNodeFromFolder,
  onRemoveInvalidPorts,
  onImportFilesToFolder,
  onSplitTextNode,
}: GraphCanvasProps) {
  const reactFlow = useReactFlow<FlowNodeCardData>();
  const [nodes, setNodes] = useState<Node<FlowNodeCardData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const initialFitRef = useRef(true);
  const locked = readOnly || isLocked;
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const edgeUpdateSuccessful = useRef(true);

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
    setActiveEdgeId(null);
  }, [onSelectNode]);

  const resolveFolderDropTarget = useCallback((clientX: number, clientY: number): string | null => {
    if (typeof document === 'undefined') {
      return null;
    }
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const element of elements) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      const folderId = element.dataset.folderDropZone;
      if (folderId) {
        return folderId;
      }
    }
    return null;
  }, []);



  useEffect(() => {
    const storedIsLocked = localStorage.getItem('lc-flow-is-locked');
    if (storedIsLocked) {
      setIsLocked(JSON.parse(storedIsLocked));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lc-flow-is-locked', JSON.stringify(isLocked));
  }, [isLocked]);

  const projectSignature = useMemo(() => {
    if (!project) return 'empty';
    const nodeCount = Array.isArray(project.nodes) ? project.nodes.length : 0;
    const edgeCount = Array.isArray(project.edges) ? project.edges.length : 0;
    const signature = `${project.project_id}:${project.updated_at}:${nodeCount}:${edgeCount}`;
    return signature;
  }, [project]);

  // Restore lock state after any project change that might cause re-render
  useEffect(() => {
    const storedIsLocked = localStorage.getItem('lc-flow-is-locked');
    if (storedIsLocked) {
      const lockState = JSON.parse(storedIsLocked);
      if (lockState !== isLocked) {
        setIsLocked(lockState);
      }
    }
  }, [projectSignature]); // Only depend on projectSignature, not isLocked

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
      isLocked: locked,
      readOnly,
      draggingId: null,
      onRunNode,
      onRegenerateNode,
      onDeleteNode,
      onChangeNodeMeta,
      onChangeNodeContent,
      onCommitNodeContent,
      onChangeNodeTitle,
      onChangeNodeAi,
      onChangeNodeUi,
      currentNodeSizes, // Pass current sizes
      generatingNodes,
      onMoveNodeToFolder,
      onRemoveNodeFromFolder: onRemoveNodeFromFolder
        ? (nodeId: string, folderId: string) => onRemoveNodeFromFolder(nodeId, folderId)
        : undefined,
      onRemoveInvalidPorts,
      onSplitTextNode,
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
  }, [projectSignature, locked, readOnly, generatingNodes]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    );
    if (selectedNodeId) {
      setActiveEdgeId(null);
    }
  }, [selectedNodeId]);

  useEffect(() => {
    if (activeEdgeId && !edges.some((edge) => edge.id === activeEdgeId)) {
      setActiveEdgeId(null);
    }
  }, [activeEdgeId, edges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Let ReactFlow handle the state update for smooth interaction
      setNodes((prev) => applyNodeChanges(changes, prev));

      // We intentionally avoid persisting updates here to keep dragging smooth.
    },
    [],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const handleEdgesDelete = useCallback(
    (removed: Edge[]) => {
      if (readOnly || removed.length === 0) return;
      
      // Immediately remove edges from React Flow state to prevent visual glitches
      setEdges((prev) => {
        const filtered = prev.filter(edge => 
          !removed.some(removedEdge => 
            edge.source === removedEdge.source && edge.target === removedEdge.target
          )
        );
        return filtered;
      });

      if (activeEdgeId && removed.some((edge) => edge.id === activeEdgeId)) {
        setActiveEdgeId(null);
      }
      
      onRemoveEdges?.(removed.map((edge) => ({ from: edge.source, to: edge.target })));
    },
    [activeEdgeId, onRemoveEdges, readOnly],
  );

  const handleEdgeDoubleClick = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      if (readOnly) return;
      // Remove edge on double click
      handleEdgesDelete([edge]);
    },
    [handleEdgesDelete, readOnly],
  );

  const handleEdgeClick = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      event.stopPropagation();
      setActiveEdgeId(edge.id);
      setEdges((prev) => {
        const filtered = prev.filter((item) => item.id !== edge.id);
        return [...filtered, { ...edge }];
      });
    },
    [],
  );

  const handleEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeUpdateSuccessful.current = true;
      setEdges((prev) => updateEdge(oldEdge, newConnection, prev));
      onRemoveEdges?.([{ from: oldEdge.source, to: oldEdge.target }]);
      onCreateEdge?.({
        from: newConnection.source,
        to: newConnection.target,
        sourceHandle: newConnection.sourceHandle ?? null,
        targetHandle: newConnection.targetHandle ?? null,
      });
      setActiveEdgeId(oldEdge.id);
    },
    [onCreateEdge, onRemoveEdges],
  );

  const handleNodesDelete = useCallback(
    (removed: Node<FlowNodeCardData>[]) => {
      if (readOnly) return;
      if (removed.length === 0) return;

      // Delete nodes with small delays to avoid race conditions
      removed.forEach((node, index) => {
        setTimeout(async () => {
          try {
            await onDeleteNode(node.id);
          } catch (error) {
            console.error(`Failed to delete node ${node.id}:`, error);
          }
        }, index * 100); // 100ms delay between each deletion
      });
    },
    [onDeleteNode, readOnly],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      console.log('🔗 handleConnect called:', connection);
      
      if (readOnly) {
        console.log('❌ Connection blocked: readOnly mode');
        return;
      }
      
      if (!connection.source || !connection.target) {
        console.log('❌ Connection blocked: missing source or target', { source: connection.source, target: connection.target });
        return;
      }
      
      // Check if edge already exists in project to avoid server conflicts
      // ВАЖНО: проверяем не только from/to, но и handles (может быть несколько соединений между нодами через разные порты)
      const edgeExists = project?.edges.some(edge => 
        edge.from === connection.source && 
        edge.to === connection.target &&
        edge.sourceHandle === connection.sourceHandle &&
        edge.targetHandle === connection.targetHandle
      );
      
      if (edgeExists) {
        console.log('❌ Connection blocked: edge already exists in project', {
          from: connection.source,
          to: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle
        });
        return;
      }
      
      console.log('✅ Creating new edge:', { from: connection.source, to: connection.target });
      
      setEdges((prev) => {
        if (!connection.target || !connection.source) return prev;
        // ВАЖНО: проверяем не только source/target, но и handles
        const exists = prev.some((edge) => 
          edge.source === connection.source && 
          edge.target === connection.target &&
          edge.sourceHandle === connection.sourceHandle &&
          edge.targetHandle === connection.targetHandle
        );
        if (exists) {
          console.log('❌ Edge already exists in local state');
          return prev;
        }
        const newEdge: Edge = {
          id: `${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle || undefined,
          targetHandle: connection.targetHandle || undefined,
          type: 'smart',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
        };
        console.log('✅ Adding edge to local state:', newEdge);
        return addEdge(newEdge, prev);
      });
      
      console.log('📤 Calling onCreateEdge');
      onCreateEdge?.({ 
        from: connection.source, 
        to: connection.target,
        sourceHandle: connection.sourceHandle || null,
        targetHandle: connection.targetHandle || null
      });
    },
    [onCreateEdge, project?.edges, readOnly],
  );

  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: Node<FlowNodeCardData>) => {
      onSelectNode(node.id);
      setActiveEdgeId(null);
    },
    [onSelectNode],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
    setActiveEdgeId(null);
  }, [onSelectNode]);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node<FlowNodeCardData>[]; edges: Edge[] }) => {
      if (selected.length > 0) {
        onSelectNode(selected[0].id);
      } else {
        onSelectNode(null);
        setActiveEdgeId(null);
      }
    },
    [onSelectNode],
  );

  const handleNodeDragStart = useCallback(() => {
    // React Flow manages dragging state internally; we only persist on drag stop.
  }, []);

  const handleNodeDragStop = useCallback(
    async (event: ReactMouseEvent, node: Node<FlowNodeCardData>) => {
      const { width, height } = getNodeDimensions(node);
      const x1 = Math.round(node.position.x);
      const y1 = Math.round(node.position.y);

      onChangeNodeUi(node.id, {
        bbox: {
          x1,
          y1,
          x2: x1 + width,
          y2: y1 + height,
        },
      });

      if (!onMoveNodeToFolder) {
        return;
      }

      const dropFolderId = resolveFolderDropTarget(event.clientX, event.clientY);
      if (dropFolderId && dropFolderId !== node.id) {
        try {
          await onMoveNodeToFolder(node.id, dropFolderId);
        } catch (error) {
          console.error('[GraphCanvas] Failed to move node into folder:', error);
        }
      }
    },
    [onChangeNodeUi, onMoveNodeToFolder, resolveFolderDropTarget],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    const dataTransfer = event.dataTransfer;
    const hasFiles = dataTransfer.files && dataTransfer.files.length > 0;
    const dropFolderId = resolveFolderDropTarget(event.clientX, event.clientY);
    
    // Always allow drop for palette items and node copies
    const hasNodeData = dataTransfer.types.includes('application/reactflow-node-copy');
    const hasSlugData = dataTransfer.types.includes('application/reactflow-node');
    const hasFolderData = dataTransfer.types.includes('application/mwf-folder-node');
    
    if (readOnly) {
      dataTransfer.dropEffect = 'none';
      return;
    }

    if (hasFiles) {
      dataTransfer.dropEffect = dropFolderId ? 'copy' : 'none';
      return;
    }

    if (hasFolderData) {
      dataTransfer.dropEffect = 'move';
    } else if (hasNodeData || hasSlugData) {
      dataTransfer.dropEffect = 'copy';
    } else {
      // Still allow drop for unknown data types (palette/internal nodes)
      dataTransfer.dropEffect = dropFolderId ? 'copy' : 'copy';
    }
  }, [readOnly, resolveFolderDropTarget]);

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Проверяем, это drag from palette или copy from sidebar
      const slug = event.dataTransfer.getData('application/reactflow-node');
      const nodeCopyData = event.dataTransfer.getData('application/reactflow-node-copy');
      const folderNodeData = event.dataTransfer.getData('application/mwf-folder-node');
      const dropFolderId = resolveFolderDropTarget(event.clientX, event.clientY);
      const droppedFiles = Array.from(event.dataTransfer.files ?? []);

      if (folderNodeData) {
        try {
          const payload = JSON.parse(folderNodeData) as { node_id: string; folder_id?: string };
          if (payload?.node_id) {
            await onRemoveNodeFromFolder?.(
              payload.node_id,
              payload.folder_id,
              { x: Math.round(position.x), y: Math.round(position.y) },
            );
          }
        } catch (error) {
          console.error('[GraphCanvas] Failed to drop folder node onto canvas:', error);
        }
        return;
      }

      if (droppedFiles.length > 0 && dropFolderId && onImportFilesToFolder) {
        try {
          await onImportFilesToFolder(dropFolderId, droppedFiles, {
            x: Math.round(position.x),
            y: Math.round(position.y),
          });
        } catch (error) {
          console.error('[GraphCanvas] Failed to import files into folder:', error);
        }
        return;
      }
      
      if (slug && slug.trim()) {
        // Drag from palette - создаем новую ноду
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
          if (onCopyNode) {
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
      }
    },
    [onAddNodeFromPalette, onCopyNode, onImportFilesToFolder, onRemoveNodeFromFolder, reactFlow, readOnly, resolveFolderDropTarget],
  );

  return (
    <div 
      className={`relative h-full ${activeEdgeId ? 'flow-edge-active' : ''}`} 
      style={{ width: '100vw', height: '100vh' }}
      onDrop={handleDrop} 
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onEdgeClick={handleEdgeClick}
        onEdgeUpdate={handleEdgeUpdate}
        onEdgeUpdateStart={handleEdgeUpdateStart}
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
        nodesDraggable={!locked}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={readOnly ? [] : ['Delete']}
        minZoom={0.3}
        maxZoom={2}
        snapToGrid={!locked}
        snapGrid={SNAP_GRID}
        nodesConnectable={!readOnly}
        connectionLineComponent={SmartConnectionLine}
        defaultEdgeOptions={{ type: 'smart', markerEnd: { type: MarkerType.ArrowClosed } }}
        edgesUpdatable={!readOnly}
        edgeUpdaterRadius={18}
        proOptions={{ hideAttribution: true }}
        className="bg-slate-900"
        defaultViewport={defaultViewport || { x: 0, y: 0, zoom: 1 }}
        onMoveEnd={(_, viewport) => {
          if (onViewportChange) {
            onViewportChange(viewport);
          }
        }}
      >
        <Background color="#1e293b" gap={20} />
        <Controls 
          showFitView={false}
          showZoom={false}
          showInteractive={false}
          position="bottom-left"
          className="!gap-1"
          style={{
            left: sidebarCollapsed ? '96px' : `${sidebarWidth + 120}px`,
            bottom: '14px',
            display: 'flex',
            flexDirection: 'row',
            gap: '3px',
          }}
        >
          {/* Custom Fit View Button */}
          <ControlButton
            onClick={() => reactFlow.fitView({ padding: 0.2, duration: 220 })}
            title="Уместить все ноды в видимую область"
            className="!bg-slate-800/90 !backdrop-blur-sm !border !border-slate-600/50 !text-slate-200 !text-xs !h-6 !w-6 !min-h-6 !min-w-6 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500 !transition-all !duration-200 !shadow-md hover:!shadow-lg !rounded-md"
          >
            📐
          </ControlButton>
          
          {/* Custom Zoom In Button */}
          <ControlButton
            onClick={() => reactFlow.zoomIn({ duration: 200 })}
            title="Увеличить масштаб"
            className="!bg-slate-800/90 !backdrop-blur-sm !border !border-slate-600/50 !text-slate-200 !text-xs !h-6 !w-6 !min-h-6 !min-w-6 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500 !transition-all !duration-200 !shadow-md hover:!shadow-lg !rounded-md"
          >
            ➕
          </ControlButton>
          
          {/* Custom Zoom Out Button */}
          <ControlButton
            onClick={() => reactFlow.zoomOut({ duration: 200 })}
            title="Уменьшить масштаб"
            className="!bg-slate-800/90 !backdrop-blur-sm !border !border-slate-600/50 !text-slate-200 !text-xs !h-6 !w-6 !min-h-6 !min-w-6 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500 !transition-all !duration-200 !shadow-md hover:!shadow-lg !rounded-md"
          >
            ➖
          </ControlButton>
          
          {/* Lock/Unlock Button */}
          <ControlButton
            onClick={() => {
              if (readOnly) return;
              const newLockState = !isLocked;
              setIsLocked(newLockState);
            }}
            title={locked ? 'Разблокировать узлы' : 'Заблокировать узлы'}
            className={`${locked ? '!bg-orange-500/20 !border-orange-400/50 !text-orange-200 hover:!bg-orange-500/30' : '!bg-slate-800/90 !border-slate-600/50 !text-slate-200 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500'} !backdrop-blur-sm !text-xs !h-6 !w-6 !min-h-6 !min-w-6 !transition-all !duration-200 !shadow-md hover:!shadow-lg !rounded-md !border ${readOnly ? '!opacity-50 cursor-not-allowed' : ''}`}
            style={readOnly ? { pointerEvents: 'none' } : undefined}
          >
            {locked ? '🔒' : '🔓'}
          </ControlButton>
          
          {/* MiniMap Toggle Button */}
          <ControlButton
            onClick={() => setShowMiniMap(!showMiniMap)}
            title={showMiniMap ? 'Скрыть обзор' : 'Показать обзор рабочего процесса'}
            className={`${showMiniMap ? '!bg-emerald-500/20 !border-emerald-400/50 !text-emerald-200 hover:!bg-emerald-500/30' : '!bg-slate-800/90 !border-slate-600/50 !text-slate-200 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500'} !backdrop-blur-sm !text-xs !h-6 !w-6 !min-h-6 !min-w-6 !transition-all !duration-200 !shadow-md hover:!shadow-lg !rounded-md !border`}
          >
            🗺️
          </ControlButton>
        </Controls>
        {showMiniMap && (
          <MiniMap 
            position="bottom-left"
            className="!w-48 !h-32 !bg-slate-900/90 !backdrop-blur-sm !border !border-slate-600/50 !rounded-md !shadow-lg"
            style={{
              left: sidebarCollapsed ? '340px' : `${sidebarWidth + 360}px`,
              bottom: '20px',
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
      {(!project || !Array.isArray(project.nodes) || project.nodes.length === 0) && !loading && (
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
  readOnly,
  onRunNode,
  onRegenerateNode,
  onDeleteNode,
  onChangeNodeMeta,
  onChangeNodeContent,
  onCommitNodeContent,
  onChangeNodeTitle,
  onChangeNodeAi,
  onChangeNodeUi,
  currentNodeSizes,
  generatingNodes = new Set(),
  onRemoveNodeFromFolder,
  onRemoveInvalidPorts,
  onSplitTextNode,
}: BuildGraphArgs): GraphElements {
  if (!project) {
    return { nodes: [], edges: [] };
  }

  const projectNodes = Array.isArray(project.nodes) ? project.nodes : [];
  const projectEdges = Array.isArray(project.edges) ? project.edges : [];
  
  // Собираем все node_id которые находятся внутри папок
  const nodesInFolders = new Set<string>();
  projectNodes.forEach(node => {
    if (node.type === 'folder') {
      const meta = (node.meta ?? {}) as Record<string, unknown>;
      const folderChildren = meta.folder_children;
      if (Array.isArray(folderChildren)) {
        folderChildren.forEach(childId => {
          if (typeof childId === 'string') {
            nodesInFolders.add(childId);
          }
        });
      }
    }
  });
  
  // Фильтруем ноды - показываем только те, которые НЕ в папках
  const visibleNodes = projectNodes.filter((node) => {
    // Если нода в folder_children какой-то папки - не показываем на canvas
    return !nodesInFolders.has(node.node_id);
  });

  // Создаем Set видимых node_id для быстрой проверки
  const visibleNodeIds = new Set(visibleNodes.map(n => n.node_id));

  const nodes: Node<FlowNodeCardData>[] = visibleNodes.map((node) => {
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
      onCommitContent: onCommitNodeContent,
      onChangeTitle: onChangeNodeTitle,
      onChangeAi: onChangeNodeAi,
      onChangeUi: onChangeNodeUi,
      providers: providerOptions,
      sources: projectEdges
        .filter((edge) => edge.to === node.node_id)
        .map((edge) => projectNodes.find((item) => item.node_id === edge.from))
        .filter((edgeNode): edgeNode is FlowNode => Boolean(edgeNode))
        .map((sourceNode) => ({
          node_id: sourceNode.node_id,
          title: sourceNode.title,
          type: sourceNode.type,
        })),
      targets: projectEdges
        .filter((edge) => edge.from === node.node_id)
        .map((edge) => projectNodes.find((item) => item.node_id === edge.to))
        .filter((edgeNode): edgeNode is FlowNode => Boolean(edgeNode))
        .map((targetNode) => ({
          node_id: targetNode.node_id,
          title: targetNode.title,
          type: targetNode.type,
        })),
      disabled: loading || readOnly || Boolean(generatingNodes?.has(node.node_id)),
      isGenerating: Boolean(generatingNodes?.has(node.node_id)),
      allNodes: projectNodes,
      onRemoveNodeFromFolder,
      onRemoveInvalidPorts,
      onSplitText: onSplitTextNode,
    };

    return {
      id: node.node_id,
      type: 'flowNode',
      position,
      data,
      draggable: !loading && !isLocked && !readOnly && !generatingNodes?.has(node.node_id),
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

  // Фильтруем edges - показываем только те, у которых оба конца видимы (не в папках)
  const visibleEdges = projectEdges.filter(edge => 
    visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
  );

  const edges: Edge[] = visibleEdges.map((edge, index) => {
    // Find the source node to get its color
    const sourceNode = projectNodes.find(node => node.node_id === edge.from);
    const sourceColor = sourceNode?.ui?.color ?? NODE_DEFAULT_COLOR;
    
    return {
      id: `${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      sourceHandle: edge.sourceHandle || undefined,
      targetHandle: edge.targetHandle || undefined,
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
