import type { FlowNode, PromptPreset, AutoPort, ModelSchemaInput } from '../../state/api';
import type { AgentInputField } from '../../features/chat/types';
import type { PlaceholderInfo } from '../../utils/promptPlaceholders';

// ========== Tab Types ==========

export type AiSettingsTab = 'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request';

// ========== Provider Types ==========

export interface AiProviderOption {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  available: boolean;
  reason?: string;
  modelFamilies?: Array<{
    id: string;
    label: string;
    defaultModel: string;
    models: Array<{ id: string; label: string }>;
  }>;
}

// ========== Props ==========

export interface AiSettingsModalProps {
  node: FlowNode;
  onClose: () => void;
  activeTab: AiSettingsTab;
  onTabChange: (tab: AiSettingsTab) => void;
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onUpdateNodeMeta?: (nodeId: string, patch: Record<string, unknown>) => void;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => Promise<void>;
  providers?: AiProviderOption[];
  loading?: boolean;
  dynamicModels?: Record<string, string[]>;
  loadingModels?: Record<string, boolean>;
  onOpen?: () => void;
  allNodes?: FlowNode[];
  sources?: Array<{ node_id: string; title: string; type: string }>;
  targets?: Array<{ node_id: string; title: string; type: string }>;
  edges?: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
}

// ========== Shared State (passed from parent to tab components) ==========

export interface AiSettingsSharedState {
  node: FlowNode;
  loading: boolean;
  hasChanges: boolean;
  setHasChanges: (v: boolean) => void;

  // Provider/model
  currentProvider: string;
  selectedProvider: AiProviderOption | null;
  availableModels: string[];
  dynamicModels: Record<string, string[]>;
  loadingModels: Record<string, boolean>;
  midjourneyMode: 'photo' | 'video';

  // Prompts
  systemPromptValue: string;
  outputExampleValue: string;
  userPromptValue: string;
  autoGenerateUserPrompt: boolean;
  quickSystemPrompts: PromptPreset[];
  quickOutputExamples: PromptPreset[];
  promptSearchTerm: string;
  promptSearchResults: PromptPreset[];
  promptSearchLoading: boolean;
  promptSearchError: string | null;
  setPromptSearchTerm: (v: string) => void;
  setPromptSearchResults: (v: PromptPreset[]) => void;
  setPromptSearchError: (v: string | null) => void;

  // Model info
  modelInputs: ModelSchemaInput[];
  contextLimit: number;
  loadingModelInfo: boolean;

  // Port state
  pendingEnabledPorts: string[];
  setPendingEnabledPorts: React.Dispatch<React.SetStateAction<string[]>>;
  pendingAutoPorts: AutoPort[];
  setPendingAutoPorts: React.Dispatch<React.SetStateAction<AutoPort[]>>;
  invalidPortsWithEdges: string[];

  // Field mapping
  systemPromptTarget: string;
  setSystemPromptTarget: (v: string) => void;
  systemPromptSource: 'manual' | 'port';
  setSystemPromptSource: (v: 'manual' | 'port') => void;
  outputExampleTarget: string;
  setOutputExampleTarget: (v: string) => void;
  outputExampleSource: 'manual' | 'port';
  setOutputExampleSource: (v: 'manual' | 'port') => void;
  temperatureTarget: string;
  setTemperatureTarget: (v: string) => void;
  temperatureSource: 'manual' | 'port';
  setTemperatureSource: (v: 'manual' | 'port') => void;
  additionalFieldsMapping: Record<string, any>;
  setAdditionalFieldsMapping: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  additionalFieldsValues: Record<string, string>;
  setAdditionalFieldsValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // File delivery
  fileDeliveryFormat: 'url' | 'base64';
  handleFileDeliveryFormatChange: (format: 'url' | 'base64') => void;

  // Preview
  viewMode: 'simple' | 'full';
  setViewMode: (v: 'simple' | 'full') => void;
  previewPayload: Record<string, any>;
  previewLoading: boolean;
  fetchPreviewPayload: () => Promise<void>;

