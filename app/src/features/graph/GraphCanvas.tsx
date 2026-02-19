import {
  useCallback, useEffect, useMemo, useRef, useState,
  type DragEvent, type MouseEvent as ReactMouseEvent,
} from 'react';
import ReactFlow, {
  Background, MarkerType, ReactFlowProvider,
  addEdge, updateEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, useReactFlow,
} from 'reactflow';
import LoadingIndicator from './LoadingIndicator';
import type { ProjectFlow, FlowNode, NodeUI } from '../../state/api';
import FlowNodeCard, { type AiProviderOption, type FlowNodeCardData } from '../nodes/FlowNodeCard';
import { NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT } from '../../constants/nodeDefaults';
import { SmartBezierEdge, SmartConnectionLine } from './EdgeRenderer';
import { buildGraphElements, getNodeDimensions, type BuildGraphArgs } from './components/graphBuilder';
import { GraphCanvasControls } from './components/GraphCanvasControls';

const nodeTypes = { flowNode: FlowNodeCard };
const edgeTypes = { smart: SmartBezierEdge };
const SNAP_GRID: [number, number] = [20, 20];

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
  onChangeNodeAi: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onChangeNodeUi: (nodeId: string, patch: Partial<NodeUI>) => void;
  onCreateEdge?: (edge: { from: string; to: string; sourceHandle?: string | null; targetHandle?: string | null }) => void;
  onRemoveEdges?: (edges: Array<{ from: string; to: string }>) => void;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => void | Promise<void>;
  providerOptions?: AiProviderOption[];
  loading?: boolean;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  generatingNodes?: Set<string>;
  generatingEdges?: Map<string, string>;
  readOnly?: boolean;
  defaultViewport?: { x: number; y: number; zoom: number };
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  onMoveNodeToFolder?: (nodeId: string, folderId: string, options?: { index?: number | null }) => void | Promise<void>;
  onRemoveNodeFromFolder?: (nodeId: string, folderId?: string, position?: { x: number; y: number }) => void | Promise<void>;
  onImportFilesToFolder?: (folderId: string, files: File[], position: { x: number; y: number }) => void | Promise<void>;
  onSplitTextNode?: FlowNodeCardData['onSplitText'];
}

