import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GraphCanvas from '../features/graph/GraphCanvas';
import NodeSidebar from '../features/workspace/NodeSidebar';
import NodePalette from '../features/workspace/NodePalette';
import { TokenDisplay } from '../ui/TokenDisplay';
import { NODE_PALETTE } from '../data/nodePalette';
import { DEFAULT_STICKY_NOTE } from '../data/stickyNoteDefault';
import {
  fetchProject,
  fetchNodeLogs,
  runNode,
  rerunNode,
  deleteProject,
  deleteNode,
  updateNode,
  updateProjectMeta,
  createEdge,
  deleteEdge,
  createNode,
  syncProjectDrive,
  type RunLog,
  type NodeUpdatePayload,
  type EdgeListResponse,
  type CreateNodePayload,
  type NodeUI,
  type ProjectFlow,
  type FlowNode,
} from '../state/api';
import {
  useProjectStore,
  selectNodeById,
  findPreviousNodes,
  findNextNodes,
  type NodeTemplate,
} from '../state/store';
import { useGlobalIntegrationsStore } from '../state/globalIntegrationsStore';
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
const SIDEBAR_DEFAULT_WIDTH = 300;
const PALETTE_MIN_WIDTH = 220;
const PALETTE_MAX_WIDTH = 420;
const PALETTE_DEFAULT_WIDTH = 320;

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

  const { integrations: globalIntegrations, fetchIntegrations } = useGlobalIntegrationsStore();

  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [paletteWidth, setPaletteWidth] = useState(PALETTE_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [showNodeModal, setShowNodeModal] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [generatingNodes, setGeneratingNodes] = useState<Set<string>>(new Set());
  const [generatingEdges, setGeneratingEdges] = useState<Map<string, string>>(new Map());
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
    const options: AiProviderOption[] = [];
    
    // Добавляем stub провайдер всегда
    options.push({
      id: 'stub',
      name: 'Local Stub',
      models: ['local-llm-7b-q5'],
      defaultModel: 'local-llm-7b-q5',
      available: true,
      description: 'Встроенный оффлайн движок для тестовых запусков.',
      inputFields: [],
    });

    // Преобразуем глобальные интеграции в провайдеры
    globalIntegrations.forEach((integration) => {
      const hasApiKey = Boolean(integration.apiKey && integration.apiKey.trim().length > 0);
      
      let models: string[] = [];
      let defaultModel = '';
      
      // Определяем модели в зависимости от провайдера
      if (integration.providerId === 'openai_gpt') {
        models = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        defaultModel = 'gpt-4o-mini';
      } else if (integration.providerId === 'anthropic') {
        models = ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'];
        defaultModel = 'claude-3-haiku';
      } else {
        // Fallback для других провайдеров
        models = ['default-model'];
        defaultModel = 'default-model';
      }

      options.push({
        id: integration.providerId,
        name: integration.name,
        models,
        defaultModel,
        available: hasApiKey,
        description: integration.description || `${integration.name} integration`,
        reason: hasApiKey ? undefined : 'Добавьте API ключ в интеграциях, чтобы использовать провайдера.',
        config: {
          api_key: integration.apiKey,
          base_url: integration.baseUrl,
          organization: integration.organization,
        },
        systemPromptTemplate: integration.systemPrompt,
        inputFields: integration.inputFields || [],
      });
    });

    return options;
  }, [globalIntegrations]);

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

  // Загружаем глобальные интеграции при инициализации
  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

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

  // Функция для копирования ноды из NodeSidebar
  const handleNodeCopy = useCallback(
    async (node: FlowNode, position: { x: number; y: number }) => {
      if (!project) return;
      
      // Создаем копию ноды с новыми координатами
      const copyPayload: CreateNodePayload = {
        type: node.type,
        title: `${node.title} (копия)`,
        content_type: node.content_type,
        content: node.content,
        meta: node.meta ? { ...node.meta } : undefined,
        ai: node.ai ? { ...node.ai } : undefined,
        parser: node.parser ? { ...node.parser } : undefined,
        python: node.python ? { ...node.python } : undefined,
        visibility_rules: node.visibility_rules,
        position,
        ui: {
          color: node.ui?.color || NODE_DEFAULT_COLOR,
          bbox: {
            x1: Math.round(position.x),
            y1: Math.round(position.y),
            x2: Math.round(position.x) + NODE_DEFAULT_WIDTH,
            y2: Math.round(position.y) + NODE_DEFAULT_HEIGHT,
          },
        },
        ai_visible: node.ai_visible,
        connections: { incoming: [], outgoing: [] },
      };

      try {
        setLoading(true);
        setError(null);
        const response = await createNode(project.project_id, copyPayload);
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

  // Helper function to create a new node from AI generation
  const createNewNodeFromGeneration = useCallback(
    async (sourceNode: any, content: string) => {
      if (!project) return;

      // Parse AI response to extract clean text
      let cleanContent = content;
      try {
        // Try to parse as JSON and extract the response field
        const parsedContent = JSON.parse(content);
        if (parsedContent && typeof parsedContent === 'object' && parsedContent.response) {
          cleanContent = parsedContent.response;
        }
      } catch (err) {
        // If not valid JSON, use content as-is
      }

      // Calculate position for new node (to the right with more spacing)
      const sourcePos = sourceNode.ui?.bbox || DEFAULT_NODE_BBOX;
      const newX = sourcePos.x2 + 100; // Increased spacing from 20px to 100px
      const newY = sourcePos.y1;

      // Check for overlapping nodes and adjust position if needed
      const allNodes = project.nodes || [];
      let adjustedY = newY;
      
      for (const node of allNodes) {
        const nodeBbox = node.ui?.bbox || DEFAULT_NODE_BBOX;
        // Check if there's overlap in X range and adjust Y if needed
        if (newX < nodeBbox.x2 + 50 && newX + NODE_DEFAULT_WIDTH > nodeBbox.x1 - 50) {
          if (adjustedY < nodeBbox.y2 + 50 && adjustedY + NODE_DEFAULT_HEIGHT > nodeBbox.y1 - 50) {
            adjustedY = nodeBbox.y2 + 50; // Move below the overlapping node with more spacing
          }
        }
      }

      // Create new node with generated content
      const newNodePayload: CreateNodePayload = {
        type: 'text',
        title: `Generated from ${sourceNode.title}`,
        content: cleanContent, // Use cleaned content instead of raw content
        content_type: 'text/plain', // Use plain text instead of markdown
        ui: {
          color: NODE_DEFAULT_COLOR,
          bbox: {
            x1: newX,
            y1: adjustedY,
            x2: newX + NODE_DEFAULT_WIDTH,
            y2: adjustedY + NODE_DEFAULT_HEIGHT,
          },
        },
        ai_visible: true,
        connections: { incoming: [], outgoing: [] },
      };

      try {
        const newNodeResponse = await createNode(project.project_id, newNodePayload);
        addNodeFromServer(newNodeResponse.node, newNodeResponse.project_updated_at);
        
        // Create edge connection from source to new node
        const edgeResponse = await createEdge(project.project_id, {
          from: sourceNode.node_id,
          to: newNodeResponse.node.node_id,
          label: 'generated',
        });
        
        // Update edges in state to prevent ReactFlow state desync
        setEdges(edgeResponse.edges, edgeResponse.updated_at);
        
        // Clear selection immediately to prevent sticky behavior
        selectNode(null);
        
      } catch (err) {
        console.error('Failed to create new node from generation:', err);
      }
    },
    [project, addNodeFromServer, setEdges, selectNode],
  );

  // Функция для расчета позиции новой ноды справа от источника
  const calculateOutputNodePosition = useCallback((sourceNode: FlowNode) => {
    const sourceBbox = sourceNode.ui?.bbox ?? DEFAULT_NODE_BBOX;
    const sourceWidth = sourceBbox.x2 - sourceBbox.x1;
    
    return {
      x: sourceBbox.x1 + sourceWidth + 150, // 150px отступ справа
      y: sourceBbox.y1, // Та же высота
    };
  }, []);

  const handleRunNode = useCallback(
    async (nodeId: string) => {
      if (!project) return;
      try {
        selectNode(nodeId);
        
        // For AI nodes, create result node immediately and add to generating set
        const sourceNode = selectNodeById(project, nodeId);
        let resultNodeId: string | null = null;
        
        if (sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved')) {
          // Create placeholder result node immediately
          const resultPosition = calculateOutputNodePosition(sourceNode);
          const resultNode: CreateNodePayload = {
            type: 'text',
            slug: 'text',
            meta: {},
            position: resultPosition,
            ai: {},
            ui: {
              bbox: {
                x1: resultPosition.x,
                y1: resultPosition.y,
                x2: resultPosition.x + NODE_DEFAULT_WIDTH,
                y2: resultPosition.y + NODE_DEFAULT_HEIGHT,
              },
              color: NODE_DEFAULT_COLOR,
            },
            title: 'Генерируется ответ...',
            content: 'Пожалуйста подождите, идет генерация ответа...',
          };
          
          // Create the result node
          const createResponse = await createNode(project.project_id, resultNode);
          resultNodeId = createResponse.node.node_id;
          
          // Add edge from AI node to result node
          await createEdge(project.project_id, {
            from: nodeId,
            to: resultNodeId,
          });
          
          // Add to generating edges map and nodes set
          if (resultNodeId) {
            setGeneratingEdges(prev => new Map(prev).set(nodeId, resultNodeId));
            setGeneratingNodes(prev => new Set(prev).add(resultNodeId));
          }
          
          // Refresh project to show the new node
          const refreshedProject = await fetchProject(project.project_id);
          if (refreshedProject) {
            setProject(refreshedProject);
          }
        }
        
        // Now run the AI node in background
        const response = await runNode(project.project_id, nodeId);
        
        // Check if this is a multi-node result
        if (sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved') && response.isMultiNodeResult && response.createdNodes) {
          // Multi-node result: remove the placeholder node and refresh project
          if (resultNodeId) {
            // Delete the placeholder result node since we created multiple nodes instead
            await deleteNode(project.project_id, resultNodeId);
            
            setGeneratingEdges(prev => {
              const next = new Map(prev);
              next.delete(nodeId);
              return next;
            });
            
            setGeneratingNodes(prev => {
              const next = new Set(prev);
              if (resultNodeId) next.delete(resultNodeId);
              return next;
            });
            
            // Update logs for the original AI node
            const refreshedLogs = await fetchNodeLogs(project.project_id, nodeId);
            setRuns(nodeId, refreshedLogs);
            
            // Refresh project to show created nodes
            const refreshedProject = await fetchProject(project.project_id);
            if (refreshedProject) {
              setProject(refreshedProject);
            }
            
            // Show success message
            setError(`✅ Создано ${response.createdNodes.length} нод: ${response.createdNodes.map((n: { node_id: string; type: string; title: string }) => n.title).join(', ')}`);
            setTimeout(() => setError(''), 5000);
          }
        } else if (sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved') && response.content && resultNodeId) {
          // Extract content from response - it might be in different formats
          let responseContent = response.content;
          if (typeof responseContent === 'string') {
            try {
              // Try to parse if it's JSON with a response field
              const parsed = JSON.parse(responseContent);
              if (parsed.response) {
                responseContent = parsed.response;
              }
            } catch {
              // If not JSON, use as is
            }
          }
          
          // Update the result node with actual content
          await updateNode(project.project_id, resultNodeId, {
            content: responseContent,
            title: `Ответ от ${sourceNode.title}`,
          });
          
          // Remove from generating edges map and nodes set
          setGeneratingEdges(prev => {
            const next = new Map(prev);
            next.delete(nodeId);
            return next;
          });
          
          setGeneratingNodes(prev => {
            const next = new Set(prev);
            if (resultNodeId) next.delete(resultNodeId);
            return next;
          });
          
          // Update logs for the original AI node
          const refreshedLogs = await fetchNodeLogs(project.project_id, nodeId);
          setRuns(nodeId, refreshedLogs);
          
          // Refresh project to show updated content
          const refreshedProject = await fetchProject(project.project_id);
          if (refreshedProject) {
            setProject(refreshedProject);
          }
        } else if (!sourceNode || (sourceNode.type !== 'ai' && sourceNode.type !== 'ai_improved')) {
          // Only update content for non-AI nodes
          upsertNodeContent(response.nodeId, {
            content: response.content ?? undefined,
            content_type: response.contentType ?? undefined,
          });
          
          // Update logs for the response node
          const refreshedLogs = await fetchNodeLogs(project.project_id, response.nodeId);
          setRuns(response.nodeId, refreshedLogs);
        }
        
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        
        // Remove from generating edges on error
        setGeneratingEdges(prev => {
          const next = new Map(prev);
          next.delete(nodeId);
          return next;
        });
      } finally {
        // Clear selection after node execution to prevent sticking
        selectNode(null);
      }
    },
    [project, selectNode, upsertNodeContent, setRuns, setError, setProject, setGeneratingEdges, setGeneratingNodes],
  );

  const handleRegenerateNode = useCallback(
    async (nodeId: string) => {
      if (!project) return;
      try {
        selectNode(nodeId);
        
        // For AI nodes, create result node immediately and add to generating set
        const sourceNode = selectNodeById(project, nodeId);
        let resultNodeId: string | null = null;
        
        if (sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved')) {
          // Create placeholder result node immediately
          const resultPosition = calculateOutputNodePosition(sourceNode);
          const resultNode: CreateNodePayload = {
            type: 'text',
            slug: 'text',
            meta: {},
            position: resultPosition,
            ai: {},
            ui: {
              bbox: {
                x1: resultPosition.x,
                y1: resultPosition.y,
                x2: resultPosition.x + NODE_DEFAULT_WIDTH,
                y2: resultPosition.y + NODE_DEFAULT_HEIGHT,
              },
              color: NODE_DEFAULT_COLOR,
            },
            title: 'Регенерируется ответ...',
            content: 'Пожалуйста подождите, идет регенерация ответа...',
          };
          
          // Create the result node
          const createResponse = await createNode(project.project_id, resultNode);
          resultNodeId = createResponse.node.node_id;
          
          // Add edge from AI node to result node
          await createEdge(project.project_id, {
            from: nodeId,
            to: resultNodeId,
          });
          
          // Add to generating edges map and nodes set
          if (resultNodeId) {
            setGeneratingEdges(prev => new Map(prev).set(nodeId, resultNodeId!));
            setGeneratingNodes(prev => new Set(prev).add(resultNodeId!));
          }
          
          // Refresh project to show the new node
          const refreshedProject = await fetchProject(project.project_id);
          if (refreshedProject) {
            setProject(refreshedProject);
          }
        }
        
        // Now run the regeneration in background
        const response = await rerunNode(project.project_id, nodeId, { clone: false });
        
        if (sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved') && response.content && resultNodeId) {
          // Extract content from response - it might be in different formats
          let responseContent = response.content;
          if (typeof responseContent === 'string') {
            try {
              // Try to parse if it's JSON with a response field
              const parsed = JSON.parse(responseContent);
              if (parsed.response) {
                responseContent = parsed.response;
              }
            } catch {
              // If not JSON, use as is
            }
          }
          
          // Update the result node with actual content
          await updateNode(project.project_id, resultNodeId, {
            content: responseContent,
            title: `Регенерированный ответ от ${sourceNode.title}`,
          });
          
          // Remove from generating edges map and nodes set
          setGeneratingEdges(prev => {
            const next = new Map(prev);
            next.delete(nodeId);
            return next;
          });
          
          setGeneratingNodes(prev => {
            const next = new Set(prev);
            if (resultNodeId) next.delete(resultNodeId);
            return next;
          });
          
          // Update logs for the original AI node
          const refreshedLogs = await fetchNodeLogs(project.project_id, nodeId);
          setRuns(nodeId, refreshedLogs);
          
          // Refresh project to show updated content
          const refreshedProject = await fetchProject(project.project_id);
          if (refreshedProject) {
            setProject(refreshedProject);
          }
        } else if (!sourceNode || (sourceNode.type !== 'ai' && sourceNode.type !== 'ai_improved')) {
          // For non-AI nodes: update content as usual
          const targetNodeId = response.targetNodeId ?? response.nodeId;
          upsertNodeContent(targetNodeId, {
            content: response.content ?? undefined,
            content_type: response.contentType ?? undefined,
          });
          
          // Update logs for the target node
          const refreshedLogs = await fetchNodeLogs(project.project_id, targetNodeId);
          setRuns(targetNodeId, refreshedLogs);
        }
        
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        
        // Remove from generating edges on error
        setGeneratingEdges(prev => {
          const next = new Map(prev);
          next.delete(nodeId);
          return next;
        });
      } finally {
        // Clear selection after node execution to prevent sticking
        selectNode(null);
      }
    },
    [project, selectNode, upsertNodeContent, setRuns, setError, setProject, setGeneratingEdges, setGeneratingNodes, calculateOutputNodePosition],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!project) return;
      try {
        setLoading(true);
        console.log('Deleting node:', nodeId);
        
        // Clear any pending operations for this node to prevent update conflicts
        if (pendingUiTimersRef.current.has(nodeId)) {
          clearTimeout(pendingUiTimersRef.current.get(nodeId));
          pendingUiTimersRef.current.delete(nodeId);
        }
        pendingUiRef.current.delete(nodeId);
        
        // Call API to delete node on server
        const updatedProject = await deleteNode(project.project_id, nodeId);
        
        // Update local state by removing the node
        removeNode(nodeId);
        
        // Update project timestamp
        setProject(updatedProject);
        
        console.log('Node deleted successfully:', nodeId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to delete node:', message);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [project, removeNode, setLoading, setError, setProject],
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

  const handleStartEditTitle = useCallback(() => {
    if (!project) return;
    setEditTitle(project.title || '');
    setIsEditingTitle(true);
  }, [project]);

  const handleSaveTitle = useCallback(async () => {
    if (!project || !editTitle.trim()) return;
    try {
      const updatedProject = await updateProjectMeta(project.project_id, { title: editTitle.trim() });
      setProject(updatedProject);
      setIsEditingTitle(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, [project, editTitle, setProject, setError]);

  const handleCancelEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    setEditTitle('');
  }, []);

  const handleStartEditDescription = useCallback(() => {
    if (!project) return;
    setEditDescription(project.description || '');
    setIsEditingDescription(true);
  }, [project]);

  const handleSaveDescription = useCallback(async () => {
    if (!project) return;
    try {
      const updatedProject = await updateProjectMeta(project.project_id, { description: editDescription.trim() });
      setProject(updatedProject);
      setIsEditingDescription(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, [project, editDescription, setProject, setError]);

  const handleCancelEditDescription = useCallback(() => {
    setIsEditingDescription(false);
    setEditDescription('');
  }, []);

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
    <div className="relative h-screen min-h-0 p-4" style={{ width: '100vw', height: '100vh' }}>
      {/* Sidebar positioned absolutely over the workflow */}
      <aside 
        className="absolute left-4 z-10 flex flex-col" 
        style={{ 
          top: '120px', // Position further below the header (80px + 40px)
          width: sidebarCollapsed ? 48 : sidebarWidth,
          height: 'calc(100vh - 136px)', // Adjust height to account for top offset
        }}
      >
        <div className="flex-1 overflow-auto">
          <NodeSidebar 
            project={project} 
            selectedNodeId={selectedNodeId} 
            onSelectNode={selectNode} 
            onCopyNode={handleNodeCopy}
            onOpenNodeModal={setShowNodeModal}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>
      </aside>
      
      {/* Resize handle positioned absolutely */}
      {!sidebarCollapsed && (
        <div 
          className="absolute z-10" 
          style={{ 
            left: sidebarWidth + 16,
            top: '120px',
            height: 'calc(100vh - 136px)'
          }}
        >
          <ResizeHandle orientation="vertical" ariaLabel="Изменить ширину меню нод" onResize={(delta: number) => setSidebarWidth((prev: number) => clamp(prev + delta, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH))} />
        </div>
      )}
      
      {/* Main content area - full width */}
      <div className="flex flex-col gap-4 h-full min-h-0">
        <header className="flex items-center justify-between rounded-lg bg-slate-800 p-4 shadow">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-slate-200">
              <button
                type="button"
                className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600 transition"
                onClick={() => navigate('/')}
              >
                ← Projects
              </button>
              <span className="text-xs uppercase tracking-wide text-slate-500">Workspace</span>
            </div>
            <div className="ml-4">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') handleCancelEditTitle();
                    }}
                    className="text-2xl font-semibold bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="text-green-400 hover:text-green-300 p-1"
                    title="Сохранить"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleCancelEditTitle}
                    className="text-red-400 hover:text-red-300 p-1"
                    title="Отменить"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-2xl font-semibold">{project?.title ?? 'Loading...'}</h1>
                  <button
                    onClick={handleStartEditTitle}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-300 p-1 transition-opacity"
                    title="Редактировать название"
                  >
                    ✏️
                  </button>
                </div>
              )}
              
              {isEditingDescription ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveDescription();
                      if (e.key === 'Escape') handleCancelEditDescription();
                    }}
                    className="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-300"
                    placeholder="Добавить описание..."
                    autoFocus
                  />
                  <button
                    onClick={handleSaveDescription}
                    className="text-green-400 hover:text-green-300 p-1"
                    title="Сохранить"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleCancelEditDescription}
                    className="text-red-400 hover:text-red-300 p-1"
                    title="Отменить"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <p className="text-sm text-slate-400">{project?.description || 'Нет описания'}</p>
                  <button
                    onClick={handleStartEditDescription}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-300 p-1 transition-opacity"
                    title="Редактировать описание"
                  >
                    ✏️
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Token Display - compact version */}
            <TokenDisplay project={project} compact={true} />
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handleSaveWorkspace} 
                disabled={!project || isSaving}
                className={`h-9 px-4 text-sm text-white transition disabled:opacity-50 flex items-center gap-2 rounded ${
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
        
        {/* Main workflow area */}
        <div className="flex-1 overflow-hidden rounded-lg bg-slate-800 shadow" 
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
            onCopyNode={handleNodeCopy}
            onCreateEdge={handleConnectEdge}
            onRemoveEdges={handleRemoveEdges}
            providerOptions={providerOptions}
            loading={loading}
            sidebarCollapsed={sidebarCollapsed}
            sidebarWidth={sidebarWidth}
            generatingNodes={generatingNodes}
            generatingEdges={generatingEdges}
          />
        </div>
        
        {/* Right palette positioned absolutely over the workflow */}
        <aside 
          className="absolute right-4 z-10 flex flex-col" 
          style={{ 
            top: '120px', // Same height as left sidebar
            width: paletteCollapsed ? 48 : 320,
            height: 'calc(100vh - 136px)', // Same height as left sidebar
          }}
        >
          <div className="flex-1 overflow-auto">
            <NodePalette 
              onCreateNode={handlePaletteCreate} 
              disabled={loading || !project}
              collapsed={paletteCollapsed}
              onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)}
            />
          </div>
        </aside>
      </div>
      
      {/* Node Modal */}
      {showNodeModal && project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-4xl max-h-[80vh] w-full mx-4 bg-slate-800 rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                {project.nodes.find(n => n.node_id === showNodeModal)?.title || 'Нода'}
              </h2>
              <button
                type="button"
                onClick={() => setShowNodeModal(null)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white transition rounded"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {(() => {
                const node = project.nodes.find(n => n.node_id === showNodeModal);
                if (!node) return <div>Нода не найдена</div>;
                
                return (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">ID:</label>
                      <div className="text-sm text-slate-400 font-mono">{node.node_id}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Тип:</label>
                      <div className="text-sm text-slate-400">{node.type}</div>
                    </div>
                    {node.content && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Содержимое:</label>
                        <div className="text-sm text-slate-200 bg-slate-900 p-3 rounded max-h-40 overflow-y-auto">
                          <pre className="whitespace-pre-wrap">{node.content}</pre>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          selectNode(showNodeModal);
                          setShowNodeModal(null);
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition"
                      >
                        Выбрать на поле
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNodeModal(null)}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition"
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
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
