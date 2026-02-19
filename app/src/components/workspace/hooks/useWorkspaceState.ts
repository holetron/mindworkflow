import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NODE_PALETTE } from '../../../data/nodePalette';
import { PROVIDERS } from '../../../data/providers';
import { DEFAULT_TEXT_MARKDOWN_TEMPLATE } from '../../../data/stickyNoteDefault';
import { DEFAULT_REPLICATE_MODELS } from '../../../data/defaultReplicateModels';
import {
  fetchProject,
  fetchWorkflowUiSettings,
  type NodeUI,
  type ProjectFlow,
  type ProjectRole,
  type ShareResponse,
  type SharePayload,
} from '../../../state/api';
import {
  useProjectStore,
  selectNodeById,
  findPreviousNodes,
  findNextNodes,
  type NodeTemplate,
} from '../../../state/store';
import { useGlobalIntegrationsStore } from '../../../state/globalIntegrationsStore';
import { AI_PROVIDER_PRESETS } from '../../../data/aiProviders';
import type { AiProviderOption } from '../../../features/nodes/FlowNodeCard';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import { useAuth } from '../../../contexts/AuthContext';
import type { ValidationState } from '../types';
import { SIDEBAR_DEFAULT_WIDTH, PALETTE_DEFAULT_WIDTH } from '../constants';

/**
 * Central workspace state hook: project loading, role derivation,
 * provider catalog, layout state (sidebar/palette), share state, etc.
 */
