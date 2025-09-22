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
  MarkerType,
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
import type { ProjectFlow, FlowNode, NodeUI } from '../../state/api';
import FlowNodeCard, {
  NODE_DIMENSIONS,
  type AiProviderOption,
  type FlowNodeCardData,
} from '../nodes/FlowNodeCard';
import {
  NODE_DEFAULT_COLOR,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  NODE_MAX_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MIN_WIDTH,
} from '../../constants/nodeDefaults';
import { SmartBezierEdge, SmartConnectionLine } from './EdgeRenderer';

const nodeTypes = { flowNode: FlowNodeCard };
const edgeTypes = { smart: SmartBezierEdge };
const SNAP_GRID: [number, number] = [16, 16];

interface GraphCanvasProps {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onRunNode: (nodeId: string) => void;
  onRegenerateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddNodeFromPalette: (slug: string, position: { x: number; y: number }) => void | Promise<void>;
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
}

interface BuildGraphArgs {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  providerOptions: AiProviderOption[];
  loading: boolean;
  draggingId: string | null;
  onRunNode: GraphCanvasProps['onRunNode'];
  onRegenerateNode: GraphCanvasProps['onRegenerateNode'];
  onDeleteNode: GraphCanvasProps['onDeleteNode'];
  onChangeNodeMeta: GraphCanvasProps['onChangeNodeMeta'];
  onChangeNodeContent: GraphCanvasProps['onChangeNodeContent'];
  onChangeNodeTitle: GraphCanvasProps['onChangeNodeTitle'];
  onChangeNodeAi: GraphCanvasProps['onChangeNodeAi'];
  onChangeNodeUi: GraphCanvasProps['onChangeNodeUi'];
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
  onChangeNodeMeta,
  onChangeNodeContent,
  onChangeNodeTitle,
  onChangeNodeAi,
  onChangeNodeUi,
  onCreateEdge,
  onRemoveEdges,
  providerOptions = [],
  loading = false,
}: GraphCanvasProps) {
  const reactFlow = useReactFlow<FlowNodeCardData>();
  const [nodes, setNodes] = useState<Node<FlowNodeCardData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const initialFitRef = useRef(true);

  const projectSignature = useMemo(() => {
    if (!project) return 'empty';
    return `${project.project_id}:${project.updated_at}:${project.nodes.length}:${project.edges.length}`;
  }, [project]);

  useEffect(() => {
    if (!project) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const next = buildGraphElements({
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
          const width = Math.max(
            NODE_MIN_WIDTH,
            Math.min(NODE_MAX_WIDTH, Math.round(change.dimensions.width ?? NODE_DEFAULT_WIDTH)),
          );
          const height = Math.max(
            NODE_MIN_HEIGHT,
            Math.min(NODE_MAX_HEIGHT, Math.round(change.dimensions.height ?? NODE_DEFAULT_HEIGHT)),
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
      setEdges((prev) => {
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
    [onCreateEdge],
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
      const width = Math.max(NODE_MIN_WIDTH, node.measured?.width ?? NODE_DEFAULT_WIDTH);
      const height = Math.max(NODE_MIN_HEIGHT, node.measured?.height ?? NODE_DEFAULT_HEIGHT);
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
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const slug = event.dataTransfer.getData('application/reactflow-node');
      if (!slug) return;
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      void onAddNodeFromPalette(slug, {
        x: Math.round(position.x),
        y: Math.round(position.y),
      });
    },
    [onAddNodeFromPalette, reactFlow],
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
        nodeDragHandle=".flow-node__drag-handle"
        selectionOnDrag
        panOnScroll
        panOnDrag
        zoomAnimation
        zoomOnDoubleClick={false}
        nodesDraggable={!isLocked}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={['Delete']}
        minZoom={0.3}
        maxZoom={2}
        connectionLineComponent={SmartConnectionLine}
        defaultEdgeOptions={{ type: 'smart', markerEnd: { type: MarkerType.ArrowClosed } }}
        proOptions={{ hideAttribution: true }}
        className="bg-slate-900"
      >
        <Background color="#1e293b" gap={24} />
        <Controls position="bottom-right" showInteractive={false}>
          <ControlButton onClick={() => setIsLocked((prev) => !prev)} title={isLocked ? 'Unlock' : 'Lock'}>
            {isLocked ? '🔒' : '🔓'}
          </ControlButton>
        </Controls>
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
}: BuildGraphArgs): GraphElements {
  if (!project) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node<FlowNodeCardData>[] = project.nodes.map((node) => {
    const position = getStoredPosition(node);
    const width = getNodeWidth(node);
    const height = getNodeHeight(node);

    const data: FlowNodeCardData = {
      node,
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
        minWidth: NODE_DIMENSIONS.minWidth,
        minHeight: NODE_DIMENSIONS.minHeight,
        maxWidth: NODE_DIMENSIONS.maxWidth,
        maxHeight: NODE_DIMENSIONS.maxHeight,
        border: `1px solid ${node.ui?.color ?? NODE_DEFAULT_COLOR}`,
        backgroundColor: '#1e293b',
      },
    } satisfies Node<FlowNodeCardData>;
  });

  const edges: Edge[] = project.edges.map((edge, index) => ({
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: 'smart',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
  }));

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