function GraphCanvasInner({
  project, selectedNodeId, onSelectNode, onRunNode, onRegenerateNode, onDeleteNode,
  onAddNodeFromPalette, onCopyNode, onChangeNodeMeta, onChangeNodeContent,
  onCommitNodeContent, onChangeNodeTitle, onChangeNodeAi, onChangeNodeUi,
  onCreateEdge, onRemoveEdges, providerOptions = [], loading = false,
  sidebarCollapsed = false, sidebarWidth = 300, generatingNodes = new Set(),
  generatingEdges = new Map(), readOnly = false, defaultViewport, onViewportChange,
  onMoveNodeToFolder, onRemoveNodeFromFolder, onRemoveInvalidPorts,
  onImportFilesToFolder, onSplitTextNode,
}: GraphCanvasProps) {
  const reactFlow = useReactFlow<FlowNodeCardData>();
  const [nodes, setNodes] = useState<Node<FlowNodeCardData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const initialFitRef = useRef(true);
  const locked = readOnly || isLocked;
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const edgeUpdateSuccessful = useRef(true);

  const clearSelection = useCallback(() => {
    onSelectNode(null);
    setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
    setActiveEdgeId(null);
  }, [onSelectNode]);

  const resolveFolderDropTarget = useCallback((clientX: number, clientY: number): string | null => {
    if (typeof document === 'undefined') return null;
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const folderId = el.dataset.folderDropZone;
      if (folderId) return folderId;
    }
    return null;
  }, []);

  // Lock state persistence
  useEffect(() => { const s = localStorage.getItem('lc-flow-is-locked'); if (s) setIsLocked(JSON.parse(s)); }, []);
  useEffect(() => { localStorage.setItem('lc-flow-is-locked', JSON.stringify(isLocked)); }, [isLocked]);

  const projectSignature = useMemo(() => {
    if (!project) return 'empty';
    const nc = Array.isArray(project.nodes) ? project.nodes.length : 0;
    const ec = Array.isArray(project.edges) ? project.edges.length : 0;
    return `${project.project_id}:${project.updated_at}:${nc}:${ec}`;
  }, [project]);

  useEffect(() => {
    const s = localStorage.getItem('lc-flow-is-locked');
    if (s) { const v = JSON.parse(s); if (v !== isLocked) setIsLocked(v); }
  }, [projectSignature]);

  useEffect(() => {
    if (!project) { setNodes([]); setEdges([]); return; }
    const currentNodeSizes = new Map<string, { width: number; height: number }>();
    nodes.forEach((n) => {
      if (n.style?.width && n.style?.height) {
        currentNodeSizes.set(n.id, {
          width: typeof n.style.width === 'number' ? n.style.width : parseInt(String(n.style.width)) || NODE_DEFAULT_WIDTH,
          height: typeof n.style.height === 'number' ? n.style.height : parseInt(String(n.style.height)) || NODE_DEFAULT_HEIGHT,
        });
      }
    });
    const next = buildGraphElements({
      project, selectedNodeId, providerOptions, loading, isLocked: locked, readOnly,
      draggingId: null, onRunNode, onRegenerateNode, onDeleteNode, onChangeNodeMeta,
      onChangeNodeContent, onCommitNodeContent, onChangeNodeTitle, onChangeNodeAi, onChangeNodeUi,
      currentNodeSizes, generatingNodes,
      onMoveNodeToFolder,
      onRemoveNodeFromFolder: onRemoveNodeFromFolder ? (nodeId: string, folderId: string) => onRemoveNodeFromFolder(nodeId, folderId) : undefined,
      onRemoveInvalidPorts, onSplitTextNode,
    });
    setNodes(next.nodes); setEdges(next.edges);
    if (initialFitRef.current && next.nodes.length > 0) {
      initialFitRef.current = false;
      requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 220 }));
    }
  }, [projectSignature, locked, readOnly, generatingNodes]);

  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === selectedNodeId })));
    if (selectedNodeId) setActiveEdgeId(null);
  }, [selectedNodeId]);

  useEffect(() => {
    if (activeEdgeId && !edges.some((e) => e.id === activeEdgeId)) setActiveEdgeId(null);
  }, [activeEdgeId, edges]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const handleEdgesDelete = useCallback((removed: Edge[]) => {
    if (readOnly || removed.length === 0) return;
    setEdges((prev) => prev.filter((e) => !removed.some((r) => e.source === r.source && e.target === r.target)));
    if (activeEdgeId && removed.some((e) => e.id === activeEdgeId)) setActiveEdgeId(null);
    onRemoveEdges?.(removed.map((e) => ({ from: e.source, to: e.target })));
  }, [activeEdgeId, onRemoveEdges, readOnly]);

  const handleEdgeDoubleClick = useCallback((_: ReactMouseEvent, edge: Edge) => {
    if (!readOnly) handleEdgesDelete([edge]);
  }, [handleEdgesDelete, readOnly]);

  const handleEdgeClick = useCallback((_: ReactMouseEvent, edge: Edge) => {
    setActiveEdgeId(edge.id);
    setEdges((prev) => [...prev.filter((e) => e.id !== edge.id), { ...edge }]);
  }, []);

  const handleEdgeUpdateStart = useCallback(() => { edgeUpdateSuccessful.current = false; }, []);

  const handleEdgeUpdate = useCallback((oldEdge: Edge, newConn: Connection) => {
    edgeUpdateSuccessful.current = true;
    setEdges((prev) => updateEdge(oldEdge, newConn, prev));
    onRemoveEdges?.([{ from: oldEdge.source, to: oldEdge.target }]);
    onCreateEdge?.({ from: newConn.source, to: newConn.target, sourceHandle: newConn.sourceHandle ?? null, targetHandle: newConn.targetHandle ?? null });
    setActiveEdgeId(oldEdge.id);
  }, [onCreateEdge, onRemoveEdges]);

  const handleNodesDelete = useCallback((removed: Node<FlowNodeCardData>[]) => {
    if (readOnly || removed.length === 0) return;
    removed.forEach((node, i) => {
      setTimeout(async () => { try { await onDeleteNode(node.id); } catch (err) { console.error(`Failed to delete node ${node.id}:`, err); } }, i * 100);
    });
  }, [onDeleteNode, readOnly]);

  const handleConnect = useCallback((connection: Connection) => {
    if (readOnly || !connection.source || !connection.target) return;
    const edgeExists = project?.edges.some((e) => e.from === connection.source && e.to === connection.target && e.sourceHandle === connection.sourceHandle && e.targetHandle === connection.targetHandle);
    if (edgeExists) return;
    setEdges((prev) => {
      if (!connection.target || !connection.source) return prev;
      const exists = prev.some((e) => e.source === connection.source && e.target === connection.target && e.sourceHandle === connection.sourceHandle && e.targetHandle === connection.targetHandle);
      if (exists) return prev;
      const newEdge: Edge = {
        id: `${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source, target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        type: 'smart', markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
      };
      return addEdge(newEdge, prev);
    });
    onCreateEdge?.({ from: connection.source, to: connection.target, sourceHandle: connection.sourceHandle || null, targetHandle: connection.targetHandle || null });
  }, [onCreateEdge, project?.edges, readOnly]);

  const handleNodeClick = useCallback((_: ReactMouseEvent, node: Node<FlowNodeCardData>) => { onSelectNode(node.id); setActiveEdgeId(null); }, [onSelectNode]);
  const handlePaneClick = useCallback(() => { onSelectNode(null); setActiveEdgeId(null); }, [onSelectNode]);
  const handleSelectionChange = useCallback(({ nodes: sel }: { nodes: Node<FlowNodeCardData>[]; edges: Edge[] }) => {
    sel.length > 0 ? onSelectNode(sel[0].id) : (onSelectNode(null), setActiveEdgeId(null));
  }, [onSelectNode]);
  const handleNodeDragStart = useCallback(() => {}, []);

  const handleNodeDragStop = useCallback(async (event: ReactMouseEvent, node: Node<FlowNodeCardData>) => {
    const { width, height } = getNodeDimensions(node);
    const x1 = Math.round(node.position.x), y1 = Math.round(node.position.y);
    onChangeNodeUi(node.id, { bbox: { x1, y1, x2: x1 + width, y2: y1 + height } });
    if (!onMoveNodeToFolder) return;
    const dropFolderId = resolveFolderDropTarget(event.clientX, event.clientY);
    if (dropFolderId && dropFolderId !== node.id) {
      try { await onMoveNodeToFolder(node.id, dropFolderId); } catch (err) { console.error('[GraphCanvas] Failed to move node into folder:', err); }
    }
  }, [onChangeNodeUi, onMoveNodeToFolder, resolveFolderDropTarget]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    const dt = event.dataTransfer;
    if (readOnly) { dt.dropEffect = 'none'; return; }
    const hasFiles = dt.files && dt.files.length > 0;
    const dropFolderId = resolveFolderDropTarget(event.clientX, event.clientY);
    if (hasFiles) { dt.dropEffect = dropFolderId ? 'copy' : 'none'; return; }
    if (dt.types.includes('application/mwf-folder-node')) dt.dropEffect = 'move';
    else dt.dropEffect = 'copy';
  }, [readOnly, resolveFolderDropTarget]);

  const handleDrop = useCallback(async (event: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    event.preventDefault(); event.stopPropagation();
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const slug = event.dataTransfer.getData('application/reactflow-node');
    const nodeCopyData = event.dataTransfer.getData('application/reactflow-node-copy');
    const folderNodeData = event.dataTransfer.getData('application/mwf-folder-node');
    const dropFolderId = resolveFolderDropTarget(event.clientX, event.clientY);
    const droppedFiles = Array.from(event.dataTransfer.files ?? []);

    if (folderNodeData) {
      try {
        const payload = JSON.parse(folderNodeData) as { node_id: string; folder_id?: string };
        if (payload?.node_id) await onRemoveNodeFromFolder?.(payload.node_id, payload.folder_id, { x: Math.round(position.x), y: Math.round(position.y) });
      } catch (err) { console.error('[GraphCanvas] Failed to drop folder node onto canvas:', err); }
      return;
    }
    if (droppedFiles.length > 0 && dropFolderId && onImportFilesToFolder) {
      try { await onImportFilesToFolder(dropFolderId, droppedFiles, { x: Math.round(position.x), y: Math.round(position.y) }); } catch (err) { console.error('[GraphCanvas] Failed to import files into folder:', err); }
      return;
    }
    if (slug?.trim()) {
      try { void onAddNodeFromPalette(slug, { x: Math.round(position.x), y: Math.round(position.y) }); } catch (err) { console.error('Error creating node from palette:', err); }
    } else if (nodeCopyData?.trim()) {
      try { const nd = JSON.parse(nodeCopyData); if (onCopyNode) onCopyNode(nd, { x: Math.round(position.x), y: Math.round(position.y) }); } catch (err) { console.error('Failed to parse node copy data:', err); }
    }
  }, [onAddNodeFromPalette, onCopyNode, onImportFilesToFolder, onRemoveNodeFromFolder, reactFlow, readOnly, resolveFolderDropTarget]);

  return (
    <div className={`relative h-full ${activeEdgeId ? 'flow-edge-active' : ''}`} style={{ width: '100vw', height: '100vh' }}
      onDrop={handleDrop} onDragOver={handleDragOver}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
        onNodesDelete={handleNodesDelete} onEdgesDelete={handleEdgesDelete}
        onEdgeDoubleClick={handleEdgeDoubleClick} onEdgeClick={handleEdgeClick}
        onEdgeUpdate={handleEdgeUpdate} onEdgeUpdateStart={handleEdgeUpdateStart}
        onConnect={handleConnect} onNodeClick={handleNodeClick} onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange} onNodeDragStart={handleNodeDragStart} onNodeDragStop={handleNodeDragStop}
        panOnScroll={false} panOnDrag zoomOnScroll zoomOnPinch zoomOnDoubleClick={false}
        nodesDraggable={!locked} multiSelectionKeyCode="Shift" deleteKeyCode={readOnly ? [] : ['Delete']}
        minZoom={0.3} maxZoom={2} snapToGrid={!locked} snapGrid={SNAP_GRID} nodesConnectable={!readOnly}
        connectionLineComponent={SmartConnectionLine}
        defaultEdgeOptions={{ type: 'smart', markerEnd: { type: MarkerType.ArrowClosed } }}
        edgesUpdatable={!readOnly} edgeUpdaterRadius={18} proOptions={{ hideAttribution: true }}
        className="bg-slate-900" defaultViewport={defaultViewport || { x: 0, y: 0, zoom: 1 }}
        onMoveEnd={(_, viewport) => onViewportChange?.(viewport)}>
        <Background color="#1e293b" gap={20} />
        <GraphCanvasControls reactFlow={reactFlow} isLocked={isLocked} locked={locked} readOnly={readOnly}
          showMiniMap={showMiniMap} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth}
          onToggleLock={() => { if (!readOnly) setIsLocked((p) => !p); }}
          onToggleMiniMap={() => setShowMiniMap((p) => !p)} />
      </ReactFlow>
      {(!project || !Array.isArray(project.nodes) || project.nodes.length === 0) && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400">
          <p className="rounded-lg bg-slate-900/80 px-5 py-3 text-sm shadow">Drag a node from the store to get started</p>
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-slate-900/70 px-4 py-2 text-sm text-slate-200 shadow">Operation in progress...</div>
        </div>
      )}
    </div>
  );
}

export default function GraphCanvas(props: GraphCanvasProps) {
  return <ReactFlowProvider><GraphCanvasInner {...props} /></ReactFlowProvider>;
}
