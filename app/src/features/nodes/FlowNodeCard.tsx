import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeResizer, useStore, useUpdateNodeInternals, useReactFlow, type NodeProps } from 'reactflow';
import {
  captureHtmlScreenshot,
  createEdge,
  createNode,
  fetchHtmlMetadata,
  fetchQuickPromptPresets,
  fetchModelSchema,
  searchPromptPresets,
} from '../../state/api';
import type {
  FlowNode,
  NodeUI,
  IntegrationFieldConfig,
  PromptPreset,
  AutoPort,
  ModelSchemaInput,
  CreateNodePayload,
} from '../../state/api';
import type { InputPortKind } from '../../data/inputPortTypes';
import { INPUT_PORT_TYPES, findInputPortMeta } from '../../data/inputPortTypes';
import { defaultPlannerPrompt } from '../../data/promptPresets';
import {
  NODE_DEFAULT_COLOR,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  NODE_MAX_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_MIN_WIDTH,
  normalizeNodeHeight,
  normalizeNodeWidth,
  calculateContentBasedHeight,
} from '../../constants/nodeDefaults';
import {
  NODE_HEADER_HEIGHT,
  NODE_TOOLBAR_HEIGHT,
  NODE_FOOTER_HEIGHT_NORMAL,
  NODE_FOOTER_HEIGHT_ANNOTATION,
  ANNOTATION_OVERLAY_HEIGHT,
  TOTAL_FIXED_HEIGHT_NORMAL,
  TOTAL_FIXED_HEIGHT_ANNOTATION,
  MIN_CONTENT_WIDTH,
  MAX_CONTENT_WIDTH,
  MIN_CONTENT_HEIGHT,
  MAX_CONTENT_HEIGHT,
  calculateNodeHeight,
  calculateContentHeight,
  scaleImageToFit,
  getFooterHeight,
} from '../../constants/nodeSizes';
import { SettingsIcon } from '../../ui/icons/SettingsIcon';
import { NodeSettingsModal } from '../../ui/NodeSettingsModal';
import { AiSettingsModal } from '../../ui/AiSettingsModal';
import { ProviderFileWarningModal } from '../../ui/ProviderFileWarningModal';
import { DEFAULT_REPLICATE_MODELS } from '../../data/defaultReplicateModels';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import type { AgentRoutingConfig } from '../routing/agentRouting';
import { DEFAULT_ROUTING_CONFIGS } from '../routing/agentRouting';
import { AgentRoutingDisplay } from '../routing/AgentRoutingDisplay';
import { AgentRoutingEditor } from '../routing/AgentRoutingEditor';
import { AgentLogs } from '../logs/AgentLogs';
import { AgentLogsModal } from '../logs/AgentLogsModal';
import { MarkdownRenderer } from '../../ui/MarkdownRenderer';
import { RichTextEditor } from '../../ui/RichTextEditor';
import { ImageAnnotationEditor } from './ImageAnnotationEditor';
import type { ImageAnnotationEditorHandle } from './ImageAnnotationEditor';
import { ImageCropModal } from './ImageCropModal';
import { VideoCropModal, type VideoCropSettings } from './VideoCropModal';
import { VideoFrameExtractModal } from './VideoFrameExtractModal';
import { VideoTrimModal } from './VideoTrimModal';
import { loadImageElement, loadImageWithRetry, type ImageCropSettings } from './imageProcessing';
import { VideoPreview } from './components/VideoPreview';
import { NotionTableEditor, type TableData } from '../tables/NotionTableEditor';
import { extractPlaceholderInfo } from '../../utils/promptPlaceholders';
import { diffToTextOperations, type TextOperation } from '../../utils/textOperations';
import { useDebouncedUpdateNodeInternals } from '../../utils/debounce';
import { useProjectStore } from '../../state/store';
import { DEFAULT_UI_SETTINGS } from '../../constants/uiSettings';

// Screen width constants for HTML preview
const SCREEN_WIDTHS = [
  { id: 'mobile', name: 'Mobile', width: '375px' },
  { id: 'tablet', name: 'Tablet', width: '768px' },
  { id: 'laptop', name: 'Laptop', width: '1024px' },
  { id: 'desktop', name: 'Desktop', width: '1440px' },
  { id: 'wide', name: 'Wide', width: '1920px' }
];

const VIDEO_SCALE_OPTIONS = [0.5, 1, 1.5, 2] as const;
const VIDEO_NOTES_MIN_LINES = 1;
const VIDEO_NOTES_LINE_HEIGHT = 18;
const VIDEO_NOTES_MIN_HEIGHT = VIDEO_NOTES_MIN_LINES * VIDEO_NOTES_LINE_HEIGHT + 16;
const VIDEO_NOTES_VERTICAL_EXTRA = 32;
const VIDEO_EXTRA_MIN_HEIGHT = 50;
const DEFAULT_VIDEO_ASPECT = 16 / 9;
const IMAGE_VIEWPORT_MIN_HEIGHT = 380;
const IMAGE_NOTES_MIN_LINES = 3;
const IMAGE_NOTES_LINE_HEIGHT = 20;
const IMAGE_NOTES_MIN_HEIGHT = IMAGE_NOTES_MIN_LINES * IMAGE_NOTES_LINE_HEIGHT + 16;
const IMAGE_CONTENT_VERTICAL_GAP = 24;
const FILE_NOTES_MIN_LINES = 2;
const FILE_NOTES_LINE_HEIGHT = 20;
const FILE_NOTES_MIN_HEIGHT = FILE_NOTES_MIN_LINES * FILE_NOTES_LINE_HEIGHT + 16;
const FOLDER_NOTES_MIN_LINES = 3;
const FOLDER_NOTES_LINE_HEIGHT = 20;
const FOLDER_NOTES_MIN_HEIGHT = FOLDER_NOTES_MIN_LINES * FOLDER_NOTES_LINE_HEIGHT + 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Determine model type by name
function getModelType(modelName?: string): { type: string; emoji: string; color: string } {
  if (!modelName) return { type: 'text', emoji: '📝', color: '#6b7280' };
  
  const name = modelName.toLowerCase();
  
  // Images
  if (name.includes('dall-e') || name.includes('dalle') || name.includes('stable-diffusion') || 
      name.includes('midjourney') || name.includes('imagen') || name.includes('firefly') ||
      name.includes('flux') || name.includes('playground') || name.includes('sd-') ||
      name.includes('image') || name.includes('img')) {
    return { type: 'image', emoji: '🎨', color: '#8b5cf6' };
  }
  
  // Video
  if (name.includes('sora') || name.includes('runway') || name.includes('pika') || 
      name.includes('video') || name.includes('gen-2') || name.includes('gen-3') ||
      name.includes('kling') || name.includes('luma')) {
    return { type: 'video', emoji: '🎬', color: '#ec4899' };
  }
  
  // 3D
  if (name.includes('3d') || name.includes('mesh') || name.includes('model') || 
      name.includes('shap-e') || name.includes('meshy')) {
    return { type: '3d', emoji: '🎲', color: '#06b6d4' };
  }
  
  // Audio
  if (name.includes('whisper') || name.includes('tts') || name.includes('audio') || 
      name.includes('sound') || name.includes('voice') || name.includes('elevenlabs') ||
      name.includes('bark') || name.includes('musicgen')) {
    return { type: 'audio', emoji: '🎵', color: '#f59e0b' };
  }
  
  // Multimodal
  if (name.includes('gpt-4-vision') || name.includes('gpt-4o') || name.includes('claude-3') ||
      name.includes('gemini-pro-vision') || name.includes('gemini-1.5') || 
      name.includes('vision') || name.includes('multimodal')) {
    return { type: 'multi', emoji: '👁️', color: '#10b981' };
  }
  
  // Text (default)
  return { type: 'text', emoji: '📝', color: '#6b7280' };
}

function generateAutoPorts(inputs: ModelSchemaInput[], enabledPorts: string[] = []): AutoPort[] {
  const filtered = inputs.filter((input) => {
    if (input.name === 'prompt') {
      return false;
    }
    return input.required || enabledPorts.includes(input.name);
  });

  return filtered.map((input) => {
    let portType = input.type;
    const nameLC = input.name.toLowerCase();
    const descLC = (input.description || '').toLowerCase();

    if (nameLC.includes('image') || nameLC.includes('img') || nameLC.includes('photo') || nameLC.includes('picture')) {
      portType = 'image';
    } else if (nameLC.includes('video') || nameLC.includes('vid')) {
      portType = 'video';
    } else if (nameLC.includes('audio') || nameLC.includes('sound')) {
      portType = 'audio';
    } else if (descLC.includes('image') || descLC.includes('picture') || descLC.includes('photo')) {
      portType = 'image';
    } else if (descLC.includes('video')) {
      portType = 'video';
    } else if (descLC.includes('audio') || descLC.includes('sound')) {
      portType = 'audio';
    }

    return {
      id: input.name,
      label: input.name.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      type: portType,
      required: input.required,
      position: 'left',
      description: input.description,
      default: input.default,
    } satisfies AutoPort;
  });
}

// Collapsible section component
function CollapsibleSection({ title, icon, defaultExpanded, disabled, children }: {
  title: string;
  icon: string;
  defaultExpanded: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-white/10 rounded bg-black/5">
      <button
        type="button"
        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => !disabled && setExpanded(!expanded)}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-sm font-medium text-white/80">{title}</span>
        </div>
        <span className="text-white/60 text-xs">
          {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <div className="p-3 pt-0 border-t border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}

export interface AiProviderOption {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  available: boolean;
  description?: string;
  reason?: string;
  config?: Record<string, unknown>;
  systemPromptTemplate?: string;
  inputFields?: IntegrationFieldConfig[];
  supportsFiles?: boolean; // File support
  supportedFileTypes?: string[]; // Supported file types
  modelFamilies?: Array<{
    id: string;
    label: string;
    defaultModel: string;
    models: Array<{ id: string; label: string }>;
  }>;
}

export interface FlowNodeCardData {
  node: FlowNode;
  projectId?: string;
  onRun: (nodeId: string) => void;
  onRegenerate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onChangeContent: (nodeId: string, content: string) => void;
  onCommitContent?: (
    nodeId: string,
    content: string,
    options?: { operations?: TextOperation[] },
  ) => Promise<void> | void;
  onChangeTitle: (nodeId: string, title: string) => void;
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onChangeUi?: (nodeId: string, patch: Partial<NodeUI>) => void;
  onOpenSettings?: (nodeId: string) => void;
  onOpenConnections?: (nodeId: string) => void;
  providers?: AiProviderOption[];
  sources?: Array<{ node_id: string; title: string; type: string }>;
  targets?: Array<{ node_id: string; title: string; type: string }>;
  allNodes?: FlowNode[];
  disabled?: boolean;
  isGenerating?: boolean; // Indicator that the node is currently generating a response
  onRemoveNodeFromFolder?: (nodeId: string, folderId?: string, position?: { x: number; y: number }) => void | Promise<void>;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => void | Promise<void>;
  onSplitText?: (nodeId: string, config: TextSplitterConfig, options?: { content: string }) => void | Promise<void>;
}

const FALLBACK_SYSTEM_PRESETS: PromptPreset[] = [
  {
    preset_id: 'fallback-system-planner',
    category: 'system_prompt',
    label: 'Planner',
    description: 'Basic system prompt for workflow plan generation',
    content: defaultPlannerPrompt,
    tags: ['default', 'planner'],
    is_quick_access: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

const TYPE_ICONS: Record<string, string> = {
  text: '📝',
  ai: '🤖',
  parser: '🧩',
  python: '🐍',
  file: '📁',
  image: '🖼️',
  pdf: '📄',
  table: '📊',
  video: '🎬',
  folder: '📂',
  image_gen: '🖼️',
  audio_gen: '🔊',
  video_gen: '🎬',
  html: '🌐',
  html_editor: '✉️',
};

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', 
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', 
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', 
  '#ec4899', '#f43f5e', '#84cc16', '#6b7280',
];

const DEFAULT_COLOR = NODE_DEFAULT_COLOR;
const DEFAULT_MODEL = 'gpt-4.1-mini';

export interface TextSplitterConfig {
  separator: string;
  subSeparator: string;
  namingMode: 'auto' | 'manual';
}

const DEFAULT_TEXT_SPLITTER_CONFIG: TextSplitterConfig = {
  separator: '---',
  subSeparator: '-----', // ← changed from '-' to '-----'
  namingMode: 'auto',
};

const sortFontSteps = (steps: { maxLength: number; multiplier: number }[]): { maxLength: number; multiplier: number }[] =>
  [...steps].sort((a, b) => a.maxLength - b.maxLength);

const computeDynamicFontSize = (
  length: number,
  base: number,
  steps: { maxLength: number; multiplier: number }[],
  scaleMultiplier = 1,
): number => {
  if (!Number.isFinite(length) || length < 0) {
    return base;
  }
  const sorted = sortFontSteps(steps);
  const step = sorted.find((item) => length <= item.maxLength) ?? sorted[sorted.length - 1];
  const multiplier = step && Number.isFinite(step.multiplier) && step.multiplier > 0 ? step.multiplier : 1;
  const resolvedScale = Number.isFinite(scaleMultiplier) && scaleMultiplier > 0 ? scaleMultiplier : 1;
  const size = base * multiplier * resolvedScale;
  // Clamp to sensible range
  return Math.max(6, Math.min(size, base * 12 * resolvedScale));
};

function normalizePlaceholderValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, val]) => typeof key === 'string' && typeof val === 'string',
  ) as Array<[string, string]>;
  return entries.reduce<Record<string, string>>((acc, [key, val]) => {
    acc[key] = val;
    return acc;
  }, {});
}

function shallowEqualRecords(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

// Helper function to calculate scale for different screen widths
function getScaleForScreenWidth(screenWidthId: string, nodeWidth: number): number {
  const screenWidthConfig = SCREEN_WIDTHS.find(sw => sw.id === screenWidthId);
  if (!screenWidthConfig) return 1;
  
  const targetWidth = parseInt(screenWidthConfig.width);
  const availableWidth = nodeWidth - 32; // Account for padding
  
  // If target width is larger than available space, scale down
  if (targetWidth > availableWidth) {
    return availableWidth / targetWidth;
  }
  
  return 1; // No scaling needed
}

const FALLBACK_PROVIDERS: AiProviderOption[] = [
  {
    id: 'stub',
    name: 'Local Stub',
    models: ['local-llm-7b-q5'],
    defaultModel: 'local-llm-7b-q5',
    available: true,
    description: 'Built-in offline engine for test runs.',
    inputFields: [],
    supportsFiles: false,
    supportedFileTypes: [],
  },
  {
    id: 'openai_gpt',
    name: 'OpenAI GPT',
    models: ['chatgpt-4o-latest', 'gpt-4o-mini', 'gpt-3.5-turbo'], // Minimal list for testing
    defaultModel: 'gpt-4o-mini',
    available: true,
    description: 'OpenAI GPT models with structured output support.',
    inputFields: [],
    supportsFiles: false,
    supportedFileTypes: [],
  },
  {
    id: 'google_workspace',
    name: 'Google Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'],
    defaultModel: 'gemini-2.5-flash',
    available: true,
    description: 'Google Gemini with native file and image support.',
    inputFields: [],
    supportsFiles: true,
    supportedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'],
  },
];

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: string;
  defaultExpanded: boolean;
  disabled: boolean;
  children: React.ReactNode;
}

// Field Configuration for Node Display
interface NodeFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'range';
  visible: boolean;
  order: number;
  placeholder?: string;
  options?: string[]; // for select type
  min?: number; // for number/range
  max?: number; // for number/range
  step?: number; // for number/range
}

// Routing Configuration
interface NodeRoutingConfig {
  inputPorts: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    multiple: boolean;
  }>;
  outputPorts: Array<{
    id: string;
    label: string;
    type: string;
    condition?: string;
  }>;
  routingRules: Array<{
    id: string;
    condition: string;
    outputPort: string;
    description: string;
  }>;
}

interface FieldConfiguratorProps {
  nodeId: string;
  nodeType: string;
  currentFields: NodeFieldConfig[];
  onFieldsChange: (fields: NodeFieldConfig[]) => void;
  disabled: boolean;
}

