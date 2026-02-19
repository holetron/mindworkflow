import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchQuickPromptPresets,
  fetchModelSchema,
  searchPromptPresets,
} from '../../../state/api';
import type { FlowNode, AutoPort, PromptPreset } from '../../../state/api';
import { DEFAULT_REPLICATE_MODELS } from '../../../data/defaultReplicateModels';
import { useDebouncedUpdateNodeInternals } from '../../../utils/debounce';
import { extractPlaceholderInfo } from '../../../utils/promptPlaceholders';
import { normalizePlaceholderValues, shallowEqualRecords, generateAutoPorts } from '../components/nodeUtils';
import { FALLBACK_SYSTEM_PRESETS, FALLBACK_PROVIDERS, DEFAULT_MODEL } from '../components/nodeConstants';
import type { AiProviderOption } from '../components/nodeTypes';

interface UseNodeAiOptions {
  node: FlowNode;
  isAiNode: boolean;
  disabled: boolean;
  providers: AiProviderOption[];
  allNodes: FlowNode[];
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => Promise<void>;
  updateNodeInternals: (nodeId: string) => void;
}

export function useNodeAi({
  node,
  isAiNode,
  disabled: initialDisabled,
  providers,
  allNodes,
  onChangeAi,
  onChangeMeta,
  onRemoveInvalidPorts,
  updateNodeInternals,
}: UseNodeAiOptions) {
  const [forceRender, setForceRender] = useState(0);
  const triggerRerender = useCallback(() => setForceRender((prev) => prev + 1), []);

  const debouncedUpdateNodeInternals = useDebouncedUpdateNodeInternals(updateNodeInternals, node.node_id, 50);

  const [currentProvider, setCurrentProvider] = useState(String(node.ai?.provider || ''));
  const [isInlineModelLoading, setIsInlineModelLoading] = useState(false);
  const [pendingModelSelection, setPendingModelSelection] = useState<string | null>(null);
  const [isSyncingProvider, setIsSyncingProvider] = useState(false);
  const [dynamicModels, setDynamicModels] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  // File warning modal state
  const [showFileWarningModal, setShowFileWarningModal] = useState(false);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);

  // System prompt state
  const [systemPromptValue, setSystemPromptValue] = useState(String(node.ai?.system_prompt || ''));
  const [placeholderInputs, setPlaceholderInputs] = useState<Record<string, string>>(
    () => normalizePlaceholderValues(node.ai?.placeholder_values),
  );
  const lastSavedSystemPromptRef = useRef(String(node.ai?.system_prompt || ''));
  const lastSavedPlaceholderValuesRef = useRef<Record<string, string>>(normalizePlaceholderValues(node.ai?.placeholder_values));
  const systemPromptSaveTimer = useRef<number | null>(null);
  const placeholderSaveTimer = useRef<number | null>(null);

  // Quick prompts
  const [quickSystemPrompts, setQuickSystemPrompts] = useState<PromptPreset[]>(FALLBACK_SYSTEM_PRESETS);
  const [promptSearchTerm, setPromptSearchTerm] = useState('');
  const [promptSearchResults, setPromptSearchResults] = useState<PromptPreset[]>([]);
  const [promptSearchLoading, setPromptSearchLoading] = useState(false);
  const [promptSearchError, setPromptSearchError] = useState<string | null>(null);

  // Output type
  const [outputType, setOutputType] = useState<'mindmap' | 'node' | 'folder'>(() => {
    const savedType = node.meta?.output_type as 'mindmap' | 'node' | 'folder' | undefined;
    if (savedType === 'mindmap' || savedType === 'node' || savedType === 'folder') return savedType;
    return 'node';
  });
  const userSetOutputTypeRef = useRef<'mindmap' | 'node' | 'folder' | null>(null);

  const disabled = initialDisabled || isInlineModelLoading;
  const isGenerating = isInlineModelLoading;

  useEffect(() => {
    providers.forEach((provider) => {
      if (!provider || !Array.isArray(provider.models) || provider.id !== 'replicate') return;
      const models = provider.models.length > 0 ? provider.models : DEFAULT_REPLICATE_MODELS;
      setDynamicModels((prev) => {
        const existing = prev[provider.id] ?? [];
        if (existing.length === models.length && existing.every((v, i) => v === models[i])) return prev;
        return { ...prev, [provider.id]: models };
      });
      setLoadingModels((prev) => ({ ...prev, [provider.id]: false }));
    });
  }, [providers]);

  useEffect(() => { setCurrentProvider(String(node.ai?.provider || '')); }, [node.ai?.provider]);
  useEffect(() => { if (pendingModelSelection && (typeof node.ai?.model === 'string' ? node.ai.model.trim() : '') === pendingModelSelection) setPendingModelSelection(null); }, [node.ai?.model, pendingModelSelection]);
  useEffect(() => { const incoming = String(node.ai?.system_prompt || ''); lastSavedSystemPromptRef.current = incoming; setSystemPromptValue((prev) => (prev === incoming ? prev : incoming)); }, [node.node_id, node.ai?.system_prompt]);
  useEffect(() => { const normalized = normalizePlaceholderValues(node.ai?.placeholder_values); if (!shallowEqualRecords(lastSavedPlaceholderValuesRef.current, normalized)) lastSavedPlaceholderValuesRef.current = normalized; setPlaceholderInputs((prev) => (shallowEqualRecords(prev, normalized) ? prev : normalized)); }, [node.node_id, node.ai?.placeholder_values]);
  useEffect(() => {
    const newOutputType = (node.meta?.output_type as 'mindmap' | 'node' | 'folder') || null;
    const isMidjourney = currentProvider === 'midjourney_proxy' || currentProvider === 'midjourney_mindworkflow_relay' || currentProvider === 'midjourney';
    if (newOutputType === null) return;
    const finalOutputType = isMidjourney && newOutputType === 'mindmap' ? 'node' : newOutputType;
    setOutputType((prev) => { if (userSetOutputTypeRef.current !== null) return userSetOutputTypeRef.current; return prev !== finalOutputType ? finalOutputType : prev; });
  }, [node.meta?.output_type, currentProvider]);

  // Load quick prompts
  useEffect(() => {
    let cancelled = false;
    const loadQuickPrompts = async () => {
      try {
        const system = await fetchQuickPromptPresets('system_prompt', 12);
        if (!cancelled) setQuickSystemPrompts(system.length > 0 ? system : FALLBACK_SYSTEM_PRESETS);
      } catch (error) {
        if (!cancelled) setQuickSystemPrompts(FALLBACK_SYSTEM_PRESETS);
      }
    };
    void loadQuickPrompts();
    return () => { cancelled = true; };
  }, []);

  // Prompt search
  useEffect(() => {
    const term = promptSearchTerm.trim();
    if (term.length < 2) {
      setPromptSearchResults([]);
      setPromptSearchLoading(false);
      setPromptSearchError(null);
      return;
    }
    let cancelled = false;
    setPromptSearchLoading(true);
    setPromptSearchError(null);
    const handle = window.setTimeout(async () => {
      try {
        const results = await searchPromptPresets({ category: 'system_prompt', search: term, limit: 12 });
        if (!cancelled) { setPromptSearchResults(results); setPromptSearchLoading(false); }
      } catch (error) {
        if (!cancelled) {
          setPromptSearchError(error instanceof Error ? error.message : 'Search failed');
          setPromptSearchLoading(false);
        }
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [promptSearchTerm]);

  // Cleanup save timers
  useEffect(() => {
    return () => {
      if (systemPromptSaveTimer.current !== null) {
        window.clearTimeout(systemPromptSaveTimer.current);
        if (onChangeAi && lastSavedSystemPromptRef.current !== systemPromptValue) {
          onChangeAi(node.node_id, { system_prompt: systemPromptValue });
        }
      }
      if (placeholderSaveTimer.current !== null) {
        window.clearTimeout(placeholderSaveTimer.current);
        if (onChangeAi && !shallowEqualRecords(lastSavedPlaceholderValuesRef.current, placeholderInputs)) {
          onChangeAi(node.node_id, { placeholder_values: placeholderInputs });
        }
      }
    };
  }, [onChangeAi, node.node_id, systemPromptValue, placeholderInputs]);

  // Update ReactFlow internals when AI node ports change
  useEffect(() => {
    if (node.type === 'ai' && node.ai?.auto_ports) {
      debouncedUpdateNodeInternals();
    }
  }, [node.type, node.ai?.auto_ports, node.node_id, debouncedUpdateNodeInternals]);

  // Computed values
  const selectedProvider = useMemo(() => {
    if (!isAiNode || !currentProvider) return null;
    return providers.find((p) => p.id === currentProvider) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiNode, currentProvider, providers, forceRender]);

  const inlineModelValue = useMemo(() => {
    const rawModel = typeof node.ai?.model === 'string' ? node.ai.model.trim() : '';
    if (rawModel) return rawModel;
    if (selectedProvider?.defaultModel) return selectedProvider.defaultModel;
    if (selectedProvider?.models && selectedProvider.models.length > 0) {
      const candidate = selectedProvider.models[0];
      return typeof candidate === 'string' ? candidate : String(candidate);
    }
    return '';
  }, [node.ai?.model, selectedProvider]);

  const providerModelOptions = useMemo(() => {
    let baseModels: string[] = [];
    const dynamicForProvider = currentProvider ? dynamicModels[currentProvider] : undefined;
    if (Array.isArray(dynamicForProvider) && dynamicForProvider.length > 0) {
      baseModels = dynamicForProvider.map((v) => (typeof v === 'string' ? v.trim() : String(v))).filter(Boolean);
    } else if (selectedProvider?.models) {
      baseModels = selectedProvider.models.map((v) => (typeof v === 'string' ? v.trim() : String(v))).filter(Boolean);
    }
    const extraModels = [inlineModelValue, pendingModelSelection].filter(
      (v): v is string => Boolean(v && v.trim().length > 0),
    );
    if (extraModels.length > 0) baseModels = [...extraModels, ...baseModels];
    const unique = Array.from(new Set(baseModels.map((v) => (typeof v === 'string' ? v.trim() : String(v))))).filter(Boolean);
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [currentProvider, dynamicModels, selectedProvider, inlineModelValue, pendingModelSelection]);

  const currentProviderLabel = useMemo(() => {
    if (selectedProvider?.name) return selectedProvider.name;
    if (currentProvider) return currentProvider;
    return '\u2014';
  }, [selectedProvider, currentProvider]);

  const aiCharacterCount = useMemo(() => {
    if (!isAiNode) return (node.content || '').length;
    const sp = typeof node.ai?.system_prompt === 'string' ? node.ai.system_prompt : '';
    const oe = typeof node.ai?.output_example === 'string' ? node.ai.output_example : '';
    const up = typeof node.ai?.user_prompt_template === 'string' ? node.ai.user_prompt_template : '';
    const cp = typeof node.content === 'string' ? node.content : '';
    return sp.length + oe.length + up.length + cp.length;
  }, [isAiNode, node.ai?.system_prompt, node.ai?.output_example, node.ai?.user_prompt_template, node.content]);

  const hasFileInputs = useMemo(() => {
    if (!isAiNode) return false;
    const currentRouting = (node.routing as { inputPorts?: Array<{ type: string }> }) || { inputPorts: [] };
    const filePortTypes = ['image', 'audio', 'video', 'file'];
    return currentRouting.inputPorts?.some((port) => filePortTypes.includes(port.type)) || false;
  }, [isAiNode, node.routing]);

  const getFileTypes = useCallback(() => {
    if (!isAiNode) return [];
    const currentRouting = (node.routing as { inputPorts?: Array<{ type: string }> }) || { inputPorts: [] };
    const filePortTypes = ['image', 'audio', 'video', 'file'];
    return (
      currentRouting.inputPorts
        ?.filter((port) => filePortTypes.includes(port.type))
        ?.map((port) => {
          switch (port.type) {
            case 'image': return 'Images';
            case 'audio': return 'Audio';
            case 'video': return 'Video';
            case 'file': return 'Files';
            default: return port.type;
          }
        }) || []
    );
  }, [isAiNode, node.routing]);

  const placeholderInfo = useMemo(() => {
    const availableNodes = allNodes ?? [];
    return extractPlaceholderInfo(systemPromptValue, availableNodes, node);
  }, [systemPromptValue, allNodes, node]);

  // Handlers
  const handleOutputTypeChange = useCallback(
    (type: 'mindmap' | 'node' | 'folder') => {
      setOutputType(type);
      userSetOutputTypeRef.current = type;
      onChangeMeta(node.node_id, { output_type: type });
    },
    [node.node_id, onChangeMeta],
  );

  const handleSystemPromptChange = useCallback(
    (systemPrompt: string) => {
      setSystemPromptValue(systemPrompt);
      if (systemPromptSaveTimer.current !== null) window.clearTimeout(systemPromptSaveTimer.current);
      if (!onChangeAi) return;
      systemPromptSaveTimer.current = window.setTimeout(() => {
        systemPromptSaveTimer.current = null;
        lastSavedSystemPromptRef.current = systemPrompt;
        onChangeAi(node.node_id, { system_prompt: systemPrompt });
      }, 400);
    },
    [onChangeAi, node.node_id],
  );

  const schedulePlaceholderSave = useCallback(
    (values: Record<string, string>) => {
      if (!onChangeAi) return;
      if (placeholderSaveTimer.current !== null) window.clearTimeout(placeholderSaveTimer.current);
      const snapshot = { ...values };
      placeholderSaveTimer.current = window.setTimeout(() => {
        placeholderSaveTimer.current = null;
        lastSavedPlaceholderValuesRef.current = snapshot;
        onChangeAi(node.node_id, { placeholder_values: snapshot });
      }, 400);
    },
    [onChangeAi, node.node_id],
  );

  const handlePlaceholderInputChange = useCallback(
    (name: string, rawValue: string) => {
      setPlaceholderInputs((prev) => {
        const next = { ...prev };
        if (rawValue.trim().length === 0) {
          if (!(name in next)) return prev;
          delete next[name];
        } else if (next[name] === rawValue) {
          return prev;
        } else {
          next[name] = rawValue;
        }
        schedulePlaceholderSave(next);
        return next;
      });
    },
    [schedulePlaceholderSave],
  );

  // Model loading
  const fetchGoogleModels = useCallback(async (): Promise<string[]> => {
    try { const r = await fetch('/api/integrations/google/models'); if (!r.ok) throw new Error(`HTTP ${r.status}`); const d = await r.json(); return Array.isArray(d.models) ? d.models : []; } catch { return []; }
  }, []);

  const fetchOpenAIModels = useCallback(async (): Promise<string[]> => {
    try { const r = await fetch('/api/integrations/openai/models'); if (!r.ok) throw new Error(`HTTP ${r.status}`); const d = await r.json(); return Array.isArray(d.models) ? d.models : []; } catch { return []; }
  }, []);

  const loadModelsForProvider = useCallback(
    async (providerId: string) => {
      if (loadingModels[providerId] || dynamicModels[providerId]) return;
      setLoadingModels((prev) => ({ ...prev, [providerId]: true }));
      try {
        let models: string[] = [];
        const providerConfig = providers.find((p) => p.id === providerId) ?? FALLBACK_PROVIDERS.find((p) => p.id === providerId);
        if (Array.isArray(providerConfig?.models) && providerConfig!.models.length > 0) {
          models = providerConfig!.models;
        } else if (providerId === 'replicate') {
          models = DEFAULT_REPLICATE_MODELS;
        } else if (providerId === 'google' || providerId.includes('google')) {
          models = await fetchGoogleModels();
        } else if (providerId === 'openai' || providerId.includes('openai')) {
          models = await fetchOpenAIModels();
        }
        setDynamicModels((prev) => ({ ...prev, [providerId]: models }));
      } catch {
        setDynamicModels((prev) => ({ ...prev, [providerId]: [] }));
      } finally {
        setLoadingModels((prev) => ({ ...prev, [providerId]: false }));
      }
    },
    [loadingModels, dynamicModels, fetchGoogleModels, fetchOpenAIModels, providers],
  );

  // Auto-load models
  useEffect(() => {
    if (isAiNode && node.ai?.provider) {
      const cp = typeof node.ai.provider === 'string' ? node.ai.provider : '';
      if (cp && !dynamicModels[cp] && !loadingModels[cp]) {
        const timer = setTimeout(() => loadModelsForProvider(cp), 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAiNode, node.ai?.provider, dynamicModels, loadingModels, loadModelsForProvider]);

  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;
      if (hasFileInputs && !provider.supportsFiles) {
        setPendingProviderId(providerId);
        setShowFileWarningModal(true);
        return;
      }
      setCurrentProvider(providerId);
      onChangeAi?.(node.node_id, { ...node.ai, provider: providerId, model: provider.defaultModel });
      triggerRerender();
      debouncedUpdateNodeInternals();
      setTimeout(() => loadModelsForProvider(providerId), 500);
    },
    [onChangeAi, node.node_id, node.ai, providers, hasFileInputs, loadModelsForProvider, debouncedUpdateNodeInternals, triggerRerender],
  );

  const syncProviderWithServer = useCallback(async () => {
    if (!isAiNode || !currentProvider || isSyncingProvider) return;
    setIsSyncingProvider(true);
    try {
      const provider = providers.find((p) => p.id === currentProvider);
      if (!provider) return;
      const serverProvider = String(node.ai?.provider || '');
      const needsUpdate = serverProvider !== currentProvider;
      if (needsUpdate || !node.ai?.model) {
        onChangeAi?.(node.node_id, { ...node.ai, provider: currentProvider, model: node.ai?.model || provider.defaultModel });
        triggerRerender();
      }
      if (!dynamicModels[currentProvider] && !loadingModels[currentProvider]) {
        await loadModelsForProvider(currentProvider);
      }
    } catch (error) {
      console.error('Failed to sync provider:', error);
    } finally {
      setIsSyncingProvider(false);
    }
  }, [isAiNode, currentProvider, providers, node.ai, node.node_id, onChangeAi, dynamicModels, loadingModels, loadModelsForProvider, triggerRerender, isSyncingProvider]);

  const handleInlineModelChange = useCallback(
    async (model: string) => {
      const trimmed = model.trim();
      if (!trimmed) return;
      setPendingModelSelection(trimmed);
      const providerId = currentProvider || (typeof node.ai?.provider === 'string' ? node.ai.provider : '');
      if (!onChangeAi) { setTimeout(() => setPendingModelSelection(null), 0); return; }
      if (providerId !== 'replicate') {
        onChangeAi(node.node_id, { ...node.ai, model: trimmed });
        triggerRerender();
        debouncedUpdateNodeInternals();
        return;
      }
      const currentModel = typeof node.ai?.model === 'string' ? node.ai.model.trim() : '';
      if (trimmed === currentModel) { triggerRerender(); debouncedUpdateNodeInternals(); setPendingModelSelection(null); return; }
      setIsInlineModelLoading(true);
      try {
        const schema = await fetchModelSchema(providerId, trimmed);
        const inputs = Array.isArray(schema.inputs) ? schema.inputs : [];
        const requiredFields = inputs.filter((i) => i.required && i.name !== 'prompt');
        const requiredPortNames = requiredFields.map((f) => f.name);
        const availablePortNames = inputs.map((i) => i.name);
        const metaEnabledPorts = Array.isArray(node.meta?.enabled_ports)
          ? (node.meta?.enabled_ports as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          : [];
        const currentAutoPortIds = Array.isArray(node.ai?.auto_ports)
          ? (node.ai.auto_ports as AutoPort[]).map((p) => (typeof p?.id === 'string' ? p.id.trim() : '')).filter((id) => id.length > 0)
          : [];
        const invalidPorts = Array.from(new Set([
          ...metaEnabledPorts.filter((p) => !availablePortNames.includes(p)),
          ...currentAutoPortIds.filter((p) => !availablePortNames.includes(p)),
        ]));
        if (invalidPorts.length > 0 && onRemoveInvalidPorts) {
          try { await onRemoveInvalidPorts(node.node_id, invalidPorts); } catch { /* ignore */ }
        }
        const preservedPorts = Array.from(new Set([
          ...metaEnabledPorts.filter((p) => availablePortNames.includes(p)),
          ...currentAutoPortIds.filter((p) => availablePortNames.includes(p)),
        ]));
        const enabledPorts = Array.from(new Set([...preservedPorts, ...requiredPortNames]));
        const autoPorts = generateAutoPorts(inputs, enabledPorts);
        onChangeAi(node.node_id, { ...node.ai, model: trimmed, auto_ports: autoPorts });
        if (onChangeMeta) onChangeMeta(node.node_id, { enabled_ports: enabledPorts });
      } catch {
        onChangeAi(node.node_id, { ...node.ai, model: trimmed, auto_ports: undefined });
      } finally {
        setIsInlineModelLoading(false);
        triggerRerender();
        debouncedUpdateNodeInternals();
      }
    },
    [currentProvider, node.ai, node.meta?.enabled_ports, node.node_id, onChangeAi, onChangeMeta, onRemoveInvalidPorts, triggerRerender, debouncedUpdateNodeInternals],
  );

  const handleContinueWithoutFiles = useCallback(() => {
    if (!pendingProviderId) return;
    const provider = providers.find((p) => p.id === pendingProviderId);
    if (!provider) return;
    onChangeAi?.(node.node_id, { ...node.ai, provider: pendingProviderId, model: provider.defaultModel });
    setShowFileWarningModal(false);
    setPendingProviderId(null);
  }, [onChangeAi, node.node_id, node.ai, providers, pendingProviderId]);

  const handleSwitchToFileProvider = useCallback(() => {
    const fileProvider = providers.find((p) => p.supportsFiles) || FALLBACK_PROVIDERS.find((p) => p.supportsFiles);
    if (!fileProvider) return;
    onChangeAi?.(node.node_id, { ...node.ai, provider: fileProvider.id, model: fileProvider.defaultModel });
    setShowFileWarningModal(false);
    setPendingProviderId(null);
  }, [onChangeAi, node.node_id, node.ai, providers]);

  const handleCloseFileWarning = useCallback(() => {
    setShowFileWarningModal(false);
    setPendingProviderId(null);
  }, []);

  return {
    currentProvider, selectedProvider, isInlineModelLoading, pendingModelSelection,
    isSyncingProvider, dynamicModels, loadingModels, forceRender,
    showFileWarningModal, pendingProviderId, systemPromptValue, placeholderInputs,
    quickSystemPrompts, promptSearchTerm, setPromptSearchTerm,
    promptSearchResults, setPromptSearchResults, promptSearchLoading,
    promptSearchError, setPromptSearchError, outputType, disabled, isGenerating,
    inlineModelValue, providerModelOptions, currentProviderLabel, aiCharacterCount,
    hasFileInputs, getFileTypes, placeholderInfo,
    handleOutputTypeChange, handleSystemPromptChange, handlePlaceholderInputChange,
    handleProviderChange, handleInlineModelChange, handleContinueWithoutFiles,
    handleSwitchToFileProvider, handleCloseFileWarning, syncProviderWithServer,
    triggerRerender, debouncedUpdateNodeInternals,
  };
}