export function useWorkspaceState() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { user, logout } = useAuth();
  const {
    project,
    setProject,
    mergeProject,
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
    setUiSettings,
  } = useProjectStore();

  const { integrations: globalIntegrations, fetchIntegrations } =
    useGlobalIntegrationsStore();

  const isAdmin = Boolean(user?.is_admin);

  // ---- Role / permissions ----

  const deriveRole = (): ProjectRole => {
    if (project?.role) {
      return project.role;
    }
    if (project?.user_id && user?.user_id && project.user_id === user.user_id) {
      return 'owner';
    }
    return 'viewer';
  };

  const projectRole: ProjectRole = deriveRole();
  const projectMode: 'editing' | 'viewing' =
    project?.mode ??
    (projectRole === 'owner' || projectRole === 'editor' ? 'editing' : 'viewing');
  const canEditProject = isAdmin || projectMode === 'editing';
  const canManageProject = isAdmin || projectRole === 'owner' || projectRole === 'editor';

  // ---- Running nodes ----

  const [runningNodes, setRunningNodes] = useState<string[]>([]);
  const generatingNodeSet = useMemo(() => new Set(runningNodes), [runningNodes]);

  const markNodeRunning = useCallback((nodeId: string, running: boolean) => {
    setRunningNodes((prev) => {
      if (running) {
        if (prev.includes(nodeId)) return prev;
        return [...prev, nodeId];
      }
      return prev.filter((id) => id !== nodeId);
    });
  }, []);

  // ---- Validation / notifications ----

  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });

  // ---- Layout state ----

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [paletteWidth, setPaletteWidth] = useState(PALETTE_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [paletteCollapsed, setPaletteCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // ---- UI modals / panels ----

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showNodeModal, setShowNodeModal] = useState<string | null>(null);
  const [nodeModalColorOpen, setNodeModalColorOpen] = useState(false);
  const [showNodeAiSettings, setShowNodeAiSettings] = useState<string | null>(null);

  // ---- Error / saving state ----

  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  // ---- Title / description editing ----

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(false);

  // ---- Canvas state ----

  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);
  const [savedViewport, setSavedViewport] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const [preserveViewport, setPreserveViewport] = useState(false);

  // ---- Menu state ----

  const [menuOpen, setMenuOpen] = useState(false);

  // ---- Share state ----

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareResponse | null>(null);
  const [shareFetching, setShareFetching] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareForm, setShareForm] = useState<SharePayload>({ role: 'viewer' });

  // ---- Refs ----

  const menuRef = useRef<HTMLDivElement | null>(null);
  const pendingUiRef = useRef<Map<string, NodeUI>>(new Map());
  const pendingUiTimersRef = useRef<Map<string, number>>(new Map());
  const midjourneyPollersRef = useRef<Map<string, number>>(new Map());
  const projectTitleSubmitRef = useRef(false);
  const projectDescriptionSubmitRef = useRef(false);
  const nodeContentVersionRef = useRef<Map<string, number>>(new Map());
  const nodeContentAckRef = useRef<Map<string, number>>(new Map());

  // ---- Derived / memoized ----

  const selectedNode = useMemo(
    () => selectNodeById(project, selectedNodeId),
    [project, selectedNodeId],
  );
  const previousNodes = useMemo(
    () => (selectedNode ? findPreviousNodes(project, selectedNode.node_id) : []),
    [project, selectedNode],
  );
  const nextNodes = useMemo(
    () => (selectedNode ? findNextNodes(project, selectedNode.node_id) : []),
    [project, selectedNode],
  );

  const modalNode = useMemo(
    () => (showNodeModal ? project?.nodes.find((n) => n.node_id === showNodeModal) : null),
    [project?.nodes, showNodeModal],
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
                  : DEFAULT_TEXT_MARKDOWN_TEMPLATE,
              content_type: 'text/markdown',
            }
          : item.template;
      map.set(item.slug, template);
    });
    return map;
  }, []);

  const providerCatalog = useMemo(() => {
    return new Map(PROVIDERS.map((provider) => [provider.id, provider]));
  }, []);

  const providerOptions = useMemo<AiProviderOption[]>(() => {
    try {
      const options: AiProviderOption[] = [];

      if (!globalIntegrations || !Array.isArray(globalIntegrations)) return options;

      globalIntegrations.forEach((integration) => {
        if (!integration) return;

        const hasApiKey =
          (typeof integration.apiKey === 'string' && integration.apiKey.trim().length > 0) ||
          integration.apiKeyStored === true;
        const hasBaseUrl =
          typeof integration.baseUrl === 'string' && integration.baseUrl.trim().length > 0;
        const isEnabled = integration.enabled !== false;
        const providerConfig = providerCatalog.get(integration.providerId);
        const supportsFiles = providerConfig?.supportsFiles ?? false;
        const supportedFileTypes = providerConfig?.supportedFileTypes ?? [];
        const displayName =
          integration.providerId === 'midjourney_proxy'
            ? providerConfig?.name ?? 'Midjourney Relay'
            : integration.name || providerConfig?.name || integration.providerId;
        const requiresRelay = integration.providerId === 'midjourney_proxy';
        const available =
          isEnabled && (requiresRelay ? hasApiKey && hasBaseUrl : hasApiKey);
        let reason: string | undefined;
        if (!isEnabled) {
          reason = '\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C';
        } else if (requiresRelay && (!hasApiKey || !hasBaseUrl)) {
          reason = '\u0423\u043A\u0430\u0436\u0438\u0442\u0435 Relay URL \u0438 Auth Token \u0432 \u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F\u0445.';
        } else if (!available) {
          reason = '\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 API \u043A\u043B\u044E\u0447 \u0432 \u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F\u0445, \u0447\u0442\u043E\u0431\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.';
        }

        let models: string[] = [];
        let defaultModel = '';

        if (integration.providerId === 'openai_gpt') {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : ['chatgpt-4o-latest', 'gpt-4o-mini', 'gpt-3.5-turbo'];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'gpt-4o-mini';
        } else if (integration.providerId === 'anthropic') {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'claude-3-haiku';
        } else if (
          integration.providerId === 'google_workspace' ||
          integration.providerId === 'google_gemini'
        ) {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'gemini-2.5-flash';
        } else if (integration.providerId === 'google_ai_studio') {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'gemini-2.0-flash';
        } else if (integration.providerId === 'replicate') {
          const hasStoredModels =
            Array.isArray(integration.models) && integration.models.length > 0;
          const storedModels = hasStoredModels ? integration.models : DEFAULT_REPLICATE_MODELS;
          console.log(
            '[WorkspacePage] Replicate integration:',
            integration.name,
            'Models count:',
            storedModels.length,
            'Has stored:',
            hasStoredModels,
          );
          models = storedModels;
          defaultModel =
            storedModels[0] || DEFAULT_REPLICATE_MODELS[0] || 'black-forest-labs/flux-schnell';
        } else if (integration.providerId.startsWith('midjourney_')) {
          const catalogModels = providerConfig?.models ?? [
            'midjourney-v7',
            'midjourney-v7-video',
            'midjourney-v6.1',
            'midjourney-v6',
            'midjourney-v5.2',
            'midjourney-v5.1',
            'midjourney-v5',
            'midjourney-niji-6',
            'midjourney-niji-5',
            'midjourney-niji-4',
          ];
          models = catalogModels;
          defaultModel = providerConfig?.defaultModel ?? catalogModels[0] ?? 'midjourney-v7';
        } else {
          models = ['default-model'];
          defaultModel = 'default-model';
        }

        options.push({
          id: integration.providerId,
          name: displayName,
          models,
          defaultModel,
          available,
          description: integration.description || `${integration.name} integration`,
          reason,
          modelFamilies: providerConfig?.modelFamilies,
          config: {
            api_key: integration.apiKeyStored ? undefined : integration.apiKey,
            base_url: integration.baseUrl,
            organization: integration.organization,
            relay_url: integration.baseUrl,
            auth_token: integration.apiKeyStored ? undefined : integration.apiKey,
          },
          systemPromptTemplate: integration.systemPrompt,
          inputFields: integration.inputFields || [],
          supportsFiles,
          supportedFileTypes,
        });
      });

      return options;
    } catch (err) {
      console.error('Error in providerOptions:', err);
      return [];
    }
  }, [globalIntegrations, providerCatalog]);

  return {
    // Router
    navigate,
    projectId,
    user,
    logout,

    // Store
    project,
    setProject,
    mergeProject,
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
    setUiSettings,

    // Integrations
    globalIntegrations,
    fetchIntegrations,

    // Permissions
    isAdmin,
    projectRole,
    projectMode,
    canEditProject,
    canManageProject,

    // Running nodes
    runningNodes,
    generatingNodeSet,
    markNodeRunning,

    // Validation
    validation,
    setValidation,

    // Layout
    sidebarWidth,
    setSidebarWidth,
    paletteWidth,
    setPaletteWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
    paletteCollapsed,
    setPaletteCollapsed,
    isMobile,
    setIsMobile,

    // Modals / panels
    showFeedbackModal,
    setShowFeedbackModal,
    showChatPanel,
    setShowChatPanel,
    showNodeModal,
    setShowNodeModal,
    nodeModalColorOpen,
    setNodeModalColorOpen,
    showNodeAiSettings,
    setShowNodeAiSettings,

    // Error / saving
    localError,
    setLocalError,
    isSaving,
    setIsSaving,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    lastSavedTime,
    setLastSavedTime,

    // Title / description editing
    isEditingTitle,
    setIsEditingTitle,
    isEditingDescription,
    setIsEditingDescription,
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
    editIsPublic,
    setEditIsPublic,

    // Canvas
    forceUpdateTrigger,
    setForceUpdateTrigger,
    savedViewport,
    setSavedViewport,
    preserveViewport,
    setPreserveViewport,

    // Menu
    menuOpen,
    setMenuOpen,

    // Share
    showShareModal,
    setShowShareModal,
    shareInfo,
    setShareInfo,
    shareFetching,
    setShareFetching,
    shareSaving,
    setShareSaving,
    shareError,
    setShareError,
    shareForm,
    setShareForm,

    // Refs
    menuRef,
    pendingUiRef,
    pendingUiTimersRef,
    midjourneyPollersRef,
    projectTitleSubmitRef,
    projectDescriptionSubmitRef,
    nodeContentVersionRef,
    nodeContentAckRef,

    // Derived
    selectedNode,
    previousNodes,
    nextNodes,
    modalNode,
    paletteMap,
    providerCatalog,
    providerOptions,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;