function FieldConfigurator({ nodeId, nodeType, currentFields, onFieldsChange, disabled }: FieldConfiguratorProps) {
  const [fields, setFields] = useState<NodeFieldConfig[]>(currentFields.length > 0 ? currentFields : getDefaultFields(nodeType));

  // Default fields based on node type
  function getDefaultFields(type: string): NodeFieldConfig[] {
    const commonFields = [
      { id: 'title', label: 'Title', type: 'text' as const, visible: true, order: 0 },
      { id: 'content', label: 'Content', type: 'textarea' as const, visible: true, order: 1 }
    ];

    if (type === 'ai') {
      return [
        { id: 'htmlUrl', label: 'URL', type: 'text', visible: true, order: 0 },
        { id: 'screenWidth', label: 'Screen Width', type: 'select', visible: true, order: 1 }
      ];
    }
    return commonFields;
  }

  const handleFieldToggle = (fieldId: string) => {
    const updatedFields = fields.map(field => 
      field.id === fieldId ? { ...field, visible: !field.visible } : field
    );
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const handleFieldOrderChange = (fieldId: string, direction: 'up' | 'down') => {
    const fieldIndex = fields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) return;

    const newFields = [...fields];
    const targetIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;
    
    if (targetIndex >= 0 && targetIndex < newFields.length) {
      // Swap fields
      [newFields[fieldIndex], newFields[targetIndex]] = [newFields[targetIndex], newFields[fieldIndex]];
      // Update order values
      newFields.forEach((field, index) => {
        field.order = index;
      });
      setFields(newFields);
      onFieldsChange(newFields);
    }
  };

  const addCustomField = () => {
    const newField: NodeFieldConfig = {
      id: `custom_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      visible: true,
      order: fields.length,
      placeholder: 'Enter value...'
    };
    const updatedFields = [...fields, newField];
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const removeField = (fieldId: string) => {
    const updatedFields = fields.filter(f => f.id !== fieldId);
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const updateFieldLabel = (fieldId: string, label: string) => {
    const updatedFields = fields.map(field => 
      field.id === fieldId ? { ...field, label } : field
    );
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60">
          Configure which fields to display in the node slider
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
          onClick={addCustomField}
          disabled={disabled}
        >
          + Field
        </button>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2 p-2 bg-black/10 rounded border border-white/5">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="text-xs text-white/40 hover:text-white/60 disabled:opacity-30"
                onClick={() => handleFieldOrderChange(field.id, 'up')}
                disabled={disabled || index === 0}
              >
                ▲
              </button>
              <button
                type="button"
                className="text-xs text-white/40 hover:text-white/60 disabled:opacity-30"
                onClick={() => handleFieldOrderChange(field.id, 'down')}
                disabled={disabled || index === fields.length - 1}
              >
                ▼
              </button>
            </div>

            <label className="flex items-center gap-2 flex-1">
              <input
                type="checkbox"
                checked={field.visible}
                onChange={() => handleFieldToggle(field.id)}
                disabled={disabled}
                className="w-4 h-4"
              />
              <input
                type="text"
                value={field.label}
                onChange={(e) => updateFieldLabel(field.id, e.target.value)}
                disabled={disabled}
                className="flex-1 bg-transparent text-xs text-white/80 border-none outline-none"
              />
            </label>

            <span className="text-xs text-white/40 px-2 py-1 bg-black/20 rounded">
              {field.type}
            </span>

            {field.id.startsWith('custom_') && (
              <button
                type="button"
                className="text-xs text-red-400 hover:text-red-300 p-1"
                onClick={() => removeField(field.id)}
                disabled={disabled}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="text-xs text-white/50 p-2 bg-black/5 rounded">
        Visible fields will be displayed in the slider in the specified order
      </div>
    </div>
  );
}

// Routing Configuration Component - temporarily disabled to fix hooks issue
interface RoutingConfiguratorProps {
  nodeId: string;
  nodeType: string;
  currentRouting: NodeRoutingConfig;
  availableNodes: Array<{ node_id: string; title: string; type: string }>;
  onRoutingChange: (routing: NodeRoutingConfig) => void;
  disabled: boolean;
}

function RoutingConfigurator({ nodeId, nodeType, currentRouting, availableNodes, onRoutingChange, disabled }: RoutingConfiguratorProps) {
  const [routing, setRouting] = useState<NodeRoutingConfig>(currentRouting.inputPorts.length > 0 ? currentRouting : getDefaultRouting(nodeType));

  function getDefaultRouting(type: string): NodeRoutingConfig {
    const baseRouting = {
      inputPorts: [
        { id: 'main_input', label: 'Main Input', type: 'any', required: false, multiple: false }
      ],
      outputPorts: [
        { id: 'main_output', label: 'Main Output', type: 'any' }
      ],
      routingRules: []
    };

    if (type === 'ai') {
      return {
        inputPorts: [
          { id: 'prompt_input', label: 'Prompt', type: 'text', required: true, multiple: false },
          { id: 'context_input', label: 'Context', type: 'any', required: false, multiple: true }
        ],
        outputPorts: [
          { id: 'success_output', label: 'Success Result', type: 'text' },
          { id: 'error_output', label: 'Error', type: 'error' }
        ],
        routingRules: [
          { id: 'success_rule', condition: 'success', outputPort: 'success_output', description: 'On successful execution' },
          { id: 'error_rule', condition: 'error', outputPort: 'error_output', description: 'On error' }
        ]
      };
    }

    return baseRouting;
  }

  const addInputPort = () => {
    const newPort = {
      id: `input_${Date.now()}`,
      label: 'New Input',
      type: 'any',
      required: false,
      multiple: false
    };
    const updatedRouting = {
      ...routing,
      inputPorts: [...routing.inputPorts, newPort]
    };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const addOutputPort = () => {
    const newPort = {
      id: `output_${Date.now()}`,
      label: 'New Output',
      type: 'any'
    };
    const updatedRouting = {
      ...routing,
      outputPorts: [...routing.outputPorts, newPort]
    };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const removeInputPort = (portId: string) => {
    const updatedRouting = {
      ...routing,
      inputPorts: routing.inputPorts.filter(p => p.id !== portId)
    };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const removeOutputPort = (portId: string) => {
    const updatedRouting = {
      ...routing,
      outputPorts: routing.outputPorts.filter(p => p.id !== portId),
      routingRules: routing.routingRules.filter(r => r.outputPort !== portId)
    };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const updateInputPort = (portId: string, updates: Partial<typeof routing.inputPorts[0]>) => {
    const updatedRouting = {
      ...routing,
      inputPorts: routing.inputPorts.map(port => 
        port.id === portId ? { ...port, ...updates } : port
      )
    };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const updateOutputPort = (portId: string, updates: Partial<typeof routing.outputPorts[0]>) => {
    const updatedRouting = {
      ...routing,
      outputPorts: routing.outputPorts.map(port => 
        port.id === portId ? { ...port, ...updates } : port
      )
    };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  return (
    <div className="space-y-4">
      {/* Input Ports */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-white/70">Input Ports</h4>
          <button
            type="button"
            className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors"
            onClick={addInputPort}
            disabled={disabled}
          >
            + Input
          </button>
        </div>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {routing.inputPorts.map((port) => (
            <div key={port.id} className="flex items-center gap-2 p-2 bg-black/10 rounded border border-white/5">
              <input
                type="text"
                value={port.label}
                onChange={(e) => updateInputPort(port.id, { label: e.target.value })}
                disabled={disabled}
                className="flex-1 bg-transparent text-xs text-white/80 border-none outline-none"
                placeholder="Port Name"
              />
              <select
                value={port.type}
                onChange={(e) => updateInputPort(port.id, { type: e.target.value })}
                disabled={disabled}
                className="text-xs bg-black/20 text-white/70 border border-white/10 rounded px-1 py-0.5"
              >
                <option value="any">Any</option>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="json">JSON</option>
                <option value="image">Image</option>
                <option value="file">File</option>
              </select>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={port.required}
                  onChange={(e) => updateInputPort(port.id, { required: e.target.checked })}
                  disabled={disabled}
                  className="w-3 h-3"
                />
                <span className="text-xs text-white/60">Req.</span>
              </label>
              <button
                type="button"
                className="text-xs text-red-400 hover:text-red-300 p-1"
                onClick={() => removeInputPort(port.id)}
                disabled={disabled}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Output Ports */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-white/70">Output Ports</h4>
          <button
            type="button"
            className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
            onClick={addOutputPort}
            disabled={disabled}
          >
            + Output
          </button>
        </div>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {routing.outputPorts.map((port) => (
            <div key={port.id} className="flex items-center gap-2 p-2 bg-black/10 rounded border border-white/5">
              <input
                type="text"
                value={port.label}
                onChange={(e) => updateOutputPort(port.id, { label: e.target.value })}
                disabled={disabled}
                className="flex-1 bg-transparent text-xs text-white/80 border-none outline-none"
                placeholder="Port Name"
              />
              <select
                value={port.type}
                onChange={(e) => updateOutputPort(port.id, { type: e.target.value })}
                disabled={disabled}
                className="text-xs bg-black/20 text-white/70 border border-white/10 rounded px-1 py-0.5"
              >
                <option value="any">Any</option>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="json">JSON</option>
                <option value="image">Image</option>
                <option value="file">File</option>
                <option value="error">Error</option>
              </select>
              <button
                type="button"
                className="text-xs text-red-400 hover:text-red-300 p-1"
                onClick={() => removeOutputPort(port.id)}
                disabled={disabled}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Connection Status */}
      <div className="p-2 bg-black/5 rounded border border-white/5">
        <div className="text-xs text-white/60 mb-1">Available connections:</div>
        <div className="text-xs text-white/50">
          {availableNodes.length > 0 ? (
            `${availableNodes.length} nodes available for connection`
          ) : (
            'No nodes available for connection'
          )}
        </div>
      </div>
    </div>
  );
}

// Enhanced FlowNodeCard with restored functionality
function FlowNodeCard({ data, selected, dragging }: NodeProps<FlowNodeCardData>): React.ReactElement {
  const { 
    node, 
    projectId: projectIdFromProps,
    onRun, 
    onRegenerate, 
    onDelete, 
    onChangeMeta, 
    onChangeContent, 
    onCommitContent,
    onChangeTitle, 
    onChangeAi, 
    onChangeUi,
    onOpenSettings,
    onOpenConnections,
    providers = FALLBACK_PROVIDERS,
    sources = [],
    targets = [],
    allNodes = [],
    disabled: initialDisabled = false,
    isGenerating: initialIsGenerating = false,
    onRemoveNodeFromFolder,
    onRemoveInvalidPorts,
    onSplitText,
  } = data;

  // State management
  const isUserEditingRef = useRef(false);
  const [collapsed, setCollapsed] = useState(() => {
    // Auto-collapse data nodes by default
    return node.type === 'data' || node.type === 'parser';
  });
  const [colorOpen, setColorOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(node.title);
  const [isResizing, setIsResizing] = useState(false);
  const titleSubmitRef = useRef(false);


  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [showPdfUrlModal, setShowPdfUrlModal] = useState(false);
  const [pdfUrlInputValue, setPdfUrlInputValue] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [activeAiModalTab, setActiveAiModalTab] = useState<'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request'>('ai_config');
  const [activeAiTab, setActiveAiTab] = useState<'settings' | 'fields' | 'routing' | 'logs' | 'provider' | 'model' | 'ai_config' | ''>('');
  const [showRoutingEditor, setShowRoutingEditor] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [outputType, setOutputType] = useState<'mindmap' | 'node' | 'folder'>(() => {
    // Initialize from node.meta.output_type if available
    const savedType = node.meta?.output_type as 'mindmap' | 'node' | 'folder' | undefined;
    if (savedType === 'mindmap' || savedType === 'node' || savedType === 'folder') {
      return savedType;
    }
    return 'node';
  });
  const userSetOutputTypeRef = useRef<'mindmap' | 'node' | 'folder' | null>(null);
  const [currentProvider, setCurrentProvider] = useState(String(node.ai?.provider || ''));
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [isInlineModelLoading, setIsInlineModelLoading] = useState(false);
  const [pendingModelSelection, setPendingModelSelection] = useState<string | null>(null);

  const disabled = initialDisabled || isInlineModelLoading;
  const isGenerating = initialIsGenerating || isInlineModelLoading;
  
  // State for file warning modal
  const [showFileWarningModal, setShowFileWarningModal] = useState(false);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  
  // Dynamic models state
const [dynamicModels, setDynamicModels] = useState<Record<string, string[]>>({});
const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  // Preload stored models for providers (especially Replicate)
  useEffect(() => {
    providers.forEach((provider) => {
      if (!provider || !Array.isArray(provider.models)) {
        return;
      }
      if (provider.id === 'replicate') {
        const models = provider.models.length > 0 ? provider.models : DEFAULT_REPLICATE_MODELS;
        setDynamicModels((prev) => {
          const existing = prev[provider.id] ?? [];
          const sameLength = existing.length === models.length;
          const sameContent = sameLength && existing.every((value, index) => value === models[index]);
          if (sameContent) {
            return prev;
          }
          return { ...prev, [provider.id]: models };
        });
        setLoadingModels((prev) => ({ ...prev, [provider.id]: false }));
      }
    });
  }, [providers]);
  
  // Force re-render state
  const [forceRender, setForceRender] = useState(0);
  
  // Force re-render function
  const triggerRerender = useCallback(() => {
    setForceRender(prev => prev + 1);
  }, []);
  
  // Color state for immediate UI updates
  const [currentColor, setCurrentColor] = useState(node.ui?.color ?? DEFAULT_COLOR);
  
  // Image node state
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isPdfUploading, setIsPdfUploading] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [imageEditorSession, setImageEditorSession] = useState(0);
  const imageEditorRef = useRef<ImageAnnotationEditorHandle | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);
  const [cropModalData, setCropModalData] = useState<{
    source: string;
    naturalWidth: number;
    naturalHeight: number;
    settings: ImageCropSettings | null;
  } | null>(null);
  const [lastCropSettings, setLastCropSettings] = useState<ImageCropSettings | null>(
    () => (node.meta?.image_crop_settings as ImageCropSettings | null) ?? null,
  );
  const [imageToolbarError, setImageToolbarError] = useState<string | null>(null);
  const [isSavingCropNode, setIsSavingCropNode] = useState(false);

  // Video node state
  const [isVideoCropModalOpen, setIsVideoCropModalOpen] = useState(false);
  const [isPreparingVideoCrop, setIsPreparingVideoCrop] = useState(false);
  const [showVideoFrameExtractModal, setShowVideoFrameExtractModal] = useState(false);
  const [showVideoTrimModal, setShowVideoTrimModal] = useState(false);
  const [videoCropModalData, setVideoCropModalData] = useState<{
    videoPath: string;
    source?: string; // dataUrl of first frame (optional)
    videoWidth: number;
    videoHeight: number;
    settings: VideoCropSettings | null;
  } | null>(null);
  const [lastVideoCropSettings, setLastVideoCropSettings] = useState<VideoCropSettings | null>(
    () => (node.meta?.video_crop_settings as VideoCropSettings | null) ?? null,
  );

  useEffect(() => {
    setLastCropSettings((node.meta?.image_crop_settings as ImageCropSettings | null) ?? null);
  }, [node.meta?.image_crop_settings]);
  const [videoPreviewReloadToken, setVideoPreviewReloadToken] = useState(0);
  const handleVideoRetry = useCallback(() => {
    setVideoPreviewReloadToken((value) => value + 1);
  }, []);
  
  // Image node state
  const normalizeImageValue = useCallback((value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }, []);

  const [imageOutputMode, setImageOutputMode] = useState<'annotated' | 'original'>(() => {
    const rawMode = normalizeImageValue(node.meta?.image_output_mode);
    if (rawMode === 'original' || rawMode === 'annotated') {
      return rawMode;
    }
    return 'annotated';
  });
  const imageViewMode = (node.meta?.view_mode as 'annotated' | 'original' | 'edit') || 'annotated';

  const imageNaturalSize = useMemo(() => {
    const fallbackWidth =
      typeof node.meta?.display_width === 'number' && Number.isFinite(node.meta.display_width as number)
        ? (node.meta.display_width as number)
        : 1024;
    const fallbackHeight =
      typeof node.meta?.display_height === 'number' && Number.isFinite(node.meta.display_height as number)
        ? (node.meta.display_height as number)
        : 768;
    const width =
      typeof node.meta?.natural_width === 'number' && Number.isFinite(node.meta.natural_width as number)
        ? (node.meta.natural_width as number)
        : fallbackWidth;
    const height =
      typeof node.meta?.natural_height === 'number' && Number.isFinite(node.meta.natural_height as number)
        ? (node.meta.natural_height as number)
        : fallbackHeight;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }, [node.meta?.display_height, node.meta?.display_width, node.meta?.natural_height, node.meta?.natural_width]);
  const originalImage = useMemo(() => {
    const meta = node.meta ?? {};
    return (
      normalizeImageValue(meta.image_original) ||
      normalizeImageValue(meta.original_image) ||
      normalizeImageValue(meta.image_url) ||
      normalizeImageValue(meta.edited_image) ||
      null
    );
  }, [normalizeImageValue, node.meta]);

  const editedImage = useMemo(() => {
    const meta = node.meta ?? {};
    return (
      normalizeImageValue(meta.image_edited) ||
      normalizeImageValue(meta.edited_image) ||
      normalizeImageValue(meta.annotated_image) ||
      normalizeImageValue(meta.image_original) ||
      normalizeImageValue(meta.original_image) ||
      null
    );
  }, [normalizeImageValue, node.meta]);

  const hasOriginalImage = Boolean(originalImage);
  const canCropImage = Boolean(originalImage || editedImage);
  const hasEditedVersion = useMemo(() => {
    if (!originalImage) {
      return Boolean(editedImage);
    }
    return Boolean(editedImage && editedImage !== originalImage);
  }, [editedImage, originalImage]);

  const effectiveImageOutput = useMemo(() => {
    if (imageOutputMode === 'annotated' && editedImage && hasEditedVersion) {
      return 'annotated';
    }
    return 'original';
  }, [editedImage, hasEditedVersion, imageOutputMode]);

  const [imageNotes, setImageNotes] = useState<string>(
    () => (typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : ''),
  );
  const [isEditingImageNotes, setIsEditingImageNotes] = useState(false);

  useEffect(() => {
    const nextValue = typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : '';
    setImageNotes(nextValue);
  }, [node.meta?.short_description]);

  // onBlur pattern - save only on focus loss
  const handleImageNotesChange = useCallback(
    (value: string) => {
      // Update local state WITHOUT saving to DB
      setImageNotes(value);
    },
    [],
  );

  // onFocus - mark editing start
  const handleImageNotesFocus = useCallback(() => {
    setIsEditingImageNotes(true);
  }, []);

  // onBlur - save only when leaving the field
  const handleImageNotesBlur = useCallback(() => {
    setIsEditingImageNotes(false);
    if (imageNotes !== node.meta?.short_description) {
      onChangeMeta(node.node_id, { short_description: imageNotes });
    }
  }, [node.node_id, imageNotes, node.meta?.short_description, onChangeMeta]);

  // Folder/File notes state (using short_description instead of content)
  const [folderFileNotes, setFolderFileNotes] = useState<string>(
    () => (typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : ''),
  );
  const [isEditingFolderFileNotes, setIsEditingFolderFileNotes] = useState(false);

  useEffect(() => {
    const nextValue = typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : '';
    setFolderFileNotes(nextValue);
  }, [node.meta?.short_description]);

  const handleFolderFileNotesChange = useCallback(
    (value: string) => {
      setFolderFileNotes(value);
    },
    [],
  );

  const handleFolderFileNotesFocus = useCallback(() => {
    setIsEditingFolderFileNotes(true);
  }, []);

  const handleFolderFileNotesBlur = useCallback(() => {
    setIsEditingFolderFileNotes(false);
    if (folderFileNotes !== node.meta?.short_description) {
      onChangeMeta(node.node_id, { short_description: folderFileNotes });
    }
  }, [node.node_id, folderFileNotes, node.meta?.short_description, onChangeMeta]);

  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const [imageViewportSize, setImageViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Cleanup timer for folder import message
  useEffect(() => {
    return () => {
      if (folderImportTimerRef.current !== null) {
        clearTimeout(folderImportTimerRef.current);
      }
    };
  }, []);

  const pendingImageModeRef = useRef(false);
  useEffect(() => {
    const target = imageViewportRef.current;
    if (!target) {
      return;
    }

    const updateSize = () => {
      setImageViewportSize({
        width: target.clientWidth,
        height: target.clientHeight,
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => {
        window.removeEventListener('resize', updateSize);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [imageViewMode]);
  const toolbarButtonBaseClasses =
    'inline-flex h-6 min-h-[24px] w-6 min-w-[24px] flex-shrink-0 items-center justify-center rounded border p-0.5 text-[10px] transition-colors align-bottom';
  const toolbarButtonInactiveClasses =
    'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-white/5 disabled:hover:text-white/70';
  
  // Provider sync state
  const [isSyncingProvider, setIsSyncingProvider] = useState(false);
  
  // Confirm dialog hook
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const uiSettings = useProjectStore((state) => state.uiSettings);
  const addNodeFromServer = useProjectStore((state) => state.addNodeFromServer);
  const setEdges = useProjectStore((state) => state.setEdges);
  const projectIdFromStore = useProjectStore((state) => state.project?.project_id);
  const projectId = projectIdFromProps ?? projectIdFromStore ?? null;
  
  // Text content states for controlled components
  const [contentValue, setContentValue] = useState(node.content || '');
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [isContentSaving, setIsContentSaving] = useState(false);
  const [contentSyncError, setContentSyncError] = useState<string | null>(null);
  const [recentlySaved, setRecentlySaved] = useState(false);
  const [systemPromptValue, setSystemPromptValue] = useState(String(node.ai?.system_prompt || ''));
  const [placeholderInputs, setPlaceholderInputs] = useState<Record<string, string>>(
    () => normalizePlaceholderValues(node.ai?.placeholder_values),
  );
  const lastSavedContentRef = useRef(node.content || '');
  const pendingContentRef = useRef<string | null>(null);
  const contentCommitTimer = useRef<number | null>(null);
  const contentCommitPromiseRef = useRef<Promise<boolean> | null>(null);
  const recentlySavedTimerRef = useRef<number | null>(null);
  const systemPromptSaveTimer = useRef<number | null>(null);
  const lastSavedSystemPromptRef = useRef(String(node.ai?.system_prompt || ''));
  const placeholderSaveTimer = useRef<number | null>(null);
  const lastSavedPlaceholderValuesRef = useRef<Record<string, string>>(normalizePlaceholderValues(node.ai?.placeholder_values));
  const [quickSystemPrompts, setQuickSystemPrompts] = useState<PromptPreset[]>(FALLBACK_SYSTEM_PRESETS);
  const [promptSearchTerm, setPromptSearchTerm] = useState('');
  const [promptSearchResults, setPromptSearchResults] = useState<PromptPreset[]>([]);
  const [promptSearchLoading, setPromptSearchLoading] = useState(false);
  const [promptSearchError, setPromptSearchError] = useState<string | null>(null);
  const [isTextSplitterOpen, setIsTextSplitterOpen] = useState(false);
  
  // HTML node specific states
  const initialHtmlUrl = typeof node.meta?.htmlUrl === 'string' ? node.meta.htmlUrl : '';
  const initialScreenshot = typeof node.meta?.htmlScreenshot === 'string' ? node.meta.htmlScreenshot : null;
  const [htmlUrl, setHtmlUrl] = useState<string>(initialHtmlUrl);
  const [htmlUrlInput, setHtmlUrlInput] = useState<string>(initialHtmlUrl);
  const [htmlScreenshot, setHtmlScreenshot] = useState<string | null>(initialScreenshot);
  const [showLivePreview, setShowLivePreview] = useState<boolean>(() => !initialScreenshot);
  const [isHtmlLoading, setIsHtmlLoading] = useState(false);
  const [isScreenshotCapturing, setIsScreenshotCapturing] = useState(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);
  const [screenWidth, setScreenWidth] = useState<string>((node.meta?.screenWidth as string) || 'desktop');
  const [htmlViewportWidth, setHtmlViewportWidth] = useState<number>((node.meta?.htmlViewportWidth as number) || 1024);
  const [htmlOutputType, setHtmlOutputType] = useState<'link' | 'image' | 'code'>(
    (node.meta?.htmlOutputType as 'link' | 'image' | 'code') || 'link',
  );
  const [emailHeroImage, setEmailHeroImage] = useState<string>((node.meta?.hero_image as string) || '');
  const [emailPreviewWidth, setEmailPreviewWidth] = useState<number>((node.meta?.editorPreviewWidth as number) || 640);
  const [emailPreviewHeight, setEmailPreviewHeight] = useState<number>((node.meta?.editorPreviewHeight as number) || 520);
  const [emailTextColor, setEmailTextColor] = useState<string>((node.meta?.emailTextColor as string) || '#1f2937');
  const [emailBackgroundColor, setEmailBackgroundColor] = useState<string>((node.meta?.emailBackgroundColor as string) || '#f1f5f9');
  const [emailAccentColor, setEmailAccentColor] = useState<string>((node.meta?.emailAccentColor as string) || '#2563eb');
  const [showEmailCodeEditor, setShowEmailCodeEditor] = useState(false);
  const [showHtmlSettingsModal, setShowHtmlSettingsModal] = useState(false);

  const textScalingSource = uiSettings?.textNodeFontScaling;
  const scalingBaseFontSize =
    typeof textScalingSource?.baseFontSize === 'number' && Number.isFinite(textScalingSource.baseFontSize)
      ? Math.max(6, Math.min(96, textScalingSource.baseFontSize))
      : DEFAULT_UI_SETTINGS.textNodeFontScaling.baseFontSize;
  const scalingSteps =
    Array.isArray(textScalingSource?.steps) && textScalingSource?.steps.length
      ? textScalingSource.steps
      : DEFAULT_UI_SETTINGS.textNodeFontScaling.steps;
  const scalingMultiplier =
    typeof textScalingSource?.scaleMultiplier === 'number' && Number.isFinite(textScalingSource.scaleMultiplier)
      ? Math.max(0.75, Math.min(1.5, textScalingSource.scaleMultiplier))
      : DEFAULT_UI_SETTINGS.textNodeFontScaling.scaleMultiplier;
  const scalingTargets =
    Array.isArray(textScalingSource?.targetNodeTypes) && textScalingSource.targetNodeTypes.length > 0
      ? textScalingSource.targetNodeTypes
      : DEFAULT_UI_SETTINGS.textNodeFontScaling.targetNodeTypes;
  const isTargetNodeType = scalingTargets.includes(node.type);
  const textFontSizeOverride = node.meta?.text_font_size;
  const manualFontSizeOverride =
    typeof textFontSizeOverride === 'number' && Number.isFinite(textFontSizeOverride)
      ? Math.max(8, Math.min(48, textFontSizeOverride))
      : null;
  const resolvedContentFontSize = isTargetNodeType
    ? computeDynamicFontSize(contentValue.length, scalingBaseFontSize, scalingSteps, scalingMultiplier)
    : null;
  const contentFontSizeStyle = manualFontSizeOverride
    ? `${manualFontSizeOverride}px`
    : resolvedContentFontSize
      ? `${resolvedContentFontSize}px`
      : undefined;
  const markdownPreviewSettings = uiSettings?.markdownPreview ?? DEFAULT_UI_SETTINGS.markdownPreview;
  const markdownPreviewContainerStyle = useMemo(
    () => ({
      backgroundColor: markdownPreviewSettings.backgroundColor,
      borderColor: markdownPreviewSettings.borderColor,
    }),
    [markdownPreviewSettings.backgroundColor, markdownPreviewSettings.borderColor],
  );
  const rawTextSplitterConfig = node.meta?.text_splitter;
  const textSplitterConfig = useMemo<TextSplitterConfig>(() => {
    if (rawTextSplitterConfig && typeof rawTextSplitterConfig === 'object') {
      const parsed = rawTextSplitterConfig as Record<string, unknown>;
      const separator =
        typeof parsed.separator === 'string' && parsed.separator.trim().length > 0
          ? parsed.separator.replace(/\\n/g, '\n') // ← support for \n
          : DEFAULT_TEXT_SPLITTER_CONFIG.separator;
      const subSeparator =
        typeof parsed.subSeparator === 'string'
          ? parsed.subSeparator.replace(/\\n/g, '\n') // ← support for \n
          : DEFAULT_TEXT_SPLITTER_CONFIG.subSeparator;
      const namingMode: TextSplitterConfig['namingMode'] =
        parsed.namingMode === 'manual' ? 'manual' : DEFAULT_TEXT_SPLITTER_CONFIG.namingMode;
      return {
        separator,
        subSeparator,
        namingMode,
      };
    }
    return { ...DEFAULT_TEXT_SPLITTER_CONFIG };
  }, [rawTextSplitterConfig]);
  const isTextualNode =
    node.type === 'text' || node.type === 'markdown' || node.content_type === 'text/markdown';
  const legacyTextViewMode = typeof node.meta?.view_mode === 'string' ? (node.meta.view_mode as string) : null;
  const rawTextViewMode =
    typeof node.meta?.text_view_mode === 'string'
      ? (node.meta.text_view_mode as string)
      : legacyTextViewMode || undefined;
  const normalizedTextViewMode =
    rawTextViewMode === 'preview' || rawTextViewMode === 'split' ? 'preview' : 'edit';
  const textViewMode = normalizedTextViewMode;
  const isTextPreviewVisible = textViewMode === 'preview';
  const canSplitTextContent = contentValue.trim().length > 0;
  const TEXT_FONT_SIZE_PRESETS = useMemo(
    () =>
      [
        { label: 'AUTO*', value: 'auto' },
        { label: '12px', value: '12' },
        { label: '14px', value: '14' },
        { label: '16px', value: '16' },
        { label: '18px', value: '18' },
        { label: '20px', value: '20' },
        { label: '24px', value: '24' },
      ] as const,
    [],
  );
  const textFontSizeSelectValue = manualFontSizeOverride ? String(manualFontSizeOverride) : 'auto';
  const handleTextFontSizeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === 'auto') {
        onChangeMeta(node.node_id, { text_font_size: null });
      } else {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          onChangeMeta(node.node_id, { text_font_size: parsed });
        }
      }
    },
    [node.node_id, onChangeMeta],
  );
  const handleSetTextViewMode = useCallback(
    (mode: 'edit' | 'preview') => {
      onChangeMeta(node.node_id, {
        text_view_mode: mode,
        view_mode: mode,
        text_preview_enabled: mode === 'preview',
      });
    },
    [node.node_id, onChangeMeta],
  );

  useEffect(() => {
    if (!isTextualNode || disabled) {
      setIsTextSplitterOpen(false);
    }
  }, [disabled, isTextualNode]);

  const [textSplitterPopoverStyle, setTextSplitterPopoverStyle] = useState<React.CSSProperties | null>(null);
  const textSplitterButtonRef = useRef<HTMLButtonElement | null>(null);
  const textSplitterPopoverRef = useRef<HTMLDivElement | null>(null);

  const updateTextSplitterPopoverPosition = useCallback(() => {
    const buttonEl = textSplitterButtonRef.current;
    if (!buttonEl) {
      return;
    }
    const rect = buttonEl.getBoundingClientRect();
    const width = 288; // 18rem (w-72)
    const gutter = 12;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, gutter),
      window.innerWidth - width - gutter,
    );
    const top = rect.bottom + 8;
    setTextSplitterPopoverStyle({
      position: 'fixed',
      top,
      left,
      width,
      zIndex: 2000,
    });
  }, []);

  useEffect(() => {
    if (!isTextSplitterOpen) {
      setTextSplitterPopoverStyle(null);
      return;
    }

    updateTextSplitterPopoverPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        (textSplitterPopoverRef.current && target && textSplitterPopoverRef.current.contains(target)) ||
        (textSplitterButtonRef.current && target && textSplitterButtonRef.current.contains(target))
      ) {
        return;
      }
      setIsTextSplitterOpen(false);
    };

    const handleScroll = () => {
      updateTextSplitterPopoverPosition();
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('resize', updateTextSplitterPopoverPosition);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('resize', updateTextSplitterPopoverPosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isTextSplitterOpen, updateTextSplitterPopoverPosition]);

  const [textSplitterDraft, setTextSplitterDraft] = useState<TextSplitterConfig>(textSplitterConfig);

  useEffect(() => {
    setTextSplitterDraft(textSplitterConfig);
  }, [textSplitterConfig]);

  const sanitizeTextSplitterConfig = useCallback((config: TextSplitterConfig): TextSplitterConfig => {
    const separator = config.separator.trim().length > 0 ? config.separator : DEFAULT_TEXT_SPLITTER_CONFIG.separator;
    const subSeparator =
      config.subSeparator && config.subSeparator.length > 0
        ? config.subSeparator
        : DEFAULT_TEXT_SPLITTER_CONFIG.subSeparator;
    const namingMode: TextSplitterConfig['namingMode'] =
      config.namingMode === 'manual' ? 'manual' : DEFAULT_TEXT_SPLITTER_CONFIG.namingMode;
    return {
      separator,
      subSeparator,
      namingMode,
    };
  }, []);

  const applyTextSplitterConfig = useCallback(
    (nextConfig: TextSplitterConfig) => {
      const sanitized = sanitizeTextSplitterConfig(nextConfig);
      onChangeMeta(node.node_id, {
        text_splitter: sanitized,
      });
      return sanitized;
    },
    [node.node_id, onChangeMeta, sanitizeTextSplitterConfig],
  );

  const handleTextSplitterChange = useCallback(
    (patch: Partial<TextSplitterConfig>) => {
      setTextSplitterDraft((previous) => {
        const merged = { ...previous, ...patch };
        return sanitizeTextSplitterConfig(merged);
      });
    },
    [sanitizeTextSplitterConfig],
  );

  const handleSplitTextConfirm = useCallback(async () => {
    const applied = applyTextSplitterConfig(textSplitterDraft);
    setTextSplitterDraft(applied);
    setIsTextSplitterOpen(false);
    try {
      if (onSplitText) {
        await onSplitText(node.node_id, applied, { content: contentValue });
      } else {
        console.info('[FlowNodeCard] Text split requested', { nodeId: node.node_id, config: applied });
      }
    } catch (error) {
      console.error('[FlowNodeCard] Failed to split text node', error);
    }
  }, [applyTextSplitterConfig, contentValue, node.node_id, onSplitText, textSplitterDraft]);

  const textSplitterPopover =
    isTextSplitterOpen && textSplitterPopoverStyle && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={textSplitterPopoverRef}
            className="space-y-3 rounded-lg border border-white/10 bg-slate-900/95 p-4 text-xs text-white/80 shadow-2xl"
            style={textSplitterPopoverStyle}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="font-medium text-white/90">Split Settings</div>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/50">
              Separator
              <input
                type="text"
                value={textSplitterDraft.separator}
                onChange={(event) => handleTextSplitterChange({ separator: event.target.value })}
                placeholder="---"
                className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/90 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/50">
              Sub-separator
              <input
                type="text"
                value={textSplitterDraft.subSeparator}
                onChange={(event) => handleTextSplitterChange({ subSeparator: event.target.value })}
                placeholder="-"
                className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/90 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/50">
              Naming
              <select
                value={textSplitterDraft.namingMode}
                onChange={(event) =>
                  handleTextSplitterChange({ namingMode: event.target.value === 'manual' ? 'manual' : 'auto' })
                }
                className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/90 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              >
                <option value="auto">Auto by segment</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <p className="text-[11px] leading-relaxed text-white/50">
              Full node tree will appear in the next splitter implementation step.
            </p>
            <button
              type="button"
              className="w-full rounded-md border border-emerald-400/60 bg-emerald-500/25 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleSplitTextConfirm}
              disabled={!canSplitTextContent || disabled}
            >
              Split Text
            </button>
            {!canSplitTextContent ? (
              <div className="text-[10px] text-emerald-200/70">
                Add content to the node to activate splitting.
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  // Refs for DOM manipulation
  const nodeRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const htmlPreviewRef = useRef<HTMLDivElement | null>(null);
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);
  const nodeIdRef = useRef(node.node_id);
  const updateNodeInternals = useUpdateNodeInternals();
  // Debounced version of updateNodeInternals to prevent multiple calls
  const debouncedUpdateNodeInternals = useDebouncedUpdateNodeInternals(updateNodeInternals, node.node_id, 50);
  const reactFlow = useReactFlow();
  const resizeStartPos = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const commitContentNowRef = useRef<(() => Promise<boolean>) | null>(null);
  const onChangeContentRef = useRef<typeof onChangeContent>(onChangeContent);

  const handleRemoveInvalidPortsFromModal = useCallback(
    async (nodeId: string, invalidPorts: string[]) => {
      if (!onRemoveInvalidPorts || invalidPorts.length === 0) {
        return;
      }
      try {
        await onRemoveInvalidPorts(nodeId, invalidPorts);
      } catch (error) {
        console.error('[FlowNodeCard] Failed to remove invalid ports:', error);
      }
    },
    [onRemoveInvalidPorts],
  );


  // Node properties
  const baseColor: string = currentColor; // Use local state for immediate updates
  const nodeMeta = (node.meta ?? {}) as Record<string, unknown>;
  const videoUrlValue: string =
    typeof nodeMeta.video_url === 'string' ? nodeMeta.video_url : '';
  const rawVideoUrl: string = videoUrlValue.trim();
  const rawVideoData: string =
    typeof nodeMeta.video_data === 'string' ? nodeMeta.video_data : '';
  const videoFileName: string | null =
    typeof nodeMeta.video_file === 'string' ? nodeMeta.video_file : null;
  const videoFileType: string | null =
    typeof nodeMeta.file_type === 'string' ? nodeMeta.file_type : null;
  const videoScale = useMemo(() => {
    const numeric = Number(nodeMeta.video_scale);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 1;
    }
    const matched =
      VIDEO_SCALE_OPTIONS.find((value) => Math.abs(value - numeric) < 0.001) ?? null;
    return matched ?? 1;
  }, [nodeMeta.video_scale]);
  const videoControlsEnabled = nodeMeta.controls !== false;
  const videoDisplayMode: 'url' | 'upload' =
    nodeMeta.display_mode === 'upload' ? 'upload' : 'url';
  const videoSource = useMemo(() => {
    if (rawVideoData) {
      return {
        kind: 'data' as const,
        src: rawVideoData,
        name: videoFileName,
      };
    }
    if (rawVideoUrl) {
      return {
        kind: 'url' as const,
        src: rawVideoUrl,
        name: videoFileName,
      };
    }
    return null;
  }, [rawVideoData, rawVideoUrl, videoFileName]);
  const [videoNotes, setVideoNotes] = useState<string>(
    () => (typeof nodeMeta.short_description === 'string' ? String(nodeMeta.short_description) : ''),
  );
  useEffect(() => {
    const nextValue = typeof nodeMeta.short_description === 'string' ? String(nodeMeta.short_description) : '';
    setVideoNotes(nextValue);
  }, [nodeMeta.short_description]);
  const handleVideoNotesChange = useCallback(
    (value: string) => {
      setVideoNotes(value);
      onChangeMeta(node.node_id, { short_description: value });
    },
    [node.node_id, onChangeMeta],
  );
  const videoFileSize = typeof nodeMeta.file_size === 'number' ? Number(nodeMeta.file_size) : null;
  const formattedVideoFileSize = useMemo(
    () => (videoFileSize !== null ? `${(videoFileSize / 1024 / 1024).toFixed(1)} MB` : null),
    [videoFileSize],
  );
  const videoSourceName = useMemo(() => {
    if (videoFileName) {
      return videoFileName;
    }
    if (rawVideoUrl) {
      try {
        const parsed = new URL(rawVideoUrl, typeof window !== 'undefined' ? window.location.origin : 'http://local');
        const pathnameSegment = parsed.pathname.split('/').filter(Boolean).pop();
        if (pathnameSegment) {
          return decodeURIComponent(pathnameSegment);
        }
        return parsed.hostname;
      } catch {
        const fallback = rawVideoUrl.split('/').filter(Boolean).pop();
        return decodeURIComponent(fallback ?? rawVideoUrl);
      }
    }
    return '';
  }, [videoFileName, rawVideoUrl]);
  const videoFooterInfo = useMemo(() => {
    if (node.type !== 'video') {
      return null;
    }
    return {
      primaryIcon: '🎬',
      primaryLabel: 'Video',
      fileName: videoSourceName || 'Source not set',
      sizeLabel: formattedVideoFileSize ?? null,
    };
  }, [formattedVideoFileSize, node.type, videoSourceName]);
  const videoFooterSecondaryNode = useMemo(() => {
    if (node.type !== 'video') {
      return null;
    }
    const displayName = videoFooterInfo?.fileName ?? 'Source not set';
    return (
      <span className="flex-1 truncate" title={displayName}>
        {displayName}
      </span>
    );
  }, [node.type, videoFooterInfo]);
  const videoDisplayWidthMeta =
    typeof nodeMeta.video_display_width === 'number' ? Number(nodeMeta.video_display_width) : null;
  const videoDisplayHeightMeta =
    typeof nodeMeta.video_display_height === 'number' ? Number(nodeMeta.video_display_height) : null;
  const replicateStatus =
    typeof nodeMeta.replicate_status === 'string' ? String(nodeMeta.replicate_status) : undefined;
  const replicateModel =
    typeof nodeMeta.replicate_model === 'string' ? String(nodeMeta.replicate_model) : undefined;
  const replicateVersion =
    typeof nodeMeta.replicate_version === 'string' ? String(nodeMeta.replicate_version) : undefined;
  const replicatePredictionUrl =
    typeof nodeMeta.replicate_prediction_url === 'string' ? String(nodeMeta.replicate_prediction_url) : undefined;
  const replicateLastRunAt =
    typeof nodeMeta.replicate_last_run_at === 'string' ? String(nodeMeta.replicate_last_run_at) : undefined;
  const rawReplicateOutputs = nodeMeta.replicate_output;
  const replicateOutputs =
    Array.isArray(rawReplicateOutputs)
      ? rawReplicateOutputs
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim())
      : typeof rawReplicateOutputs === 'string' && rawReplicateOutputs.trim().length > 0
        ? [rawReplicateOutputs.trim()]
        : [];
  const replicateLastRunLabel = useMemo(() => {
    if (!replicateLastRunAt) return null;
    const date = new Date(replicateLastRunAt);
    if (Number.isNaN(date.getTime())) {
      return replicateLastRunAt;
    }
    return date.toLocaleString('en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [replicateLastRunAt]);
  const replicateStatusBadge = useMemo(() => {
    if (!replicateStatus) {
      return null;
    }
    const normalized = replicateStatus.toLowerCase();
    if (['succeeded', 'success', 'completed'].includes(normalized)) {
      return { label: 'Success', className: 'bg-green-900/30 text-green-300 border border-green-500/40' };
    }
    if (['failed', 'error', 'canceled'].includes(normalized)) {
      return { label: 'Error', className: 'bg-red-900/30 text-red-300 border border-red-500/40' };
    }
    if (['processing', 'running', 'queued', 'starting'].includes(normalized)) {
      return { label: 'Processing', className: 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/40' };
    }
    return { label: replicateStatus, className: 'bg-slate-700 text-slate-200 border border-slate-600' };
  }, [replicateStatus]);
  const statusBorderColor = useMemo(() => {
    if (!replicateStatus) {
      return baseColor;
    }
    const normalized = replicateStatus.toLowerCase();
    if (['failed', 'error', 'canceled'].includes(normalized)) {
      return '#ef4444';
    }
    if (['processing', 'running', 'queued', 'starting'].includes(normalized)) {
      return '#eab308';
    }
    return baseColor;
  }, [replicateStatus, baseColor]);
  const isAiNode = node.type === 'ai';
  const isImprovedAiNode = node.type === 'ai' || node.meta?.ui_mode === 'improved';
  const typeIcon = TYPE_ICONS[node.type] || '❓';

  const videoContentMinHeight = useMemo(() => {
    if (node.type !== 'video' || !videoDisplayHeightMeta) {
      return null;
    }
    return videoDisplayHeightMeta + VIDEO_NOTES_MIN_HEIGHT + VIDEO_NOTES_VERTICAL_EXTRA;
  }, [node.type, videoDisplayHeightMeta]);
  const videoMinNodeHeight = useMemo(() => {
    if (!videoContentMinHeight) {
      return null;
    }
    const baseTotalHeight = calculateNodeHeight(videoContentMinHeight, false);
    return Math.max(NODE_MIN_HEIGHT + VIDEO_EXTRA_MIN_HEIGHT, baseTotalHeight + VIDEO_EXTRA_MIN_HEIGHT);
  }, [videoContentMinHeight]);
  const imageContentMinHeight = useMemo(() => {
    if (node.type !== 'image') {
      return null;
    }
    return IMAGE_VIEWPORT_MIN_HEIGHT + IMAGE_NOTES_MIN_HEIGHT + IMAGE_CONTENT_VERTICAL_GAP;
  }, [node.type]);
  const imageMinNodeHeight = useMemo(() => {
    if (!imageContentMinHeight) {
      return null;
    }
    const baseTotalHeight = calculateNodeHeight(imageContentMinHeight, imageViewMode === 'edit');
    return Math.max(NODE_MIN_HEIGHT, baseTotalHeight);
  }, [imageContentMinHeight, imageViewMode]);
  const nodeMinHeight = useMemo(() => {
    if (collapsed) {
      // For improved AI nodes, the collapsed state still shows the control panel
      if (isImprovedAiNode) return 150; 
      return 110;
    }
    // For the new AI node, we need more vertical space for the controls
    if (node.type === 'video' && videoMinNodeHeight) {
      return videoMinNodeHeight;
    }
    if (node.type === 'image' && imageMinNodeHeight) {
      return imageMinNodeHeight;
    }
    if (isImprovedAiNode) return 280;
    return NODE_MIN_HEIGHT;
  }, [collapsed, imageMinNodeHeight, isImprovedAiNode, node.type, videoMinNodeHeight]);

  // Derive current node dimensions before they are consumed by callbacks
  const currentReactFlowNode = reactFlow.getNode(node.node_id);
  const reactFlowWidth = currentReactFlowNode?.style?.width;
  const reactFlowHeight = currentReactFlowNode?.style?.height;

  const nodeWidth = useMemo(() => {
    // Use React Flow width if available, otherwise calculate from bbox
    if (reactFlowWidth && typeof reactFlowWidth === 'number' && reactFlowWidth > 0) {
      return reactFlowWidth;
    }
    
    const bbox = node.ui?.bbox;
    if (bbox) {
      const bboxWidth = bbox.x2 - bbox.x1;
      return normalizeNodeWidth(bboxWidth);
    }
    return NODE_DEFAULT_WIDTH;
  }, [reactFlowWidth, node.ui?.bbox]);

  const nodeHeight = useMemo(() => {
    // Use React Flow height if available, otherwise calculate from bbox
    if (reactFlowHeight && typeof reactFlowHeight === 'number' && reactFlowHeight > 0) {
      return reactFlowHeight;
    }
    
    const bbox = node.ui?.bbox;
    if (bbox) {
      const bboxHeight = bbox.y2 - bbox.y1;
      // For collapsed nodes, allow smaller height than minimum
      if (collapsed) {
        return Math.max(nodeMinHeight, bboxHeight);
      }
      return normalizeNodeHeight(bboxHeight, node.type);
    }
    
    // Calculate height based on content for new nodes
    const contentBasedHeight = calculateContentBasedHeight(
      node.content || '', 
      isAiNode && !collapsed, 
      collapsed
    );
    return contentBasedHeight;
  }, [reactFlowHeight, node.ui?.bbox, node.type, node.content, isAiNode, collapsed, nodeMinHeight]);

  const handleVideoDimensions = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      if (node.type !== 'video') {
        return;
      }
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return;
      }

      const aspectRatio = width / height || DEFAULT_VIDEO_ASPECT;
      let contentWidth = MIN_CONTENT_WIDTH;
      let contentHeight = contentWidth / aspectRatio;

      if (contentHeight > MAX_CONTENT_HEIGHT) {
        contentHeight = MAX_CONTENT_HEIGHT;
        contentWidth = Math.max(MIN_CONTENT_WIDTH, Math.min(MAX_CONTENT_WIDTH, contentHeight * aspectRatio));
      }

      if (contentWidth > MAX_CONTENT_WIDTH) {
        contentWidth = MAX_CONTENT_WIDTH;
        contentHeight = contentWidth / aspectRatio;
      }

      if (contentHeight < MIN_CONTENT_HEIGHT) {
        contentHeight = MIN_CONTENT_HEIGHT;
        contentWidth = Math.max(MIN_CONTENT_WIDTH, Math.min(MAX_CONTENT_WIDTH, contentHeight * aspectRatio));
      }

      const contentAreaHeight = contentHeight + VIDEO_NOTES_MIN_HEIGHT + VIDEO_NOTES_VERTICAL_EXTRA;
      const baseTotalHeight = calculateNodeHeight(contentAreaHeight, false);
      const totalHeight = Math.max(baseTotalHeight + VIDEO_EXTRA_MIN_HEIGHT, NODE_MIN_HEIGHT + VIDEO_EXTRA_MIN_HEIGHT);
      const totalWidth = normalizeNodeWidth(contentWidth);

      const hasWidthChange =
        typeof reactFlowWidth !== 'number' || Math.abs(reactFlowWidth - totalWidth) > 1;
      const hasHeightChange =
        typeof reactFlowHeight !== 'number' || Math.abs(reactFlowHeight - totalHeight) > 1;

      const storedWidth = videoDisplayWidthMeta;
      const storedHeight = videoDisplayHeightMeta;
      const widthDiff = storedWidth === null ? Infinity : Math.abs(storedWidth - contentWidth);
      const heightDiff = storedHeight === null ? Infinity : Math.abs(storedHeight - contentHeight);

      if (widthDiff > 1 || heightDiff > 1) {
        onChangeMeta(node.node_id, {
          video_display_width: contentWidth,
          video_display_height: contentHeight,
          video_aspect_ratio: aspectRatio,
        });
      }

      if (!hasWidthChange && !hasHeightChange) {
        return;
      }

      reactFlow.setNodes((nodes) =>
        nodes.map((n) =>
          n.id === node.node_id
            ? {
                ...n,
                style: {
                  ...n.style,
                  width: totalWidth,
                  height: totalHeight,
                },
              }
            : n,
        ),
      );

      if (onChangeUi) {
        const currentBbox = node.ui?.bbox;
        const x1 = currentBbox?.x1 ?? 0;
        const y1 = currentBbox?.y1 ?? 0;
        onChangeUi(node.node_id, {
          bbox: {
            x1,
            y1,
            x2: x1 + totalWidth,
            y2: y1 + totalHeight,
          },
        });
      }
    },
    [
      node,
      onChangeMeta,
      onChangeUi,
      reactFlow,
      reactFlowWidth,
      reactFlowHeight,
      videoDisplayWidthMeta,
      videoDisplayHeightMeta,
    ],
  );

  // AI node specific state
  const selectedProvider = useMemo(() => {
    if (!isAiNode || !currentProvider) return null;
    return providers.find(p => p.id === currentProvider) || null;
  }, [isAiNode, currentProvider, providers, forceRender]);

  const inlineModelValue = useMemo(() => {
    const rawModel = typeof node.ai?.model === 'string' ? node.ai.model.trim() : '';
    if (rawModel) {
      return rawModel;
    }
    if (selectedProvider?.defaultModel) {
      return selectedProvider.defaultModel;
    }
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
      baseModels = dynamicForProvider
        .map((value) => (typeof value === 'string' ? value.trim() : String(value)))
        .filter(Boolean);
    } else if (selectedProvider?.models) {
      baseModels = selectedProvider.models
        .map((value) => (typeof value === 'string' ? value.trim() : String(value)))
        .filter(Boolean);
    }

    const extraModels = [inlineModelValue, pendingModelSelection].filter(
      (value): value is string => Boolean(value && value.trim().length > 0),
    );

    if (extraModels.length > 0) {
      baseModels = [...extraModels, ...baseModels];
    }

    const unique = Array.from(
      new Set(baseModels.map((value) => (typeof value === 'string' ? value.trim() : String(value)))),
    ).filter(Boolean);
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [currentProvider, dynamicModels, selectedProvider, inlineModelValue, pendingModelSelection]);

  const currentProviderLabel = useMemo(() => {
    if (selectedProvider?.name) {
      return selectedProvider.name;
    }
    if (currentProvider) {
      return currentProvider;
    }
    return '—';
  }, [selectedProvider, currentProvider]);

  const aiCharacterCount = useMemo(() => {
    if (!isAiNode) {
      return (node.content || '').length;
    }
    const systemPrompt = typeof node.ai?.system_prompt === 'string' ? node.ai.system_prompt : '';
    const outputExample = typeof node.ai?.output_example === 'string' ? node.ai.output_example : '';
    const userPrompt = typeof node.ai?.user_prompt_template === 'string' ? node.ai.user_prompt_template : '';
    const contextPrompt = typeof node.content === 'string' ? node.content : '';
    return systemPrompt.length + outputExample.length + userPrompt.length + contextPrompt.length;
  }, [isAiNode, node.ai?.system_prompt, node.ai?.output_example, node.ai?.user_prompt_template, node.content]);

  const metaRecord = useMemo(() => (node.meta ?? {}) as Record<string, unknown>, [node.meta]);
  const rawOutputFolderId =
    typeof metaRecord['output_folder_id'] === 'string' ? (metaRecord['output_folder_id'] as string) : '';
  const outputFolderLabel =
    typeof metaRecord['output_folder_label'] === 'string'
      ? (metaRecord['output_folder_label'] as string)
      : typeof metaRecord['output_folder_name'] === 'string'
        ? (metaRecord['output_folder_name'] as string)
        : '';
  const maskedOutputFolderId =
    rawOutputFolderId.length > 14
      ? `${rawOutputFolderId.slice(0, 6)}…${rawOutputFolderId.slice(-4)}`
      : rawOutputFolderId;
  const activeProviderId =
    selectedProvider?.id || currentProvider || (typeof node.ai?.provider === 'string' ? node.ai.provider : '');

  const folderChildrenIds = useMemo(() => {
    if (node.type !== 'folder') {
      return [] as string[];
    }
    if (Array.isArray(node.meta?.folder_children)) {
      return (node.meta.folder_children as unknown[])
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
    if (Array.isArray(node.meta?.folder_items)) {
      return (node.meta.folder_items as unknown[])
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
    return [] as string[];
  }, [node.meta?.folder_children, node.meta?.folder_items, node.type]);

  const folderChildNodes = useMemo(() => {
    if (node.type !== 'folder' || folderChildrenIds.length === 0) {
      return [] as FlowNode[];
    }
    const lookup = new Map(allNodes.map((item) => [item.node_id, item]));
    const children = folderChildrenIds
      .map((childId) => lookup.get(childId))
      .filter((child): child is FlowNode => Boolean(child));
    
    console.log('[folderChildNodes]', {
      folderId: node.node_id,
      folderChildrenIds,
      allNodesCount: allNodes.length,
      foundChildren: children.length,
      childrenIds: children.map(c => c.node_id),
    });
    
    return children;
  }, [allNodes, folderChildrenIds, node.type, node.node_id]);

  const folderDisplayMode =
    node.type === 'folder' && node.meta?.display_mode === 'grid' ? 'grid' : 'list';
  const [isFolderDropActive, setIsFolderDropActive] = useState(false);
  const [folderImportMessage, setFolderImportMessage] = useState<string>('');
  const folderImportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folderContextLimit = useMemo(() => {
    if (node.type !== 'folder') {
      return 6;
    }
    const raw = node.meta?.folder_context_limit;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const normalized = Math.trunc(raw);
      if (normalized >= 1 && normalized <= 24) {
        return normalized;
      }
    }
    return 6;
  }, [node.meta?.folder_context_limit, node.type]);

  const handleFolderDisplayChange = useCallback(
    (mode: 'list' | 'grid') => {
      if (node.type !== 'folder') return;
      onChangeMeta(node.node_id, { display_mode: mode });
    },
    [node.node_id, node.type, onChangeMeta],
  );

  const handleFolderContextLimitChange = useCallback(
    (value: number) => {
      if (node.type !== 'folder') return;
      const numeric = Number.isFinite(value) ? value : folderContextLimit;
      const normalized = Math.max(1, Math.min(24, Math.trunc(numeric)));
      onChangeMeta(node.node_id, { folder_context_limit: normalized });
    },
    [folderContextLimit, node.node_id, node.type, onChangeMeta],
  );

  const shouldActivateFolderDropZone = useCallback(
    (event: React.DragEvent<HTMLElement>): boolean => {
      if (node.type !== 'folder') {
        return false;
      }
      const transfer = event.dataTransfer;
      if (!transfer) {
        return false;
      }
      if (transfer.files && transfer.files.length > 0) {
        return true;
      }
      const types = Array.from(transfer.types ?? []);
      if (types.includes('application/mwf-folder-node')) {
        // dragging a folder child back to canvas — do not highlight
        return false;
      }
      if (types.some((type) => type.startsWith('application/reactflow'))) {
        return true;
      }
      if (types.includes('application/reactflow-node-copy')) {
        return true;
      }
      // React Flow node drag may report no explicit types – treat as valid
      return types.length === 0;
    },
    [node.type],
  );

  const handleFolderDropZoneDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shouldActivateFolderDropZone(event)) {
        return;
      }
      event.preventDefault();
      setIsFolderDropActive(true);
    },
    [shouldActivateFolderDropZone],
  );

  const handleFolderDropZoneDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shouldActivateFolderDropZone(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect =
          event.dataTransfer.files && event.dataTransfer.files.length > 0 ? 'copy' : 'move';
      }
      if (!isFolderDropActive) {
        setIsFolderDropActive(true);
      }
    },
    [isFolderDropActive, shouldActivateFolderDropZone],
  );

  const handleFolderDropZoneDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (node.type !== 'folder') {
        return;
      }
      const related = event.relatedTarget as Node | null;
      if (related && event.currentTarget.contains(related)) {
        return;
      }
      setIsFolderDropActive(false);
    },
    [node.type],
  );

  const handleFolderDropZoneDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (shouldActivateFolderDropZone(event)) {
        event.preventDefault();
      }
      setIsFolderDropActive(false);

      // Show notification when importing files
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        setFolderImportMessage(`✓ Added ${files.length} file(s)`);
        
        // Clear old timer if it exists
        if (folderImportTimerRef.current !== null) {
          clearTimeout(folderImportTimerRef.current);
        }
        
        // Hide message after 3 seconds
        folderImportTimerRef.current = setTimeout(() => {
          setFolderImportMessage('');
          folderImportTimerRef.current = null;
        }, 3000);
      }
    },
    [shouldActivateFolderDropZone],
  );

  const clampPreviewText = useCallback((value: string, max = 140) => {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (trimmed.length <= max) {
      return trimmed;
    }
    return `${trimmed.slice(0, max - 1)}…`;
  }, []);

  const getChildImagePreview = useCallback((child: FlowNode): string | null => {
    const meta = (child.meta ?? {}) as Record<string, unknown>;
    const readString = (candidate: unknown): string | null =>
      typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
    
    const normalizeUrl = (url: string | null): string | null => {
      if (!url) return null;
      // If path starts with /uploads/ and is not already a full URL, prepend production domain
      if (url.startsWith('/uploads/') && !url.startsWith('http')) {
        return `https://mindworkflow.com${url}`;
      }
      return url;
    };

    if (child.type === 'image') {
      const preview = normalizeUrl(
        readString(meta.preview_url) ??
        readString(meta.local_url) ??
        readString(meta.image_url) ??
        readString(meta.url) ??
        readString(meta.image_data) ??
        null
      );
      console.log('[getChildImagePreview]', {
        nodeId: child.node_id,
        preview_url: meta.preview_url,
        local_url: meta.local_url,
        image_url: meta.image_url,
        url: meta.url,
        hasImageData: !!meta.image_data,
        result: preview,
      });
      return preview;
    }

    if (Array.isArray(meta.artifacts)) {
      for (const artifact of meta.artifacts as Array<Record<string, unknown>>) {
        const preview = normalizeUrl(
          readString(artifact.local_url) ??
          readString(artifact.preview_url) ??
          readString(artifact.url)
        );
        if (preview) {
          return preview;
        }
      }
    }

    return normalizeUrl(
      (typeof meta.thumbnail === 'string' ? meta.thumbnail : null) ??
      (typeof meta.image_url === 'string' ? meta.image_url : null) ??
      (typeof meta.preview === 'string' ? meta.preview : null)
    );
  }, []);

  const getChildPreviewText = useCallback(
    (child: FlowNode): string => {
      const meta = (child.meta ?? {}) as Record<string, unknown>;
      const fromContent = typeof child.content === 'string' ? child.content : '';

      if (child.type === 'text') {
        return clampPreviewText(fromContent);
      }

      if (child.type === 'ai') {
        const aiSummary =
          (typeof meta.summary === 'string' && meta.summary) ||
          (typeof meta.response === 'string' && meta.response) ||
          fromContent;
        if (aiSummary) {
          return clampPreviewText(String(aiSummary));
        }
      }

      if (child.type === 'file') {
        const fileName =
          (typeof meta.file_name === 'string' && meta.file_name) ||
          (typeof meta.title === 'string' && meta.title);
        if (fileName) {
          return clampPreviewText(String(fileName), 80);
        }
      }

      if (fromContent) {
        return clampPreviewText(fromContent);
      }

      if (typeof meta.description === 'string') {
        return clampPreviewText(meta.description, 100);
      }

      return '';
    },
    [clampPreviewText],
  );

  // Color change handler
  const handleColorChange = useCallback(
    (color: string) => {
      setCurrentColor(color); // Update local state immediately
      onChangeUi?.(node.node_id, { color });
      setColorOpen(false);
    },
    [onChangeUi, node.node_id],
  );

  const handleColorButtonClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setColorOpen(!colorOpen);
  }, [colorOpen]);

  const handleColorPickerClick = useCallback((e: MouseEvent<HTMLButtonElement>, color: string) => {
    e.preventDefault();
    e.stopPropagation();
    handleColorChange(color);
  }, [handleColorChange]);

  // Title editing handlers
  const handleTitleEdit = useCallback((e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    setEditingTitle(true);
    setTitleValue(node.title);
  }, [node.title]);

  const handleTitleSubmit = useCallback(() => {
    titleSubmitRef.current = true;
    onChangeTitle(node.node_id, titleValue.trim());
    setEditingTitle(false);
    setTimeout(() => {
      titleSubmitRef.current = false;
    }, 0);
  }, [onChangeTitle, node.node_id, titleValue]);

  const handleTitleCancel = useCallback(() => {
    setTitleValue(node.title);
    setEditingTitle(false);
    titleSubmitRef.current = false;
  }, [node.title]);

  const handleTitleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // Prevent React Flow from handling the event
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  }, [handleTitleSubmit, handleTitleCancel]);

  const handleTitleInputBlur = useCallback(() => {
    if (titleSubmitRef.current) {
      titleSubmitRef.current = false;
      return;
    }
    handleTitleCancel();
  }, [handleTitleCancel]);

  const handleTitleInputClick = useCallback((e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation(); // Prevent node dragging when clicking inside input
  }, []);

  const applyAutoTitle = useCallback(
    (rawTitle: string | undefined | null) => {
      if (editingTitle) {
        return;
      }
      if (typeof rawTitle !== 'string') {
        return;
      }
      const trimmed = rawTitle.trim();
      if (!trimmed || trimmed === node.title) {
        return;
      }
      const normalized = trimmed.replace(/\s+/g, ' ').trim();
      if (!normalized) {
        return;
      }
      const finalTitle = normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized;
      onChangeTitle(node.node_id, finalTitle);
      setTitleValue(finalTitle);
    },
    [editingTitle, node.node_id, node.title, onChangeTitle],
  );

  const autoRenameFromSource = useCallback(
    (rawSource: string | undefined | null) => {
      if (!rawSource) return;
      try {
        let source = String(rawSource).trim();
        if (!source) return;

        if (/^https?:\/\//i.test(source)) {
          try {
            const url = new URL(source);
            source = url.pathname.split('/').filter(Boolean).pop() || url.hostname;
          } catch {
            source = source.split('/').filter(Boolean).pop() ?? source;
          }
        }

        source = decodeURIComponent(source);
        source = source.replace(/[?#].*$/, '');
        source = source.replace(/\.[^/.]+$/, '');
        source = source.replace(/[_-]+/g, ' ').trim();

        if (!source) return;
        applyAutoTitle(source);
      } catch (error) {
        console.warn('autoRenameFromSource failed:', error);
      }
    },
    [applyAutoTitle],
  );

  const autoRenameFromTitle = useCallback(
    (rawTitle: string | undefined | null) => {
      if (!rawTitle) return;
      applyAutoTitle(rawTitle);
    },
    [applyAutoTitle],
  );
  const handleVideoUpload = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }
      try {
        // Upload file to server instead of storing as base64
        const formData = new FormData();
        formData.append('file', file);
        const effectiveProjectId =
          projectId ??
          (typeof node.project_id === 'string' && node.project_id.trim().length > 0
            ? node.project_id
            : null);

        if (!effectiveProjectId) {
          console.error('Video upload failed: missing projectId');
          alert('Could not determine project for video upload');
          return;
        }

        const response = await fetch(`/api/videos/${node.node_id}/upload`, {
          method: 'POST',
          headers: {
            'x-project-id': effectiveProjectId,
          },
          body: formData,
        });
        if (!response.ok) {
          console.error('Video upload failed:', response.statusText);
          alert('Video upload error');
          return;
        }
        const payload = await response.json();
        const assetRelativePath: string | undefined =
          typeof payload.assetRelativePath === 'string'
            ? payload.assetRelativePath
            : typeof payload.asset_relative_path === 'string'
              ? payload.asset_relative_path
              : undefined;
        const publicUrl: string =
          typeof payload.publicUrl === 'string'
            ? payload.publicUrl
            : typeof payload.url === 'string'
              ? payload.url
              : '';
        const relativeUrl: string | undefined =
          typeof payload.relativeUrl === 'string' ? payload.relativeUrl : undefined;
        const storedFilename: string =
          typeof payload.filename === 'string' && payload.filename.trim().length > 0
            ? payload.filename
            : file.name;
        const metaPatch: Record<string, unknown> = {
          video_file: storedFilename,
          video_url: publicUrl || undefined,
          asset_public_url: publicUrl || undefined,
          file_size: typeof payload.size === 'number' ? payload.size : file.size,
          file_type: typeof payload.mimeType === 'string' && payload.mimeType.length > 0 ? payload.mimeType : file.type,
          display_mode: 'upload',
          video_data: null,
          asset_origin: 'manual_upload',
          source_url: publicUrl || undefined,
          source_download_url: publicUrl || undefined,
          original_filename: file.name,
        };

        if (assetRelativePath) {
          metaPatch.video_path = assetRelativePath;
          metaPatch.asset_relative_path = assetRelativePath;
          metaPatch.local_url = relativeUrl || `/uploads/${effectiveProjectId}/${assetRelativePath}`;
        }

        metaPatch.project_id =
          typeof payload.projectId === 'string' && payload.projectId.trim().length > 0
            ? payload.projectId
            : effectiveProjectId;

        if (typeof payload.assetMimeType === 'string' && payload.assetMimeType.length > 0) {
          metaPatch.asset_mime_type = payload.assetMimeType;
        } else if (!metaPatch.asset_mime_type) {
          metaPatch.asset_mime_type = metaPatch.file_type;
        }

        onChangeMeta(node.node_id, {
          ...metaPatch,
        });
        autoRenameFromSource(file.name);
        setVideoPreviewReloadToken((value) => value + 1);
      } catch (error) {
        console.error('Video upload error:', error);
        alert('Error uploading video');
      }
    };
    input.click();
  }, [autoRenameFromSource, data.projectId, node.project_id, node.node_id, onChangeMeta, projectId]);
  const handleVideoUrlInput = useCallback(() => {
    const url = window.prompt('Enter video URL:')?.trim();
    if (!url) {
      return;
    }
    onChangeMeta(node.node_id, {
      video_url: url,
      video_data: null,
      video_file: null,
      display_mode: 'url',
    });
    autoRenameFromSource(url);
    setVideoPreviewReloadToken((value) => value + 1);
  }, [autoRenameFromSource, node.node_id, onChangeMeta]);
  const handleVideoDownload = useCallback(() => {
    if (!videoSource?.src) {
      return;
    }
    const sourceValue = videoSource.src;
    if (videoSource.kind === 'url' && /^https?:\/\//i.test(sourceValue)) {
      window.open(sourceValue, '_blank', 'noopener');
      return;
    }
    const link = document.createElement('a');
    link.href = sourceValue;
    const providedName =
      (videoFileName && videoFileName.trim()) ||
      (node.title && node.title.trim()) ||
      'video';
    const sanitizedName = providedName.replace(/\s+/g, '_');
    const extensionFromFilename = videoFileName && videoFileName.includes('.')
      ? videoFileName.slice(videoFileName.lastIndexOf('.') + 1)
      : null;
    const extensionFromType = videoFileType && videoFileType.includes('/')
      ? videoFileType.split('/')[1]
      : null;
    const extension = extensionFromFilename || extensionFromType || 'mp4';
    link.download = `${sanitizedName}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [node.title, videoFileName, videoFileType, videoSource]);
  const handleVideoResetScale = useCallback(() => {
    onChangeMeta(node.node_id, { video_scale: 1 });
  }, [node.node_id, onChangeMeta]);

  const handleOutputTypeChange = useCallback((type: 'mindmap' | 'node' | 'folder') => {
    console.log('🎯 handleOutputTypeChange called:', type, 'for node:', node.node_id);
    setOutputType(type);
    userSetOutputTypeRef.current = type; // Remember user's choice
    // Can also be saved in node metadata
    onChangeMeta(node.node_id, { output_type: type });
    console.log('✅ onChangeMeta called with output_type:', type);
  }, [node.node_id, onChangeMeta]);

  // Sync state with node changes
  useEffect(() => {
    setTitleValue(node.title);
  }, [node.title]);

  useEffect(() => {
    const initialContent = node.content || '';
    lastSavedContentRef.current = initialContent;
    pendingContentRef.current = null;
    if (contentCommitTimer.current !== null) {
      window.clearTimeout(contentCommitTimer.current);
      contentCommitTimer.current = null;
    }
    contentCommitPromiseRef.current = null;
    if (recentlySavedTimerRef.current !== null) {
      window.clearTimeout(recentlySavedTimerRef.current);
      recentlySavedTimerRef.current = null;
    }
    setContentValue(initialContent);
    setIsContentDirty(false);
    setIsContentSaving(false);
    setContentSyncError(null);
    setRecentlySaved(false);
  }, [node.node_id]);

  useEffect(() => {
    if (isUserEditingRef.current) {
      return;
    }
    const incoming = node.content || '';
    if (pendingContentRef.current !== null && incoming === pendingContentRef.current) {
      // Local in-flight update; keep dirty state so user can commit later
      setContentValue((prev) => (prev === incoming ? prev : incoming));
      return;
    }
    lastSavedContentRef.current = incoming;
    pendingContentRef.current = null;
    if (contentCommitTimer.current !== null) {
      window.clearTimeout(contentCommitTimer.current);
      contentCommitTimer.current = null;
    }
    setContentValue((prev) => (prev === incoming ? prev : incoming));
    setIsContentDirty(false);
    setIsContentSaving(false);
    setContentSyncError(null);
  }, [node.content]);

  useEffect(() => {
    const incoming = String(node.ai?.system_prompt || '');
    lastSavedSystemPromptRef.current = incoming;
    setSystemPromptValue((prev) => (prev === incoming ? prev : incoming));
  }, [node.node_id, node.ai?.system_prompt]);

  useEffect(() => {
    const metaUrl = typeof node.meta?.htmlUrl === 'string' ? node.meta.htmlUrl : '';
    setHtmlUrl((prev) => (prev === metaUrl ? prev : metaUrl));
    setHtmlUrlInput((prev) => (prev === metaUrl ? prev : metaUrl));
  }, [node.meta?.htmlUrl]);

  useEffect(() => {
    const metaScreenshot =
      typeof node.meta?.htmlScreenshot === 'string' ? node.meta.htmlScreenshot : null;
    setHtmlScreenshot((prev) => {
      if (prev === metaScreenshot) {
        return prev;
      }
      if (metaScreenshot) {
        setShowLivePreview(false);
      } else {
        setShowLivePreview(true);
      }
      return metaScreenshot;
    });
  }, [node.meta?.htmlScreenshot]);

  // Update ReactFlow internals when AI node ports change (critical for Handle registration)
  useEffect(() => {
    if (node.type === 'ai' && node.ai?.auto_ports) {
      console.log(`🔄 [FlowNodeCard] Auto ports changed for node: ${node.node_id}`);
      debouncedUpdateNodeInternals();
    }
  }, [node.type, node.ai?.auto_ports, node.node_id, debouncedUpdateNodeInternals]);

  useEffect(() => {
    const metaOutput = node.meta?.htmlOutputType;
    if (metaOutput === 'link' || metaOutput === 'image' || metaOutput === 'code') {
      setHtmlOutputType((prev) => (prev === metaOutput ? prev : metaOutput));
    } else {
      setHtmlOutputType((prev) => (prev === 'link' ? prev : 'link'));
    }
  }, [node.meta?.htmlOutputType]);

  useEffect(() => {
    const normalized = normalizePlaceholderValues(node.ai?.placeholder_values);
    if (!shallowEqualRecords(lastSavedPlaceholderValuesRef.current, normalized)) {
      lastSavedPlaceholderValuesRef.current = normalized;
    }
    setPlaceholderInputs((prev) => (shallowEqualRecords(prev, normalized) ? prev : normalized));
  }, [node.node_id, node.ai?.placeholder_values]);

  useEffect(() => {
    let cancelled = false;
    const loadQuickPrompts = async () => {
      try {
        const system = await fetchQuickPromptPresets('system_prompt', 12);
        if (!cancelled) {
          setQuickSystemPrompts(system.length > 0 ? system : FALLBACK_SYSTEM_PRESETS);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load quick prompt presets', error);
          setQuickSystemPrompts(FALLBACK_SYSTEM_PRESETS);
        }
      }
    };

    void loadQuickPrompts();
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (!cancelled) {
          setPromptSearchResults(results);
          setPromptSearchLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Prompt search failed', error);
          setPromptSearchError(error instanceof Error ? error.message : 'Search failed');
          setPromptSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [promptSearchTerm]);

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

  useEffect(() => {
    setCurrentProvider(String(node.ai?.provider || ''));
  }, [node.ai?.provider]);

  useEffect(() => {
    if (!pendingModelSelection) {
      return;
    }
    const currentModel = typeof node.ai?.model === 'string' ? node.ai.model.trim() : '';
    if (currentModel === pendingModelSelection) {
      setPendingModelSelection(null);
    }
  }, [node.ai?.model, pendingModelSelection]);

  useEffect(() => {
    setCurrentColor(node.ui?.color ?? DEFAULT_COLOR);
  }, [node.ui?.color]);

  useEffect(() => {
    setEmailHeroImage((node.meta?.hero_image as string) || '');
  }, [node.meta?.hero_image]);

  useEffect(() => {
    setEmailPreviewWidth((node.meta?.editorPreviewWidth as number) || 640);
  }, [node.meta?.editorPreviewWidth]);

  useEffect(() => {
    setEmailPreviewHeight((node.meta?.editorPreviewHeight as number) || 520);
  }, [node.meta?.editorPreviewHeight]);

  useEffect(() => {
    setEmailTextColor((node.meta?.emailTextColor as string) || '#1f2937');
  }, [node.meta?.emailTextColor]);

  useEffect(() => {
    setEmailBackgroundColor((node.meta?.emailBackgroundColor as string) || '#f1f5f9');
  }, [node.meta?.emailBackgroundColor]);

  useEffect(() => {
    setEmailAccentColor((node.meta?.emailAccentColor as string) || '#2563eb');
  }, [node.meta?.emailAccentColor]);

  useEffect(() => {
    const newOutputType = (node.meta?.output_type as 'mindmap' | 'node' | 'folder') || null;
    const isMidjourneyProvider = currentProvider === 'midjourney_proxy' || currentProvider === 'midjourney_mindworkflow_relay' || currentProvider === 'midjourney';
    
    // If no output_type in meta, don't change anything - keep user's selection
    if (newOutputType === null) {
      return;
    }
    
    // For Midjourney, never use mindmap mode - switch to node instead
    const finalOutputType = isMidjourneyProvider && newOutputType === 'mindmap' ? 'node' : newOutputType;
    
    setOutputType((prev) => {
      // If the user manually selected a type, ALWAYS preserve their choice
      // User's choice takes priority over backend
      if (userSetOutputTypeRef.current !== null) {
        return userSetOutputTypeRef.current;
      }
      // Only update if value actually changed to prevent flickering
      if (prev !== finalOutputType) {
        return finalOutputType;
      }
      return prev;
    });
  }, [node.meta?.output_type, currentProvider]);

  useEffect(() => {
    const rawMode = normalizeImageValue(node.meta?.image_output_mode);
    if (rawMode === 'original' || rawMode === 'annotated') {
      setImageOutputMode(rawMode);
      if (rawMode === 'original') {
        pendingImageModeRef.current = false;
      }
    } else {
      setImageOutputMode('annotated');
    }
  }, [normalizeImageValue, node.meta?.image_output_mode]);

  useEffect(() => {
    if (hasEditedVersion) {
      pendingImageModeRef.current = false;
    }
  }, [hasEditedVersion]);

  useEffect(() => {
    if (node.type !== 'image') {
      return;
    }
    if (pendingImageModeRef.current) {
      return;
    }
    if (!hasEditedVersion && imageOutputMode !== 'original') {
      pendingImageModeRef.current = false;
      setImageOutputMode('original');
      onChangeMeta(node.node_id, { image_output_mode: 'original' });
      return;
    }
  }, [hasEditedVersion, imageOutputMode, node.node_id, node.type, onChangeMeta]);


  // Focus title input when editing starts
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  // HTML node handlers
  const handleHtmlUrlChange = useCallback((url: string) => {
    if (disabled) return;
    setHtmlUrlInput(url);
  }, [disabled]);

  const commitHtmlUrl = useCallback(
    async (candidate?: string) => {
      if (disabled) {
        return;
      }
      const raw = typeof candidate === 'string' ? candidate : htmlUrlInput;
      const nextUrl = raw.trim();
      if (!nextUrl) {
        setHtmlError('Enter page URL');
        return;
      }

      setHtmlError(null);
      setHtmlUrlInput(nextUrl);
      setHtmlUrl((prev) => (prev === nextUrl ? prev : nextUrl));
      setShowLivePreview(true);
      onChangeMeta(node.node_id, { htmlUrl: nextUrl });

      setIsHtmlLoading(true);
      try {
        const metadata = await fetchHtmlMetadata(nextUrl);
        if (metadata?.finalUrl && metadata.finalUrl !== nextUrl) {
          setHtmlUrl(metadata.finalUrl);
          setHtmlUrlInput(metadata.finalUrl);
          onChangeMeta(node.node_id, { htmlUrl: metadata.finalUrl });
        }
        if (metadata?.title) {
          autoRenameFromTitle(metadata.title);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setHtmlError(message || 'Failed to load page');
      } finally {
        setIsHtmlLoading(false);
      }
    },
    [autoRenameFromTitle, disabled, htmlUrlInput, node.node_id, onChangeMeta],
  );

  const handleScreenWidthChange = useCallback(
    (width: string) => {
      if (disabled) return;
      setScreenWidth(width);
      const updates: Record<string, unknown> = { screenWidth: width };
      const preset = SCREEN_WIDTHS.find((item) => item.id === width);
      if (preset) {
        const numericWidth = Number.parseInt(preset.width, 10);
        if (!Number.isNaN(numericWidth)) {
          setHtmlViewportWidth(numericWidth);
          updates.htmlViewportWidth = numericWidth;
        }
      }
      onChangeMeta(node.node_id, updates);
    },
    [disabled, node.node_id, onChangeMeta],
  );

  const handleHtmlViewportWidthChange = useCallback(
    (width: number) => {
      if (disabled) return;
      const safeWidth = Number.isFinite(width) ? Math.max(320, Math.min(Math.round(width), 3840)) : 1024;
      setHtmlViewportWidth(safeWidth);
      onChangeMeta(node.node_id, { htmlViewportWidth: safeWidth });
    },
    [disabled, node.node_id, onChangeMeta],
  );

  const handleHtmlOutputTypeChange = useCallback(
    (value: 'link' | 'image' | 'code') => {
      if (disabled) return;
      setHtmlOutputType(value);
      onChangeMeta(node.node_id, { htmlOutputType: value });
    },
    [disabled, node.node_id, onChangeMeta],
  );

  const handleHtmlRefresh = useCallback(() => {
    if (disabled) return;
    void commitHtmlUrl(htmlUrlInput);
  }, [commitHtmlUrl, disabled, htmlUrlInput]);

  const handleTogglePreviewMode = useCallback(() => {
    if (!htmlScreenshot) {
      setShowLivePreview(true);
      return;
    }
    setShowLivePreview((prev) => !prev);
  }, [htmlScreenshot]);

  const handleCaptureScreenshot = useCallback(async () => {
    if (disabled || isScreenshotCapturing) {
      return;
    }

    let targetUrl = htmlUrl.trim();
    const candidate = htmlUrlInput.trim();

    if (!targetUrl && candidate) {
      await commitHtmlUrl(candidate);
      targetUrl = candidate;
    } else if (candidate && candidate !== targetUrl) {
      await commitHtmlUrl(candidate);
      targetUrl = candidate;
    }

    if (!targetUrl) {
      setHtmlError('Enter page URL first');
      return;
    }

    setHtmlError(null);
    setIsScreenshotCapturing(true);
    try {
      const rect = htmlPreviewRef.current?.getBoundingClientRect();
      const baseWidth = rect?.width ?? htmlViewportWidth ?? nodeWidth ?? 1024;
      const baseHeight = rect?.height ?? nodeHeight ?? 600;
      const viewportWidth = Math.max(320, Math.min(Math.round(baseWidth), 3840));
      const viewportHeight = Math.max(240, Math.min(Math.round(baseHeight), 2160));

      const response = await captureHtmlScreenshot({
        url: targetUrl,
        viewportWidth,
        viewportHeight,
        clipHeight: viewportHeight,
      });

      if (response?.finalUrl && response.finalUrl !== targetUrl) {
        setHtmlUrl(response.finalUrl);
        setHtmlUrlInput(response.finalUrl);
        onChangeMeta(node.node_id, { htmlUrl: response.finalUrl });
      }

      if (response?.title) {
        autoRenameFromTitle(response.title);
      }

      if (response?.screenshot) {
        setHtmlScreenshot(response.screenshot);
        onChangeMeta(node.node_id, {
          htmlScreenshot: response.screenshot,
          htmlScreenshotCapturedAt: new Date().toISOString(),
        });
        setShowLivePreview(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHtmlError(message || 'Failed to capture screenshot');
    } finally {
      setIsScreenshotCapturing(false);
    }
  }, [
    autoRenameFromTitle,
    captureHtmlScreenshot,
    commitHtmlUrl,
    disabled,
    htmlUrl,
    htmlUrlInput,
    htmlViewportWidth,
    isScreenshotCapturing,
    node.node_id,
    nodeHeight,
    nodeWidth,
    onChangeMeta,
  ]);

  const handleOpenHtmlUrl = useCallback(() => {
    const target = htmlUrl.trim() || htmlUrlInput.trim();
    if (!target) {
      return;
    }
    try {
      window.open(target, '_blank', 'noopener');
    } catch {
      // ignore inability to open popup
    }
  }, [htmlUrl, htmlUrlInput]);

  const handleCopyHtmlUrl = useCallback(async () => {
    const target = htmlUrl.trim() || htmlUrlInput.trim();
    if (!target || !navigator?.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(target);
    } catch {
      // ignore clipboard errors silently
    }
  }, [htmlUrl, htmlUrlInput]);

  const handleOpenHtmlScreenshot = useCallback(() => {
    if (!htmlScreenshot) {
      return;
    }
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`<img src="${htmlScreenshot}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`);
      newWindow.document.title = node.title || 'HTML screenshot';
    }
  }, [htmlScreenshot, node.title]);

  const handleDownloadHtmlScreenshot = useCallback(() => {
    if (!htmlScreenshot) {
      return;
    }
    const link = document.createElement('a');
    link.href = htmlScreenshot;
    const baseTitle = (node.title || htmlUrl || 'html-page').replace(/\s+/g, '_');
    link.download = `${baseTitle}-screenshot.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [htmlScreenshot, htmlUrl, node.title]);

  const screenshotCapturedAt = useMemo(() => {
    return typeof node.meta?.htmlScreenshotCapturedAt === 'string'
      ? node.meta.htmlScreenshotCapturedAt
      : null;
  }, [node.meta?.htmlScreenshotCapturedAt]);

  const capturedAtLabel = useMemo(
    () => (screenshotCapturedAt ? new Date(screenshotCapturedAt).toLocaleString('en-US') : '—'),
    [screenshotCapturedAt],
  );

  const displayHtmlUrl = useMemo(() => {
    const trimmedInput = htmlUrlInput.trim();
    const trimmedSaved = htmlUrl.trim();
    return trimmedInput || trimmedSaved || 'URL not specified';
  }, [htmlUrl, htmlUrlInput]);

  const handleIframeLoad = useCallback(() => {
    setIsHtmlLoading(false);
    try {
      const title = htmlIframeRef.current?.contentDocument?.title;
      if (title) {
        autoRenameFromTitle(title);
      }
    } catch {
      // Ignore cross-origin access errors
    }
  }, [autoRenameFromTitle]);

  const handleImageViewModeChange = useCallback(
    (mode: 'annotated' | 'original' | 'edit') => {
      onChangeMeta(node.node_id, { view_mode: mode });
      if (mode === 'edit') {
        setImageEditorSession((prev) => prev + 1);
      }
    },
    [node.node_id, onChangeMeta],
  );

  const handleImageOutputChange = useCallback(
    (mode: 'annotated' | 'original') => {
      pendingImageModeRef.current = mode !== 'original';
      setImageOutputMode(mode);
      onChangeMeta(node.node_id, { image_output_mode: mode });
    },
    [node.node_id, onChangeMeta],
  );

  const handleImageUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsImageUploading(true);
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const imageData = loadEvent.target?.result as string | undefined;
        if (!imageData) {
          setIsImageUploading(false);
          return;
        }

        pendingImageModeRef.current = true;
        onChangeMeta(node.node_id, {
          image_original: imageData,
          original_image: imageData,
          image_edited: imageData,
          edited_image: imageData,
          annotated_image: imageData,
          image_file: file.name,
          file_size: file.size,
          file_type: file.type,
          image_output_mode: 'annotated',
          view_mode: 'annotated',
          image_url: null,
        });
        setImageOutputMode('annotated');
        autoRenameFromSource(file.name);
        setIsImageUploading(false);
        setImageEditorSession((prev) => prev + 1);
      };
      reader.onerror = () => {
        pendingImageModeRef.current = false;
        setIsImageUploading(false);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [autoRenameFromSource, node.node_id, onChangeMeta]);

  const handleImageUrlInput = useCallback(() => {
    const url = window.prompt('Enter image URL:');
    if (!url) return;

    pendingImageModeRef.current = true;
    onChangeMeta(node.node_id, {
      image_original: url,
      original_image: url,
      image_edited: url,
      edited_image: url,
      annotated_image: url,
      image_url: url,
      image_output_mode: 'annotated',
      view_mode: 'annotated',
      image_file: null,
    });
    setImageOutputMode('annotated');
    autoRenameFromSource(url);
    setImageEditorSession((prev) => prev + 1);
  }, [autoRenameFromSource, node.node_id, onChangeMeta]);

  // Auto-resize node based on image dimensions
  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;

    const { naturalWidth, naturalHeight } = img;
    
    // CRITICAL: Check if these dimensions are already saved to avoid infinite loop!
    const savedNaturalWidth = node.meta?.natural_width as number | undefined;
    const savedNaturalHeight = node.meta?.natural_height as number | undefined;
    
    // If dimensions are already saved and match - do not update!
    if (savedNaturalWidth === naturalWidth && savedNaturalHeight === naturalHeight) {
      return;
    }
    
    // Calculate aspect ratio
    const aspectRatio = naturalWidth / naturalHeight;
    
    // Scale image to fit within max bounds while preserving aspect ratio
    const { width: scaledWidth, height: scaledHeight, scale } = scaleImageToFit(
      naturalWidth,
      naturalHeight
    );
    
    // KEY FIX: Calculate content dimensions (without fixed parts)
    // Content must not exceed MAX_CONTENT_HEIGHT
    let contentHeight = Math.min(scaledHeight, MAX_CONTENT_HEIGHT);
    let contentWidth = contentHeight * aspectRatio;
    
    // Check if width exceeds maximum
    if (contentWidth > MAX_CONTENT_WIDTH) {
      contentWidth = MAX_CONTENT_WIDTH;
      contentHeight = contentWidth / aspectRatio;
    }
    
    // Check minimums
    if (contentWidth < MIN_CONTENT_WIDTH) {
      contentWidth = MIN_CONTENT_WIDTH;
      contentHeight = contentWidth / aspectRatio;
    }
    
    if (contentHeight < MIN_CONTENT_HEIGHT) {
      contentHeight = MIN_CONTENT_HEIGHT;
      contentWidth = contentHeight * aspectRatio;
    }

    // Save dimensions to meta (only if changed!)
    onChangeMeta(node.node_id, {
      natural_width: naturalWidth,
      natural_height: naturalHeight,
      display_width: contentWidth,
      display_height: contentHeight,
      display_scale: contentHeight / naturalHeight,
    });

    // Calculate total node height (content + fixed parts)
    const isAnnotationMode = imageViewMode === 'edit';
    const totalHeight = calculateNodeHeight(contentHeight, isAnnotationMode);

    // Update node bbox if onChangeUi is available
    if (onChangeUi && node.ui?.bbox) {
      const currentX = node.ui.bbox.x1;
      const currentY = node.ui.bbox.y1;
      
      onChangeUi(node.node_id, {
        bbox: {
          x1: currentX,
          y1: currentY,
          x2: currentX + contentWidth,
          y2: currentY + totalHeight,
        },
      });
    }

    // Update React Flow node dimensions
    reactFlow.setNodes((nodes) =>
      nodes.map((n) =>
        n.id === node.node_id
          ? {
              ...n,
              style: {
                ...n.style,
                width: contentWidth,
                height: totalHeight,
              },
            }
          : n
      )
    );
  }, [node.node_id, node.meta?.natural_width, node.meta?.natural_height, node.ui?.bbox, imageViewMode, onChangeMeta, onChangeUi, reactFlow]);

  // Update node height when switching between annotation modes (only for image nodes)
  // TEMPORARILY DISABLED for debugging infinite loop
  // TODO: Need to add height change check before updating
  /*
  useEffect(() => {
    if (node.type !== 'image') return;
    
    // Get saved display dimensions from meta
    const displayHeight = node.meta?.display_height as number | undefined;
    if (!displayHeight) return; // No dimensions saved yet
    
    const isAnnotationMode = imageViewMode === 'edit';
    const newTotalHeight = calculateNodeHeight(displayHeight, isAnnotationMode);
    
    // TODO: Check current height and do not update if already correct!
    const currentHeight = reactFlow.getNode(node.node_id)?.style?.height;
    if (currentHeight === newTotalHeight) return;
    
    // Update React Flow node height with smooth transition
    reactFlow.setNodes((nodes) =>
      nodes.map((n) =>
        n.id === node.node_id
          ? {
              ...n,
              style: {
                ...n.style,
                height: newTotalHeight,
                transition: 'height 0.2s ease',
              },
            }
          : n
      )
    );

    // Update bbox if onChangeUi is available
    if (onChangeUi && node.ui?.bbox) {
      const currentX = node.ui.bbox.x1;
      const currentY = node.ui.bbox.y1;
      const currentWidth = node.ui.bbox.x2 - node.ui.bbox.x1;
      
      // TODO: Check current bbox and do not update if already correct!
      const currentBboxHeight = node.ui.bbox.y2 - node.ui.bbox.y1;
      if (currentBboxHeight === newTotalHeight) return;
      
      onChangeUi(node.node_id, {
        bbox: {
          x1: currentX,
          y1: currentY,
          x2: currentX + currentWidth,
          y2: currentY + newTotalHeight,
        },
      });
    }
  }, [imageViewMode, node.type, node.node_id, node.meta?.display_height, node.ui?.bbox, onChangeUi, reactFlow]);
  */

  const handleImageDownload = useCallback(() => {
    const target =
      imageOutputMode === 'annotated' && editedImage
        ? editedImage
        : originalImage;

    if (!target) return;

    if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener');
      return;
    }

    const filenameBase = (node.title || 'image').trim() || 'image';
    const downloadLink = document.createElement('a');
    downloadLink.href = target;
    downloadLink.download = `${filenameBase.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  }, [editedImage, imageOutputMode, node.title, originalImage]);

  const handleOpenCropModal = useCallback(async () => {
    if (disabled || isPreparingCrop || isSavingCropNode) {
      return;
    }
    setImageToolbarError(null);
    setIsPreparingCrop(true);
    try {
      let source: string | null = null;
      if (imageViewMode === 'edit' && imageEditorRef.current) {
        source = await imageEditorRef.current.exportAnnotated();
      }
      if (!source) {
        source = editedImage ?? originalImage;
      }
      if (!source) {
        setImageToolbarError('No image to crop');
        return;
      }
      // BUG-FIX: loadImageWithRetry with retry logic handles CORS and network issues
      const img = await loadImageWithRetry(source);
      const naturalWidth = Math.max(1, img.naturalWidth || img.width || 0);
      const naturalHeight = Math.max(1, img.naturalHeight || img.height || 0);
      setCropModalData({
        source,
        naturalWidth,
        naturalHeight,
        settings: lastCropSettings,
      });
      setIsCropModalOpen(true);
    } catch (error) {
      console.error('[FlowNodeCard] Failed to prepare crop modal', error);
      setImageToolbarError('Failed to prepare image for cropping.');
    } finally {
      setIsPreparingCrop(false);
    }
  }, [
    disabled,
    editedImage,
    imageViewMode,
    isPreparingCrop,
    isSavingCropNode,
    lastCropSettings,
    originalImage,
  ]);

  const handleCropModalClose = useCallback(() => {
    setIsCropModalOpen(false);
    setCropModalData(null);
    setImageToolbarError(null);
  }, []);

  const handleCropModalApply = useCallback(
    async ({ dataUrl, settings }: { dataUrl: string; settings: ImageCropSettings }) => {
      setIsCropModalOpen(false);
      setCropModalData(null);
      setLastCropSettings(settings);
      setImageToolbarError(null);
      onChangeMeta(node.node_id, {
        image_crop_settings: settings,
        image_crop_expose_port: false,
      });
      if (!projectId) {
        setImageToolbarError('Failed to create node: project unavailable.');
        return;
      }
      try {
        setIsSavingCropNode(true);
        const croppedImage = await loadImageElement(dataUrl);
        const naturalWidth = Math.max(1, croppedImage.naturalWidth || croppedImage.width || 0);
        const naturalHeight = Math.max(1, croppedImage.naturalHeight || croppedImage.height || 0);
        const { width: displayWidth, height: displayHeight } = scaleImageToFit(naturalWidth, naturalHeight);
        const displayScale = naturalHeight > 0 ? displayHeight / naturalHeight : 1;
        const baseTitle = (node.title || 'Image').trim() || 'Image';
        const newTitle = `${baseTitle} (crop)`;
        const templateMeta: Record<string, unknown> = {
          image_original: dataUrl,
          original_image: dataUrl,
          image_edited: dataUrl,
          edited_image: dataUrl,
          annotated_image: dataUrl,
          view_mode: 'annotated',
          image_output_mode: 'annotated',
          natural_width: naturalWidth,
          natural_height: naturalHeight,
          display_width: displayWidth,
          display_height: displayHeight,
          display_scale: displayScale,
          image_crop_parent: node.node_id,
          image_crop_settings: settings,
          image_crop_expose_port: false,
          annotation_layers: [],
        };
        const suggestedPosition = node.ui?.bbox
          ? {
              x: node.ui.bbox.x2 + 60,
              y: node.ui.bbox.y1,
            }
          : undefined;
        const fallbackPosition = node.ui?.bbox
          ? {
              x: node.ui.bbox.x1 + NODE_DEFAULT_WIDTH + 40,
              y: node.ui.bbox.y1,
            }
          : { x: 60, y: 60 };
        const targetPosition = suggestedPosition ?? fallbackPosition;
        const targetX = Math.round(targetPosition.x);
        const targetY = Math.round(targetPosition.y);
        const payload: CreateNodePayload = {
          slug: 'image-crop',
          type: 'image',
          title: newTitle,
          content_type: 'image',
          content: '',
          meta: templateMeta,
          position: { x: targetX, y: targetY },
          ui: {
            color: node.ui?.color ?? NODE_DEFAULT_COLOR,
            bbox: {
              x1: targetX,
              y1: targetY,
              x2: targetX + NODE_DEFAULT_WIDTH,
              y2: targetY + NODE_DEFAULT_HEIGHT,
            },
          },
          ai_visible: true,
          connections: { incoming: [], outgoing: [] },
        };
        const response = await createNode(projectId, payload);
        addNodeFromServer(response.node, response.project_updated_at);
        try {
          const edgeResponse = await createEdge(projectId, {
            from: node.node_id,
            to: response.node.node_id,
            label: 'image-crop',
          });
          setEdges(edgeResponse.edges, edgeResponse.updated_at);
        } catch (edgeError) {
          console.warn('[FlowNodeCard] Failed to auto-connect crop node', edgeError);
        }
      } catch (error) {
        console.error('[FlowNodeCard] Failed to create crop node', error);
        setImageToolbarError('Failed to create node with crop.');
      } finally {
        setIsSavingCropNode(false);
      }
    },
    [
      addNodeFromServer,
      node.node_id,
      node.title,
      node.ui?.bbox,
      node.ui?.color,
      onChangeMeta,
      projectId,
      setEdges,
    ],
  );

  // Video crop handlers
  const handleOpenVideoCropModal = useCallback(async () => {
    if (!node.meta) return;
    try {
      setIsPreparingVideoCrop(true);
      const videoSource = typeof node.meta.video_url === 'string' ? node.meta.video_url : '';
      const videoPath = typeof node.meta.video_path === 'string' ? node.meta.video_path : videoSource;
      if (!videoPath) {
        alert('No video to crop');
        return;
      }
      const videoWidth = typeof node.meta.video_display_width === 'number' ? node.meta.video_display_width : 0;
      const videoHeight = typeof node.meta.video_display_height === 'number' ? node.meta.video_display_height : 0;
      if (!videoWidth || !videoHeight) {
        alert('Could not determine video dimensions');
        return;
      }
      // try to extract first frame client-side for preview in crop modal
      let firstFrameDataUrl: string | undefined = undefined;
      try {
        firstFrameDataUrl = await (async (videoUrl: string) => {
          return new Promise<string>((resolve, reject) => {
            const video = document.createElement('video');
            video.src = videoUrl;
            video.crossOrigin = 'anonymous';
            video.muted = true;
            const onLoaded = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || videoWidth;
                canvas.height = video.videoHeight || videoHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('no-canvas-context'));
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg'));
              } catch (err) {
                reject(err);
              }
            };
            video.addEventListener('loadeddata', onLoaded, { once: true });
            video.addEventListener('error', () => reject(new Error('failed-to-load-video')), { once: true });
          });
        })(videoPath);
      } catch (err) {
        console.warn('[FlowNodeCard] Failed to extract first frame client-side', err);
      }

      setVideoCropModalData({
        videoPath,
        source: firstFrameDataUrl,
        videoWidth,
        videoHeight,
        settings: lastVideoCropSettings,
      });
      setIsVideoCropModalOpen(true);
    } catch (error) {
      console.error('[FlowNodeCard] Failed to prepare video crop modal', error);
      alert('Failed to prepare video for cropping.');
    } finally {
      setIsPreparingVideoCrop(false);
    }
  }, [node.meta, lastVideoCropSettings]);

  const handleVideoCropModalClose = useCallback(() => {
    setIsVideoCropModalOpen(false);
    setVideoCropModalData(null);
  }, []);
  const handleVideoCropModalApply = useCallback(
    async (payload: { dataUrl: string; settings: VideoCropSettings }) => {
      setIsVideoCropModalOpen(false);
      setVideoCropModalData(null);
      setLastVideoCropSettings(payload.settings);
      onChangeMeta(node.node_id, {
        video_crop_settings: payload.settings,
      });
      // Backend will handle the heavy lifting; for now we keep preview in meta if available
      if (payload.dataUrl) {
        onChangeMeta(node.node_id, { video_crop_preview: payload.dataUrl });
      }
      console.log('[FlowNodeCard] Video crop settings applied:', payload.settings);

      // Send crop request to backend
      if (!projectId) {
        console.warn('[FlowNodeCard] Project ID not available, skipping crop backend call');
        return;
      }

      try {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 5 * 60 * 1000); // 5 minute timeout

        const resp = await fetch(`/api/videos/${node.node_id}/crop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-project-id': projectId,
          },
          body: JSON.stringify({ cropSettings: payload.settings }),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        let body: any;
        try {
          const text = await resp.text();
          body = text ? JSON.parse(text) : {};
        } catch (parseErr) {
          console.error('[FlowNodeCard] Failed to parse crop response:', parseErr);
          throw new Error(`Server returned invalid JSON: ${resp.status} ${resp.statusText}`);
        }

        if (!resp.ok) {
          throw new Error(body?.message || body?.error || `Crop failed: ${resp.status}`);
        }

        console.log('[FlowNodeCard] Video cropped successfully', body);
        // New cropped video node should appear in project
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.error('[FlowNodeCard] Video crop request timed out');
          return;
        }
        console.error('[FlowNodeCard] Video crop error:', err);
      }
    },
    [node.node_id, onChangeMeta, projectId],
  );

  // Handle extract frame from video
  const handleExtractFrame = useCallback(
    async (
      timeSeconds: number,
      cropParams?: {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    ) => {
      if (!projectId) {
        throw new Error('Project unavailable');
      }

      try {
        const requestBody: any = { timestamp: timeSeconds };
        if (cropParams) {
          requestBody.crop = cropParams;
        }

        const resp = await fetch(`/api/videos/${node.node_id}/extract-frame`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-project-id': projectId,
          },
          body: JSON.stringify(requestBody),
        });

        let body: any;
        try {
          const text = await resp.text();
          body = text ? JSON.parse(text) : {};
        } catch (parseErr) {
          console.error('Failed to parse response:', parseErr);
          throw new Error(`Server returned invalid JSON: ${resp.status} ${resp.statusText}`);
        }

        if (!resp.ok) {
          throw new Error(body?.message || body?.error || `Request failed: ${resp.status}`);
        }

        // Extract frame URL from response
        const frameUrl = body.frame?.frameUrl || body.frameUrl || body.framePath || '';
        if (!frameUrl) {
          console.error('Invalid response structure:', body);
          throw new Error('Failed to get frame from server');
        }

        // Create an image node with the extracted frame
        const baseTitle = (node.title || 'Video').trim() || 'Video';
        const newTitle = `${baseTitle} (frame)`;
        const suggestedPosition = node.ui?.bbox
          ? { x: node.ui.bbox.x2 + 60, y: node.ui.bbox.y1 }
          : undefined;
        const fallbackPosition = node.ui?.bbox
          ? { x: node.ui.bbox.x1 + NODE_DEFAULT_WIDTH + 40, y: node.ui.bbox.y1 }
          : { x: 60, y: 60 };
        const targetPosition = suggestedPosition ?? fallbackPosition;
        const targetX = Math.round(targetPosition.x);
        const targetY = Math.round(targetPosition.y);

        const payload = {
          slug: 'image-frame',
          type: 'image',
          title: newTitle,
          content_type: 'image',
          content: '',
          meta: {
            image_original: frameUrl,
            original_image: frameUrl,
            image_edited: frameUrl,
            edited_image: frameUrl,
            annotated_image: frameUrl,
            edited_from_video: node.node_id,
          },
          position: { x: targetX, y: targetY },
          ui: {
            color: node.ui?.color ?? NODE_DEFAULT_COLOR,
            bbox: {
              x1: targetX,
              y1: targetY,
              x2: targetX + NODE_DEFAULT_WIDTH,
              y2: targetY + NODE_DEFAULT_HEIGHT,
            },
          },
          ai_visible: true,
          connections: { incoming: [], outgoing: [] },
      } as any;

        const response = await createNode(projectId, payload);
        addNodeFromServer(response.node, response.project_updated_at);

        try {
          const edgeResponse = await createEdge(projectId, {
            from: node.node_id,
            to: response.node.node_id,
            label: 'frame',
          });
          setEdges(edgeResponse.edges, edgeResponse.updated_at);
        } catch (edgeErr) {
          console.warn('[FlowNodeCard] Failed to connect frame node', edgeErr);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[FlowNodeCard] handleExtractFrame error:', errorMsg);
        throw err;
      }
    },
    [projectId, node.node_id, node.title, node.ui, addNodeFromServer, setEdges, createNode, createEdge],
  );

  // Handle trim video
  const handleTrimVideo = useCallback(
    async (
      startTime: number,
      endTime: number,
      cropParams?: {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    ) => {
      if (!projectId) {
        throw new Error('Project unavailable');
      }

      try {
        console.log('[FlowNodeCard] Starting trim video:', { videoNodeId: node.node_id, startTime, endTime, crop: cropParams });

        // Create AbortController for timeout handling
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 5 * 60 * 1000); // 5 minute timeout

        try {
          const requestBody: any = { startTime, endTime };
          if (cropParams) {
            requestBody.crop = cropParams;
          }

          const resp = await fetch(`/api/videos/${node.node_id}/trim`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-project-id': projectId,
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal,
          });

          clearTimeout(timeoutId);

          let body: any;
          try {
            const text = await resp.text();
            body = text ? JSON.parse(text) : {};
          } catch (parseErr) {
            console.error('[FlowNodeCard] Failed to parse trim response:', parseErr);
            throw new Error(`Server returned invalid JSON: ${resp.status} ${resp.statusText}`);
          }

          if (!resp.ok) {
            throw new Error(body?.message || body?.error || `Trim failed: ${resp.status}`);
          }

          console.log('[FlowNodeCard] Video trimmed successfully', body);
          
          // Extract trimmed video info from response
          if (!body.trimmedVideo?.trimmedVideoUrl) {
            console.error('Invalid trim response structure:', body);
            throw new Error('Failed to get cropped video from server');
          }

          // Create a video node positioned correctly (like handleExtractFrame does)
          const baseTitle = (node.title || 'Video').trim() || 'Video';
          const newTitle = `${baseTitle} (trimmed)`;
          const suggestedPosition = node.ui?.bbox
            ? { x: node.ui.bbox.x2 + 60, y: node.ui.bbox.y1 }
            : undefined;
          const fallbackPosition = node.ui?.bbox
            ? { x: node.ui.bbox.x1 + NODE_DEFAULT_WIDTH + 40, y: node.ui.bbox.y1 }
            : { x: 60, y: 60 };
          const targetPosition = suggestedPosition ?? fallbackPosition;
          const targetX = Math.round(targetPosition.x);
          const targetY = Math.round(targetPosition.y);

          const payload = {
            slug: 'video-trimmed',
            type: 'video',
            title: newTitle,
            content_type: 'video',
            content: body.trimmedVideo.trimmedVideoUrl,
            meta: {
              video_url: body.trimmedVideo.trimmedVideoUrl,
              video_path: body.trimmedVideo.trimmedVideoPath,
              duration: body.trimmedVideo.duration,
              trimmedFrom: node.node_id,
              trimSettings: {
                startTime,
                endTime,
                crop: cropParams,
              },
            },
            position: { x: targetX, y: targetY },
            ui: {
              color: node.ui?.color ?? NODE_DEFAULT_COLOR,
              bbox: {
                x1: targetX,
                y1: targetY,
                x2: targetX + NODE_DEFAULT_WIDTH,
                y2: targetY + NODE_DEFAULT_HEIGHT,
              },
            },
            ai_visible: true,
            connections: { incoming: [], outgoing: [] },
          } as any;

          const response = await createNode(projectId, payload);
          addNodeFromServer(response.node, response.project_updated_at);

          try {
            const edgeResponse = await createEdge(projectId, {
              from: node.node_id,
              to: response.node.node_id,
              label: 'trimmed',
            });
            setEdges(edgeResponse.edges, edgeResponse.updated_at);
          } catch (edgeErr) {
            console.warn('[FlowNodeCard] Failed to connect trimmed video node', edgeErr);
          }
        } catch (fetchErr) {
          if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
            throw new Error('Operation timed out. Please try again.');
          }
          throw fetchErr;
        }
      } catch (err) {
        console.error('[FlowNodeCard] handleTrimVideo error:', err);
        throw err;
      }
    },
    [projectId, node.node_id, node.title, node.ui, addNodeFromServer, setEdges, createNode, createEdge],
  );

  const handleEnterImageAnnotationMode = useCallback(() => {
    handleImageViewModeChange('edit');
  }, [handleImageViewModeChange]);

  const handleSelectOriginalImageView = useCallback(() => {
    handleImageViewModeChange('original');
    handleImageOutputChange('original');
  }, [handleImageOutputChange, handleImageViewModeChange]);

  const handleSelectEditedImageView = useCallback(() => {
    if (!hasEditedVersion) {
      return;
    }
    handleImageViewModeChange('annotated');
    handleImageOutputChange('annotated');
  }, [handleImageOutputChange, handleImageViewModeChange, hasEditedVersion]);

  useEffect(() => {
    if (node.type !== 'image') {
      return;
    }
    const meta = node.meta ?? {};
    const normalize = (value: unknown): string | null =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

    const patch: Record<string, unknown> = {};

    const legacyOriginal = normalize(meta.original_image);
    if (!normalize(meta.image_original) && legacyOriginal) {
      patch.image_original = legacyOriginal;
    }

    const legacyEdited =
      normalize(meta.image_edited) ||
      normalize(meta.edited_image) ||
      normalize(meta.annotated_image);
    if (!normalize(meta.image_edited) && legacyEdited) {
      patch.image_edited = legacyEdited;
    }

    const legacyCrop = normalize(meta.image_crop) || normalize(meta.crop_image);
    if (!normalize(meta.image_crop) && legacyCrop) {
      patch.image_crop = legacyCrop;
    }

    if (typeof meta.image_crop_expose_port !== 'boolean' && typeof meta.image_crop_settings === 'object' && meta.image_crop_settings) {
      const exposePort = (meta.image_crop_settings as Record<string, unknown>).exposePort;
      if (typeof exposePort === 'boolean') {
        patch.image_crop_expose_port = exposePort;
      }
    }

    const aliasKeys = ['image-annotated', 'image-crop', 'image-original'] as const;
    aliasKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(meta, key)) {
        const aliasValue = (meta as Record<string, unknown>)[key];
        if (aliasValue !== undefined && aliasValue !== null) {
          patch[key] = null;
        }
      }
    });

    if (Object.keys(patch).length > 0) {
      onChangeMeta(node.node_id, patch);
    }
  }, [node.meta, node.node_id, node.type, onChangeMeta]);

  // Reset node size to match content dimensions
  const handleResetToContentSize = useCallback(() => {
    const naturalWidth = node.meta?.natural_width as number | undefined;
    const naturalHeight = node.meta?.natural_height as number | undefined;
    
    if (!naturalWidth || !naturalHeight) {
      console.warn('No natural dimensions saved for this image');
      return;
    }

    // Calculate aspect ratio
    const aspectRatio = naturalWidth / naturalHeight;
    
    // Scale image to fit within max bounds while preserving aspect ratio
    const { width: scaledWidth, height: scaledHeight, scale } = scaleImageToFit(
      naturalWidth,
      naturalHeight
    );
    
    // KEY FIX: Calculate content dimensions (without fixed parts)
    // Content must not exceed MAX_CONTENT_HEIGHT
    let contentHeight = Math.min(scaledHeight, MAX_CONTENT_HEIGHT);
    let contentWidth = contentHeight * aspectRatio;
    
    // Check if width exceeds maximum
    if (contentWidth > MAX_CONTENT_WIDTH) {
      contentWidth = MAX_CONTENT_WIDTH;
      contentHeight = contentWidth / aspectRatio;
    }
    
    // Check minimums
    if (contentWidth < MIN_CONTENT_WIDTH) {
      contentWidth = MIN_CONTENT_WIDTH;
      contentHeight = contentWidth / aspectRatio;
    }
    
    if (contentHeight < MIN_CONTENT_HEIGHT) {
      contentHeight = MIN_CONTENT_HEIGHT;
      contentWidth = contentHeight * aspectRatio;
    }

    // Update meta
    onChangeMeta(node.node_id, {
      display_width: contentWidth,
      display_height: contentHeight,
      display_scale: contentHeight / naturalHeight,
    });

    // Calculate total node height
    const isAnnotationMode = imageViewMode === 'edit';
    const totalHeight = calculateNodeHeight(contentHeight, isAnnotationMode);

    // Update bbox
    if (onChangeUi && node.ui?.bbox) {
      const currentX = node.ui.bbox.x1;
      const currentY = node.ui.bbox.y1;
      
      onChangeUi(node.node_id, {
        bbox: {
          x1: currentX,
          y1: currentY,
          x2: currentX + contentWidth,
          y2: currentY + totalHeight,
        },
      });
    }

    // Update React Flow node dimensions
    reactFlow.setNodes((nodes) =>
      nodes.map((n) =>
        n.id === node.node_id
          ? {
              ...n,
              style: {
                ...n.style,
                width: contentWidth,
                height: totalHeight,
              },
            }
          : n
      )
    );
  }, [node.node_id, node.meta, node.ui?.bbox, imageViewMode, onChangeMeta, onChangeUi, reactFlow]);

  // File download function
  const handleFileDownload = useCallback((fileName: string, fileData: string | ArrayBuffer | null) => {
    if (!fileData || !fileName) return;
    
    try {
      let blob: Blob;
      
      if (typeof fileData === 'string') {
        // Base64 data
        if (fileData.startsWith('data:')) {
          // Data URL format
          const response = fetch(fileData);
          response.then(res => res.blob()).then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          });
          return;
        } else {
          // Plain text or base64 string
          blob = new Blob([fileData], { type: 'application/octet-stream' });
        }
      } else {
        // ArrayBuffer
        blob = new Blob([fileData], { type: 'application/octet-stream' });
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  }, []);
  const renderHtmlNode = useCallback(() => {
    return (
      <div className="flex flex-col h-full" data-node-id={node.node_id}>
        <div
          ref={htmlPreviewRef}
          className="relative w-full flex-1 mb-2 border border-white/10 bg-white/5 rounded overflow-hidden"
        >
          {showLivePreview ? (
            htmlUrl ? (
              <iframe
                key={htmlUrl}
                ref={htmlIframeRef}
                src={htmlUrl}
                onLoad={handleIframeLoad}
                className="block w-full h-full border-0"
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '200px',
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                loading="lazy"
                title="Website Preview"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                Enter URL for website preview
              </div>
            )
          ) : htmlScreenshot ? (
            <img
              src={htmlScreenshot}
              alt="Page screenshot"
              className="w-full h-full object-contain bg-slate-950"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
              Screenshot not yet created
            </div>
          )}

          {isHtmlLoading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white">
              Loading page…
            </div>
          )}

          {isScreenshotCapturing && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white">
              Capturing screenshot…
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-white/10 bg-slate-900/40/70 backdrop-blur-sm px-2 py-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[190px]">
                <input
                  type="url"
                  value={htmlUrlInput}
                  onChange={(e) => handleHtmlUrlChange(e.target.value)}
                  placeholder="https://wikipedia.org"
                  className="w-full rounded bg-black/30 px-2 py-1 text-[11px] text-white border border-white/10 focus:border-primary/70 focus:outline-none transition-colors nodrag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-nodrag="true"
                  disabled={disabled}
                  readOnly={disabled}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleHtmlRefresh();
                    }
                  }}
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleHtmlRefresh}
                  disabled={disabled || isHtmlLoading}
                  className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/30 text-white/70 text-base hover:bg-black/40 hover:text-white transition disabled:opacity-60"
                  title="Refresh page"
                >
                  🔄
                </button>
                <button
                  type="button"
                  onClick={handleTogglePreviewMode}
                  disabled={showLivePreview && !htmlScreenshot}
                  className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/30 text-white/70 text-base hover:bg-black/40 hover:text-white transition disabled:opacity-40"
                  title={showLivePreview ? 'Show screenshot' : 'Open live preview'}
                >
                  {showLivePreview ? '🖼️' : '🌐'}
                </button>
                <button
                  type="button"
                  onClick={handleCaptureScreenshot}
                  disabled={disabled || isScreenshotCapturing || isHtmlLoading || !htmlUrl.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded border border-primary/50 bg-primary/30 text-white text-base hover:bg-primary/40 transition disabled:opacity-60"
                  title="Capture visible area screenshot"
                >
                  📸
                </button>
                <button
                  type="button"
                  onClick={() => setShowHtmlSettingsModal(true)}
                  className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/30 text-white text-base hover:bg-black/40 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                  data-nodrag="true"
                  disabled={disabled}
                  title="HTML node settings"
                >
                  ⚙️
                </button>
              </div>
              <div className="w-[5.15rem] min-w-[93px]">
                <select
                  value={htmlOutputType}
                  onChange={(e) => handleHtmlOutputTypeChange(e.target.value as 'link' | 'image' | 'code')}
                  className="w-full rounded bg-black/30 px-2 py-1 text-[11px] text-white border border-white/10 focus:border-primary/70 focus:outline-none transition-colors nodrag disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Determines what next nodes will receive"
                  data-nodrag="true"
                  disabled={disabled}
                >
                  <option value="link">Link</option>
                  <option value="image" disabled={!htmlScreenshot}>Screenshot</option>
                  <option value="code">HTML</option>
                </select>
              </div>
            </div>
          </div>
          {htmlError && (
            <div className="text-[10px] text-rose-200 bg-rose-500/20 border border-rose-500/40 rounded px-2 py-1">
              {htmlError}
            </div>
          )}
        </div>
      </div>
    );
  }, [
    handleCaptureScreenshot,
    handleHtmlOutputTypeChange,
    handleHtmlRefresh,
    handleHtmlUrlChange,
    handleHtmlViewportWidthChange,
    handleIframeLoad,
    handleTogglePreviewMode,
    setShowHtmlSettingsModal,
    htmlError,
    htmlOutputType,
    htmlScreenshot,
    htmlUrl,
    htmlUrlInput,
    htmlViewportWidth,
    isHtmlLoading,
    isScreenshotCapturing,
    node.node_id,
    nodeWidth,
    screenWidth,
    setShowLivePreview,
    showLivePreview,
    disabled,
  ]);

  const htmlEmailPreview = useMemo(() => {
    const raw = contentValue?.trim() ?? '';
    const textColor = emailTextColor || '#1f2937';
    const backgroundColor = emailBackgroundColor || '#f1f5f9';
    const accentColor = emailAccentColor || '#2563eb';

    const heroBlock = emailHeroImage
      ? `<div class="email-hero" style="text-align:center;margin:24px 0;">
  <img src="${emailHeroImage}" alt="Hero" style="max-width:100%;border-radius:16px;box-shadow:0 12px 24px rgba(15,23,42,0.15);" />
</div>`
      : '';

    if (/<!doctype|<html/i.test(raw)) {
      if (!emailHeroImage) {
        return raw || '<!DOCTYPE html><html><body></body></html>';
      }
      const lower = raw.toLowerCase();
      const bodyIndex = lower.indexOf('<body');
      if (bodyIndex === -1) {
        return `${heroBlock}${raw}`;
      }
      const insertIndex = raw.indexOf('>', bodyIndex);
      if (insertIndex === -1) {
        return `${raw}${heroBlock}`;
      }
      return `${raw.slice(0, insertIndex + 1)}${heroBlock}${raw.slice(insertIndex + 1)}`;
    }

    const fallbackSection = raw || `<p style="margin:0 0 16px 0;">
  Start editing the email using the toolbar. Add images, buttons, and dividers to build your template.
</p>
<p style="margin:0 0 16px 0;">
  Click "Show HTML" to make precise code edits.
</p>`;

    return `<!DOCTYPE html><html lang="ru"><head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
<style>
  body { margin:0; padding:24px; background:${backgroundColor}; color:${textColor}; font-family:Arial,sans-serif; }
  .email-shell { max-width:640px; margin:0 auto; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 24px 48px rgba(15,23,42,0.18); }
  .email-header { padding:32px 32px 24px; background:linear-gradient(135deg, ${accentColor}, ${accentColor}cc); color:#ffffff; }
  .email-header h1 { margin:0 0 12px 0; font-size:28px; font-weight:700; }
  .email-header p { margin:0; font-size:16px; opacity:0.85; }
  .email-main { padding:32px; line-height:1.6; font-size:16px; color:${textColor}; background:${backgroundColor}; }
  .email-main p { margin:0 0 16px 0; }
  .email-cta { padding:0 32px 32px; text-align:center; background:${backgroundColor}; }
  .email-button { display:inline-flex; align-items:center; gap:8px; padding:14px 28px; border-radius:999px; background:${accentColor}; color:#ffffff; text-decoration:none; font-weight:600; }
  .email-footer { padding:24px; text-align:center; font-size:12px; color:#64748b; background:#f8fafc; }
  .email-hero img { max-width:100%; border-radius:16px; box-shadow:0 12px 24px rgba(15,23,42,0.15); }
  @media (max-width:640px) {
    .email-shell { border-radius:16px; }
    .email-main, .email-header { padding:24px; }
  }
</style>
</head><body>
  <div class="email-shell">
    <header class="email-header">
      <h1>Email Header</h1>
      <p>Add your key offer or promotion here.</p>
    </header>
    <main class="email-main">
      ${heroBlock}
      <div class="email-content">
        ${fallbackSection}
      </div>
    </main>
    <div class="email-cta">
      <a class="email-button" href="https://example.com">Go to project →</a>
    </div>
    <footer class="email-footer">
      You received this email because you subscribed to updates.
    </footer>
  </div>
</body></html>`;
  }, [contentValue, emailHeroImage, emailAccentColor, emailBackgroundColor, emailTextColor]);

  const openEmailPreviewInTab = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const blob = new Blob([htmlEmailPreview], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 30000);
  }, [htmlEmailPreview]);

  useEffect(() => {
    if (isResizing || !nodeRef.current) return;

    // When AI tab changes or node is collapsed/expanded, recalculate height
    const requiredHeight = nodeRef.current.scrollHeight;
    const currentRfNode = reactFlow.getNode(node.node_id);
    const currentHeight = typeof currentRfNode?.style?.height === 'number' ? currentRfNode.style.height : nodeHeight;

    // Only expand, don't shrink automatically unless it's a collapse action
    if (requiredHeight > currentHeight || collapsed) {
      const newHeight = normalizeNodeHeight(requiredHeight, node.type);

      if (Math.abs(newHeight - currentHeight) > 1) {
        reactFlow.setNodes((nodes) =>
          nodes.map((n) =>
            n.id === node.node_id
              ? {
                  ...n,
                  style: {
                    ...n.style,
                    height: newHeight,
                  },
                }
              : n
          )
        );
        
        const currentBbox = node.ui?.bbox || { x1: 0, y1: 0, x2: nodeWidth, y2: currentHeight };
        onChangeUi?.(node.node_id, {
          bbox: {
            ...currentBbox,
            y2: currentBbox.y1 + newHeight,
          },
        });
      }
    }
  }, [activeAiTab, collapsed, isResizing, node.node_id, reactFlow, onChangeUi, node.type, nodeWidth, nodeHeight, node.ui?.bbox]);

  // Resize handlers - simplified for fixed dimensions
  const handleResizeStart = useCallback((e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't allow resize for collapsed nodes
    if (collapsed) return;
    
    setIsResizing(true);
    
    // Store initial state
    resizeStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: nodeWidth,
      height: nodeHeight
    };

    // Create temporary resize handlers
    const handleResizeMove = (moveEvent: PointerEvent) => {
      if (!resizeStartPos.current) return;
      
      const deltaX = moveEvent.clientX - resizeStartPos.current.x;
      const deltaY = moveEvent.clientY - resizeStartPos.current.y;
      
      // Calculate new dimensions with constraints
      const newWidth = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, resizeStartPos.current.width + deltaX));
      const newHeight = Math.max(nodeMinHeight, Math.min(NODE_MAX_HEIGHT, resizeStartPos.current.height + deltaY));
      
      // Update React Flow node directly (no DOM manipulation)
      reactFlow.setNodes((nodes) => 
        nodes.map((n) => 
          n.id === node.node_id 
            ? { 
                ...n, 
                style: { 
                  ...n.style, 
                  width: newWidth, 
                  height: newHeight 
                } 
              }
            : n
        )
      );
    };

    const handleResizeEnd = (finalEvent: PointerEvent) => {
      if (!resizeStartPos.current) return;
      
      setIsResizing(false);
      
      // Calculate final dimensions
      const deltaX = finalEvent.clientX - resizeStartPos.current.x;
      const deltaY = finalEvent.clientY - resizeStartPos.current.y;
      const finalWidth = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, resizeStartPos.current.width + deltaX));
      const finalHeight = Math.max(nodeMinHeight, Math.min(NODE_MAX_HEIGHT, resizeStartPos.current.height + deltaY));
      
      // Save to bbox
      const currentBbox = node.ui?.bbox || { x1: 0, y1: 0, x2: nodeWidth, y2: nodeHeight };
      onChangeUi?.(node.node_id, {
        bbox: {
          x1: currentBbox.x1,
          y1: currentBbox.y1,
          x2: currentBbox.x1 + finalWidth,
          y2: currentBbox.y1 + finalHeight
        }
      });
      
      // Clean up event listeners
      document.removeEventListener('pointermove', handleResizeMove);
      document.removeEventListener('pointerup', handleResizeEnd);
      document.removeEventListener('pointercancel', handleResizeEnd);
      
      // ✅ Update internals after resize (using debounced version)
      console.log(`📏 [FlowNodeCard] Node resized: ${node.node_id}`);
      debouncedUpdateNodeInternals();
    };

    // Add event listeners
    document.addEventListener('pointermove', handleResizeMove);
    document.addEventListener('pointerup', handleResizeEnd);
    document.addEventListener('pointercancel', handleResizeEnd);
    
  }, [nodeWidth, nodeHeight, node.node_id, node.ui?.bbox, onChangeUi, debouncedUpdateNodeInternals, reactFlow, collapsed, nodeMinHeight]);

  // Prevent default drag behavior when resizing
  const handleResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Set pointer capture to ensure we get all events
    e.currentTarget.setPointerCapture(e.pointerId);
    
    // Convert React event to native event and call our handler
    const nativeEvent = e.nativeEvent;
    handleResizeStart(nativeEvent);
  }, [handleResizeStart]);

  // Function to check if node has file inputs
  const hasFileInputs = useMemo(() => {
    if (!isAiNode) return false;
    
    const currentRouting = node.routing as { inputPorts?: Array<{ type: string }> } || { inputPorts: [] };
    const filePortTypes = ['image', 'audio', 'video', 'file'];
    
    return currentRouting.inputPorts?.some((port: { type: string }) => 
      filePortTypes.includes(port.type)
    ) || false;
  }, [isAiNode, node.routing]);

  // Get file types from input ports
  const getFileTypes = useCallback(() => {
    if (!isAiNode) return [];
    
    const currentRouting = node.routing as { inputPorts?: Array<{ type: string }> } || { inputPorts: [] };
    const filePortTypes = ['image', 'audio', 'video', 'file'];
    
    return currentRouting.inputPorts
      ?.filter((port: { type: string }) => filePortTypes.includes(port.type))
      ?.map((port: { type: string }) => {
        switch (port.type) {
          case 'image': return 'Images';
          case 'audio': return 'Audio';
          case 'video': return 'Video';
          case 'file': return 'Files';
          default: return port.type;
        }
      }) || [];
  }, [isAiNode, node.routing]);

  // Functions for dynamic model loading
  const fetchGoogleModels = useCallback(async (): Promise<string[]> => {
    try {
      const response = await fetch('/api/integrations/google/models');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data.models) ? data.models : [];
    } catch (error) {
      console.error('Failed to fetch Google models:', error);
      return [];
    }
  }, []);

  const fetchOpenAIModels = useCallback(async (): Promise<string[]> => {
    try {
      const response = await fetch('/api/integrations/openai/models');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data.models) ? data.models : [];
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      return [];
    }
  }, []);

  const loadModelsForProvider = useCallback(async (providerId: string) => {
    if (loadingModels[providerId] || dynamicModels[providerId]) {
      console.log(`⚠️ Skipping load for ${providerId}: loading=${loadingModels[providerId]}, has models=${dynamicModels[providerId]?.length || 0}`);
      return; // Already loading or loaded
    }

    console.log('🚀 Loading models for provider:', providerId, 'Available providers:', providers.map(p => p.id));
    
    setLoadingModels(prev => ({ ...prev, [providerId]: true }));
    
    try {
      let models: string[] = [];
      const providerConfig = providers.find(p => p.id === providerId) ?? FALLBACK_PROVIDERS.find(p => p.id === providerId);
      
      // First try to use models from providerConfig (already loaded from integrations)
      if (Array.isArray(providerConfig?.models) && providerConfig.models.length > 0) {
        models = providerConfig.models;
        console.log(`📦 Using ${models.length} models from provider config for ${providerId}`);
      } else if (providerId === 'replicate') {
        models = DEFAULT_REPLICATE_MODELS;
        console.log('📦 Using default Replicate models:', models.length);
      } else if (providerId === 'google' || providerId.includes('google')) {
        console.log('📡 Fetching Google models for ID:', providerId);
        models = await fetchGoogleModels();
      } else if (providerId === 'openai' || providerId.includes('openai')) {
        console.log('📡 Fetching OpenAI models for ID:', providerId);
        models = await fetchOpenAIModels();
      } else {
        console.log('⚠️ Unknown provider ID for dynamic loading:', providerId);
      }
      
      if (!models || models.length === 0) {
        console.log('⚠️ No models loaded for', providerId);
      }

      console.log(`✅ Loaded ${models.length} models for ${providerId}:`, models);
      
      setDynamicModels(prev => ({ ...prev, [providerId]: models }));
      
    } catch (error) {
      console.error(`❌ Error loading models for ${providerId}:`, error);
      setDynamicModels(prev => ({ ...prev, [providerId]: [] }));
    } finally {
      setLoadingModels(prev => ({ ...prev, [providerId]: false }));
    }
  }, [loadingModels, dynamicModels, fetchGoogleModels, fetchOpenAIModels, providers]);

  // Enhanced provider change handler with file detection
  const handleProviderChange = useCallback((providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
      console.error('❌ Provider not found:', providerId);
      return;
    }

    console.log('🔄 Provider change to:', providerId, 'Current provider:', currentProvider);
    console.log('🔄 onChangeAi function available:', typeof onChangeAi);

    // Check if current selection has files and new provider doesn't support them
    if (hasFileInputs && !provider.supportsFiles) {
      console.log('🚨 Files detected, provider does not support files');
      // Show warning modal
      setPendingProviderId(providerId);
      setShowFileWarningModal(true);
      return;
    }

    // Update local state immediately (like outputType)
    console.log('📝 Setting currentProvider from', currentProvider, 'to', providerId);
    setCurrentProvider(providerId);

    // Save to AI config
    const newAiConfig = {
      ...node.ai, // Preserve existing configuration
      provider: providerId,
      model: provider.defaultModel,
    };
    console.log('💾 Saving AI config:', newAiConfig);
    
    onChangeAi?.(node.node_id, newAiConfig);

    // Force component re-render immediately
    console.log('🔄 Triggering re-render');
    triggerRerender();

    // ✅ Force React Flow to update the node (using debounced version)
    console.log('🔄 Updating node internals for provider change');
    debouncedUpdateNodeInternals();

    // Start loading models in background
    setTimeout(() => {
      console.log('📥 Loading models for provider:', providerId);
      loadModelsForProvider(providerId);
    }, 500);
    
  }, [onChangeAi, node.node_id, node.ai, providers, hasFileInputs, loadModelsForProvider, debouncedUpdateNodeInternals, triggerRerender, currentProvider]);

  // Function to sync provider info with server
  const syncProviderWithServer = useCallback(async () => {
    if (!isAiNode || !currentProvider) {
      console.log('⚠️ Skipping provider sync - not AI node or no provider');
      return;
    }

    if (isSyncingProvider) {
      console.log('⚠️ Provider sync already in progress');
      return;
    }

    setIsSyncingProvider(true);
    console.log('🔄 Starting provider sync with server:', {
      currentProvider,
      nodeProvider: node.ai?.provider,
      nodeModel: node.ai?.model,
      nodeId: node.node_id
    });

    try {
      // Ensure the current provider selection is saved to server
      const provider = providers.find(p => p.id === currentProvider);
      if (!provider) {
        console.error('❌ Provider not found for sync:', currentProvider);
        return;
      }

      // Check if server state matches local state
      const serverProvider = String(node.ai?.provider || '');
      const needsUpdate = serverProvider !== currentProvider;

      console.log('🔍 Provider sync check:', {
        serverProvider,
        localProvider: currentProvider,
        needsUpdate
      });

      if (needsUpdate || !node.ai?.model) {
        const currentAiConfig = {
          ...node.ai,
          provider: currentProvider,
          model: node.ai?.model || provider.defaultModel,
        };

        console.log('📤 Updating server with AI config:', currentAiConfig);
        
        // Update server with current config
        onChangeAi?.(node.node_id, currentAiConfig);

        // Force re-render to reflect changes
        triggerRerender();
      } else {
        console.log('✅ Provider already in sync with server');
      }

      // Load fresh models if needed
      if (!dynamicModels[currentProvider] && !loadingModels[currentProvider]) {
        console.log('🔄 Loading fresh models for:', currentProvider);
        await loadModelsForProvider(currentProvider);
      } else {
        console.log('✅ Models already available for:', currentProvider);
      }

      console.log('✅ Provider sync completed successfully');
    } catch (error) {
      console.error('❌ Failed to sync provider with server:', error);
    } finally {
      setIsSyncingProvider(false);
    }
  }, [isAiNode, currentProvider, providers, node.ai, node.node_id, onChangeAi, dynamicModels, loadingModels, loadModelsForProvider, triggerRerender, isSyncingProvider]);

  // Auto-load models for current AI provider on initialization
  useEffect(() => {
    if (isAiNode && node.ai?.provider) {
      const currentProvider = typeof node.ai.provider === 'string' ? node.ai.provider : '';
      if (currentProvider && !dynamicModels[currentProvider] && !loadingModels[currentProvider]) {
        console.log('🚀 Auto-loading models on initialization for:', currentProvider);
        const timer = setTimeout(() => {
          loadModelsForProvider(currentProvider);
        }, 1000); // Slight delay to avoid overwhelming the system
        
        return () => clearTimeout(timer);
      }
    }
  }, [isAiNode, node.ai?.provider, dynamicModels, loadingModels, loadModelsForProvider]);

  // Handle continue without files
  const handleContinueWithoutFiles = useCallback(() => {
    if (!pendingProviderId) return;
    
    const provider = providers.find(p => p.id === pendingProviderId);
    if (!provider) return;

    onChangeAi?.(node.node_id, {
      ...node.ai, // Preserve existing configuration
      provider: pendingProviderId,
      model: provider.defaultModel,
    });
    
    setShowFileWarningModal(false);
    setPendingProviderId(null);
  }, [onChangeAi, node.node_id, node.ai, providers, pendingProviderId]);

  // Handle switch to file-supporting provider
  const handleSwitchToFileProvider = useCallback(() => {
    // Find best file-supporting provider
    const fileProvider = providers.find(p => p.supportsFiles) || 
                        FALLBACK_PROVIDERS.find(p => p.supportsFiles);
    
    if (!fileProvider) return;

    onChangeAi?.(node.node_id, {
      ...node.ai, // Preserve existing configuration
      provider: fileProvider.id,
      model: fileProvider.defaultModel,
    });
    
    setShowFileWarningModal(false);
    setPendingProviderId(null);
  }, [onChangeAi, node.node_id, node.ai, providers]);

  // Close file warning modal
  const handleCloseFileWarning = useCallback(() => {
    setShowFileWarningModal(false);
    setPendingProviderId(null);
  }, []);

  // Original provider change handler (keeping the original for reference)
  const originalHandleProviderChange = useCallback((providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    onChangeAi?.(node.node_id, {
      ...node.ai, // Preserve existing configuration
      provider: providerId,
      model: provider.defaultModel,
    });
  }, [onChangeAi, node.node_id, node.ai, providers]);

  // AI model change handler
  const handleInlineModelChange = useCallback(
    async (model: string) => {
      const trimmed = model.trim();
      if (!trimmed) {
        return;
      }

      setPendingModelSelection(trimmed);

      const providerId =
        currentProvider ||
        (typeof node.ai?.provider === 'string' ? node.ai.provider : '');
      const currentModel =
        typeof node.ai?.model === 'string' ? node.ai.model.trim() : '';

      if (!onChangeAi) {
        setTimeout(() => setPendingModelSelection(null), 0);
        return;
      }

      if (providerId !== 'replicate') {
        onChangeAi(node.node_id, { ...node.ai, model: trimmed });
        triggerRerender();
        console.log(`🔄 [FlowNodeCard] Model changed (non-replicate): ${trimmed}`);
        debouncedUpdateNodeInternals();
        return;
      }

      if (trimmed === currentModel) {
        triggerRerender();
        console.log(`🔄 [FlowNodeCard] Model unchanged: ${trimmed}`);
        debouncedUpdateNodeInternals();
        setPendingModelSelection(null);
        return;
      }

      setIsInlineModelLoading(true);
      try {
        const schema = await fetchModelSchema(providerId, trimmed);
        const inputs = Array.isArray(schema.inputs) ? schema.inputs : [];
        const requiredFields = inputs.filter(
          (input) => input.required && input.name !== 'prompt',
        );
        const requiredPortNames = requiredFields.map((field) => field.name);
        const availablePortNames = inputs.map((input) => input.name);

        const metaEnabledPorts = Array.isArray(node.meta?.enabled_ports)
          ? (node.meta?.enabled_ports as unknown[])
              .filter(
                (value): value is string =>
                  typeof value === 'string' && value.trim().length > 0,
              )
          : [];

        const currentAutoPortIds = Array.isArray(node.ai?.auto_ports)
          ? (node.ai.auto_ports as AutoPort[])
              .map((port) =>
                typeof port?.id === 'string' ? port.id.trim() : '',
              )
              .filter((id) => id.length > 0)
          : [];

        const invalidFromEnabled = metaEnabledPorts.filter(
          (port) => !availablePortNames.includes(port),
        );
        const invalidFromAuto = currentAutoPortIds.filter(
          (port) => !availablePortNames.includes(port),
        );
        const invalidPorts = Array.from(
          new Set([...invalidFromEnabled, ...invalidFromAuto]),
        );

        if (invalidPorts.length > 0 && onRemoveInvalidPorts) {
          try {
            await onRemoveInvalidPorts(node.node_id, invalidPorts);
          } catch (error) {
            console.error(
              '[FlowNodeCard] Failed to remove invalid ports:',
              error,
            );
          }
        }

        const preservedPorts = Array.from(
          new Set([
            ...metaEnabledPorts.filter((port) =>
              availablePortNames.includes(port),
            ),
            ...currentAutoPortIds.filter((port) =>
              availablePortNames.includes(port),
            ),
          ]),
        );

        const enabledPorts = Array.from(
          new Set([...preservedPorts, ...requiredPortNames]),
        );

        const autoPorts = generateAutoPorts(inputs, enabledPorts);

        onChangeAi(node.node_id, {
          ...node.ai,
          model: trimmed,
          auto_ports: autoPorts,
        });

        if (onChangeMeta) {
          onChangeMeta(node.node_id, { enabled_ports: enabledPorts });
        }
      } catch (error) {
        console.error('[FlowNodeCard] Error loading model schema:', error);
        onChangeAi(node.node_id, {
          ...node.ai,
          model: trimmed,
          auto_ports: undefined,
        });
      } finally {
        setIsInlineModelLoading(false);
        triggerRerender();
        console.log(`🔄 [FlowNodeCard] Model change completed, updating internals`);
        debouncedUpdateNodeInternals();
      }
    },
    [
      currentProvider,
      node.ai,
      node.meta?.enabled_ports,
      node.node_id,
      onChangeAi,
      onChangeMeta,
      onRemoveInvalidPorts,
      triggerRerender,
      debouncedUpdateNodeInternals,
    ],
  );

  const clearRecentlySaved = useCallback(() => {
    if (recentlySavedTimerRef.current !== null) {
      window.clearTimeout(recentlySavedTimerRef.current);
      recentlySavedTimerRef.current = null;
    }
    setRecentlySaved(false);
  }, []);

  const markRecentlySaved = useCallback(() => {
    if (recentlySavedTimerRef.current !== null) {
      window.clearTimeout(recentlySavedTimerRef.current);
    }
    setRecentlySaved(true);
    recentlySavedTimerRef.current = window.setTimeout(() => {
      setRecentlySaved(false);
      recentlySavedTimerRef.current = null;
    }, 2000); // Auto-hide after 2 seconds
  }, []);

  const commitContentNow = useCallback(async (): Promise<boolean> => {
    if (!isContentDirty && pendingContentRef.current === null) {
      return true;
    }
    const contentToPersist = pendingContentRef.current ?? contentValue;
    const baseContent = lastSavedContentRef.current ?? '';
    const operations = diffToTextOperations(baseContent, contentToPersist);
    const commitOptions = operations.length > 0 ? { operations } : undefined;
    if (contentToPersist === lastSavedContentRef.current) {
      pendingContentRef.current = null;
      setIsContentDirty(false);
      clearRecentlySaved();
      markRecentlySaved();
      return true;
    }
    if (!onCommitContent) {
      lastSavedContentRef.current = contentToPersist;
      pendingContentRef.current = null;
      setIsContentDirty(false);
      clearRecentlySaved();
      markRecentlySaved();
      return true;
    }
    if (contentCommitPromiseRef.current) {
      return contentCommitPromiseRef.current;
    }

    setIsContentSaving(true);
    setContentSyncError(null);
    const promise = (async () => {
      try {
        await onCommitContent(node.node_id, contentToPersist, commitOptions);
        lastSavedContentRef.current = contentToPersist;
        pendingContentRef.current = null;
        setIsContentDirty(false);
        clearRecentlySaved();
        markRecentlySaved();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save changes';
        setContentSyncError(message);
        setIsContentDirty(true);
        return false;
      } finally {
        setIsContentSaving(false);
        contentCommitPromiseRef.current = null;
      }
    })();

    contentCommitPromiseRef.current = promise;
    return promise;
  }, [isContentDirty, onCommitContent, node.node_id, contentValue, clearRecentlySaved, markRecentlySaved]);

  const scheduleContentCommit = useCallback(
    (delay = 800) => {
      if (contentCommitTimer.current !== null) {
        window.clearTimeout(contentCommitTimer.current);
      }
      contentCommitTimer.current = window.setTimeout(() => {
        contentCommitTimer.current = null;
        void commitContentNow();
      }, delay);
    },
    [commitContentNow],
  );

  const startContentEditing = useCallback(
    (source?: HTMLTextAreaElement | FocusEvent<HTMLElement> | null) => {
      isUserEditingRef.current = true;
      let element: HTMLTextAreaElement | null = null;
      if (source instanceof HTMLTextAreaElement) {
        element = source;
      } else if (source && typeof (source as FocusEvent<HTMLElement>).currentTarget !== 'undefined') {
        const potential = (source as FocusEvent<HTMLElement>).currentTarget;
        if (potential instanceof HTMLTextAreaElement) {
          element = potential;
        }
      }
      if (element) {
        contentInputRef.current = element;
      }
      if (contentCommitTimer.current !== null) {
        window.clearTimeout(contentCommitTimer.current);
        contentCommitTimer.current = null;
      }
    },
    [],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      clearRecentlySaved();
      setContentValue(content);
      pendingContentRef.current = content;
      setIsContentDirty(true);
      setContentSyncError(null);
      if (isUserEditingRef.current && contentInputRef.current) {
        const element = contentInputRef.current;
        if (element && document.activeElement !== element) {
          element.focus({ preventScroll: true });
          if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
            const caret = Math.min(content.length, element.selectionEnd);
            element.setSelectionRange(caret, caret);
          }
        }
      }
      if (!isUserEditingRef.current) {
        scheduleContentCommit();
        if (onChangeContent) {
          onChangeContent(node.node_id, content);
        }
      }
    },
    [
      clearRecentlySaved,
      node.node_id,
      onChangeContent,
      scheduleContentCommit,
    ],
  );

  const flushContent = useCallback(async (): Promise<boolean> => {
    if (contentCommitTimer.current !== null) {
      window.clearTimeout(contentCommitTimer.current);
      contentCommitTimer.current = null;
    }
    return commitContentNow();
  }, [commitContentNow]);

  const finishContentEditing = useCallback(() => {
    isUserEditingRef.current = false;
    contentInputRef.current = null;
    const latest = pendingContentRef.current ?? contentValue;
    if (onChangeContent) {
      onChangeContent(node.node_id, latest);
    }
    void flushContent();
  }, [contentValue, flushContent, node.node_id, onChangeContent]);

  useEffect(() => {
    onChangeContentRef.current = onChangeContent;
  }, [onChangeContent]);

  useEffect(() => {
    commitContentNowRef.current = () => commitContentNow();
  }, [commitContentNow]);

  useEffect(() => {
    nodeIdRef.current = node.node_id;
  }, [node.node_id]);

  useEffect(() => {
    if (!isUserEditingRef.current) {
      return;
    }
    const element = contentInputRef.current;
    if (element && document.activeElement !== element) {
      element.focus({ preventScroll: true });
      if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        const caret = element.value.length;
        element.setSelectionRange(caret, caret);
      }
    }
  }, [contentValue]);

  useEffect(() => {
    const container = nodeRef.current;
    if (!container) {
      return undefined;
    }

    const handlePointerUp = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('button, [data-commit-on-click="true"]')) {
        if (pendingContentRef.current !== null || isContentDirty) {
          void flushContent();
        }
      }
    };

    container.addEventListener('pointerup', handlePointerUp, true);
    return () => {
      container.removeEventListener('pointerup', handlePointerUp, true);
    };
  }, [flushContent, isContentDirty]);

  const wasDraggingRef = useRef(dragging);
  useEffect(() => {
    if (wasDraggingRef.current && !dragging) {
      if (pendingContentRef.current !== null || isContentDirty) {
        void flushContent();
      }
    }
    wasDraggingRef.current = dragging;
  }, [dragging, flushContent, isContentDirty]);

  const wasResizingRef = useRef(isResizing);
  useEffect(() => {
    if (wasResizingRef.current && !isResizing) {
      if (pendingContentRef.current !== null || isContentDirty) {
        void flushContent();
      }
    }
    wasResizingRef.current = isResizing;
  }, [isResizing, flushContent, isContentDirty]);

  const wasSelectedRef = useRef(selected);
  useEffect(() => {
    if (wasSelectedRef.current && !selected) {
      if (pendingContentRef.current !== null || isContentDirty) {
        void flushContent();
      }
    }
    wasSelectedRef.current = selected;
  }, [selected, flushContent, isContentDirty]);

  useEffect(() => {
    return () => {
      if (contentCommitTimer.current !== null) {
        window.clearTimeout(contentCommitTimer.current);
        contentCommitTimer.current = null;
      }
      if (recentlySavedTimerRef.current !== null) {
        window.clearTimeout(recentlySavedTimerRef.current);
        recentlySavedTimerRef.current = null;
      }
      if (pendingContentRef.current !== null) {
        const latest = pendingContentRef.current;
        const changeHandler = onChangeContentRef.current;
        const nodeId = nodeIdRef.current;
        if (changeHandler) {
          changeHandler(nodeId, latest);
        }
        if (commitContentNowRef.current) {
          void commitContentNowRef.current();
        }
      }
      contentInputRef.current = null;
      isUserEditingRef.current = false;
    };
  }, []);

  const handleEmailHeroImageChange = useCallback((url: string) => {
    setEmailHeroImage(url);
    onChangeMeta(node.node_id, { hero_image: url });
  }, [node.node_id, onChangeMeta]);

  const handleEmailPreviewWidthChange = useCallback((width: number) => {
    const clamped = Math.round(Math.min(900, Math.max(320, width)));
    setEmailPreviewWidth(clamped);
    onChangeMeta(node.node_id, { editorPreviewWidth: clamped });
  }, [node.node_id, onChangeMeta]);

  const handleInsertHeroImage = useCallback(() => {
    if (!emailHeroImage) return;
    const imgTag = `<div class="email-hero" style="text-align:center;margin:24px 0;">
  <img src="${emailHeroImage}" alt="Hero" style="max-width:100%;border-radius:16px;box-shadow:0 12px 24px rgba(15,23,42,0.15);" />
</div>`;
    if (contentValue.includes(emailHeroImage)) {
      return;
    }
    const updated = contentValue.trim() ? `${imgTag}\n${contentValue}` : imgTag;
    handleContentChange(updated);
  }, [contentValue, emailHeroImage, handleContentChange]);

  const handleEmailPreviewHeightChange = useCallback((height: number) => {
    const clamped = Math.round(Math.min(900, Math.max(360, height)));
    setEmailPreviewHeight(clamped);
    onChangeMeta(node.node_id, { editorPreviewHeight: clamped });
  }, [node.node_id, onChangeMeta]);

  const handleEmailTextColorChange = useCallback((color: string) => {
    setEmailTextColor(color);
    onChangeMeta(node.node_id, { emailTextColor: color });
  }, [node.node_id, onChangeMeta]);

  const handleEmailBackgroundColorChange = useCallback((color: string) => {
    setEmailBackgroundColor(color);
    onChangeMeta(node.node_id, { emailBackgroundColor: color });
  }, [node.node_id, onChangeMeta]);

  const handleEmailAccentColorChange = useCallback((color: string) => {
    setEmailAccentColor(color);
    onChangeMeta(node.node_id, { emailAccentColor: color });
  }, [node.node_id, onChangeMeta]);

  const handleInsertImageBlock = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = window.prompt('Enter image URL');
    if (!url) return;
    const alt = window.prompt('Alternative text for image') || 'Image';
    const block = `<div style="text-align:center;margin:24px 0;">
  <img src="${url}" alt="${alt}" style="max-width:100%;border-radius:12px;box-shadow:0 8px 18px rgba(15,23,42,0.15);" />
</div>`;
    handleContentChange(contentValue.trim() ? `${contentValue}\n${block}` : block);
  }, [contentValue, handleContentChange]);

  const handleInsertCtaBlock = useCallback(() => {
    const snippet = `<div style="text-align:center;margin:32px 0;">
  <a href="https://example.com" style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:999px;background:${emailAccentColor};color:#ffffff;font-weight:600;text-decoration:none;">Follow link →</a>
</div>`;
    handleContentChange(contentValue.trim() ? `${contentValue}\n${snippet}` : snippet);
  }, [contentValue, emailAccentColor, handleContentChange]);

  const handleInsertDivider = useCallback(() => {
    const divider = `<hr style="margin:32px 0;border:none;height:1px;background:linear-gradient(90deg, transparent, rgba(148,163,184,0.4), transparent);" />`;
    handleContentChange(contentValue.trim() ? `${contentValue}\n${divider}` : divider);
  }, [contentValue, handleContentChange]);

  const handleResetEmailPalette = useCallback(() => {
    const defaultText = '#1f2937';
    const defaultBackground = '#f1f5f9';
    const defaultAccent = '#2563eb';
    setEmailTextColor(defaultText);
    setEmailBackgroundColor(defaultBackground);
    setEmailAccentColor(defaultAccent);
    onChangeMeta(node.node_id, {
      emailTextColor: defaultText,
      emailBackgroundColor: defaultBackground,
      emailAccentColor: defaultAccent,
    });
  }, [node.node_id, onChangeMeta]);

  // System prompt change handler
  const handleSystemPromptChange = useCallback((systemPrompt: string) => {
    setSystemPromptValue(systemPrompt);
    if (systemPromptSaveTimer.current !== null) {
      window.clearTimeout(systemPromptSaveTimer.current);
    }
    if (!onChangeAi) {
      return;
    }
    systemPromptSaveTimer.current = window.setTimeout(() => {
      systemPromptSaveTimer.current = null;
      lastSavedSystemPromptRef.current = systemPrompt;
      onChangeAi(node.node_id, { system_prompt: systemPrompt });
    }, 400);
  }, [onChangeAi, node.node_id]);

  const schedulePlaceholderSave = useCallback((values: Record<string, string>) => {
    if (!onChangeAi) {
      return;
    }
    if (placeholderSaveTimer.current !== null) {
      window.clearTimeout(placeholderSaveTimer.current);
    }
    const snapshot = { ...values };
    placeholderSaveTimer.current = window.setTimeout(() => {
      placeholderSaveTimer.current = null;
      lastSavedPlaceholderValuesRef.current = snapshot;
      onChangeAi(node.node_id, { placeholder_values: snapshot });
    }, 400);
  }, [onChangeAi, node.node_id]);

  const handlePlaceholderInputChange = useCallback((name: string, rawValue: string) => {
    const value = rawValue;
    setPlaceholderInputs((prev) => {
      const next = { ...prev };
      if (value.trim().length === 0) {
        if (!(name in next)) {
          return prev;
        }
        delete next[name];
      } else if (next[name] === value) {
        return prev;
      } else {
        next[name] = value;
      }
      schedulePlaceholderSave(next);
      return next;
    });
  }, [schedulePlaceholderSave]);

  // Field configuration handler
  const handleFieldsChange = useCallback((fields: NodeFieldConfig[]) => {
    onChangeMeta(node.node_id, { displayFields: fields });
  }, [onChangeMeta, node.node_id]);

  // Get current display fields from node meta
  const currentDisplayFields = useMemo(() => {
    const metaFields = node.meta?.displayFields as NodeFieldConfig[] | undefined;
    return metaFields || [];
  }, [node.meta?.displayFields]);

  // Routing configuration handler
  const handleRoutingChange = useCallback((routing: NodeRoutingConfig) => {
    onChangeMeta(node.node_id, { routingConfig: routing });
  }, [onChangeMeta, node.node_id]);

  // Get current routing configuration from node meta
  const currentRoutingConfig = useMemo(() => {
    const metaRouting = node.meta?.routingConfig as NodeRoutingConfig | undefined;
    return metaRouting || { inputPorts: [], outputPorts: [], routingRules: [] };
  }, [node.meta?.routingConfig]);

  const placeholderInfo = useMemo(() => {
    const availableNodes = allNodes ?? [];
    return extractPlaceholderInfo(systemPromptValue, availableNodes, node);
  }, [systemPromptValue, allNodes, node]);

  

  return (
    <div
      ref={nodeRef}
      className={`flow-node flow-node__card ${selected ? 'flow-node--selected' : ''} ${dragging ? 'flow-node--dragging' : ''} ${isResizing ? 'flow-node--resizing' : ''} ${isGenerating ? 'flow-node--generating' : ''}`}
      style={{
        backgroundColor: `${baseColor}15`,
        border: `2px solid ${statusBorderColor}`,
        borderRadius: '8px',
        overflow: 'visible', // allow port handles/labels to extend beyond node bounds
        position: 'relative',
        width: '100%', // Return to 100% for React Flow compatibility
        height: '100%', // Return to 100% for React Flow compatibility
        minWidth: `${NODE_MIN_WIDTH}px`,
        minHeight: `${nodeMinHeight}px`,
        maxWidth: `${NODE_MAX_WIDTH}px`,
        maxHeight: `${NODE_MAX_HEIGHT}px`,
        backdropFilter: 'blur(10px)',
        boxShadow: selected
          ? `0 0 0 2px ${statusBorderColor}, 0 8px 24px ${statusBorderColor}30`
          : `0 4px 12px ${statusBorderColor}20`,
        transition: isResizing ? 'none' : 'box-shadow 0.2s ease, transform 0.1s ease, height 0.2s ease-out',
        transform: dragging ? 'scale(1.02)' : 'scale(1)',
        display: 'flex',
        flexDirection: 'column',
        opacity: (isGenerating || isImageUploading) ? 0.7 : 1,
        pointerEvents: (isGenerating || isImageUploading) ? 'none' : 'auto',
        animation: (isGenerating || isImageUploading) ? 'gentle-pulse 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* NodeResizer for image/video nodes with aspect ratio preservation */}
      {selected && (node.type === 'image' || node.type === 'video') && (() => {
        const naturalWidth = node.meta?.natural_width as number | undefined;
        const naturalHeight = node.meta?.natural_height as number | undefined;
        const isAnnotationMode = (node.meta?.annotation_mode ?? false) as boolean;
        const footerHeight = getFooterHeight(isAnnotationMode);
        const fixedPartsHeight = NODE_HEADER_HEIGHT + NODE_TOOLBAR_HEIGHT + footerHeight;
        
        // Like Photoshop: maxWidth = natural image size (node NOT larger than image!)
        const maxResizeWidth = naturalWidth ? Math.min(naturalWidth, MAX_CONTENT_WIDTH) : MAX_CONTENT_WIDTH;
        const maxResizeHeight = naturalHeight 
          ? naturalHeight + fixedPartsHeight 
          : (imageViewMode === 'edit' ? MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION : MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL);
        
        return (
          <NodeResizer
            minWidth={MIN_CONTENT_WIDTH}
            minHeight={
              imageViewMode === 'edit' 
                ? MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION 
                : MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL
            }
            maxWidth={maxResizeWidth}
            maxHeight={maxResizeHeight}
            keepAspectRatio={false}
          isVisible={selected}
          onResize={(event, params) => {
            // Visual indicator only - do NOT update dimensions here!
            setIsResizing(true);
          }}
          onResizeEnd={(event, params) => {
            setIsResizing(false);
            
            const naturalWidth = node.meta?.natural_width as number | undefined;
            const naturalHeight = node.meta?.natural_height as number | undefined;
            const contentWidth = params.width;
            
            if (!naturalWidth || !naturalHeight) {
              // For nodes without aspect ratio (text, pdf, etc.)
              // bbox stores content dimensions as-is
              if (onChangeUi && node.ui?.bbox) {
                onChangeUi(node.node_id, {
                  bbox: {
                    x1: node.ui.bbox.x1,
                    y1: node.ui.bbox.y1,
                    x2: node.ui.bbox.x1 + contentWidth,
                    y2: node.ui.bbox.y1 + params.height,
                  },
                });
              }
              return;
            }
            
            // For image/video: bbox = content dimensions by aspect ratio
            // bbox stores ONLY content dimensions (image)
            // Constants (header, toolbar, footer) are added in UI automatically
            const aspectRatio = naturalWidth / naturalHeight;
            const contentHeight = contentWidth / aspectRatio;
            
            if (onChangeUi && node.ui?.bbox) {
              onChangeUi(node.node_id, {
                bbox: {
                  x1: node.ui.bbox.x1,
                  y1: node.ui.bbox.y1,
                  x2: node.ui.bbox.x1 + contentWidth,
                  y2: node.ui.bbox.y1 + contentHeight,
                },
              });
            }
          }}
          />
        );
      })()}
      
      {/* Header with identity and toolbar */}
      <div 
        className="flow-node__header"
        style={{
          backgroundColor: `${baseColor}25`,
          borderBottom: `1px solid ${baseColor}40`,
          borderRadius: '8px 8px 0 0',
        }}
      >
        <div className="flow-node__identity">
          <div 
            className="flow-node__type-icon relative"
            style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              boxShadow: `0 2px 4px ${baseColor}30`
            }}
          >
            {isGenerating ? (
              <div className="relative flex items-center justify-center">
                {/* Muted background icon */}
                <span className="absolute opacity-30">{typeIcon}</span>
                
                {/* Loading indicator */}
                <div className="w-5 h-5 relative">
                  <div className="w-full h-full border-2 border-slate-400 border-t-sky-500 rounded-full animate-spin"></div>
                  
                  {/* Pulsating dot in center */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            ) : (
              typeIcon
            )}
          </div>
          <div className="flow-node__identity-text">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="flow-node__title-input"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleInputBlur}
                onKeyDown={handleTitleKeyDown}
                onClick={handleTitleInputClick}
                maxLength={50}
                style={{
                  backgroundColor: `${baseColor}20`,
                  border: `1px solid ${baseColor}`,
                }}
                disabled={disabled}
              />
            ) : (
              <button
                type="button"
                className="flow-node__title-button"
                onClick={handleTitleEdit}
                disabled={disabled}
                style={{
                  backgroundColor: selected ? `${baseColor}30` : `${baseColor}20`,
                }}
              >
                {node.title}
              </button>
            )}
            <div className="flow-node__meta-row">
              <span 
                className="flow-node__meta-pill"
                style={{ backgroundColor: `${baseColor}30` }}
              >
                {node.type}
              </span>
              <span className="flow-node__meta-id">{node.node_id.slice(-8)}</span>
              {(node.meta?.attachments && Array.isArray(node.meta.attachments)) ? (
                <span className="text-blue-300" title="Has attached files">
                  📎 {String((node.meta.attachments as string[]).length)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flow-node__toolbar">
          {/* Collapse/Expand button */}
          {!(node.type === 'data' || node.type === 'parser') && (
            <button
              type="button"
              className="flow-node__toolbar-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCollapsed(!collapsed);
              }}
              title={collapsed ? "Expand" : "Collapse"}
              disabled={disabled}
              style={{ 
                width: '28px', 
                height: '28px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '14px' 
              }}
            >
              {collapsed ? '➕' : '➖'}
            </button>
          )}

          {/* Color picker button */}
          <button
            type="button"
            className="flow-node__toolbar-button"
            onClick={handleColorButtonClick}
            title="Change color"
            disabled={disabled}
            style={{ 
              width: '28px', 
              height: '28px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '14px' 
            }}
          >
            🎨
          </button>

          {/* Settings button */}
          <button
            type="button"
            className="flow-node__toolbar-button"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              // Sync provider with server before opening settings
              if (isAiNode) {
                await syncProviderWithServer();
              }
              setShowSettingsModal(true);
            }}
            title="Node settings"
            disabled={disabled}
            style={{ 
              width: '28px', 
              height: '28px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '14px' 
            }}
          >
            ⚙️
          </button>

          {/* Delete button */}
          <button
            type="button"
            className="flow-node__toolbar-button text-red-400 hover:text-red-300"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const confirmed = await showConfirm({
                title: 'Delete node?',
                message: 'This node will be permanently deleted. All data and connections will be lost.',
                confirmText: 'Delete',
                cancelText: 'Cancel',
                type: 'danger'
              });
              
              if (confirmed) {
                onDelete(node.node_id);
              }
            }}
            title="Delete node"
            disabled={disabled}
            style={{ 
              width: '28px', 
              height: '28px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '14px' 
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Color Palette */}
      {colorOpen && (
        <div className="absolute z-20 top-16 right-4 p-3 bg-slate-900 rounded-lg border border-slate-700 shadow-lg">
          <div className="grid grid-cols-4 gap-2">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className="h-6 w-6 rounded-full border border-white/20 transition hover:scale-110"
                style={{ backgroundColor: color }}
                onClick={(e) => handleColorPickerClick(e, color)}
                title={`Change to ${color}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div 
        ref={contentRef} 
        className="flow-node__content nodrag"
        style={{ 
          padding: isImprovedAiNode ? '16px' : (node.type === 'image' ? '0' : '16px'), 
          paddingTop: (isImprovedAiNode && collapsed) || node.type === 'image' ? '0' : '16px',
          paddingBottom: node.type === 'image' ? '0' : '8px', // Less padding at bottom since footer provides separation
          display: 'flex', 
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          transition: 'padding 0.2s ease-out',
          position: 'relative'
        }}
      >
        {isImprovedAiNode ? (
          <>
            {/* Main Input Area - resizable content area */}
            {!collapsed && (
              <div className="flex-1 min-h-0">
                <textarea
                  ref={contentInputRef}
                  value={contentValue}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onFocus={(event) => {
                    event.stopPropagation();
                    startContentEditing(event.currentTarget);
                  }}
                  onBlur={(event) => {
                    event.stopPropagation();
                    finishContentEditing();
                  }}
                  placeholder="Enter your prompt for the agent..."
                  disabled={disabled}
                  className="w-full h-full p-3 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { autoRenameFromSource((e.target as HTMLInputElement).value); } }}
                      draggable={false}
                  data-nodrag="true"
                  style={{ 
                    minHeight: '80px',
                    resize: 'none',
                    fontSize: contentFontSizeStyle ?? '13px',
                    lineHeight: '1.4'
                  }}
                />
              </div>
            )}
            
            {/* Control Panel */}
            <div
              className="mt-2"
              style={{
                marginTop: '10px',
                flexShrink: 0,
              }}
            >
              <div className="flex items-center justify-end w-full">
                <select
                  value={pendingModelSelection ?? inlineModelValue}
                  onChange={(e) => {
                    void handleInlineModelChange(e.target.value);
                  }}
                  disabled={disabled || providerModelOptions.length === 0}
                  className="flex-1 min-w-[150px] max-w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-300 hover:text-white hover:bg-slate-600 transition nodrag"
                  title={selectedProvider ? `Model (${selectedProvider.name})` : 'Select operator in settings'}
                  data-nodrag="true"
                  key={`model-${forceRender}`}
                  style={{ marginRight: '8px' }}
                >
                  {providerModelOptions.length === 0 ? (
                    <option value="" disabled>
                      No available models
                    </option>
                  ) : (
                    providerModelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))
                  )}
                </select>

                <button
                  type="button"
                  onClick={async () => {
                    await syncProviderWithServer();
                    setActiveAiModalTab('ai_config');
                    setShowAiSettingsModal(true);
                  }}
                  className="w-7 h-7 rounded border transition flex items-center justify-center bg-black/20 border-white/10 text-white/70 hover:bg-black/30 hover:text-white"
                  title={isSyncingProvider ? 'Syncing…' : `AI Settings (operator: ${currentProviderLabel})`}
                  disabled={disabled || isSyncingProvider}
                  style={{ marginRight: '8px' }}
                >
                  {isSyncingProvider ? '⏳' : '⚙️'}
                </button>

                <select
                  value={outputType}
                  onChange={(e) => {
                    const value = e.target.value as 'mindmap' | 'node' | 'folder';
                    // If Midjourney and trying to set mindmap, switch to node instead
                    const isMidjourneyProvider = currentProvider === 'midjourney_proxy' || currentProvider === 'midjourney_mindworkflow_relay' || currentProvider === 'midjourney';
                    if (isMidjourneyProvider && value === 'mindmap') {
                      handleOutputTypeChange('node');
                    } else {
                      handleOutputTypeChange(value);
                    }
                  }}
                  className="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-300 hover:text-white hover:bg-slate-600 transition"
                  title="Output type"
                  disabled={disabled}
                  style={{ marginRight: '5px' }}
                >
                  {currentProvider !== 'midjourney_proxy' && currentProvider !== 'midjourney_mindworkflow_relay' && currentProvider !== 'midjourney' && (
                    <option value="mindmap">Mindmap</option>
                  )}
                  <option value="node">Node</option>
                  <option value="folder">Folder</option>
                </select>
                
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const committed = await flushContent();
                    if (!committed) {
                      return;
                    }
                    // Sync provider with server before running
                    await syncProviderWithServer();
                    onRun(node.node_id);
                  }}
                  className="px-3 py-1.5 text-xs rounded border border-green-500/50 bg-green-600/20 text-green-300 hover:bg-green-600/30 transition"
                  title={isSyncingProvider ? "Syncing..." : "Run generation"}
                  disabled={disabled || isSyncingProvider}
                >
                  {isSyncingProvider ? '⏳' : '▶️'}
                </button>
              </div>
            </div>

        {/* Expandable Settings Panels */}
            {activeAiTab === 'settings' && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
                <div>
                  <label className="text-xs text-white/70 block mb-2">System Prompt</label>
                  <div className="flex flex-wrap items-start gap-2 mb-2">
                    <div className="flex flex-wrap gap-2">
                      {quickSystemPrompts.map((preset) => (
                        <button
                          key={preset.preset_id}
                          type="button"
                          onClick={() => {
                            handleSystemPromptChange(preset.content);
                            setPromptSearchTerm('');
                            setPromptSearchResults([]);
                            setPromptSearchError(null);
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          className="px-2 py-1 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
                          disabled={disabled}
                          title={preset.description ?? undefined}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="relative flex-1 min-w-[200px]">
                      <input
                        type="search"
                        value={promptSearchTerm}
                        onChange={(event) => setPromptSearchTerm(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setPromptSearchTerm('');
                            setPromptSearchResults([]);
                            setPromptSearchError(null);
                          }
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="w-full rounded border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        placeholder="Search prompt library..."
                        disabled={disabled}
                      />
                      {promptSearchTerm.trim().length >= 2 && (
                        <div className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-lg">
                          {promptSearchLoading && (
                            <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
                          )}
                          {promptSearchError && !promptSearchLoading && (
                            <div className="px-3 py-2 text-xs text-rose-400">{promptSearchError}</div>
                          )}
                          {!promptSearchLoading && !promptSearchError && promptSearchResults.length === 0 && (
                            <div className="px-3 py-2 text-xs text-slate-400">Nothing found</div>
                          )}
                          {!promptSearchLoading &&
                            promptSearchResults.map((preset) => (
                              <button
                                key={preset.preset_id}
                                type="button"
                                className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-700/60"
                                onClick={() => {
                                  handleSystemPromptChange(preset.content);
                                  setPromptSearchTerm('');
                                  setPromptSearchResults([]);
                                  setPromptSearchError(null);
                                }}
                                disabled={disabled}
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <span className="text-xs font-medium text-slate-200">{preset.label}</span>
                                {preset.description && (
                                  <span className="text-[11px] text-slate-400">{preset.description}</span>
                                )}
                                {preset.tags.length > 0 && (
                                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                                    {preset.tags.join(' • ')}
                                  </span>
                                )}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={systemPromptValue}
                    onChange={(e) => handleSystemPromptChange(e.target.value)}
                    placeholder="E.g.: You are a helpful assistant."
                    disabled={disabled}
                    className="w-full p-3 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    draggable={false}
                    data-nodrag="true"
                    rows={4}
                  style={{ 
                    minHeight: '80px',
                    resize: 'none',
                    fontSize: '13px',
                    lineHeight: '1.4'
                  }}
                />
                {placeholderInfo.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold text-white/70">Prompt Variables</div>
                    <div className="text-[11px] text-white/40">
                      Fill in values manually or specify a node identifier (e.g., <code>node123.content</code>).
                    </div>
                    {placeholderInfo.map((placeholder) => {
                      const currentValue = placeholderInputs[placeholder.name] ?? '';
                      const preview = placeholder.resolvedValue ?? placeholder.reference ?? '';
                      const previewText = preview.length > 80 ? `${preview.slice(0, 77)}…` : preview;
                      return (
                        <div key={placeholder.name} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-white/80">{placeholder.name}</span>
                            {preview && (
                              <span className="text-[11px] text-white/40">
                                Auto: {previewText}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={currentValue}
                            onChange={(event) => handlePlaceholderInputChange(placeholder.name, event.target.value)}
                            placeholder={preview ? `Auto: ${previewText}` : 'Enter value or node_id'}
                            className="w-full rounded border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-white/80 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            data-nodrag="true"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>


            </div>
          )}

            {activeAiTab === 'ai_config' && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
                <div>
                  <label className="text-xs text-white/70 block mb-2">Provider</label>
                  <select
                    value={String(node.ai?.provider || '')}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    disabled={disabled}
                    className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-sm nodrag"
                    data-nodrag="true"
                  >
                    {providers.map(p => (
                      <option key={p.id} value={p.id} disabled={!p.available}>
                        {p.name}{' '}
                        {p.supportsFiles && '🗂️'}{' '}
                        {!p.available && `(${p.reason || 'Unavailable'})`}
                        {hasFileInputs && !p.supportsFiles && ' ⚠️ Files not supported'}
                      </option>
                    ))}
                  </select>
                  
                  {/* File support warning */}
                  {hasFileInputs && selectedProvider && !selectedProvider.supportsFiles && (
                    <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300">
                      ⚠️ Current provider does not support files. Detected inputs: {getFileTypes().join(', ')}
                    </div>
                  )}
                </div>
                {selectedProvider && (
                  <div>
                    <label className="text-xs text-white/70 block mb-2">Model</label>
                    <button
                      onClick={() => setActiveAiTab('ai_config')}
                      disabled={disabled}
                      className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag text-left hover:bg-black/40 hover:border-white/20 transition-colors flex items-center justify-between group"
                      data-nodrag="true"
                      title="Click to change model"
                    >
                      <span className="text-white/80 truncate">
                        {String(node.ai?.model || selectedProvider.defaultModel || 'Not selected')}
                      </span>
                      <span className="text-white/40 group-hover:text-white/60 transition-colors">⚙️</span>
                    </button>
                    <div className="text-xs text-white/50 mt-1">Click to change model</div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-white/70 block mb-2">Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={Number(node.ai?.temperature) || 0.7}
                    onChange={(e) => {
                      const temp = parseFloat(e.target.value) || 0.7;
                      const newAiConfig = { ...node.ai, temperature: temp };
                      onChangeAi?.(node.node_id, newAiConfig);
                    }}
                    disabled={disabled}
                    className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag"
                    data-nodrag="true"
                  />
                  <div className="text-xs text-white/50 mt-1">From 0 (strict) to 2 (creative)</div>
                </div>
                {selectedProvider?.inputFields && selectedProvider.inputFields.length > 0 && (
                  <div>
                    <label className="text-xs text-white/70 block mb-2">Provider Settings</label>
                    {selectedProvider.inputFields.map(field => (
                      <div key={field.id} className="mb-2">
                        <label className="text-xs text-white/70 block mb-1">{field.label}</label>
                        <input
                          type="text"
                          value={(node.ai as any)?.[field.key] || ''}
                          onChange={(e) => {
                            const newAiConfig = { ...node.ai, [field.key]: e.target.value };
                            onChangeAi?.(node.node_id, newAiConfig);
                          }}
                          placeholder={field.placeholder}
                          disabled={disabled}
                          className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag"
                          data-nodrag="true"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeAiTab === 'routing' && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
                <div className="text-xs text-white/70">
                  <div className="mb-2">Output routing settings:</div>
                  <div className="text-white/50 text-[10px]">
                    Here you can configure input and output data types, 
                    number of I/O ports and processing rules.
                  </div>
                </div>
                {/* Placeholder for routing configuration */}
                <div className="p-2 bg-black/20 border border-white/5 rounded text-xs text-white/50 text-center">
                  Routing configuration will be added in future versions
                </div>
              </div>
            )}
          </>
        ) : !collapsed ? (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            minHeight: 0 
          }}>
            {node.type === 'html_editor' ? (
              // Rich Text Email Editor
              <div className="flex h-full flex-col gap-3">
                {/* Mode Toggle and Quick Actions in one row */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-white/70">Mode:</span>
                    {(['rich', 'code', 'preview'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => onChangeMeta(node.node_id, { editor_mode: mode })}
                        className={`px-2 py-1 rounded transition-colors ${
                          (node.meta?.editor_mode || 'preview') === mode
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-black/20 text-white/60 border border-white/10 hover:bg-white/5'
                        }`}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {mode === 'rich' ? '✉️' : mode === 'code' ? '💻' : '👁️'}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const template = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Template</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; line-height: 1.6; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Email Header</h1>
    </div>
    <div class="content">
      <p>Hello!</p>
      <p>This is an HTML email template. You can edit it in "Editor" mode or switch to "Code" mode for fine-tuning.</p>
      <p>Best regards,<br>Project Team</p>
    </div>
    <div class="footer">
      You received this email because you subscribed to updates.
    </div>
  </div>
</body>
</html>`;
                        handleContentChange(template);
                      }}
                      className="px-2 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors"
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Upload template"
                    >
                      📝
                    </button>
                    
                    <button
                      onClick={() => {
                        const htmlContent = contentValue;
                        const blob = new Blob([htmlContent], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `email-${Date.now()}.html`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-2 py-1 bg-green-500/20 text-green-300 border border-green-500/30 rounded hover:bg-green-500/30 transition-colors"
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Download HTML"
                    >
                      💾
                    </button>
                  </div>
                </div>

                {/* Editor Content */}
                {(() => {
                  const editorMode = (node.meta?.editor_mode as string) || 'preview';
                  
                  if (editorMode === 'rich') {
                    return (
                      <div 
                        className="flex-1 min-h-0"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        data-nodrag="true"
                      >
                        <RichTextEditor
                          value={contentValue}
                          onChange={handleContentChange}
                          onFocus={startContentEditing}
                          onBlur={finishContentEditing}
                          placeholder="Create a beautiful HTML email..."
                          disabled={disabled}
                          height={300}
                          mode="full"
                        />
                      </div>
                    );
                  } else if (editorMode === 'code') {
                      return (
                        <textarea
                          ref={contentInputRef}
                          value={contentValue}
                        onChange={(e) => handleContentChange(e.target.value)}
                        onFocus={(event) => {
                          event.stopPropagation();
                          startContentEditing(event.currentTarget);
                        }}
                        onBlur={(event) => {
                          event.stopPropagation();
                          finishContentEditing();
                        }}
                        placeholder="<!DOCTYPE html>\n<html>\n<head>\n  <title>Email</title>\n</head>\n<body>\n  <!-- Your email content -->\n</body>\n</html>"
                        disabled={disabled}
                        className="flex-1 p-3 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag font-mono"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        draggable={false}
                        data-nodrag="true"
                        style={{ 
                          height: '300px',
                          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                          lineHeight: '1.5',
                          tabSize: 2
                        }}
                      />
                    );
                  } else {
                    // Preview mode
                    return (
                      <div 
                        className="flex-1 p-3 bg-black/20 border border-white/10 rounded text-sm overflow-auto"
                        style={{ height: '300px' }}
                      >
                        <div 
                          className="bg-white text-black p-4 rounded"
                          dangerouslySetInnerHTML={{ __html: contentValue }}
                        />
                      </div>
                    );
                  }
                })() as React.ReactNode}
              </div>
            ) : node.type === 'html' ? (
              renderHtmlNode()
            ) : node.type === 'image' ? (
              <div className="flex flex-col h-full">
                <div
                  className="flex items-center gap-1 px-2 overflow-x-hidden flex-nowrap flex-shrink-0"
                  style={{ height: `${NODE_TOOLBAR_HEIGHT}px` }}
                  data-nodrag="true"
                >
                  <button
                    type="button"
                    onClick={handleImageUpload}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} border-emerald-400/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40 disabled:hover:bg-emerald-500/20 disabled:hover:text-emerald-100/70`}
                    title="Upload file"
                    aria-label="Upload file"
                    disabled={disabled}
                    data-nodrag="true"
                  >
                    ⬆️
                  </button>
                  <button
                    type="button"
                    onClick={handleImageUrlInput}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} border-blue-400/50 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 disabled:opacity-40 disabled:hover:bg-blue-500/20 disabled:hover:text-blue-100/70`}
                    title="Upload from URL"
                    aria-label="Upload from URL"
                    disabled={disabled}
                    data-nodrag="true"
                  >
                    🔗
                  </button>
                  <button
                    type="button"
                    onClick={handleImageDownload}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} ${toolbarButtonInactiveClasses}`}
                    title="Download selected version"
                    aria-label="Download selected version"
                    disabled={disabled || (!editedImage && !originalImage)}
                    data-nodrag="true"
                  >
                    ⬇️
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToContentSize}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} border-purple-400/60 bg-purple-500/20 text-purple-100 hover:bg-purple-500/30 disabled:opacity-40 disabled:hover:bg-purple-500/20 disabled:hover:text-purple-100/70`}
                    title="Fit size to content"
                    aria-label="Fit size to content"
                    disabled={
                      disabled || !node.meta?.natural_width || !node.meta?.natural_height
                    }
                    data-nodrag="true"
                  >
                    ⟲
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenCropModal}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} border-amber-400/70 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 disabled:opacity-40 disabled:hover:bg-amber-500/20 disabled:hover:text-amber-100/70`}
                    title="Extract frame"
                    aria-label="Extract frame"
                    disabled={disabled || !canCropImage || isPreparingCrop || isSavingCropNode}
                    data-nodrag="true"
                  >
                    🎞️
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={handleEnterImageAnnotationMode}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} ${
                      imageViewMode === 'edit'
                        ? 'border-amber-400/70 bg-amber-500/25 text-amber-50 shadow-inner shadow-amber-500/30 disabled:opacity-40 disabled:hover:bg-amber-500/25 disabled:hover:text-amber-50/70'
                        : toolbarButtonInactiveClasses
                    }`}
                    title="Annotation mode"
                    aria-label="Annotation mode"
                    disabled={disabled || !hasOriginalImage}
                    data-nodrag="true"
                    aria-pressed={imageViewMode === 'edit'}
                  >
                    ✏️
                  </button>
                  <div className="h-6 w-px flex-shrink-0 rounded-full bg-white/10" />
                  <button
                    type="button"
                    onClick={handleSelectOriginalImageView}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} ${
                      effectiveImageOutput === 'original'
                        ? 'border-sky-400/70 bg-sky-500/25 text-sky-100 shadow-inner shadow-sky-500/30 disabled:opacity-40 disabled:hover:bg-sky-500/25 disabled:hover:text-sky-100/70'
                        : toolbarButtonInactiveClasses
                    }`}
                    title="View original image"
                    aria-label="View original image"
                    disabled={disabled || !hasOriginalImage}
                    data-nodrag="true"
                    aria-pressed={effectiveImageOutput === 'original'}
                  >
                    👁️
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectEditedImageView}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} ${
                      effectiveImageOutput === 'annotated'
                        ? 'border-purple-400/70 bg-purple-500/25 text-purple-50 shadow-inner shadow-purple-500/30 disabled:opacity-40 disabled:hover:bg-purple-500/25 disabled:hover:text-purple-50/70'
                        : toolbarButtonInactiveClasses
                    }`}
                    title="View edited image"
                    aria-label="View edited image"
                    disabled={disabled || !hasEditedVersion}
                    data-nodrag="true"
                    aria-pressed={effectiveImageOutput === 'annotated'}
                  >
                    ✨
                  </button>
                </div>
                {imageToolbarError ? (
                  <div className="px-2 pt-1 text-[11px] text-rose-300">{imageToolbarError}</div>
                ) : null}
                {/* Content area - image fills width edge-to-edge, notes below */}
                <div
                  className="flex-1 min-h-0 flex flex-col"
                  style={{
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {/* Image viewport - shrinks to fit image, not flex-1 */}
                  <div className="flex-shrink-0">
                    {imageViewMode === 'edit' ? (
                      <ImageAnnotationEditor
                        ref={imageEditorRef}
                        key={`${node.node_id}-${imageEditorSession}`}
                        originalImage={originalImage}
                        annotatedImage={editedImage}
                        viewMode={imageViewMode}
                        sessionKey={imageEditorSession}
                        viewportMinHeight={IMAGE_VIEWPORT_MIN_HEIGHT}
                        hasEditedImage={hasEditedVersion}
                        onExport={(dataUrl) => {
                          pendingImageModeRef.current = true;
                          onChangeMeta(node.node_id, {
                            image_edited: dataUrl,
                            edited_image: dataUrl,
                            annotated_image: dataUrl,
                            view_mode: 'annotated',
                            image_output_mode: 'annotated',
                          });
                          setImageOutputMode('annotated');
                          setImageEditorSession((prev) => prev + 1);
                        }}
                        onReset={() => {
                          if (originalImage) {
                            pendingImageModeRef.current = false;
                            onChangeMeta(node.node_id, {
                              image_edited: originalImage,
                              edited_image: originalImage,
                              annotated_image: originalImage,
                            });
                            setImageEditorSession((prev) => prev + 1);
                          }
                        }}
                        disabled={disabled}
                      />
                    ) : (
                      <div
                        ref={imageViewportRef}
                        style={{
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        {(() => {
                          const previewSource =
                            imageViewMode === 'original'
                              ? originalImage
                              : editedImage || originalImage;
                          if (!previewSource) {
                            return (
                              <div className="px-4 py-8 text-center text-sm text-white/60">
                                Upload an image to see preview
                              </div>
                            );
                          }
                          return (
                            <img
                              src={previewSource}
                              alt={
                                imageViewMode === 'annotated'
                                  ? 'Edited image'
                                  : 'Original image'
                              }
                              style={{
                                width: '100%',
                                height: 'auto',
                                objectFit: 'cover',
                                objectPosition: 'top center',
                                display: 'block',
                              }}
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                if (img.naturalWidth && img.naturalHeight) {
                                  handleImageLoad(img);
                                }
                              }}
                            />
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  {/* Notes area - fills remaining space below image */}
                  <div className="flex-1 min-h-0 px-2 pb-2 pt-2 flex flex-col">
                    <textarea
                      value={imageNotes}
                      onChange={(event) => handleImageNotesChange(event.target.value)}
                      onFocus={handleImageNotesFocus}
                      onBlur={handleImageNotesBlur}
                      placeholder="Write what's important to remember when working with this image..."
                      className="w-full flex-1 resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
                      style={{
                        minHeight: `${IMAGE_NOTES_MIN_HEIGHT}px`,
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      disabled={disabled}
                      data-nodrag="true"
                    />
                  </div>
                </div>
              </div>
            ) : node.type === 'video' ? (
              <div className="flex flex-col h-full">
                <div
                  className="flex items-center gap-1 px-2 overflow-visible flex-nowrap flex-shrink-0"
                  style={{ height: `${NODE_TOOLBAR_HEIGHT}px` }}
                >
                  <button
                    type="button"
                    onClick={handleVideoUpload}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-green-500/40 bg-green-500/20 text-green-200 transition-colors hover:bg-green-500/30 text-[11px]"
                    title="Upload video file"
                    disabled={disabled}
                    data-nodrag="true"
                  >
                    📁
                  </button>
                  <button
                    type="button"
                    onClick={handleVideoUrlInput}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-blue-500/40 bg-blue-500/20 text-blue-200 transition-colors hover:bg-blue-500/30 text-[11px]"
                    title="Upload from URL"
                    disabled={disabled}
                    data-nodrag="true"
                  >
                    🔗
                  </button>
                  <button
                    type="button"
                    onClick={handleVideoDownload}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/20 text-white/60 transition-colors hover:bg-white/10 text-[11px]"
                    title="Download current video"
                    disabled={disabled || !videoSource}
                    data-nodrag="true"
                  >
                    ⬇️
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowVideoFrameExtractModal(true);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 transition-colors hover:bg-emerald-500/30 text-[11px]"
                    title="Extract frame"
                    disabled={disabled || !videoSource || isPreparingVideoCrop}
                    data-nodrag="true"
                  >
                    🎬
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowVideoTrimModal(true);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-sky-500/40 bg-sky-500/20 text-sky-200 transition-colors hover:bg-sky-500/30 text-[11px]"
                    title="Trim video"
                    disabled={disabled || !videoSource || isPreparingVideoCrop}
                    data-nodrag="true"
                  >
                    ⏱️
                  </button>
                  <div className="flex-1" />
                  <label className="flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">
                    Scale
                    <select
                      value={String(videoScale)}
                      onChange={(event) => {
                        const nextScale = Number(event.target.value);
                        if (!Number.isFinite(nextScale) || nextScale <= 0) {
                          return;
                        }
                        onChangeMeta(node.node_id, { video_scale: nextScale });
                      }}
                      className="rounded bg-black/40 px-2 py-1 text-[11px] text-white focus:outline-none"
                      onMouseDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      data-nodrag="true"
                      disabled={disabled || !videoSource}
                    >
                      {VIDEO_SCALE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}x
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">
                    <input
                      type="checkbox"
                      checked={videoControlsEnabled}
                      onChange={(event) => onChangeMeta(node.node_id, { controls: event.target.checked })}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="accent-blue-500"
                      disabled={disabled || !videoSource}
                      data-nodrag="true"
                    />
                    Controls
                  </label>
                </div>

                <div className="flex-1 min-h-0 flex flex-col gap-3 pt-2">
                  <VideoPreview
                    key={`${node.node_id}-${videoPreviewReloadToken}`}
                    source={videoSource}
                    controls={videoControlsEnabled}
                    scale={videoScale}
                    onRetry={handleVideoRetry}
                    onDimensionsChange={handleVideoDimensions}
                    className="flex-shrink-0"
                  />

                  <div className="flex-1 flex flex-col">
                    <textarea
                      value={videoNotes}
                      onChange={(event) => handleVideoNotesChange(event.target.value)}
                      placeholder="Write what's important to remember when working with this video..."
                      className="flex-1 w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
                      style={{ minHeight: VIDEO_NOTES_MIN_HEIGHT }}
                      onMouseDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      disabled={disabled}
                      data-nodrag="true"
                    />
                  </div>
                </div>
              </div>
            ) : node.type === 'folder' ? (
              <div className="flex flex-col h-full">
                {/* Folder controls and drop zone - fixed at top */}
                <div className="flex-shrink-0 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2" />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 rounded border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/70">
                      Context
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={folderContextLimit}
                        onChange={(event) => handleFolderContextLimitChange(Number(event.target.value))}
                        onClick={(event) => event.stopPropagation()}
                        className="w-12 rounded bg-black/30 px-1 py-0.5 text-center text-white/80 focus:outline-none"
                        disabled={disabled}
                      />
                    </label>
                    <div className="flex overflow-hidden rounded border border-white/15 bg-black/20 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handleFolderDisplayChange('list')}
                        className={`px-2 py-1 transition ${
                          folderDisplayMode === 'list'
                            ? 'bg-white/20 text-white'
                            : 'text-white/60 hover:bg-white/10'
                        }`}
                        disabled={disabled}
                      >
                        ☰
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFolderDisplayChange('grid')}
                        className={`px-2 py-1 transition ${
                          folderDisplayMode === 'grid'
                            ? 'bg-white/20 text-white'
                            : 'text-white/60 hover:bg-white/10'
                        }`}
                        disabled={disabled}
                      >
                        ▦
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  data-folder-drop-zone={node.node_id}
                  onDragEnter={handleFolderDropZoneDragEnter}
                  onDragOver={handleFolderDropZoneDragOver}
                  onDragLeave={handleFolderDropZoneDragLeave}
                  onDrop={handleFolderDropZoneDrop}
                  className={`rounded-lg border border-dashed transition-colors ${
                    isFolderDropActive
                      ? 'border-emerald-400/70 bg-emerald-500/10 text-white/80 shadow-inner shadow-emerald-500/20'
                      : 'border-white/20 bg-black/10 text-white/60'
                  } ${folderChildNodes.length === 0 ? 'py-8' : 'py-3'} px-3`}
                >
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span>📥</span>
                    <span>Drag nodes or files to this area</span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/50">
                    Images and <span className="font-mono text-xs text-white/70">.txt</span> files up to 5000 characters will be added to the folder.
                  </div>
                  {folderChildNodes.length === 0 && (
                    <div className="mt-3 text-[11px] text-white/45">
                      Nested nodes will appear here. You can also use the ↗ button on a node to return it to the canvas.
                    </div>
                  )}
                </div>

                {/* Import feedback notification */}
                {folderImportMessage && (
                  <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-200 animate-pulse">
                    {folderImportMessage}
                  </div>
                )}

                {/* Folder children nodes - dynamic height up to 1200px */}
                {folderChildNodes.length === 0 ? null : (
                  <div className="flex-shrink-0">
                    {folderDisplayMode === 'grid' ? (
                      <div className="overflow-y-auto pr-1" style={{ maxHeight: '1200px' }}>
                        <div className="grid gap-3 sm:grid-cols-2">
                        {folderChildNodes.map((child) => {
                      const icon = TYPE_ICONS[child.type] ?? '🧩';
                      const previewImage = getChildImagePreview(child);
                      const previewText = getChildPreviewText(child);
                      const title = child.title || child.node_id;
                      const parentFolderId = node.node_id; // Explicitly capture folder ID
                      
                      console.log('[Folder Grid Item]', {
                        folderNode: parentFolderId,
                        folderType: node.type,
                        childNode: child.node_id,
                        childType: child.type,
                      });

                      return (
                        <div
                          key={child.node_id}
                          className="group relative flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-white/40"
                          draggable={!disabled}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            event.dataTransfer.setData(
                              'application/mwf-folder-node',
                              JSON.stringify({ node_id: child.node_id, folder_id: node.node_id }),
                            );
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(event) => event.stopPropagation()}
                          data-nodrag="true"
                        >
                          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30 aspect-square">
                            {previewImage ? (
                              <img
                                src={previewImage}
                                alt={title}
                                className="h-full w-full object-cover"
                                draggable={false}
                                onError={(e) => {
                                  console.error('[Folder Grid] Image failed to load:', {
                                    src: previewImage,
                                    childId: child.node_id,
                                    childType: child.type,
                                  });
                                  // Hide broken image
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                                onLoad={() => {
                                  console.log('[Folder Grid] Image loaded successfully:', previewImage);
                                }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-3xl text-white/50">
                                {icon}
                              </div>
                            )}
                            <button
                              type="button"
                              className="absolute top-2 right-2 rounded-full border border-white/30 bg-black/60 px-2 py-1 text-[11px] text-white/80 opacity-0 transition group-hover:opacity-100"
                              onClick={() => {
                                console.log('[FlowNodeCard] Removing from folder (grid):', {
                                  childId: child.node_id,
                                  childType: child.type,
                                  folderId: parentFolderId,
                                  folderType: node.type,
                                  callingWith: `onRemoveNodeFromFolder(${child.node_id}, ${parentFolderId})`,
                                });
                                onRemoveNodeFromFolder?.(child.node_id, parentFolderId);
                              }}
                              disabled={!onRemoveNodeFromFolder || disabled}
                              title="Return to canvas"
                            >
                              ↗
                            </button>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-white/80" title={title}>
                              <span className="text-base">{icon}</span>
                              <span className="truncate">{title}</span>
                            </div>
                            {previewText && (
                              <div className="text-[11px] text-white/60 line-clamp-2">
                                {previewText}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-y-auto space-y-1 pr-1" style={{ maxHeight: '1200px' }}>
                        {folderChildNodes.map((child) => {
                      const icon = TYPE_ICONS[child.type] ?? '🧩';
                      const previewImage = getChildImagePreview(child);
                      const previewText = getChildPreviewText(child);
                      const title = child.title || child.node_id;
                      const parentFolderId = node.node_id; // Explicitly capture folder ID

                      return (
                        <div
                          key={child.node_id}
                          className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-2 hover:border-white/30"
                          draggable={!disabled}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            event.dataTransfer.setData(
                              'application/mwf-folder-node',
                              JSON.stringify({ node_id: child.node_id, folder_id: node.node_id }),
                            );
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(event) => event.stopPropagation()}
                          data-nodrag="true"
                        >
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-white/10 bg-black/30">
                            {previewImage ? (
                              <img src={previewImage} alt={title} className="h-full w-full object-cover" draggable={false} />
                            ) : (
                              <span className="text-xl text-white/50">{icon}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-white/80" title={title}>
                              <span className="text-base">{icon}</span>
                              <span className="truncate">{title}</span>
                            </div>
                            {previewText && (
                              <div className="truncate text-[11px] text-white/60" title={previewText}>
                                {previewText}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="rounded border border-white/20 bg-black/30 px-2 py-1 text-[11px] text-white/70 hover:border-white/40 hover:text-white"
                            onClick={() => {
                              console.log('[FlowNodeCard] Removing from folder (list):', {
                                childId: child.node_id,
                                childType: child.type,
                                folderId: parentFolderId,
                                folderType: node.type,
                              });
                              onRemoveNodeFromFolder?.(child.node_id, parentFolderId);
                            }}
                            disabled={!onRemoveNodeFromFolder || disabled}
                            title="Return to canvas"
                          >
                            ↗
                          </button>
                        </div>
                      );
                    })}
                      </div>
                    )}
                  </div>
                )}
                </div>

                {/* Folder notes - expandable */}
                <div className="flex-1 flex flex-col" style={{ minHeight: FOLDER_NOTES_MIN_HEIGHT }}>
                  <textarea
                    value={folderFileNotes}
                    onChange={(e) => handleFolderFileNotesChange(e.target.value)}
                    onFocus={handleFolderFileNotesFocus}
                    onBlur={handleFolderFileNotesBlur}
                    placeholder="Write what's important to remember when working with this folder..."
                    disabled={disabled}
                    className="flex-1 w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
                    style={{ minHeight: FOLDER_NOTES_MIN_HEIGHT }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    draggable={false}
                    data-nodrag="true"
                  />
                </div>
              </div>
            ) : node.type === 'file' ? (
              // File node content
              <div className="flex flex-col h-full">
                <div className="flex-shrink-0 space-y-3">
                {/* File Preview */}
                {(() => {
                  const attachments = (node.meta?.attachments as string[]) || [];
                  const fileData = node.meta?.file_data;
                  const fileName = node.meta?.file_name as string | undefined;
                  
                  const hasFiles = attachments.length > 0 || fileName;
                  
                  return hasFiles ? (
                    <div className="space-y-2">
                      <div className="text-xs text-white/70 mb-2">Attached files:</div>
                      {/* Display attachments */}
                      {attachments.map((file: string, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/10">
                          <div className="flex items-center gap-2">
                            <span className="text-base">📎</span>
                            <span className="text-sm text-white/80 truncate max-w-48">{file}</span>
                          </div>
                          <button
                            onClick={() => {
                              const newAttachments = attachments.filter((_, i) => i !== index);
                              onChangeMeta(node.node_id, { attachments: newAttachments });
                            }}
                            className="text-red-400 hover:text-red-300 text-xs ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      
                      {/* Display main file if exists */}
                      {fileName && (
                        <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/10">
                          <div className="flex items-center gap-2">
                            <span className="text-base">📄</span>
                            <span className="text-sm text-white/80 truncate max-w-48">{fileName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {typeof node.meta?.file_size === 'number' && (
                              <span className="text-xs text-white/50">
                                {((node.meta.file_size as number) / 1024 / 1024).toFixed(1)} MB
                              </span>
                            )}
                            {fileData && (
                              <button
                                onClick={() => handleFileDownload(fileName, fileData as string | ArrayBuffer)}
                                className="text-blue-400 hover:text-blue-300 text-xs ml-1"
                                title="Download file"
                              >
                                ⬇️
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-center py-6 text-white/50 text-sm border border-dashed border-white/20 rounded">
                        📁 No attached files
                      </div>
                      
                      {/* Upload button */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.multiple = true;
                            input.onchange = (e) => {
                              const files = Array.from((e.target as HTMLInputElement).files || []);
                              if (files.length > 0) {
                                setIsFileUploading(true);
                                files.forEach((file, index) => {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const fileData = event.target?.result as string;
                                    
                                    if (index === 0) {
                                      // First file goes to main file data
                                      onChangeMeta(node.node_id, {
                                        file_name: file.name,
                                        file_data: fileData,
                                        file_size: file.size,
                                        file_type: file.type,
                                      });
                                      autoRenameFromSource(file.name);
                                    } else {
                                      // Additional files go to attachments
                                      const currentAttachments = (node.meta?.attachments as string[]) || [];
                                      onChangeMeta(node.node_id, {
                                        attachments: [...currentAttachments, file.name]
                                      });
                                    }
                                    
                                    console.log('📁 File uploaded:', file.name);
                                    
                                    // Reset uploading state after last file
                                    if (index === files.length - 1) {
                                      setIsFileUploading(false);
                                    }
                                  };
                                  reader.onerror = () => {
                                    console.error('Error reading file:', file.name);
                                    setIsFileUploading(false);
                                  };
                                  reader.readAsDataURL(file);
                                });
                              }
                            };
                            input.click();
                          }}
                          className="px-3 py-2 text-sm rounded bg-green-600/30 text-green-200 hover:bg-green-600/50 transition flex-1"
                          disabled={isFileUploading}
                        >
                          📁 {isFileUploading ? 'Uploading...' : 'Upload files'}
                        </button>
                      </div>
                    </div>
                  );
                })() as React.ReactNode}
                </div>

                {/* File notes - expandable */}
                <div className="flex-1 flex flex-col" style={{ minHeight: FILE_NOTES_MIN_HEIGHT }}>
                  <textarea
                    value={folderFileNotes}
                    onChange={(e) => handleFolderFileNotesChange(e.target.value)}
                    onFocus={handleFolderFileNotesFocus}
                    onBlur={handleFolderFileNotesBlur}
                    placeholder="Write what's important to remember when working with these files..."
                    disabled={disabled}
                    className="flex-1 w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
                    style={{ minHeight: FILE_NOTES_MIN_HEIGHT }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    draggable={false}
                    data-nodrag="true"
                  />
                </div>
              </div>
            ) : node.type === 'pdf' ? (
              // PDF node content - simplified viewer only (header + viewer + footer)
              <div className="flex flex-col h-full">
                {(() => {
                  const pdfUrl = node.meta?.pdf_url as string | undefined;
                  const pdfFile = node.meta?.pdf_file;
                  const pdfData = node.meta?.pdf_data as string | undefined;
                  const viewerSrc = pdfUrl || pdfData;
                  
                  return viewerSrc ? (
                    // PDF Viewer taking full available space
                    <iframe
                      src={viewerSrc}
                      className="w-full flex-1 border-0"
                      title="PDF Viewer"
                      style={{ minHeight: '300px' }}
                    />
                  ) : (
                    // Upload/URL input when no PDF
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                      <div className="text-center py-6 text-white/50 text-sm">
                        📄 PDF Viewer
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const url = prompt('Enter PDF file URL:');
                          if (url) {
                        onChangeMeta(node.node_id, { pdf_url: url, pdf_file: null, pdf_data: null });
                        autoRenameFromSource(url);
                      }
                          }}
                          className="px-3 py-2 text-sm rounded bg-blue-600/30 text-blue-200 hover:bg-blue-600/50 transition"
                        >
                          🔗 URL
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.pdf,application/pdf';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const pdfData = event.target?.result as string;
                                  onChangeMeta(node.node_id, {
                                    pdf_file: file.name,
                                    pdf_data: pdfData,
                                    pdf_url: null
                                  });
                                  autoRenameFromSource(file.name);
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                          className="px-3 py-2 text-sm rounded bg-green-600/30 text-green-200 hover:bg-green-600/50 transition"
                        >
                          📁 File
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : isTextualNode ? (
              <div className="flex h-full flex-col gap-2">
                <div className="relative flex flex-wrap items-center gap-1" data-nodrag="true">
                  <button
                    type="button"
                    onClick={() => handleSetTextViewMode('edit')}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} ${
                      textViewMode === 'edit'
                        ? 'border-blue-500/50 bg-blue-500/25 text-blue-100 shadow-inner shadow-blue-500/30'
                        : toolbarButtonInactiveClasses
                    }`}
                    aria-label="Edit mode"
                    title="Edit mode"
                    disabled={disabled}
                    aria-pressed={textViewMode === 'edit'}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetTextViewMode('preview')}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`${toolbarButtonBaseClasses} ${
                      textViewMode === 'preview'
                        ? 'border-sky-500/50 bg-sky-500/25 text-sky-100 shadow-inner shadow-sky-500/30'
                        : toolbarButtonInactiveClasses
                    }`}
                    aria-label="Preview mode"
                    title="Preview mode"
                    disabled={disabled}
                    aria-pressed={textViewMode === 'preview'}
                  >
                    👁️
                  </button>
                  <div className="relative">
                    <button
                      ref={textSplitterButtonRef}
                      type="button"
                      onClick={() => {
                        setIsTextSplitterOpen((prev) => !prev);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      className={`${toolbarButtonBaseClasses} border-emerald-500/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30`}
                      aria-expanded={isTextSplitterOpen}
                      aria-label="Split into nodes"
                      title="Split into nodes"
                      disabled={disabled}
                    >
                      /
                    </button>
                  </div>
                  <select
                    value={textFontSizeSelectValue}
                    onChange={handleTextFontSizeChange}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="h-6 rounded border border-white/15 bg-black/30 px-1 text-[10px] text-white/80 focus:border-emerald-400 focus:outline-none"
                    title="Font size"
                    disabled={disabled}
                  >
                    {TEXT_FONT_SIZE_PRESETS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      const markdownContent = contentValue;
                      const blob = new Blob([markdownContent], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `document-${Date.now()}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className={`${toolbarButtonBaseClasses} bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30`}
                    onPointerDown={(event) => event.stopPropagation()}
                    title="Download Markdown"
                    disabled={disabled}
                  >
                    💾
                  </button>
                </div>

                {textViewMode === 'preview' ? (
                  <div
                    className="flex flex-1 flex-col min-h-0 rounded-lg border p-4 text-sm text-white/90 shadow-inner"
                    style={{
                      ...markdownPreviewContainerStyle,
                      boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.35)',
                    }}
                  >
                    <div
                      className="flex-1 overflow-auto"
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        fontSize: contentFontSizeStyle ?? '13px',
                      }}
                    >
                      <MarkdownRenderer content={contentValue} settings={markdownPreviewSettings} />
                    </div>
                  </div>
                ) : (
                  <textarea
                    ref={contentInputRef}
                    value={contentValue}
                    onChange={(event) => handleContentChange(event.target.value)}
                    onFocus={(event) => {
                      event.stopPropagation();
                      startContentEditing(event.currentTarget);
                    }}
                    onBlur={(event) => {
                      event.stopPropagation();
                      finishContentEditing();
                    }}
                    placeholder="Enter content..."
                    disabled={disabled}
                    className="flex-1 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/90 shadow-inner shadow-black/30 resize-none nodrag font-mono tracking-wide"
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerMove={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    draggable={false}
                    data-nodrag="true"
                    style={{
                      minHeight: '180px',
                      lineHeight: '1.45',
                      fontSize: contentFontSizeStyle ?? '13px',
                      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                )}
              </div>
            ) : node.type === 'table' ? (
              // Table node content
              <div className="flex h-full flex-col gap-3">
                {/* Upload/URL/Download buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.csv,text/csv';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const csvData = event.target?.result as string;
                            onChangeMeta(node.node_id, {
                              csv_file: file.name,
                              csv_data: csvData,
                              file_size: file.size,
                              file_type: file.type,
                              csv_url: '',
                              current_page: 1
                            });
                            autoRenameFromSource(file.name);
                            console.log('📊 CSV uploaded:', file.name);
                          };
                          reader.onerror = () => {
                            console.error('Error reading CSV file');
                          };
                          reader.readAsText(file);
                        }
                      };
                      input.click();
                    }}
                    className="px-3 py-2 text-sm rounded bg-green-600/30 text-green-200 hover:bg-green-600/50 transition flex-1"
                  >
                    📁 File
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const csvUrl = prompt('Enter CSV file URL:');
                      if (csvUrl) {
                        onChangeMeta(node.node_id, { 
                          csv_url: csvUrl,
                          csv_data: null,
                          csv_file: null,
                          current_page: 1
                        });
                        autoRenameFromSource(csvUrl);
                      }
                    }}
                    className="px-3 py-2 text-sm rounded bg-blue-600/30 text-blue-200 hover:blue-600/50 transition flex-1"
                  >
                    🔗 URL
                  </button>
                  {/* Download CSV button */}
                  {(node.meta?.csv_data || node.meta?.csv_url) && (
                    <button
                      type="button"
                      onClick={() => {
                        const csvData = node.meta?.csv_data as string;
                        if (csvData) {
                          const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                          const fileName = (node.meta?.csv_file as string) || 'table.csv';
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          link.download = fileName;
                          link.click();
                          URL.revokeObjectURL(link.href);
                        }
                      }}
                      className="px-3 py-2 text-sm rounded bg-orange-600/30 text-orange-200 hover:bg-orange-600/50 transition"
                      title="Download CSV"
                    >
                      💾
                    </button>
                  )}
                </div>

                {/* Table Display */}
                {(() => {
                  const csvUrl = node.meta?.csv_url as string;
                  const csvData = node.meta?.csv_data as string;
                  const hasHeader = (node.meta?.has_header as boolean) !== false;
                  const delimiter = (node.meta?.delimiter as string) || ',';
                  
                  if (csvData || csvUrl) {
                    // Parse CSV data
                    const parseCSV = (text: string) => {
                      const lines = text.split('\n').filter(line => line.trim());
                      return lines.map(line => line.split(delimiter).map(cell => cell.trim()));
                    };
                    
                    let rows: string[][] = [];
                    if (csvData) {
                      rows = parseCSV(csvData);
                    }
                    
                    return (
                      <div className="flex-1 bg-black/20 border border-white/10 rounded overflow-auto">
                        {rows.length > 0 ? (
                          <table className="w-full text-xs">
                            {hasHeader && rows.length > 0 && (
                              <thead className="bg-white/5 sticky top-0">
                                <tr>
                                  {rows[0].map((header, index) => (
                                    <th key={index} className="px-2 py-1 text-left text-white/80 border-b border-white/10">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                            )}
                            <tbody>
                              {(hasHeader ? rows.slice(1) : rows).slice(0, 50).map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-white/5">
                                  {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="px-2 py-1 text-white/90 border-b border-white/5">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : csvUrl ? (
                          <div className="flex-1 flex items-center justify-center text-white/60 text-sm">
                            📊 Enter CSV file URL to load
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-white/60 text-sm">
                            📊 CSV data not found
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    return (
                      <div className="flex-1 flex items-center justify-center text-white/50 text-sm border border-dashed border-white/20 rounded">
                        📊 Upload a CSV file or provide a link
                      </div>
                    );
                  }
                })() as React.ReactNode}
              </div>
            ) : (
              // Regular textarea for other node types
              <textarea
                ref={contentInputRef}
                value={contentValue}
                onChange={(e) => handleContentChange(e.target.value)}
                onFocus={(event) => {
                  event.stopPropagation();
                  startContentEditing(event.currentTarget);
                }}
                onBlur={(event) => {
                  event.stopPropagation();
                  finishContentEditing();
                }}
                placeholder="Enter content..."
                disabled={disabled}
                className="w-full bg-transparent border-none outline-none text-white/90 resize-none nodrag"
                onMouseDown={(e) => e.stopPropagation()} // Prevent node dragging when clicking in textarea
                onMouseMove={(e) => e.stopPropagation()} // Prevent node dragging during text selection
                onMouseUp={(e) => e.stopPropagation()}   // Prevent interference with text selection
                onPointerDown={(e) => e.stopPropagation()} // Prevent pointer events from bubbling
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()} // Prevent keyboard events from bubbling
                draggable={false} // Explicitly disable dragging
                data-nodrag="true" // Additional React Flow hint
                style={{ 
                  height: '100%',
                  minHeight: '80px',
                  overflow: 'auto',
                  resize: 'none',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(148, 163, 184, 0.5) transparent',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  fontSize: contentFontSizeStyle ?? '13px',
                  lineHeight: '1.4'
                }}
              />
            )}
          </div>
        ) : null}

      </div>

      <div 
        className="flow-node__footer"
        style={{
          backgroundColor: `${String(baseColor)}20`,
          borderTop: `1px solid ${String(baseColor)}30`,
          flexShrink: 0,
          height: node.type === 'image' && imageViewMode === 'edit' 
            ? `${NODE_FOOTER_HEIGHT_ANNOTATION}px` 
            : `${NODE_FOOTER_HEIGHT_NORMAL}px`,
          transition: 'height 0.2s ease',
        } as React.CSSProperties}
      >
        <div className="flex justify-between items-center w-full px-3 py-2 gap-3">
          {/* Show different info based on node type and collapsed state */}
          {collapsed ? (
            node.type === 'folder' ? (
              <>
                <div className="text-xs text-white/70 flex items-center gap-1">
                  <span>📂</span>
                  <span>Folder</span>
                </div>
                <div className="text-xs text-white/50">
                  {folderChildNodes.length} items • Context {folderContextLimit}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-white/70 flex items-center gap-2 truncate">
                  {node.type === 'video' ? (
                    <>
                      <span>{videoFooterInfo?.primaryIcon ?? '🎬'}</span>
                      <span className="truncate">{videoFooterInfo?.primaryLabel ?? 'Video'}</span>
                    </>
                  ) : (
                    <span>{node.type.toUpperCase()}</span>
                  )}
                </div>
                <div className="text-xs text-white/50 flex items-center gap-2 truncate">
                  {(() => {
                    if (node.type === 'image') {
                      const imageFile = node.meta?.image_file;
                      const imageUrl = node.meta?.image_url;
                      
                      if (imageFile && typeof imageFile === 'string') {
                        return (
                          <span className="truncate" title={imageFile}>
                            📄 {imageFile}
                          </span>
                        );
                      } else if (imageUrl && typeof imageUrl === 'string') {
                        return <span>🔗 URL</span>;
                      } else {
                        return <span>Not loaded</span>;
                      }
                    }
                    if (node.type === 'video') {
                      return videoFooterSecondaryNode ?? <span>Video not loaded</span>;
                    }
                    if (node.type === 'file') return <span>File</span>;
                    if (node.type === 'pdf') {
                      const pdfUrl = node.meta?.pdf_url;
                      const pdfFile = node.meta?.pdf_file;
                      if (pdfUrl || pdfFile) return <span>📄 PDF</span>;
                      return <span>PDF not loaded</span>;
                    }
                    if (node.type === 'markdown') {
                      const viewMode = node.meta?.view_mode || 'preview';
                      return (
                        <span>
                          📋 {viewMode === 'edit' ? 'Editor' : viewMode === 'preview' ? 'Preview' : 'Split'}
                        </span>
                      );
                    }
                    const chars = isAiNode ? aiCharacterCount : (node.content || '').length;
                    return <span>Chars {chars.toLocaleString()}</span>;
                  })()}
                </div>
              </>
            )
          ) : (
            node.type === 'folder' ? (
              <>
                <div className="text-xs text-white/70 flex items-center gap-1">
                  <span>📂</span>
                  <span>Folder</span>
                </div>
                <div className="text-xs text-white/50">
                  {folderChildNodes.length} items • Context {folderContextLimit}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-white/70 flex items-center gap-2 truncate">
                  <span className="flex items-center gap-2 truncate">
                    {(() => {
                      if (node.type === 'image') {
                        const imageFile = node.meta?.image_file;
                        const imageUrl = node.meta?.image_url;
                        if (imageFile && typeof imageFile === 'string') {
                          return (
                            <span className="truncate" title={imageFile}>
                              📄 {imageFile}
                            </span>
                          );
                        } else if (imageUrl && typeof imageUrl === 'string') {
                          try {
                            return (
                              <span title={imageUrl}>
                                🔗 {new URL(imageUrl).hostname}
                              </span>
                            );
                          } catch {
                            return <span title={imageUrl}>🔗 URL</span>;
                          }
                        } else {
                          return <span>Image not loaded</span>;
                        }
                      }
                      if (node.type === 'video') {
                        return (
                          <span className="flex items-center gap-2">
                            <span>{videoFooterInfo?.primaryIcon ?? '🎬'}</span>
                            <span className="text-white/60 whitespace-nowrap">
                              {formattedVideoFileSize ?? '—'}
                            </span>
                          </span>
                        );
                      }
                      if (node.type === 'file') return <span>Size: —</span>; // Placeholder for file weight
                      if (node.type === 'pdf') {
                        const pdfUrl = node.meta?.pdf_url as string | undefined;
                        const pdfFile = node.meta?.pdf_file;
                        const currentPage = node.meta?.current_page || 1;
                        const totalPages = node.meta?.total_pages || 0;
                        
                        if (pdfUrl) {
                          try {
                            const hostname = new URL(pdfUrl).hostname;
                            return (
                              <span>
                                📄 {hostname} • Page {currentPage}
                                {totalPages ? `/${totalPages}` : ''}
                              </span>
                            );
                          } catch {
                            return (
                              <span>
                                📄 PDF • Page {currentPage}
                                {totalPages ? `/${totalPages}` : ''}
                              </span>
                            );
                          }
                        } else if (pdfFile) {
                          return (
                            <span>
                              📄 File • Page {currentPage}
                              {totalPages ? `/${totalPages}` : ''}
                            </span>
                          );
                        } else {
                          return <span>📄 PDF not loaded</span>;
                        }
                      }
                      if (node.type === 'markdown') {
                        const viewMode = node.meta?.view_mode || 'preview';
                        const lines = (node.content || '').split('\n').length;
                        return (
                          <span>
                            📋 {viewMode === 'edit' ? 'Editor' : viewMode === 'preview' ? 'Preview' : 'Split'} • {lines}{' '}
                            lines
                          </span>
                        );
                      }
                      return (
                        <span>
                          {isAiNode && node.ai?.model ? (
                            <>
                              {getModelType(node.ai.model as string).emoji}{' '}
                              {getModelType(node.ai.model as string).type}
                            </>
                          ) : (
                            <>Chars {(isAiNode ? aiCharacterCount : (node.content || '').length).toLocaleString()}</>
                          )}
                        </span>
                      );
                    })()}
                  </span>
                  {isAiNode && currentProviderLabel && (
                    <span className="text-white/60 flex items-center gap-1">
                      <span className="text-white/70">{currentProviderLabel}</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-white/50 flex items-center gap-2 truncate">
                  {(() => {
                    if (node.type === 'video') {
                      return (
                        <span className="flex items-center gap-2 truncate pl-[30px]">
                          {videoFooterSecondaryNode ?? <span>Source not set</span>}
                        </span>
                      );
                    }
                    if (node.type === 'image') {
                      const imageUrl = node.meta?.image_url;
                      if (imageUrl && typeof imageUrl === 'string') {
                        try {
                          return (
                            <span className="truncate" title={imageUrl}>
                              {new URL(imageUrl).hostname}
                            </span>
                          );
                        } catch {
                          return (
                            <span className="truncate" title={imageUrl}>
                              {imageUrl}
                            </span>
                          );
                        }
                      }
                      const imageFile = node.meta?.image_file;
                      if (imageFile && typeof imageFile === 'string') {
                        return (
                          <span className="truncate" title={imageFile}>
                            {imageFile}
                          </span>
                        );
                      }
                      return <span>Source not set</span>;
                    }
                    if (node.type === 'markdown') {
                      const chars = (node.content || '').length;
                      return <span>Chars {chars.toLocaleString()}</span>;
                    }
                    if (node.type === 'pdf') {
                      return <span>Click to open PDF settings</span>;
                    }
                    if (node.type === 'file') {
                      const fileName = node.meta?.file_name;
                      return fileName ? <span className="truncate">{fileName as string}</span> : <span>No file selected</span>;
                    }
                    const chars = isAiNode ? aiCharacterCount : (node.content || '').length;
                    return <span>Chars {chars.toLocaleString()}</span>;
                  })()}
                </div>
              </>
            )
          )}
        </div>
      </div>

      {/* Connection Handles - Auto ports if AI node with auto_ports, otherwise standard */}
      {isAiNode && node.ai?.auto_ports && node.ai.auto_ports.length > 0 ? (
        <>
          {/* Main context handle - always present */}
          <Handle
            type="target"
            position={Position.Left}
            id="context"
            isConnectable={true}
            className="flow-node__handle flow-node__handle--target"
            style={{ 
              background: '#3b82f6',
              border: '2px solid #fff',
              width: 14,
              height: 14,
              top: '60px',
              left: -7,
              zIndex: 10,
            }}
            title="Context - main input for prompt"
          />
          
          {/* Render auto-generated ports BELOW context - ALL ports on the left, EXCEPT "prompt" */}
          {node.ai.auto_ports
            .filter(port => port.id !== 'prompt') // ← EXCLUDE prompt
            .map((port, index) => {
              // Check if port is invalid (has connections but not supported by model)
              const invalidPortsList = (node.meta?.invalid_ports_with_edges || []) as string[];
              const isInvalidPort = invalidPortsList.includes(port.id);
              
              return (
                <Handle
                  key={port.id}
                  type="target"
                  position={Position.Left}
                  id={port.id}
                  isConnectable={true}
                  className="flow-node__handle flow-node__handle--target"
                  style={{ 
                    background: port.required ? '#ef4444' : '#3b82f6',
                    border: isInvalidPort ? '3px solid #ef4444' : '2px solid #fff', // Red border for invalid ports
                    width: 14,
                    height: 14,
                    top: `${95 + index * 35}px`,
                    left: -7,
                    zIndex: 10,
                    boxShadow: isInvalidPort ? '0 0 0 2px rgba(239, 68, 68, 0.3)' : undefined, // Additional glow effect
                  }}
                  title={isInvalidPort ? `⚠️ ${port.label} - port is no longer supported by the current model but has connections. Switch to another port.` : `${port.label}${port.required ? ' (required)' : ''}`}
                />
              );
            })
          }
          
          {/* Port labels layer - ABOVE all content */}
          <div 
            className="port-labels-layer" 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {/* Label for main context port */}
            <span 
              className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap"
              style={{ 
                position: 'absolute',
                right: 'calc(100% + 15px)',
                top: '75px',
                transform: 'translateY(-50%)',
                whiteSpace: 'nowrap',
                textAlign: 'right',
                color: 'rgba(226, 232, 240, 0.75)',
                border: '1px solid rgba(148, 163, 184, 0.08)',
                backgroundColor: 'rgba(15, 23, 42, 0.34)',
              }}
            >
              context
            </span>
            
            {/* Labels for auto ports - all on the left, EXCEPT "prompt" */}
            {node.ai.auto_ports
              .filter(port => port.id !== 'prompt') // ← EXCLUDE prompt
              .map((port, index) => (
              <span 
                key={`label-${port.id}`}
                className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap"
                style={{ 
                  position: 'absolute',
                  right: 'calc(100% + 15px)',
                  top: `${110 + index * 35}px`,
                  transform: 'translateY(-50%)',
                  whiteSpace: 'nowrap',
                  textAlign: 'right',
                  color: 'rgba(226, 232, 240, 0.75)',
                  border: '1px solid rgba(148, 163, 184, 0.08)',
                  backgroundColor: 'rgba(15, 23, 42, 0.34)',
                }}
              >
                {port.label}
                {port.required && <span className="text-red-400 ml-1">*</span>}
              </span>
            ))}
          </div>
        </>
      ) : (
        <Handle
          type="target"
          position={Position.Left}
          id="context"
          className="flow-node__handle flow-node__handle--target"
          style={{ 
            background: '#3b82f6',
            border: '2px solid #fff',
            width: 14,
            height: 14,
            top: '60px',
            left: -7,
            zIndex: 10,
          }}
        />
      )}
      {/* Output handles */}
      {node.type === 'image' ? (
        <>
          <Handle
            id="image-original"
            type="source"
            position={Position.Right}
            className={`flow-node__handle flow-node__handle--source ${effectiveImageOutput === 'original' ? 'flow-node__handle--highlight' : ''}`}
            style={{
              background: '#38bdf8',
              border: '2px solid #fff',
              width: 14,
              height: 14,
              top: '60px',
              right: -7,
              zIndex: 10,
            }}
            title="Original image"
          />
          {hasEditedVersion ? (
            <Handle
              id="image-annotated"
              type="source"
              position={Position.Right}
              className={`flow-node__handle flow-node__handle--source ${effectiveImageOutput === 'annotated' ? 'flow-node__handle--highlight' : ''}`}
              style={{
                background: '#a855f7',
                border: '2px solid #fff',
                width: 14,
                height: 14,
                top: '96px',
                right: -7,
                zIndex: 10,
              }}
              title="Edited image"
            />
          ) : null}
          <div
            className="port-labels-layer"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {hasEditedVersion ? (
              <span
                className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap"
                style={{
                  position: 'absolute',
                  left: 'calc(100% + 15px)',
                  top: '60px',
                  transform: 'translateY(-50%)',
                  color: 'rgba(226, 232, 240, 0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                }}
              >
                Original
              </span>
            ) : null}
            {hasEditedVersion ? (
              <span
                className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap"
                  style={{
                    position: 'absolute',
                    left: 'calc(100% + 15px)',
                    top: '96px',
                    transform: 'translateY(-50%)',
                    color: 'rgba(226, 232, 240, 0.8)',
                    border: '1px solid rgba(148, 163, 184, 0.12)',
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  }}
                >
                  Edited
                </span>
              ) : null}
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="flow-node__handle flow-node__handle--source"
          style={{ 
            background: '#10b981',
            border: '2px solid #fff',
            width: 14,
            height: 14,
            top: '60px',
            right: -7,
            zIndex: 10,
          }}
        />
      )}

      {/* Resize Handle - hide for collapsed nodes */}
      {!collapsed && (
        <div
          className="flow-node__resize-handle nodrag nopan"
          onPointerDown={handleResizePointerDown}
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: '12px',
            height: '12px',
            cursor: 'nwse-resize',
            backgroundColor: isResizing ? 'rgba(17, 24, 39, 0.9)' : 'rgba(17, 24, 39, 0.7)',
            borderRadius: '2px',
            zIndex: 20,
            opacity: selected || isResizing ? 1 : 0.6,
            transition: isResizing ? 'none' : 'opacity 0.2s ease',
            pointerEvents: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.25)',
          }}
          title="Resize (drag to enlarge/shrink)"
        />
      )}
      
      {/* Node Settings Modal */}
      {showSettingsModal && (
        <NodeSettingsModal
          node={node}
          onClose={() => setShowSettingsModal(false)}
          onUpdateNodeMeta={onChangeMeta}
          loading={disabled}
        />
      )}

      {/* AI Settings Modal */}
      {showAiSettingsModal && (
        <AiSettingsModal
          key={`ai-settings-${node.node_id}`}
          node={node}
          onClose={() => setShowAiSettingsModal(false)}
          activeTab={activeAiModalTab}
          onTabChange={setActiveAiModalTab}
          onChangeAi={onChangeAi}
          onUpdateNodeMeta={onChangeMeta}
          providers={providers}
          loading={disabled}
          dynamicModels={dynamicModels}
          loadingModels={loadingModels}
          allNodes={allNodes}
          sources={sources}
          targets={targets}
          onRemoveInvalidPorts={handleRemoveInvalidPortsFromModal}
        />
      )}

      {/* File Warning Modal */}
      {showFileWarningModal && pendingProviderId && (
        <ProviderFileWarningModal
          isOpen={showFileWarningModal}
          onClose={handleCloseFileWarning}
          onContinue={handleContinueWithoutFiles}
          onSwitchProvider={handleSwitchToFileProvider}
          currentProvider={selectedProvider?.id || ''}
          suggestedProvider={providers.find(p => p.supportsFiles)?.id || 'google_workspace'}
          fileCount={getFileTypes().length}
          fileTypes={getFileTypes()}
        />
      )}

      {/* Agent Routing Editor */}
      {showRoutingEditor && node.type === 'ai' && (
        <AgentRoutingEditor
          config={(node.ai?.routing as AgentRoutingConfig) || DEFAULT_ROUTING_CONFIGS.universal}
          onChange={(newConfig) => {
            const newAiConfig = { ...node.ai, routing: newConfig };
            onChangeAi?.(node.node_id, newAiConfig);
          }}
          onClose={() => setShowRoutingEditor(false)}
        />
      )}

      {/* Agent Logs Modal */}
      {showLogsModal && node.type === 'ai' && (
        <AgentLogsModal
          nodeId={node.node_id}
          projectId={data.projectId || ''}
          onClose={() => setShowLogsModal(false)}
        />
      )}

      {/* URL Input Modal */}
      {showUrlModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowUrlModal(false);
            }
          }}
        >
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-medium text-white mb-4">Insert Image URL</h3>
            
            <input
              type="url"
              value={urlInputValue}
              onChange={(e) => setUrlInputValue(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChangeMeta(node.node_id, { 
                    image_url: urlInputValue,
                    image_data: null, // Clear file when setting URL
                    image_file: null,
                    file_size: null,
                    file_type: null
                  });
                  setShowUrlModal(false);
                } else if (e.key === 'Escape') {
                  setShowUrlModal(false);
                }
              }}
            />
            
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  onChangeMeta(node.node_id, { 
                    image_url: urlInputValue,
                    image_data: null, // Clear file when setting URL
                    image_file: null,
                    file_size: null,
                    file_type: null
                  });
                  setShowUrlModal(false);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition text-sm font-medium"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setShowUrlModal(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showHtmlSettingsModal && !disabled && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowHtmlSettingsModal(false);
            }
          }}
        >
          <div className="w-96 max-w-[90vw] rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">HTML Node Settings</h3>
              <button
                type="button"
                className="text-white/70 hover:text-white"
                onClick={() => setShowHtmlSettingsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs text-white/70 block mb-1">Screen Width</label>
                <select
                  value={screenWidth}
                  onChange={(e) => handleScreenWidthChange(e.target.value)}
                  className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:outline-none"
                  disabled={disabled}
                >
                  {SCREEN_WIDTHS.map((sw) => (
                    <option key={sw.id} value={sw.id}>
                      {sw.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/70 block mb-1">Width in Pixels</label>
                <input
                  type="number"
                  min={320}
                  max={3840}
                  value={htmlViewportWidth}
                  onChange={(e) => handleHtmlViewportWidthChange(Number(e.target.value))}
                  className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:outline-none"
                  disabled={disabled}
                />
              </div>
              <div>
                <label className="text-xs text-white/70 block mb-1">Output Type</label>
                <select
                  value={htmlOutputType}
                  onChange={(e) => handleHtmlOutputTypeChange(e.target.value as 'link' | 'image' | 'code')}
                  className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:outline-none"
                  disabled={disabled}
                >
                  <option value="link">Link</option>
                  <option value="image" disabled={!htmlScreenshot}>Image (screenshot)</option>
                  <option value="code">HTML Code</option>
                </select>
              </div>
            </div>
            <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
              <div>
                <div className="text-xs text-white/70 uppercase tracking-wide">Page</div>
                <div className="mt-2 text-sm text-white/80 break-all">{displayHtmlUrl}</div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20"
                    onClick={handleOpenHtmlUrl}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20"
                    onClick={handleCopyHtmlUrl}
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs text-white/70 uppercase tracking-wide">Screenshot</div>
                <div className="mt-2 text-sm text-white/80">
                  {htmlScreenshot ? `Saved: ${capturedAtLabel}` : 'Screenshot not yet captured'}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20 disabled:opacity-40"
                    onClick={handleOpenHtmlScreenshot}
                    disabled={!htmlScreenshot}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20 disabled:opacity-40"
                    onClick={handleDownloadHtmlScreenshot}
                    disabled={!htmlScreenshot}
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:text-white"
                onClick={() => setShowHtmlSettingsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isCropModalOpen && cropModalData ? (
        <ImageCropModal
          source={cropModalData.source}
          naturalWidth={cropModalData.naturalWidth}
          naturalHeight={cropModalData.naturalHeight}
          initialSettings={cropModalData.settings}
          onCancel={handleCropModalClose}
          onApply={(payload) => {
            void handleCropModalApply(payload);
          }}
        />
      ) : null}

      {isVideoCropModalOpen && videoCropModalData ? (
        <VideoCropModal
          source={videoCropModalData.source ?? videoCropModalData.videoPath}
          naturalWidth={videoCropModalData.videoWidth}
          naturalHeight={videoCropModalData.videoHeight}
          initialSettings={videoCropModalData.settings}
          onCancel={handleVideoCropModalClose}
          onApply={(payload) => {
            void handleVideoCropModalApply(payload as any);
          }}
        />
      ) : null}

      {/* PDF URL Input Modal */}
      {showPdfUrlModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPdfUrlModal(false);
            }
          }}
        >
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-medium text-white mb-4">Insert PDF Link</h3>
            
            <input
              type="url"
              value={pdfUrlInputValue}
              onChange={(e) => setPdfUrlInputValue(e.target.value)}
              placeholder="https://example.com/document.pdf"
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChangeMeta(node.node_id, { 
                    pdf_url: pdfUrlInputValue,
                    pdf_data: null, // Clear file when setting URL
                    pdf_file: null,
                    file_size: null,
                    file_type: null,
                    current_page: 1,
                    zoom_level: 1
                  });
                  setShowPdfUrlModal(false);
                } else if (e.key === 'Escape') {
                  setShowPdfUrlModal(false);
                }
              }}
            />
            
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  onChangeMeta(node.node_id, { 
                    pdf_url: pdfUrlInputValue,
                    pdf_data: null, // Clear file when setting URL
                    pdf_file: null,
                    file_size: null,
                    file_type: null,
                    current_page: 1,
                    zoom_level: 1
                  });
                  setShowPdfUrlModal(false);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition text-sm font-medium"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setShowPdfUrlModal(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Frame Extract Modal */}
      {showVideoFrameExtractModal && videoSource && (
        <VideoFrameExtractModal
          videoUrl={videoSource.src}
          videoNodeId={node.node_id}
          projectId={projectId}
          onClose={() => setShowVideoFrameExtractModal(false)}
          onExtract={handleExtractFrame}
        />
      )}

      {/* Video Trim Modal */}
      {showVideoTrimModal && videoSource && (
        <VideoTrimModal
          videoUrl={videoSource.src}
          videoNodeId={node.node_id}
          projectId={projectId}
          onClose={() => setShowVideoTrimModal(false)}
          onTrim={handleTrimVideo}
        />
      )}

      {textSplitterPopover}

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </div>
  );
}

export default memo(FlowNodeCard);
