import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useUpdateNodeInternals } from 'reactflow';

import type { PromptPreset, AutoPort, ModelSchemaInput } from '../../state/api';
import { fetchQuickPromptPresets, searchPromptPresets, fetchModelSchema } from '../../state/api';
import type { AgentInputField } from '../../features/chat/types';
import { defaultMindmapExample, defaultPlannerPrompt } from '../../data/promptPresets';
import { buildUserPromptTemplate, extractPlaceholderInfo } from '../../utils/promptPlaceholders';
import { useDebouncedUpdateNodeInternals } from '../../utils/debounce';

import type { AiSettingsModalProps, AiSettingsSharedState, AiProviderOption, FlowNode } from './types';
import { MIDJOURNEY_DEFAULT_PORTS, V7_INCOMPATIBLE_PORTS, V6_INCOMPATIBLE_PORTS } from './types';
import { generateAutoPorts, getMidjourneyVersion, getNodeIcon } from './utilities';
import { useDataHelpers } from './useDataHelpers';

const FALLBACK_SYSTEM_PRESETS: PromptPreset[] = [
  { preset_id: 'fallback-system-planner', category: 'system_prompt', label: 'Planner', description: 'Basic system prompt for generating workflow plans', content: defaultPlannerPrompt, tags: ['default', 'planner'], is_quick_access: true, sort_order: 0, created_at: '', updated_at: '' },
];
const FALLBACK_OUTPUT_PRESETS: PromptPreset[] = [
  { preset_id: 'fallback-output-mindmap', category: 'output_example', label: 'Mindmap', description: 'Output example in mindmap format', content: defaultMindmapExample, tags: ['default', 'mindmap'], is_quick_access: true, sort_order: 0, created_at: '', updated_at: '' },
];

