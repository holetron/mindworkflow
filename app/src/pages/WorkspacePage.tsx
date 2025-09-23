import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GraphCanvas from '../features/graph/GraphCanvas';
import NodeSidebar from '../features/workspace/NodeSidebar';
import NodePalette from '../features/workspace/NodePalette';
import TokenDisplay from '../ui/TokenDisplay';
import { NODE_PALETTE } from '../data/nodePalette';
import { DEFAULT_STICKY_NOTE } from '../data/stickyNoteDefault';
import {
  fetchProject,
  fetchNodeLogs,
  runNode,
  rerunNode,
  deleteProject,
  updateNode,
  createEdge,
  deleteEdge,
  createNode,
  syncProjectDrive,
  type RunLog,
  type NodeUpdatePayload,
  type EdgeListResponse,
  type CreateNodePayload,
  type NodeUI,
} from '../state/api';
import {
  useProjectStore,
  selectNodeById,
  findPreviousNodes,
  findNextNodes,
  type NodeTemplate,
} from '../state/store';
import { AI_PROVIDER_PRESETS } from '../data/aiProviders';
import type { AiProviderOption } from '../features/nodes/FlowNodeCard';
import type { IntegrationFieldConfig } from '../state/api';
import {
  DEFAULT_NODE_BBOX,
  NODE_DEFAULT_COLOR,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
} from '../constants/nodeDefaults';

interface ValidationIdle {
  status: 'idle';
}

interface ValidationSuccess {
  status: 'success';
  message: string;
}

interface ValidationError {
  status: 'error';
  message: string;
}

type ValidationState = ValidationIdle | ValidationSuccess | ValidationError;

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 400;
const PALETTE_MIN_WIDTH = 220;
const PALETTE_MAX_WIDTH = 420;

