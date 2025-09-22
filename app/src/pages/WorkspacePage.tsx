import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GraphCanvas from '../features/graph/GraphCanvas';
import NodeEditor from '../features/workspace/NodeEditor';
import JsonViewer from '../ui/JsonViewer';
import NodeSidebar from '../features/workspace/NodeSidebar';
import NodePalette from '../features/workspace/NodePalette';
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
const INSPECTOR_MIN_HEIGHT = 240;
const INSPECTOR_MAX_HEIGHT = 560;

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
  const [inspectorHeight, setInspectorHeight] = useState(320);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pendingUiRef = useRef<Map<string, NodeUI>>(new Map());
  const pendingUiTimersRef = useRef<Map<string, number>>(new Map());

  const selectedNode = useMemo(() => selectNodeById(project, selectedNodeId), [project, selectedNodeId]);
  const [showAiContext, setShowAiContext] = useState(false);
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [project, setLoading, setError, addNodeFromServer],
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
    },
    [upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeTitle = useCallback(
    (nodeId: string, title: string) => {
      upsertNodeContent(nodeId, { title });
      void persistNodeUpdate(nodeId, { title });
    },
    [upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeAi = useCallback(
    (nodeId: string, aiPatch: Record<string, unknown>, options?: { replace?: boolean }) => {
      if (options?.replace) {
        upsertNodeContent(nodeId, { ai: aiPatch });
        void persistNodeUpdate(nodeId, { ai: aiPatch });
        return;
      }
      const current = selectNodeById(project, nodeId)?.ai as Record<string, unknown> | undefined;
      const nextAi = { ...(current ?? {}), ...aiPatch };
      upsertNodeContent(nodeId, { ai: nextAi });
      void persistNodeUpdate(nodeId, { ai: nextAi });
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

  const selectedRuns: RunLog[] | undefined = selectedNode
    ? runs[selectedNode.node_id]
    : undefined;

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
            <button onClick={handleSaveWorkspace} disabled={!project || isSaving}>
              {isSaving ? 'Сохраняю…' : 'Сохранить'}
            </button>
            <button
              onClick={handleDeleteWorkspace}
              className="rounded bg-rose-600 px-3 py-1 text-sm text-white transition hover:bg-rose-500 disabled:opacity-50"
              disabled={!project || loading}
            >
              Delete workspace
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
            height: 'calc(100% - 320px)', 
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
          <ResizeHandle orientation="horizontal" ariaLabel="Изменить высоту меню" onResize={(delta) => setInspectorHeight((prev) => clamp(prev - delta, INSPECTOR_MIN_HEIGHT, INSPECTOR_MAX_HEIGHT))} />
          <div
            className="grid gap-4 overflow-hidden lg:grid-cols-[minmax(0,320px),1fr]"
            style={{
              height: inspectorHeight,
              minHeight: INSPECTOR_MIN_HEIGHT,
              maxHeight: INSPECTOR_MAX_HEIGHT,
            }}
          >
            <section className="flex h-full flex-col overflow-hidden rounded-lg bg-slate-800 p-4 shadow">
              <button
                type="button"
                className="mb-3 flex w-full items-center justify-between rounded bg-slate-900/60 px-3 py-2 text-left text-lg font-semibold text-slate-200"
                onClick={() => setShowAiContext((prev) => !prev)}
              >
                <span>AI Node Context</span>
                <span className="text-sm text-slate-400">{showAiContext ? '▲' : '▼'}</span>
              </button>
              {!selectedNode && <p className="text-sm text-slate-400">Выберите узел</p>}
              {selectedNode && showAiContext && (
                <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                  <div>
                    <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-400">
                      Полный контент предыдущих узлов
                    </h3>
                    <div className="space-y-2">
                      {previousNodes.map((node) => (
                        <article key={node.node_id} className="rounded border border-slate-700 p-2">
                          <h4 className="text-sm font-semibold">{node.title}</h4>
                          <p className="text-xs text-slate-400">{node.node_id}</p>
                          {node.content ? (
                            <JsonViewer value={node.content} collapsible />
                          ) : (
                            <p className="text-sm text-slate-300">Нет данных</p>
                          )}
                        </article>
                      ))}
                      {previousNodes.length === 0 && (
                        <p className="text-sm text-slate-400">Нет предшествующих узлов</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-400">
                      Метаданные следующих узлов
                    </h3>
                    <ul className="space-y-2">
                      {nextNodes.map((node) => (
                        <li key={node.node_id} className="rounded border border-slate-700 p-2">
                          <p className="font-semibold">{node.title}</p>
                          <p className="text-sm text-slate-300">
                            {(node.meta?.short_description as string | undefined) ??
                              (node.content ? node.content.slice(0, 200) : 'Нет описания')}
                          </p>
                        </li>
                      ))}
                      {nextNodes.length === 0 && (
                        <p className="text-sm text-slate-400">Нет последующих узлов</p>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </section>
            <div className="min-h-0 overflow-hidden rounded-lg bg-slate-800 shadow">
              <NodeEditor
                node={selectedNode}
                projectId={project?.project_id ?? ''}
                runs={selectedRuns}
                loading={loading}
              />
            </div>
          </div>
        </div>
      </div>
      <ResizeHandle
        orientation="vertical"
        ariaLabel="Изменить ширину магазина"
        onResize={(delta) => setPaletteWidth((prev) => clamp(prev - delta, PALETTE_MIN_WIDTH, PALETTE_MAX_WIDTH))}
      />
      <aside className="flex-shrink-0" style={{ width: paletteWidth }}>
        <div className="h-full overflow-auto">
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