export function useAiSettingsState(props: AiSettingsModalProps): AiSettingsSharedState {
  const {
    node, activeTab, onChangeAi, onUpdateNodeMeta, onRemoveInvalidPorts,
    providers = [], loading = false,
    dynamicModels: externalDynamicModels = {}, loadingModels: externalLoadingModels = {},
    onOpen, allNodes = [], sources = [], targets = [], edges = [],
  } = props;

  const updateNodeInternals = useUpdateNodeInternals();
  const debouncedUpdateNodeInternals = useDebouncedUpdateNodeInternals(updateNodeInternals, node.node_id, 50);

  const prevModelRef = useRef<string | number | undefined>(node.ai?.model);
  const prevProviderRef = useRef<string | undefined>(node.ai?.provider);
  const [isInitializing, setIsInitializing] = useState(true);
  const initializationCompleteRef = useRef(false);

  const [systemPromptValue, setSystemPromptValue] = useState(String(node.ai?.system_prompt || ''));
  const [outputExampleValue, setOutputExampleValue] = useState(String(node.ai?.output_example || ''));
  const [hasChanges, setHasChanges] = useState(false);
  const [quickSystemPrompts, setQuickSystemPrompts] = useState<PromptPreset[]>(FALLBACK_SYSTEM_PRESETS);
  const [quickOutputExamples, setQuickOutputExamples] = useState<PromptPreset[]>(FALLBACK_OUTPUT_PRESETS);
  const [promptSearchTerm, setPromptSearchTerm] = useState('');
  const [promptSearchResults, setPromptSearchResults] = useState<PromptPreset[]>([]);
  const [promptSearchLoading, setPromptSearchLoading] = useState(false);
  const [promptSearchError, setPromptSearchError] = useState<string | null>(null);
  const [userPromptValue, setUserPromptValue] = useState(String(node.ai?.user_prompt_template || ''));
  const [autoGenerateUserPrompt, setAutoGenerateUserPrompt] = useState(() => !node.ai?.user_prompt_template);

  const [modelInputs, setModelInputs] = useState<ModelSchemaInput[]>([]);
  const [contextLimit, setContextLimit] = useState<number>(32000);
  const [loadingModelInfo, setLoadingModelInfo] = useState(false);

  const [pendingEnabledPorts, setPendingEnabledPorts] = useState<string[]>(node.meta?.enabled_ports as string[] || []);
  const [pendingAutoPorts, setPendingAutoPorts] = useState<AutoPort[]>(node.ai?.auto_ports || []);
  const [invalidPortsWithEdges, setInvalidPortsWithEdges] = useState<string[]>([]);

  const [systemPromptTarget, setSystemPromptTarget] = useState<string>(String(node.ai?.field_mapping?.system_prompt_target || 'prompt'));
  const [systemPromptSource, setSystemPromptSource] = useState<'manual' | 'port'>((node.ai?.field_mapping?.system_prompt_source as 'manual' | 'port') || 'manual');
  const [outputExampleTarget, setOutputExampleTarget] = useState<string>(String(node.ai?.field_mapping?.output_example_target || 'prompt'));
  const [outputExampleSource, setOutputExampleSource] = useState<'manual' | 'port'>((node.ai?.field_mapping?.output_example_source as 'manual' | 'port') || 'manual');
  const [temperatureTarget, setTemperatureTarget] = useState<string>(String(node.ai?.field_mapping?.temperature_target || 'temperature'));
  const [temperatureSource, setTemperatureSource] = useState<'manual' | 'port'>((node.ai?.field_mapping?.temperature_source as 'manual' | 'port') || 'manual');
  const [additionalFieldsMapping, setAdditionalFieldsMapping] = useState<Record<string, any>>((node.ai?.field_mapping?.additional_fields as Record<string, any>) || {});
  const [additionalFieldsValues, setAdditionalFieldsValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    const meta = node.meta as any;
    if (meta) { Object.keys(meta).forEach(key => { if (typeof meta[key] === 'string' || typeof meta[key] === 'number') values[key] = String(meta[key]); }); }
    return values;
  });

  const fileDeliveryFormat: 'url' | 'base64' = typeof node.ai?.file_delivery_format === 'string' && node.ai.file_delivery_format.trim().toLowerCase() === 'base64' ? 'base64' : 'url';
  const [previewPayload, setPreviewPayload] = useState<Record<string, any>>({});
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPreviewPayload = useCallback(async () => {
    if (!node.project_id) return;
    try {
      setPreviewLoading(true);
      const response = await fetch(`/api/node/${node.node_id}/ai/preview-payload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: node.project_id }) });
      if (!response.ok) { setPreviewPayload({}); return; }
      setPreviewPayload(await response.json());
    } catch { setPreviewPayload({}); } finally { setPreviewLoading(false); }
  }, [node.node_id, node.project_id]);

  useEffect(() => { if (activeTab === 'request') fetchPreviewPayload(); }, [activeTab, fetchPreviewPayload]);

  const handleFileDeliveryFormatChange = (format: 'url' | 'base64') => {
    if (!onChangeAi) return;
    onChangeAi(node.node_id, { ...(node.ai ?? {}), file_delivery_format: format });
    setHasChanges(true);
  };

  const [viewMode, setViewMode] = useState<'simple' | 'full'>('full');

  const placeholderInfo = extractPlaceholderInfo(systemPromptValue, allNodes, node);
  const generatedUserPrompt = buildUserPromptTemplate(placeholderInfo);
  const unresolvedPlaceholders = placeholderInfo.filter((item) => item.reference && item.resolvedValue === undefined);

  // Data helpers (port data, node context, computed values) extracted to useDataHelpers
  const {
    incomingNodes, outgoingNodes, getNodeContentPreview, getNodesAtDepth,
    getPortData, getPortDataList, formatNodeForContext,
    autoPortSourceIds, autoInputsPreview, contextPreview, contextCharCount,
  } = useDataHelpers({ node, allNodes, sources, targets, pendingAutoPorts, pendingEnabledPorts });

  // Dynamic models state
  const [localDynamicModels, setLocalDynamicModels] = useState<Record<string, string[]>>({});
  const [localLoadingModels, setLocalLoadingModels] = useState<Record<string, boolean>>({});
  const dynamicModels = Object.keys(externalDynamicModels).length > 0 ? externalDynamicModels : localDynamicModels;
  const loadingModels = Object.keys(externalLoadingModels).length > 0 ? externalLoadingModels : localLoadingModels;

  // Replicate metadata
  const metaRecord = (node.meta ?? {}) as Record<string, unknown>;
  const replicatePredictionUrl = typeof metaRecord['replicate_prediction_url'] === 'string' ? metaRecord['replicate_prediction_url'] as string : '';
  const replicatePredictionApiUrl = typeof metaRecord['replicate_prediction_api_url'] === 'string' ? metaRecord['replicate_prediction_api_url'] as string : '';
  const replicatePredictionId = typeof metaRecord['replicate_prediction_id'] === 'string' ? metaRecord['replicate_prediction_id'] as string : '';
  const replicateStatusRaw = typeof metaRecord['replicate_status'] === 'string' ? metaRecord['replicate_status'] as string : '';
  const replicateStatus = replicateStatusRaw.trim();
  const replicateStatusLabel = replicateStatus ? replicateStatus.charAt(0).toUpperCase() + replicateStatus.slice(1) : '\u2014';
  const replicateStatusColor = replicateStatus === 'succeeded' ? 'text-emerald-300' : replicateStatus === 'failed' ? 'text-rose-300' : replicateStatus ? 'text-sky-200' : 'text-slate-400';
  const replicatePredictionIdMasked = replicatePredictionId.length > 18 ? `${replicatePredictionId.slice(0, 8)}\u2026${replicatePredictionId.slice(-6)}` : replicatePredictionId;

  const [forceRender, setForceRender] = useState(0);
  const [currentProvider, setCurrentProvider] = useState(String(node.ai?.provider || ''));
  const [midjourneyMode, setMidjourneyMode] = useState<'photo' | 'video'>(() => {
    const raw = typeof node.ai?.midjourney_mode === 'string' ? node.ai.midjourney_mode : '';
    return raw === 'video' ? 'video' : 'photo';
  });

  useEffect(() => { setCurrentProvider(String(node.ai?.provider || '')); }, [node.ai?.provider]);
  useEffect(() => { const raw = typeof node.ai?.midjourney_mode === 'string' ? node.ai.midjourney_mode : ''; setMidjourneyMode(raw === 'video' ? 'video' : 'photo'); }, [node.ai?.midjourney_mode]);

  useEffect(() => {
    setCurrentProvider(String(node.ai?.provider || ''));
    setForceRender(prev => prev + 1);
    if (onOpen) onOpen();
  }, []);

  // Load quick prompts
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [system, output] = await Promise.all([fetchQuickPromptPresets('system_prompt', 12), fetchQuickPromptPresets('output_example', 12)]);
        if (cancelled) return;
        setQuickSystemPrompts(system.length > 0 ? system : FALLBACK_SYSTEM_PRESETS);
        setQuickOutputExamples(output.length > 0 ? output : FALLBACK_OUTPUT_PRESETS);
      } catch { if (!cancelled) { setQuickSystemPrompts(FALLBACK_SYSTEM_PRESETS); setQuickOutputExamples(FALLBACK_OUTPUT_PRESETS); } }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { const next = String(node.ai?.user_prompt_template || ''); setUserPromptValue(next); setAutoGenerateUserPrompt(next.trim().length === 0); }, [node.node_id, node.ai?.user_prompt_template]);

  // Prompt search
  useEffect(() => {
    const term = promptSearchTerm.trim();
    if (term.length < 2) { setPromptSearchResults([]); setPromptSearchLoading(false); setPromptSearchError(null); return; }
    let cancelled = false;
    setPromptSearchLoading(true); setPromptSearchError(null);
    const handle = window.setTimeout(async () => {
      try { const results = await searchPromptPresets({ category: 'system_prompt', search: term, limit: 12 }); if (!cancelled) { setPromptSearchResults(results); setPromptSearchLoading(false); } }
      catch (error) { if (!cancelled) { setPromptSearchError(error instanceof Error ? error.message : 'Search failed'); setPromptSearchLoading(false); } }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [promptSearchTerm]);

  useEffect(() => {
    if (!autoGenerateUserPrompt || placeholderInfo.length === 0 || !generatedUserPrompt.trim()) return;
    setUserPromptValue(prev => { if (prev === generatedUserPrompt) return prev; setHasChanges(true); return generatedUserPrompt; });
  }, [autoGenerateUserPrompt, generatedUserPrompt, placeholderInfo.length]);

  // Restore ports from field_mapping
  useEffect(() => {
    const modelJustChanged = prevModelRef.current !== node.ai?.model;
    const providerJustChanged = prevProviderRef.current !== node.ai?.provider;
    if (modelJustChanged || providerJustChanged) return;
    const portsToEnable: string[] = [];
    if (node.ai?.field_mapping) {
      const mapping = node.ai.field_mapping as any;
      if (mapping.system_prompt_source === 'port') { portsToEnable.push('system_prompt'); setSystemPromptSource('port'); }
      if (mapping.output_example_source === 'port') { portsToEnable.push('output_example'); setOutputExampleSource('port'); }
      if (mapping.temperature_source === 'port') { portsToEnable.push('temperature'); setTemperatureSource('port'); }
      if (mapping.additional_fields) { setAdditionalFieldsMapping(mapping.additional_fields); Object.entries(mapping.additional_fields).forEach(([key, value]: [string, any]) => { if (value?.source === 'port') portsToEnable.push(key); }); }
    }
    if (node.ai?.auto_ports && node.ai.auto_ports.length > 0) node.ai.auto_ports.forEach((port: any) => { if (!portsToEnable.includes(port.id)) portsToEnable.push(port.id); });
    if (portsToEnable.length > 0) setPendingEnabledPorts(prev => [...new Set([...prev, ...portsToEnable])]);
  }, [node.ai?.field_mapping, node.ai?.auto_ports]);

  useEffect(() => {
    if (pendingEnabledPorts.length > 0 || node.ai?.auto_ports) debouncedUpdateNodeInternals();
  }, [pendingEnabledPorts, node.node_id, debouncedUpdateNodeInternals, node.ai?.auto_ports]);

  // Model loading functions
  const fetchGoogleModels = useCallback(async () => { try { const r = await fetch('/api/integrations/google/models', { credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d.models) ? d.models : []; } catch { return []; } }, []);
  const fetchOpenAIModels = useCallback(async () => { try { const r = await fetch('/api/integrations/openai/models', { credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d.models) ? d.models : []; } catch { return []; } }, []);

  const loadModelsForProvider = useCallback(async (providerId: string) => {
    if (Object.keys(externalLoadingModels).length > 0) return;
    const supported = ['google_gemini', 'google_workspace', 'google', 'openai_gpt', 'openai'];
    if (!supported.includes(providerId) || loadingModels[providerId] || (dynamicModels[providerId] && dynamicModels[providerId].length > 0)) return;
    if (Object.keys(externalDynamicModels).length === 0) setLocalLoadingModels(prev => ({ ...prev, [providerId]: true }));
    try {
      let models: string[] = [];
      const config = providers.find(p => p.id === providerId);
      if (['google_gemini', 'google_workspace', 'google'].includes(providerId)) models = await fetchGoogleModels();
      else if (['openai_gpt', 'openai'].includes(providerId)) models = await fetchOpenAIModels();
      if ((!models || models.length === 0) && config?.models?.length) models = config.models;
      if (models && models.length > 0 && Object.keys(externalDynamicModels).length === 0) setLocalDynamicModels(prev => ({ ...prev, [providerId]: models }));
    } catch {} finally { if (Object.keys(externalDynamicModels).length === 0) setLocalLoadingModels(prev => ({ ...prev, [providerId]: false })); }
  }, [loadingModels, dynamicModels, fetchGoogleModels, fetchOpenAIModels, externalLoadingModels, externalDynamicModels, providers]);

  const selectedProvider = useMemo(() => { try { return providers.find(p => p.id === (currentProvider || node.ai?.provider)) || null; } catch { return null; } }, [providers, currentProvider, node.ai?.provider, forceRender]);

  const availableModels = useMemo(() => {
    try {
      if (!selectedProvider) return [];
      const dm = dynamicModels[selectedProvider.id];
      if (dm && dm.length > 0) return dm;
      if (selectedProvider.id.startsWith('midjourney_') && selectedProvider.modelFamilies) {
        const family = selectedProvider.modelFamilies.find(e => e.id === midjourneyMode) ?? selectedProvider.modelFamilies[0];
        if (family) return family.models.map(m => m.id);
      }
      return selectedProvider.models || [];
    } catch { return []; }
  }, [selectedProvider, dynamicModels, midjourneyMode, forceRender]);

  const getModelLabel = useCallback((modelId: string): string => {
    if (selectedProvider?.modelFamilies) { for (const f of selectedProvider.modelFamilies) { const found = f.models.find(m => m.id === modelId); if (found) return found.label; } }
    return modelId;
  }, [selectedProvider]);

  const handleProviderSelect = useCallback((providerId: string) => {
    setCurrentProvider(providerId);
    if (!onChangeAi) return;
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    const ds = dynamicModels[providerId];
    const computedModel = ((ds && ds.length > 0 && ds[0]) || provider.defaultModel || (provider.models && provider.models.length > 0 ? provider.models[0] : '') || '').toString();
    let nextMode: 'photo' | 'video' | undefined;
    if (provider.id.startsWith('midjourney_') && provider.modelFamilies) {
      const ff = provider.modelFamilies.find(f => f.models.some(m => m.id === computedModel));
      nextMode = ff?.id === 'video' ? 'video' : 'photo';
      if (nextMode) setMidjourneyMode(nextMode);
    }
    onChangeAi(node.node_id, { ...node.ai, provider: providerId, model: computedModel, ...(provider.id.startsWith('midjourney_') ? { midjourney_mode: nextMode ?? midjourneyMode } : {}) });
    setForceRender(prev => prev + 1);
    if (!dynamicModels[providerId] && !loadingModels[providerId]) void loadModelsForProvider(providerId);
  }, [onChangeAi, providers, dynamicModels, loadingModels, loadModelsForProvider, node.ai, node.node_id, midjourneyMode]);

  const buildInputFieldsFromPortSources = useCallback((): AgentInputField[] => {
    const fields: AgentInputField[] = [];
    if (systemPromptSource === 'port') fields.push({ name: 'system_prompt', label: 'System Prompt', type: 'textarea', required: false, placeholder: 'Enter system prompt...' });
    if (outputExampleSource === 'port') fields.push({ name: 'output_example', label: 'Output Example', type: 'textarea', required: false, placeholder: 'Enter output example...' });
    if (temperatureSource === 'port') fields.push({ name: 'temperature', label: 'Temperature', type: 'number', required: false, placeholder: '0.7' });
    if (additionalFieldsMapping && typeof additionalFieldsMapping === 'object') {
      Object.entries(additionalFieldsMapping).forEach(([fk, fm]) => {
        if (fm.source === 'port') { const fi = modelInputs.find(i => i.name === fk); let ft: 'text' | 'textarea' | 'number' | 'select' = 'text'; if (fi?.type === 'number' || fi?.type === 'integer') ft = 'number'; else if (fi?.options && fi.options.length > 0) ft = 'select'; fields.push({ name: fk, label: fi?.description || fk, type: ft, required: fi?.required || false, placeholder: fi?.description || `Enter ${fk}...`, options: fi?.options?.map(o => o.value), defaultValue: fi?.default }); }
      });
    }
    return fields;
  }, [systemPromptSource, outputExampleSource, temperatureSource, additionalFieldsMapping, modelInputs]);

  const resolveMidjourneyModeForModel = useCallback((modelId: string): 'photo' | 'video' => {
    if (selectedProvider?.modelFamilies) { for (const f of selectedProvider.modelFamilies) { if (f.models.some(e => e.id === modelId)) return f.id === 'video' ? 'video' : 'photo'; } }
    const n = modelId.toLowerCase();
    if (n.includes('/video-') || n.includes('-video')) return 'video';
    return midjourneyMode === 'video' ? 'video' : 'photo';
  }, [selectedProvider, midjourneyMode]);

  const handleModelChange = useCallback(async (modelId: string): Promise<Record<string, unknown> | null> => {
    if (!onChangeAi || !currentProvider) return null;
    const preservedContextMode = node.ai?.context_mode || 'simple';
    const providerSupportsAutoPorts = ['replicate', 'openai_gpt', 'google_workspace', 'google_gemini', 'google_ai_studio', 'anthropic'].includes(currentProvider) || currentProvider.startsWith('midjourney_');
    let appliedConfig: Record<string, unknown> = { ...node.ai, model: modelId, context_mode: preservedContextMode };
    try {
      if (providerSupportsAutoPorts) {
        setLoadingModelInfo(true);
        const schema = await fetchModelSchema(currentProvider, modelId);
        const inputs = schema.inputs || [];
        const requiredFields = inputs.filter(i => i.required && i.name !== 'prompt');
        const requiredPortNames = requiredFields.map(f => f.name);
        const availablePortNames = inputs.map(i => i.name);
        let inferredMidjourneyMode: 'photo' | 'video' | null = null;
        let defaultPortNames: string[] = [];
        if (currentProvider.startsWith('midjourney_')) {
          inferredMidjourneyMode = resolveMidjourneyModeForModel(modelId);
          const candidates = inferredMidjourneyMode ? MIDJOURNEY_DEFAULT_PORTS[inferredMidjourneyMode] : [];
          const mjVersion = getMidjourneyVersion(modelId);
          let compatibleCandidates = candidates;
          if (mjVersion === 7) compatibleCandidates = candidates.filter(name => !V7_INCOMPATIBLE_PORTS.includes(name));
          else if (mjVersion === 6) compatibleCandidates = candidates.filter(name => !V6_INCOMPATIBLE_PORTS.includes(name));
          defaultPortNames = compatibleCandidates.filter(name => availablePortNames.includes(name));
        }
        const invalidPorts = pendingEnabledPorts.filter(port => !availablePortNames.includes(port));
        if (currentProvider.startsWith('midjourney_')) {
          const mjVersion = getMidjourneyVersion(modelId);
          if (mjVersion === 7) pendingEnabledPorts.forEach(port => { if (V7_INCOMPATIBLE_PORTS.includes(port) && !invalidPorts.includes(port)) invalidPorts.push(port); });
          else if (mjVersion === 6) pendingEnabledPorts.forEach(port => { if (V6_INCOMPATIBLE_PORTS.includes(port) && !invalidPorts.includes(port)) invalidPorts.push(port); });
        }
        if (invalidPorts.length > 0) {
          if (onRemoveInvalidPorts) try { await onRemoveInvalidPorts(node.node_id, invalidPorts); } catch {}
          setPendingEnabledPorts(prev => prev.filter(port => !invalidPorts.includes(port)));
          setInvalidPortsWithEdges([]);
        } else setInvalidPortsWithEdges([]);
        const validEnabledPorts = pendingEnabledPorts.filter(port => availablePortNames.includes(port));
        const enabledPorts = Array.from(new Set([...validEnabledPorts, ...requiredPortNames, ...defaultPortNames]));
        const autoPorts = generateAutoPorts(inputs, enabledPorts);
        setPendingAutoPorts(autoPorts);
        appliedConfig = { ...appliedConfig, auto_ports: autoPorts, ...(inferredMidjourneyMode ? { midjourney_mode: inferredMidjourneyMode } : {}) };
        if (inferredMidjourneyMode && inferredMidjourneyMode !== midjourneyMode) setMidjourneyMode(inferredMidjourneyMode);
        setModelInputs(inputs);
        setContextLimit(schema.context_limit || 32000);
        if (requiredPortNames.length > 0 || invalidPorts.length > 0) setPendingEnabledPorts(prev => { const merged = new Set(prev); requiredPortNames.forEach(n => merged.add(n)); return Array.from(merged).filter(n => availablePortNames.includes(n)); });
        requiredFields.forEach(field => {
          if (field.name === 'system_prompt') setSystemPromptSource('port');
          else if (field.name === 'output_example') setOutputExampleSource('port');
          else if (field.name === 'temperature') setTemperatureSource('port');
          else setAdditionalFieldsMapping(prev => ({ ...prev, [field.name]: { source: 'port' } }));
        });
      } else { appliedConfig = { ...appliedConfig, auto_ports: undefined }; setPendingAutoPorts([]); }
      onChangeAi(node.node_id, appliedConfig);
      setForceRender(prev => prev + 1);
      return appliedConfig;
    } catch {
      const fb = { ...node.ai, model: modelId, auto_ports: undefined };
      onChangeAi(node.node_id, fb);
      setForceRender(prev => prev + 1);
      return fb;
    } finally { if (providerSupportsAutoPorts) setLoadingModelInfo(false); }
  }, [currentProvider, node.ai, node.node_id, onChangeAi, onRemoveInvalidPorts, pendingEnabledPorts, resolveMidjourneyModeForModel, midjourneyMode]);

  const handleMidjourneyModeChange = useCallback(async (mode: 'photo' | 'video') => {
    if (!onChangeAi || !currentProvider || !currentProvider.startsWith('midjourney_') || !selectedProvider) return;
    setMidjourneyMode(mode);
    const family = selectedProvider.modelFamilies?.find(e => e.id === mode);
    const fallbackModel = family?.defaultModel || family?.models?.[0]?.id || selectedProvider.defaultModel || selectedProvider.models?.[0] || '';
    if (fallbackModel) { const uc = (await handleModelChange(fallbackModel)) ?? node.ai ?? {}; onChangeAi(node.node_id, { ...uc, midjourney_mode: mode, model: fallbackModel }); }
    else onChangeAi(node.node_id, { ...node.ai, midjourney_mode: mode });
  }, [currentProvider, handleModelChange, node.ai, node.node_id, onChangeAi, selectedProvider]);

  // Auto-load model schema on mount
  useEffect(() => {
    const loadInitialSchema = async () => {
      const supportsAutoInputs = ['replicate', 'openai_gpt', 'google_workspace', 'google_gemini', 'google_ai_studio', 'anthropic'].includes(currentProvider) || currentProvider.startsWith('midjourney_');
      if (supportsAutoInputs && node.ai?.model && !loadingModelInfo) {
        try {
          setLoadingModelInfo(true);
          const schema = await fetchModelSchema(currentProvider, String(node.ai.model));
          const inputs = schema.inputs || [];
          setModelInputs(inputs);
          setContextLimit(schema.context_limit || 32000);
          setLoadingModelInfo(false);
          const requiredFields = inputs.filter(i => i.required && i.name !== 'prompt');
          const requiredPortNames = requiredFields.map(f => f.name);
          if (!node.ai.auto_ports || node.ai.auto_ports.length === 0) {
            const dp = currentProvider.startsWith('midjourney_') ? (MIDJOURNEY_DEFAULT_PORTS[midjourneyMode] ?? []).filter(n => inputs.some(i => i.name === n)) : [];
            const merged = Array.from(new Set([...pendingEnabledPorts, ...requiredPortNames, ...dp]));
            setPendingAutoPorts(generateAutoPorts(inputs, merged));
            setPendingEnabledPorts(merged);
          }
          if (inputs.some(i => i.name === 'system_prompt') && !node.ai.field_mapping?.system_prompt_target) setSystemPromptTarget('system_prompt');
          if (inputs.some(i => i.name === 'temperature') && !node.ai.field_mapping?.temperature_target) setTemperatureTarget('temperature');
          if (requiredFields.length > 0) {
            requiredFields.forEach(field => {
              if (field.name === 'system_prompt' && !node.ai.field_mapping?.system_prompt_source) setSystemPromptSource('port');
              else if (field.name === 'output_example' && !node.ai.field_mapping?.output_example_source) setOutputExampleSource('port');
              else if (field.name === 'temperature' && !node.ai.field_mapping?.temperature_source) setTemperatureSource('port');
              else { const em = node.ai.field_mapping?.additional_fields?.[field.name]; if (!em || !em.source) setAdditionalFieldsMapping(prev => ({ ...prev, [field.name]: { source: 'port' } })); }
            });
            setPendingEnabledPorts(prev => { const m = new Set(prev); requiredPortNames.forEach(n => m.add(n)); return Array.from(m); });
          }
        } catch { setLoadingModelInfo(false); }
      }
      if (!initializationCompleteRef.current) { initializationCompleteRef.current = true; setIsInitializing(false); }
    };
    loadInitialSchema();
  }, [node.ai?.model, currentProvider]);

  // Reset field_mapping on model/provider change
  useEffect(() => {
    const modelChanged = prevModelRef.current !== node.ai?.model;
    const providerChanged = prevProviderRef.current !== node.ai?.provider;
    if (!modelChanged && !providerChanged) return;
    prevModelRef.current = node.ai?.model;
    prevProviderRef.current = node.ai?.provider;
    const prevPorts = [...pendingEnabledPorts];
    const prevAdditional = { ...additionalFieldsMapping };
    const prevSPS = systemPromptSource;
    const prevOES = outputExampleSource;
    const prevTS = temperatureSource;
    const transfer = async () => {
      try {
        const provider = node.ai?.provider;
        const model = node.ai?.model;
        if (!provider || !model) { setSystemPromptSource('manual'); setOutputExampleSource('manual'); setTemperatureSource('manual'); setAdditionalFieldsMapping({}); setPendingEnabledPorts([]); return; }
        const schema = await fetchModelSchema(provider, String(model));
        const newInputs = schema.inputs || [];
        const newPortNames = newInputs.map(i => i.name);
        const commonPorts = prevPorts.filter(port => newPortNames.includes(port));
        setPendingEnabledPorts(commonPorts);
        setSystemPromptSource(commonPorts.includes('system_prompt') && prevSPS === 'port' ? 'port' : 'manual');
        setOutputExampleSource(commonPorts.includes('output_example') && prevOES === 'port' ? 'port' : 'manual');
        setTemperatureSource(commonPorts.includes('temperature') && prevTS === 'port' ? 'port' : 'manual');
        const newAF: Record<string, any> = {};
        Object.entries(prevAdditional).forEach(([k, v]) => { if (commonPorts.includes(k)) newAF[k] = v; });
        setAdditionalFieldsMapping(newAF);
      } catch { setSystemPromptSource('manual'); setOutputExampleSource('manual'); setTemperatureSource('manual'); setAdditionalFieldsMapping({}); setPendingEnabledPorts([]); }
    };
    void transfer();
  }, [node.ai?.model, node.ai?.provider]);

  useEffect(() => {
    if (currentProvider?.startsWith('midjourney_')) { setSystemPromptSource('manual'); setSystemPromptTarget('prompt'); setOutputExampleSource('manual'); setOutputExampleTarget('prompt'); setTemperatureSource('manual'); setTemperatureTarget('temperature'); setAdditionalFieldsMapping({}); }
  }, [midjourneyMode, currentProvider]);

  useEffect(() => {
    const ps = typeof currentProvider === 'string' ? currentProvider : '';
    if (ps && !dynamicModels[ps] && !loadingModels[ps]) { const timer = setTimeout(() => loadModelsForProvider(ps), 800); return () => clearTimeout(timer); }
  }, [currentProvider, loadModelsForProvider, dynamicModels, loadingModels]);

  useEffect(() => { const ps = typeof node.ai?.provider === 'string' ? node.ai.provider : ''; if (ps && ps !== currentProvider) setCurrentProvider(ps); }, [node.ai?.provider, currentProvider]);

  useEffect(() => {
    const count = Object.keys(dynamicModels).filter(id => dynamicModels[id] && dynamicModels[id].length > 0).length;
    if (count > 0) { const timer = setTimeout(() => setForceRender(prev => prev + 1), 100); return () => clearTimeout(timer); }
  }, [Object.keys(dynamicModels).join(',')]);

  // Handlers
  const updateSystemPrompt = useCallback((value: string) => { setSystemPromptValue(value); }, []);
  const updateOutputExample = useCallback((value: string) => { setOutputExampleValue(value); }, []);
  const handleSystemPromptBlur = useCallback(() => { setHasChanges(true); }, []);
  const handleOutputExampleBlur = useCallback(() => { setHasChanges(true); }, []);
  const handleUserPromptChange = (value: string) => { if (autoGenerateUserPrompt) setAutoGenerateUserPrompt(false); setUserPromptValue(value); setHasChanges(true); };
  const handleRegenerateUserPrompt = () => { if (!generatedUserPrompt.trim()) return; setUserPromptValue(generatedUserPrompt); setHasChanges(true); };
  const handleToggleAutoGenerateUserPrompt = (checked: boolean) => { setAutoGenerateUserPrompt(checked); if (checked && generatedUserPrompt.trim()) { setUserPromptValue(generatedUserPrompt); setHasChanges(true); } else setHasChanges(true); };
  const handleTemperatureChange = useCallback((temperature: number) => { if (onChangeAi) onChangeAi(node.node_id, { ...node.ai, temperature }); }, [onChangeAi, node.ai, node.node_id]);

  const handleSavePreset = useCallback(async () => {
    const title = node.title || 'New Agent';
    const nodeTemplate = { node_id: `agent-${Date.now()}`, type: node.type, title, content: node.content || '', content_type: node.content_type || 'text/plain', ui: { bbox: { x1: 0, y1: 0, x2: 450, y2: 200 }, color: node.ui?.color || '#8b5cf6' }, meta: { ...node.meta, icon: node.meta?.icon || '🤖', tags: node.meta?.tags || [], is_favorite: true }, ai: { ...node.ai, enabled: true, system_prompt: systemPromptValue, output_example: outputExampleValue }, ai_visible: true, connections: { incoming: [], outgoing: [] } };
    try { const r = await fetch('/api/agent-presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description: node.content || `Personal Agent ${title}`, icon: node.meta?.icon || '🤖', node_template: nodeTemplate, tags: node.meta?.tags || ['personal'], is_favorite: true }) }); if (!r.ok) throw new Error('Failed'); alert(`✅ Agent "${title}" saved`); } catch { alert('❌ Error saving agent'); }
  }, [node, systemPromptValue, outputExampleValue]);

  const handleSave = () => {
    if (!hasChanges) return;
    const updatedAutoPorts = [...pendingAutoPorts];
    const addOrRemovePort = (id: string, source: string, label: string, type: string, desc: string) => {
      if (source === 'port') { if (!updatedAutoPorts.find(p => p.id === id)) updatedAutoPorts.push({ id, label, type, required: false, position: 'left', description: desc }); }
      else { const idx = updatedAutoPorts.findIndex(p => p.id === id); if (idx !== -1) updatedAutoPorts.splice(idx, 1); }
    };
    addOrRemovePort('system_prompt', systemPromptSource, 'System Prompt', 'text', 'System prompt from incoming node');
    addOrRemovePort('output_example', outputExampleSource, 'Output Example', 'text', 'Output Example from incoming node');
    addOrRemovePort('temperature', temperatureSource, 'Temperature', 'number', 'Temperature from incoming node');
    for (const [fk, fm] of Object.entries(additionalFieldsMapping)) {
      const fi = modelInputs.find(i => i.name === fk);
      addOrRemovePort(fk, fm.source, fk, fi?.type === 'number' || fi?.type === 'integer' ? 'number' : 'text', fi?.description || `${fk} from incoming node`);
    }
    if (onUpdateNodeMeta) {
      const updatedMeta: Record<string, any> = { ...node.meta, enabled_ports: pendingEnabledPorts, invalid_ports_with_edges: invalidPortsWithEdges };
      for (const [fk, fv] of Object.entries(additionalFieldsValues)) { if (fv !== '') updatedMeta[fk] = fv; }
      onUpdateNodeMeta(node.node_id, updatedMeta);
    }
    if (onChangeAi) {
      onChangeAi(node.node_id, { ...node.ai, system_prompt: systemPromptValue, user_prompt_template: userPromptValue, output_example: outputExampleValue, auto_ports: updatedAutoPorts, input_fields: buildInputFieldsFromPortSources(), field_mapping: { system_prompt_target: systemPromptTarget, system_prompt_source: systemPromptSource, output_example_target: outputExampleTarget, output_example_source: outputExampleSource, temperature_target: temperatureTarget, temperature_source: temperatureSource, additional_fields: additionalFieldsMapping } });
    }
    setHasChanges(false);
    setForceRender(prev => prev + 1);
  };

  return {
    node, loading, hasChanges, setHasChanges, currentProvider, selectedProvider, availableModels,
    dynamicModels, loadingModels, midjourneyMode, systemPromptValue, outputExampleValue,
    userPromptValue, autoGenerateUserPrompt, quickSystemPrompts, quickOutputExamples,
    promptSearchTerm, promptSearchResults, promptSearchLoading, promptSearchError,
    setPromptSearchTerm, setPromptSearchResults, setPromptSearchError,
    modelInputs, contextLimit, loadingModelInfo, pendingEnabledPorts, setPendingEnabledPorts,
    pendingAutoPorts, setPendingAutoPorts, invalidPortsWithEdges,
    systemPromptTarget, setSystemPromptTarget, systemPromptSource, setSystemPromptSource,
    outputExampleTarget, setOutputExampleTarget, outputExampleSource, setOutputExampleSource,
    temperatureTarget, setTemperatureTarget, temperatureSource, setTemperatureSource,
    additionalFieldsMapping, setAdditionalFieldsMapping, additionalFieldsValues, setAdditionalFieldsValues,
    fileDeliveryFormat, handleFileDeliveryFormatChange, viewMode, setViewMode,
    previewPayload, previewLoading, fetchPreviewPayload,
    handleProviderSelect, handleModelChange, handleMidjourneyModeChange, handleTemperatureChange,
    updateSystemPrompt, updateOutputExample, handleSystemPromptBlur, handleOutputExampleBlur,
    handleUserPromptChange, handleRegenerateUserPrompt, handleToggleAutoGenerateUserPrompt,
    handleSave, handleSavePreset, getModelLabel,
    onChangeAi, onUpdateNodeMeta, onRemoveInvalidPorts, providers, allNodes, sources, targets,
    getPortData, getPortDataList, getNodesAtDepth, formatNodeForContext, getNodeIcon, getNodeContentPreview,
    incomingNodes, outgoingNodes, placeholderInfo, generatedUserPrompt, unresolvedPlaceholders,
    contextPreview, contextCharCount, autoInputsPreview, autoPortSourceIds,
    replicateStatusColor, replicateStatusLabel, replicatePredictionUrl, replicatePredictionApiUrl,
    replicatePredictionIdMasked, metaRecord, isInitializing,
  } as AiSettingsSharedState & { isInitializing: boolean };
}