function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    project,
    setProject,
    clearProject,
    loading,
    setLoading,
    error,
    setError,
    selectedNodeId,
    selectNode,
    runs,
    setRuns,
    upsertNodeContent,
    addNodeFromServer,
    removeNode,
    setEdges,
  } = useProjectStore();

  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [paletteWidth, setPaletteWidth] = useState(280);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const pendingUiRef = useRef<Map<string, NodeUI>>(new Map());
  const pendingUiTimersRef = useRef<Map<string, number>>(new Map());

  // Предупреждение о несохраненных изменениях при закрытии страницы
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'У вас есть несохраненные изменения. Вы уверены, что хотите покинуть страницу?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const selectedNode = useMemo(() => selectNodeById(project, selectedNodeId), [project, selectedNodeId]);
  const previousNodes = useMemo(
    () => (selectedNode ? findPreviousNodes(project, selectedNode.node_id) : []),
    [project, selectedNode],
  );

  const nextNodes = useMemo(
    () => (selectedNode ? findNextNodes(project, selectedNode.node_id) : []),
    [project, selectedNode],
  );

  const paletteMap = useMemo(() => {
    const map = new Map<string, NodeTemplate>();
    NODE_PALETTE.forEach((item) => {
      const template =
        item.slug === 'text'
          ? {
              ...item.template,
              content:
                item.template.content && item.template.content.length > 0
                  ? item.template.content
                  : DEFAULT_STICKY_NOTE,
              content_type: 'text/markdown',
            }
          : item.template;
      map.set(item.slug, template);
    });
    return map;
  }, []);

  const providerOptions = useMemo<AiProviderOption[]>(() => {
    const integrations =
      project && project.settings && typeof project.settings === 'object'
        ? ((project.settings as { integrations?: Record<string, unknown> }).integrations ?? {})
        : {};

    return AI_PROVIDER_PRESETS.map((preset) => {
      const integrationKey = preset.integrationKey ?? preset.id;
      const integration =
        integrations && typeof integrations === 'object'
          ? (integrations as Record<string, unknown>)[integrationKey]
          : undefined;
      const integrationConfig =
        integration && typeof integration === 'object'
          ? (integration as Record<string, unknown>)
          : undefined;
      const apiKey =
        integrationConfig && typeof integrationConfig['api_key'] === 'string'
          ? String(integrationConfig['api_key']).trim()
          : '';
      const available = preset.integrationKey === null ? true : apiKey.length > 0;

      const option: AiProviderOption = {
        id: preset.id,
        name: preset.name,
        models: preset.models,
        defaultModel: preset.defaultModel,
        available,
        description: preset.description,
        reason: available ? undefined : 'Добавьте API ключ в интеграциях, чтобы использовать провайдера.',
        config: integrationConfig,
        systemPromptTemplate:
          typeof integrationConfig?.system_prompt_template === 'string'
            ? String(integrationConfig.system_prompt_template)
            : undefined,
        inputFields: Array.isArray(integrationConfig?.input_fields)
          ? (integrationConfig?.input_fields as IntegrationFieldConfig[])
          : undefined,
      };
      return option;
    });
  }, [project]);

  useEffect(() => {
    return () => {
      pendingUiTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      pendingUiTimersRef.current.clear();
      pendingUiRef.current.clear();
      clearProject();
    };
  }, [clearProject]);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setLocalError(null);
        const projectFlow = await fetchProject(projectId);
        setProject(projectFlow);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLocalError(message);
      } finally {
        setLoading(false);
      }
    };

    load().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setLocalError(message);
    });
  }, [projectId, setProject, setError, setLoading]);

  useEffect(() => {
    const loadRuns = async () => {
      if (!project || !selectedNode) return;
      try {
        const logs = await fetchNodeLogs(project.project_id, selectedNode.node_id);
        setRuns(selectedNode.node_id, logs);
      } catch (err) {
        console.error(err);
      }
    };
    loadRuns();
  }, [project, selectedNode, setRuns]);

  const createNodeFromTemplate = useCallback(
    async (template: NodeTemplate, slug: string, position?: { x: number; y: number }) => {
      if (!project) return;
      const width = NODE_DEFAULT_WIDTH;
      const height = NODE_DEFAULT_HEIGHT;
      const x1 = position ? Math.round(position.x) : 0;
      const y1 = position ? Math.round(position.y) : 0;
      const payload: CreateNodePayload = {
        slug,
        type: template.type,
        title: template.title,
        content_type: template.content_type,
        content: template.content,
        meta: template.meta,
        ai: template.ai,
        parser: template.parser,
        python: template.python,
        visibility_rules: template.visibility_rules,
        position,
        ui: {
          color: NODE_DEFAULT_COLOR,
          bbox: {
            x1,
            y1,
            x2: x1 + width,
            y2: y1 + height,
          },
        },
        ai_visible: true,
        connections: { incoming: [], outgoing: [] },
      };
      try {
        setLoading(true);
        setError(null);
        const response = await createNode(project.project_id, payload);
        addNodeFromServer(response.node, response.project_updated_at);

        // Auto-connect AI generation nodes to the selected node
        if ((template.type === 'ai' || slug.includes('agent')) && selectedNodeId) {
          try {
            const edgeResponse = await createEdge(project.project_id, {
              from: selectedNodeId,
              to: response.node.node_id,
              label: 'auto-connected',
            });
            setEdges(edgeResponse.edges, edgeResponse.updated_at);
          } catch (edgeErr) {
            console.warn('Failed to auto-connect nodes:', edgeErr);
            // Don't throw here, node creation was successful
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [project, selectedNodeId, setLoading, setError, addNodeFromServer, setEdges],
  );

  const handlePaletteCreate = useCallback(
    (template: NodeTemplate, slug: string) => {
      void createNodeFromTemplate(template, slug);
    },
    [createNodeFromTemplate],
  );

  const handlePaletteDrop = useCallback(
    (slug: string, position: { x: number; y: number }) => {
      const template = paletteMap.get(slug);
      if (!template) return;
      void createNodeFromTemplate(template, slug, position);
    },
    [createNodeFromTemplate, paletteMap],
  );

  const persistNodeUpdate = useCallback(
    async (nodeId: string, patch: NodeUpdatePayload) => {
      if (!project) return;
      try {
        const updated = await updateNode(project.project_id, nodeId, patch);
        upsertNodeContent(nodeId, updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    },
    [project, setError, upsertNodeContent],
  );

  const handleRunNode = useCallback(
    async (nodeId: string) => {
      if (!project) return;
      try {
        setLoading(true);
        selectNode(nodeId);
        const response = await runNode(project.project_id, nodeId);
        upsertNodeContent(response.nodeId, {
          content: response.content ?? undefined,
          content_type: response.contentType ?? undefined,
        });
        
        // For AI nodes, automatically create a new node to the right with the generated content
        const sourceNode = selectNodeById(project, nodeId);
        if (sourceNode && sourceNode.type === 'ai' && response.content) {
          await createNewNodeFromGeneration(sourceNode, response.content);
        }
        
        const refreshedLogs = await fetchNodeLogs(project.project_id, response.nodeId);
        setRuns(response.nodeId, refreshedLogs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [project, selectNode, setLoading, upsertNodeContent, setRuns, setError],
  );

  // Helper function to create a new node from AI generation
  const createNewNodeFromGeneration = useCallback(
    async (sourceNode: any, content: string) => {
      if (!project) return;

      // Calculate position for new node (to the right with 20px spacing)
      const sourcePos = sourceNode.ui?.bbox || DEFAULT_NODE_BBOX;
      const newX = sourcePos.x2 + 20;
      const newY = sourcePos.y1;

      // Check for overlapping nodes and adjust position if needed
      const allNodes = project.nodes || [];
      let adjustedY = newY;
      
      for (const node of allNodes) {
        const nodeBbox = node.ui?.bbox || DEFAULT_NODE_BBOX;
        // Check if there's overlap in X range and adjust Y if needed
        if (newX < nodeBbox.x2 + 20 && newX + NODE_DEFAULT_WIDTH > nodeBbox.x1 - 20) {
          if (adjustedY < nodeBbox.y2 + 20 && adjustedY + NODE_DEFAULT_HEIGHT > nodeBbox.y1 - 20) {
            adjustedY = nodeBbox.y2 + 20; // Move below the overlapping node
          }
        }
      }

      // Create new node with generated content
      const newNodePayload: CreateNodePayload = {
        type: 'text',
        title: `Generated from ${sourceNode.title}`,
        content: content,
        ui: {
          color: NODE_DEFAULT_COLOR,
          bbox: {
            x1: newX,
            y1: adjustedY,
            x2: newX + NODE_DEFAULT_WIDTH,
            y2: adjustedY + NODE_DEFAULT_HEIGHT,
          },
        },
      };

      try {
        const newNode = await createNode(project.project_id, newNodePayload);
        addNodeFromServer(newNode.node, newNode.project_updated_at);
        
        // Create edge connection from source to new node
        await createEdge(project.project_id, {
          from: sourceNode.node_id,
          to: newNode.node.node_id,
        });
      } catch (err) {
        console.error('Failed to create new node from generation:', err);
      }
    },
    [project, addNodeFromServer],
  );

  const handleRegenerateNode = useCallback(
    async (nodeId: string) => {
      if (!project) return;
      try {
        setLoading(true);
        selectNode(nodeId);
        const response = await rerunNode(project.project_id, nodeId, { clone: false });
        const targetNodeId = response.targetNodeId ?? response.nodeId;
        upsertNodeContent(targetNodeId, {
          content: response.content ?? undefined,
          content_type: response.contentType ?? undefined,
        });
        const refreshedLogs = await fetchNodeLogs(project.project_id, targetNodeId);
        setRuns(targetNodeId, refreshedLogs);
        if (targetNodeId && targetNodeId !== nodeId) {
          selectNode(targetNodeId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [project, selectNode, setLoading, upsertNodeContent, setRuns, setError],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      removeNode(nodeId);
    },
    [removeNode],
  );

  const handleUpdateNodeMeta = useCallback(
    (nodeId: string, metaPatch: Record<string, unknown>) => {
      if (!project) return;
      const node = selectNodeById(project, nodeId);
      if (!node) return;
      const mergedMeta = { ...(node.meta ?? {}), ...metaPatch };
      upsertNodeContent(nodeId, { meta: mergedMeta });
      void persistNodeUpdate(nodeId, { meta: mergedMeta });
      setHasUnsavedChanges(true);
    },
    [project, upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeUi = useCallback(
    (nodeId: string, patch: Partial<NodeUI>) => {
      if (!project) return;
      const node = selectNodeById(project, nodeId);
      if (!node) return;
      const current = node.ui ?? { color: NODE_DEFAULT_COLOR, bbox: { ...DEFAULT_NODE_BBOX } };
      const nextUi: NodeUI = {
        color: typeof patch.color === 'string' && patch.color.trim().length > 0 ? patch.color : current.color,
        bbox: patch.bbox
          ? {
              x1: patch.bbox.x1 ?? current.bbox.x1,
              y1: patch.bbox.y1 ?? current.bbox.y1,
              x2: patch.bbox.x2 ?? current.bbox.x2,
              y2: patch.bbox.y2 ?? current.bbox.y2,
            }
          : current.bbox,
      };
      upsertNodeContent(nodeId, { ui: nextUi });
      setHasUnsavedChanges(true);
      pendingUiRef.current.set(nodeId, nextUi);
      const existingTimer = pendingUiTimersRef.current.get(nodeId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      const timer = window.setTimeout(() => {
        pendingUiTimersRef.current.delete(nodeId);
        const payload = pendingUiRef.current.get(nodeId);
        if (!payload) return;
        pendingUiRef.current.delete(nodeId);
        void persistNodeUpdate(nodeId, { ui: payload });
      }, 200);
      pendingUiTimersRef.current.set(nodeId, timer);
    },
    [project, upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeContent = useCallback(
    (nodeId: string, content: string) => {
      upsertNodeContent(nodeId, {
        content,
        content_type: 'text/markdown',
      });
      void persistNodeUpdate(nodeId, { content, content_type: 'text/markdown' });
      setHasUnsavedChanges(true);
    },
    [upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeTitle = useCallback(
    (nodeId: string, title: string) => {
      upsertNodeContent(nodeId, { title });
      void persistNodeUpdate(nodeId, { title });
      setHasUnsavedChanges(true);
    },
    [upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeAi = useCallback(
    (nodeId: string, aiPatch: Record<string, unknown>, options?: { replace?: boolean }) => {
      if (options?.replace) {
        upsertNodeContent(nodeId, { ai: aiPatch });
        void persistNodeUpdate(nodeId, { ai: aiPatch });
        setHasUnsavedChanges(true);
        return;
      }
      const current = selectNodeById(project, nodeId)?.ai as Record<string, unknown> | undefined;
      const nextAi = { ...(current ?? {}), ...aiPatch };
      upsertNodeContent(nodeId, { ai: nextAi });
      void persistNodeUpdate(nodeId, { ai: nextAi });
      setHasUnsavedChanges(true);
    },
    [project, persistNodeUpdate, upsertNodeContent],
  );

  const handleConnectEdge = useCallback(
    async ({ from, to }: { from: string; to: string }) => {
      if (!project) return;
      try {
        const response = await createEdge(project.project_id, { from, to });
        setEdges(response.edges, response.updated_at);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    },
    [project, setEdges, setError],
  );

  const handleRemoveEdges = useCallback(
    async (edgesToRemove: Array<{ from: string; to: string }>) => {
      if (!project || edgesToRemove.length === 0) return;
      try {
        let latest: EdgeListResponse | null = null;
        for (const edge of edgesToRemove) {
          const response = await deleteEdge(project.project_id, edge.from, edge.to);
          latest = response;
        }
        if (latest) {
          setEdges(latest.edges, latest.updated_at);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    },
    [project, setEdges, setError],
  );

  const handleSaveWorkspace = useCallback(async () => {
    if (!project) return;
    try {
      setIsSaving(true);
      setValidation({ status: 'idle' });
      await syncProjectDrive(project.project_id);
      setValidation({ status: 'success', message: 'Воркфлоу сохранён' });
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setValidation({ status: 'error', message: `Не удалось сохранить: ${message}` });
    } finally {
      setIsSaving(false);
    }
  }, [project]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!project) return;
    const confirmed = window.confirm('Удалить весь воркспейс? Действие необратимо.');
    if (!confirmed) return;
    try {
      setLoading(true);
      await deleteProject(project.project_id);
      clearProject();
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [project, setLoading, clearProject, navigate, setError]);

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-200">
        <div className="text-center">
          <p className="text-lg">Project ID is missing.</p>
          <button
            type="button"
            className="mt-4 rounded bg-primary px-4 py-2 text-sm text-white"
            onClick={() => navigate('/')}
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  if (localError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900 text-slate-200">
        <div className="max-w-lg text-center">
          <h1 className="text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{localError}</p>
        </div>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm text-white"
          onClick={() => navigate('/')}
        >
          Back to project list
        </button>
      </div>
    );
  }

  // Force a resize event to ensure ReactFlow dimensions are correct
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-screen min-h-0 gap-4 p-4" style={{ width: '100vw', height: '100vh' }}>
      <aside className="flex-shrink-0" style={{ width: sidebarWidth }}>
        <div className="mb-4 flex items-center justify-between text-slate-200">
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
            onClick={() => navigate('/')}
          >
            ← Projects
          </button>
          <span className="text-xs uppercase tracking-wide text-slate-500">Workspace</span>
        </div>
        <div className="h-[calc(100%-2.5rem)] overflow-auto">
          <NodeSidebar project={project} selectedNodeId={selectedNodeId} onSelectNode={selectNode} />
        </div>
      </aside>
      <ResizeHandle orientation="vertical" ariaLabel="Изменить ширину меню нод" onResize={(delta) => setSidebarWidth((prev) => clamp(prev + delta, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH))} />
      <div className="flex flex-1 flex-col gap-4 min-h-0">
        <header className="flex items-center justify-between rounded-lg bg-slate-800 p-4 shadow">
          <div>
            <h1 className="text-2xl font-semibold">{project?.title ?? 'Loading...'}</h1>
            <p className="text-sm text-slate-400">{project?.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSaveWorkspace} 
              disabled={!project || isSaving}
              className={`h-9 px-4 text-sm text-white transition disabled:opacity-50 flex items-center gap-2 ${
                hasUnsavedChanges 
                  ? 'bg-orange-600 hover:bg-orange-500' 
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Сохраняю…
                </>
              ) : hasUnsavedChanges ? (
                <>
                  <span className="text-orange-200">●</span>
                  Сохранить*
                </>
              ) : (
                <>
                  <span className="text-green-300">✓</span>
                  Сохранено
                </>
              )}
            </button>
            <button
              onClick={handleDeleteWorkspace}
              className="h-9 w-24 rounded bg-rose-600 px-4 text-sm text-white transition hover:bg-rose-500 disabled:opacity-50"
              disabled={!project || loading}
            >
              Удалить
            </button>
          </div>
        </header>
        {error && <div className="rounded bg-red-500/20 p-3 text-sm text-red-200">{error}</div>}
        {validation.status !== 'idle' && (
          <div
            className={`rounded p-2 text-sm ${
              validation.status === 'success'
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-amber-500/20 text-amber-100'
            }`}
          >
            {validation.message}
          </div>
        )}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden min-h-0">
        <div 
          className="flex-1 overflow-hidden rounded-lg bg-slate-800 shadow" 
          style={{ 
            minHeight: '500px', 
            position: 'relative',
            display: 'flex', 
            flexDirection: 'column'
          }}
        >
            <GraphCanvas
              project={project}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
              onRunNode={handleRunNode}
              onRegenerateNode={handleRegenerateNode}
              onDeleteNode={handleDeleteNode}
              onChangeNodeMeta={handleUpdateNodeMeta}
              onChangeNodeContent={handleUpdateNodeContent}
              onChangeNodeTitle={handleUpdateNodeTitle}
              onChangeNodeAi={handleUpdateNodeAi}
              onChangeNodeUi={handleUpdateNodeUi}
              onAddNodeFromPalette={handlePaletteDrop}
              onCreateEdge={handleConnectEdge}
              onRemoveEdges={handleRemoveEdges}
              providerOptions={providerOptions}
              loading={loading}
            />
          </div>
        </div>
      </div>
      <ResizeHandle
        orientation="vertical"
        ariaLabel="Изменить ширину магазина"
        onResize={(delta) => setPaletteWidth((prev) => clamp(prev - delta, PALETTE_MIN_WIDTH, PALETTE_MAX_WIDTH))}
      />
      <aside className="flex-shrink-0" style={{ width: paletteWidth }}>
        <div className="h-full overflow-auto flex flex-col gap-4 p-4">
          <TokenDisplay project={project} />
          <NodePalette onCreateNode={handlePaletteCreate} disabled={loading || !project} />
        </div>
      </aside>
    </div>
  );
}

export default WorkspacePage;

function ResizeHandle({ orientation, onResize, ariaLabel }: ResizeHandleProps) {
  const isVertical = orientation === 'vertical';

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      let previous = isVertical ? event.clientX : event.clientY;

      const handleMove = (moveEvent: PointerEvent) => {
        const current = isVertical ? moveEvent.clientX : moveEvent.clientY;
        const delta = current - previous;
        if (delta !== 0) {
          onResize(delta);
          previous = current;
        }
      };

      const handleUp = () => {
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
        window.removeEventListener('pointermove', handleMove);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
      window.addEventListener('pointercancel', handleUp, { once: true });
    },
    [isVertical, onResize],
  );

  const baseClasses = isVertical
    ? 'w-3 cursor-ew-resize'
    : 'h-3 cursor-ns-resize';

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      className={`group relative flex flex-none items-center justify-center ${baseClasses}`}
      onPointerDown={handlePointerDown}
    >
      <span
        className={`pointer-events-none rounded-full bg-slate-600/40 transition group-hover:bg-slate-400/70 ${
          isVertical ? 'h-[70%] w-px' : 'h-px w-[70%]'
        }`}
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-slate-300 opacity-0 transition group-hover:opacity-100"
      >
        {isVertical ? '↔' : '↕'}
      </span>
    </div>
  );
}

interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  ariaLabel: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