  // Handlers
  handleProviderSelect: (providerId: string) => void;
  handleModelChange: (modelId: string) => Promise<Record<string, unknown> | null>;
  handleMidjourneyModeChange: (mode: 'photo' | 'video') => void;
  handleTemperatureChange: (temperature: number) => void;
  updateSystemPrompt: (value: string) => void;
  updateOutputExample: (value: string) => void;
  handleSystemPromptBlur: () => void;
  handleOutputExampleBlur: () => void;
  handleUserPromptChange: (value: string) => void;
  handleRegenerateUserPrompt: () => void;
  handleToggleAutoGenerateUserPrompt: (checked: boolean) => void;
  handleSave: () => void;
  handleSavePreset: () => void;
  getModelLabel: (modelId: string) => string;

  // Callbacks from parent
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onUpdateNodeMeta?: (nodeId: string, patch: Record<string, unknown>) => void;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => Promise<void>;
  providers: AiProviderOption[];
  allNodes: FlowNode[];
  sources: Array<{ node_id: string; title: string; type: string }>;
  targets: Array<{ node_id: string; title: string; type: string }>;

  // Context helpers
  getPortData: (portId: string, portType?: string) => string;
  getPortDataList: (portId: string, portType?: string) => string[];
  getNodesAtDepth: (targetDepth: number, direction: 'incoming' | 'outgoing') => FlowNode[];
  formatNodeForContext: (n: FlowNode, mode: 'simple' | 'full_json' | 'clean' | 'simple_json') => string;
  getNodeIcon: (type: string) => string;
  getNodeContentPreview: (n: FlowNode) => React.ReactNode;

  // Computed values
  incomingNodes: FlowNode[];
  outgoingNodes: FlowNode[];
  placeholderInfo: PlaceholderInfo[];
  generatedUserPrompt: string;
  unresolvedPlaceholders: PlaceholderInfo[];
  contextPreview: string;
  contextCharCount: number;
  autoInputsPreview: Array<{
    port: AutoPort;
    sourceNode: FlowNode | undefined;
    value: string;
    hasValue: boolean;
  }>;
  autoPortSourceIds: Set<string>;

  // Replicate metadata
  replicateStatusColor: string;
  replicateStatusLabel: string;
  replicatePredictionUrl: string;
  replicatePredictionApiUrl: string;
  replicatePredictionIdMasked: string;
  metaRecord: Record<string, unknown>;
}

// ========== Constants ==========

export const MIDJOURNEY_DEFAULT_PORTS: Record<'photo' | 'video', string[]> = {
  photo: [
    'reference_image',
    'image_prompt',
    'style_reference',
    'character_reference',
    'omni',
    'style_prompt',
    'clip_prompt',
  ],
  video: [
    'first_frame_image',
    'end_frame_image',
    'timeline_prompt',
    'duration_seconds',
    'audio_track_url',
  ],
};

export const V7_INCOMPATIBLE_PORTS = [
  'character_reference',
];

export const V6_INCOMPATIBLE_PORTS: string[] = [
  'omni',
];

export const FALLBACK_SYSTEM_PRESETS: PromptPreset[] = [
  {
    preset_id: 'fallback-system-planner',
    category: 'system_prompt',
    label: 'Planner',
    description: 'Basic system prompt for workflow plan generation',
    content: '', // Will be filled from import
    tags: ['default', 'planner'],
    is_quick_access: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

export const FALLBACK_OUTPUT_PRESETS: PromptPreset[] = [
  {
    preset_id: 'fallback-output-mindmap',
    category: 'output_example',
    label: 'Mindmap',
    description: 'Output Example in mindmap format',
    content: '', // Will be filled from import
    tags: ['default', 'mindmap'],
    is_quick_access: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

export type { FlowNode, PromptPreset, AutoPort, ModelSchemaInput, AgentInputField, PlaceholderInfo };
