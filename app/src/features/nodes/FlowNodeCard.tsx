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
import React from 'react';
import { Handle, Position, useStore, useUpdateNodeInternals, useReactFlow, type NodeProps } from 'reactflow';
import type { FlowNode, NodeUI } from '../../state/api';
import type { InputPortKind } from '../../data/inputPortTypes';
import { INPUT_PORT_TYPES, findInputPortMeta } from '../../data/inputPortTypes';
import type { IntegrationFieldConfig } from '../../state/api';
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
import { SettingsIcon } from '../../ui/icons/SettingsIcon';
import { NodeSettingsModal } from '../../ui/NodeSettingsModal';
import type { AgentRoutingConfig } from '../routing/agentRouting';
import { DEFAULT_ROUTING_CONFIGS } from '../routing/agentRouting';
import { AgentRoutingDisplay } from '../routing/AgentRoutingDisplay';
import { AgentRoutingEditor } from '../routing/AgentRoutingEditor';
import { AgentLogs } from '../logs/AgentLogs';
import { AgentLogsModal } from '../logs/AgentLogsModal';

// Screen width constants for HTML preview
const SCREEN_WIDTHS = [
  { id: 'mobile', name: 'Mobile', width: '375px' },
  { id: 'tablet', name: 'Tablet', width: '768px' },
  { id: 'laptop', name: 'Laptop', width: '1024px' },
  { id: 'desktop', name: 'Desktop', width: '1440px' },
  { id: 'wide', name: 'Wide', width: '1920px' }
];

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
}

export interface FlowNodeCardData {
  node: FlowNode;
  projectId?: string;
  onRun: (nodeId: string) => void;
  onRegenerate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onChangeContent: (nodeId: string, content: string) => void;
  onChangeTitle: (nodeId: string, title: string) => void;
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onChangeUi?: (nodeId: string, patch: Partial<NodeUI>) => void;
  onOpenSettings?: (nodeId: string) => void;
  onOpenConnections?: (nodeId: string) => void;
  providers?: AiProviderOption[];
  sources?: Array<{ node_id: string; title: string; type: string }>;
  disabled?: boolean;
  isGenerating?: boolean; // Индикатор что нода сейчас генерирует ответ
}

const TYPE_ICONS: Record<string, string> = {
  text: '📝',
  ai: '🤖',
  ai_improved: '🤖',
  parser: '🧩',
  python: '🐍',
  file: '📁',
  image: '🖼️',
  video: '🎬',
  folder: '📂',
  image_gen: '🖼️',
  audio_gen: '🔊',
  video_gen: '🎬',
  html: '🌐',
};

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', 
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', 
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', 
  '#ec4899', '#f43f5e', '#84cc16', '#6b7280',
];

const DEFAULT_COLOR = NODE_DEFAULT_COLOR;
const DEFAULT_MODEL = 'gpt-4.1-mini';

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
    description: 'Встроенный оффлайн движок для тестовых запусков.',
    inputFields: [],
  },
  {
    id: 'openai_gpt',
    name: 'OpenAI GPT',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    available: true,
    description: 'OpenAI GPT модели с поддержкой структурированного вывода.',
    inputFields: [],
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
      { id: 'title', label: 'Заголовок', type: 'text' as const, visible: true, order: 0 },
      { id: 'content', label: 'Содержимое', type: 'textarea' as const, visible: true, order: 1 }
    ];

    if (type === 'ai') {
      return [
        { id: 'htmlUrl', label: 'URL', type: 'text', visible: true, order: 0 },
        { id: 'screenWidth', label: 'Ширина экрана', type: 'select', visible: true, order: 1 }
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
      label: 'Новое поле',
      type: 'text',
      visible: true,
      order: fields.length,
      placeholder: 'Введите значение...'
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
          Настройте, какие поля отображать в слайдере ноды
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
          onClick={addCustomField}
          disabled={disabled}
        >
          + Поле
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
        Видимые поля будут отображаться в слайдере в указанном порядке
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
        { id: 'main_input', label: 'Основной вход', type: 'any', required: false, multiple: false }
      ],
      outputPorts: [
        { id: 'main_output', label: 'Основной выход', type: 'any' }
      ],
      routingRules: []
    };

    if (type === 'ai') {
      return {
        inputPorts: [
          { id: 'prompt_input', label: 'Промпт', type: 'text', required: true, multiple: false },
          { id: 'context_input', label: 'Контекст', type: 'any', required: false, multiple: true }
        ],
        outputPorts: [
          { id: 'success_output', label: 'Успешный результат', type: 'text' },
          { id: 'error_output', label: 'Ошибка', type: 'error' }
        ],
        routingRules: [
          { id: 'success_rule', condition: 'success', outputPort: 'success_output', description: 'При успешном выполнении' },
          { id: 'error_rule', condition: 'error', outputPort: 'error_output', description: 'При ошибке' }
        ]
      };
    }

    return baseRouting;
  }

  const addInputPort = () => {
    const newPort = {
      id: `input_${Date.now()}`,
      label: 'Новый вход',
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
      label: 'Новый выход',
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
          <h4 className="text-xs font-medium text-white/70">Входные порты</h4>
          <button
            type="button"
            className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors"
            onClick={addInputPort}
            disabled={disabled}
          >
            + Вход
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
                placeholder="Название порта"
              />
              <select
                value={port.type}
                onChange={(e) => updateInputPort(port.id, { type: e.target.value })}
                disabled={disabled}
                className="text-xs bg-black/20 text-white/70 border border-white/10 rounded px-1 py-0.5"
              >
                <option value="any">Любой</option>
                <option value="text">Текст</option>
                <option value="number">Число</option>
                <option value="json">JSON</option>
                <option value="image">Изображение</option>
                <option value="file">Файл</option>
              </select>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={port.required}
                  onChange={(e) => updateInputPort(port.id, { required: e.target.checked })}
                  disabled={disabled}
                  className="w-3 h-3"
                />
                <span className="text-xs text-white/60">Обяз.</span>
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
          <h4 className="text-xs font-medium text-white/70">Выходные порты</h4>
          <button
            type="button"
            className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
            onClick={addOutputPort}
            disabled={disabled}
          >
            + Выход
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
                placeholder="Название порта"
              />
              <select
                value={port.type}
                onChange={(e) => updateOutputPort(port.id, { type: e.target.value })}
                disabled={disabled}
                className="text-xs bg-black/20 text-white/70 border border-white/10 rounded px-1 py-0.5"
              >
                <option value="any">Любой</option>
                <option value="text">Текст</option>
                <option value="number">Число</option>
                <option value="json">JSON</option>
                <option value="image">Изображение</option>
                <option value="file">Файл</option>
                <option value="error">Ошибка</option>
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
        <div className="text-xs text-white/60 mb-1">Доступные подключения:</div>
        <div className="text-xs text-white/50">
          {availableNodes.length > 0 ? (
            `${availableNodes.length} нод доступно для соединения`
          ) : (
            'Нет доступных нод для соединения'
          )}
        </div>
      </div>
    </div>
  );
}

// Enhanced FlowNodeCard with restored functionality
function FlowNodeCard({ data, selected, dragging }: NodeProps<FlowNodeCardData>) {
  const { 
    node, 
    onRun, 
    onRegenerate, 
    onDelete, 
    onChangeMeta, 
    onChangeContent, 
    onChangeTitle, 
    onChangeAi, 
    onChangeUi,
    onOpenSettings,
    onOpenConnections,
    providers = FALLBACK_PROVIDERS,
    sources = [],
    disabled = false,
    isGenerating = false
  } = data;

  // State management
  const [collapsed, setCollapsed] = useState(() => {
    // Auto-collapse data nodes by default
    return node.type === 'data' || node.type === 'parser';
  });
  const [colorOpen, setColorOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(node.title);
  const [isResizing, setIsResizing] = useState(false);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [fileUrlInput, setFileUrlInput] = useState('');
  const [fileDialogMode, setFileDialogMode] = useState<'url' | 'upload'>('url');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeAiTab, setActiveAiTab] = useState<'settings' | 'fields' | 'routing' | 'logs' | 'provider' | 'model' | 'ai_config' | ''>('');
  const [showRoutingEditor, setShowRoutingEditor] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showOutputExampleModal, setShowOutputExampleModal] = useState(false);
  
  // Color state for immediate UI updates
  const [currentColor, setCurrentColor] = useState(node.ui?.color ?? DEFAULT_COLOR);
  
  // Text content states for controlled components
  const [contentValue, setContentValue] = useState(node.content || '');
  const [systemPromptValue, setSystemPromptValue] = useState(String(node.ai?.system_prompt || ''));
  const [outputExampleValue, setOutputExampleValue] = useState(String(node.ai?.output_example || ''));
  
  // HTML node specific states
  const [htmlUrl, setHtmlUrl] = useState<string>((node.meta?.htmlUrl as string) || 'https://wikipedia.org');
  const [screenWidth, setScreenWidth] = useState<string>((node.meta?.screenWidth as string) || 'desktop');
  const [htmlViewportWidth, setHtmlViewportWidth] = useState<number>((node.meta?.htmlViewportWidth as number) || 1024);
  const [htmlViewMode, setHtmlViewMode] = useState<'render' | 'code'>(() => {
    const mode = node.meta?.htmlViewMode as string;
    return mode === 'code' ? 'code' : 'render';
  });
  const [htmlSourceCode, setHtmlSourceCode] = useState<string>((node.meta?.htmlSourceCode as string) || '');

  // Refs for DOM manipulation
  const nodeRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const reactFlow = useReactFlow();
  const resizeStartPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Node properties
  const baseColor = currentColor; // Use local state for immediate updates
  const isAiNode = node.type === 'ai' || node.type === 'ai_improved';
  const isImprovedAiNode = node.type === 'ai_improved' || node.meta?.ui_mode === 'improved';
  const typeIcon = TYPE_ICONS[node.type] || '❓';

  const nodeMinHeight = useMemo(() => {
    if (collapsed) {
      // For improved AI nodes, the collapsed state still shows the control panel
      if (isImprovedAiNode) return 150; 
      return 110;
    }
    // For the new AI node, we need more vertical space for the controls
    if (isImprovedAiNode) return 280;
    return NODE_MIN_HEIGHT;
  }, [collapsed, isImprovedAiNode]);

  // AI node specific state
  const selectedProvider = useMemo(() => {
    if (!isAiNode || !node.ai?.provider) return null;
    return providers.find(p => p.id === String(node.ai?.provider)) || null;
  }, [isAiNode, node.ai?.provider, providers]);

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
    onChangeTitle(node.node_id, titleValue.trim());
    setEditingTitle(false);
  }, [onChangeTitle, node.node_id, titleValue]);

  const handleTitleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // Prevent React Flow from handling the event
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setTitleValue(node.title);
      setEditingTitle(false);
    }
  }, [handleTitleSubmit, node.title]);

  const handleTitleInputBlur = useCallback((e: FocusEvent<HTMLInputElement>) => {
    // Small delay to allow for potential click events to fire first
    setTimeout(() => {
      handleTitleSubmit();
    }, 100);
  }, [handleTitleSubmit]);

  const handleTitleInputClick = useCallback((e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation(); // Prevent node dragging when clicking inside input
  }, []);

  // File handling callbacks
  const handleFileUrlSubmit = useCallback(() => {
    if (fileUrlInput.trim()) {
      const currentAttachments = node.meta?.attachments as string[] || [];
      onChangeMeta(node.node_id, { 
        attachments: [...currentAttachments, fileUrlInput.trim()] 
      });
      setFileUrlInput('');
      setShowFileDialog(false);
    }
  }, [fileUrlInput, node.meta?.attachments, node.node_id, onChangeMeta]);

  const handleFileUpload = useCallback((files: FileList) => {
    const fileNames = Array.from(files).map(f => f.name);
    const currentAttachments = node.meta?.attachments as string[] || [];
    onChangeMeta(node.node_id, { 
      attachments: [...currentAttachments, ...fileNames] 
    });
    setShowFileDialog(false);
    console.log('Files attached:', fileNames);
  }, [node.meta?.attachments, node.node_id, onChangeMeta]);

  const openFileDialog = useCallback(() => {
    setShowFileDialog(true);
    setFileDialogMode('url');
    setFileUrlInput('');
  }, []);

  // Sync state with node changes
  useEffect(() => {
    setTitleValue(node.title);
  }, [node.title]);

  useEffect(() => {
    setContentValue(node.content || '');
  }, [node.content]);

  useEffect(() => {
    setSystemPromptValue(String(node.ai?.system_prompt || ''));
  }, [node.ai?.system_prompt]);

  useEffect(() => {
    setCurrentColor(node.ui?.color ?? DEFAULT_COLOR);
  }, [node.ui?.color]);

  // Focus title input when editing starts
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  // HTML node handlers
  const handleHtmlUrlChange = useCallback((url: string) => {
    setHtmlUrl(url);
    onChangeMeta(node.node_id, { htmlUrl: url });
  }, [onChangeMeta, node.node_id]);

  const handleScreenWidthChange = useCallback((width: string) => {
    setScreenWidth(width);
    onChangeMeta(node.node_id, { screenWidth: width });
  }, [onChangeMeta, node.node_id]);

  const handleHtmlViewportWidthChange = useCallback((width: number) => {
    setHtmlViewportWidth(width);
    onChangeMeta(node.node_id, { htmlViewportWidth: width });
  }, [onChangeMeta, node.node_id]);

  const handleHtmlViewModeChange = useCallback((mode: 'render' | 'code') => {
    setHtmlViewMode(mode);
    onChangeMeta(node.node_id, { htmlViewMode: mode });
  }, [onChangeMeta, node.node_id]);

  const handleHtmlSourceCodeChange = useCallback((code: string) => {
    setHtmlSourceCode(code);
    onChangeMeta(node.node_id, { htmlSourceCode: code });
  }, [onChangeMeta, node.node_id]);

  const handleHtmlRefresh = useCallback(() => {
    if (htmlViewMode === 'render') {
      // Force iframe reload
      const iframe = document.querySelector(`[data-node-id="${node.node_id}"] iframe`) as HTMLIFrameElement;
      if (iframe && htmlUrl) {
        iframe.src = htmlUrl + '?t=' + Date.now(); // Add timestamp to force reload
        // Reset HTML source code when refreshing from URL
        setHtmlSourceCode('');
        onChangeMeta(node.node_id, { htmlSourceCode: '' });
      }
    }
  }, [htmlViewMode, htmlUrl, node.node_id, onChangeMeta]);

  // Get node dimensions from React Flow state
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
      node.content, 
      isAiNode && !collapsed, 
      collapsed
    );
    return contentBasedHeight;
  }, [reactFlowHeight, node.ui?.bbox, node.type, node.content, isAiNode, collapsed, nodeMinHeight]);

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
      
      // Update internals after resize
      setTimeout(() => {
        updateNodeInternals(node.node_id);
      }, 50);
    };

    // Add event listeners
    document.addEventListener('pointermove', handleResizeMove);
    document.addEventListener('pointerup', handleResizeEnd);
    document.addEventListener('pointercancel', handleResizeEnd);
    
  }, [nodeWidth, nodeHeight, node.node_id, node.ui?.bbox, onChangeUi, updateNodeInternals, reactFlow, collapsed, nodeMinHeight]);

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

  // AI provider change handler
  const handleProviderChange = useCallback((providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    onChangeAi?.(node.node_id, {
      provider: providerId,
      model: provider.defaultModel,
    });
  }, [onChangeAi, node.node_id, providers]);

  // AI model change handler
  const handleModelChange = useCallback((model: string) => {
    onChangeAi?.(node.node_id, { model });
  }, [onChangeAi, node.node_id]);

  // Content change handler with debouncing
  const handleContentChange = useCallback((content: string) => {
    setContentValue(content); // Immediately update local state
    onChangeContent(node.node_id, content);
  }, [onChangeContent, node.node_id]);

  // System prompt change handler
  const handleSystemPromptChange = useCallback((systemPrompt: string) => {
    setSystemPromptValue(systemPrompt); // Immediately update local state
    onChangeAi?.(node.node_id, { system_prompt: systemPrompt });
  }, [onChangeAi, node.node_id]);

  // Output example change handler
  const handleOutputExampleChange = useCallback((outputExample: string) => {
    setOutputExampleValue(outputExample); // Immediately update local state
    onChangeAi?.(node.node_id, { output_example: outputExample });
  }, [onChangeAi, node.node_id]);

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

  

  return (
    <div
      ref={nodeRef}
      className={`flow-node flow-node__card ${selected ? 'flow-node--selected' : ''} ${dragging ? 'flow-node--dragging' : ''} ${isResizing ? 'flow-node--resizing' : ''}`}
      style={{
        backgroundColor: `${baseColor}15`,
        border: `2px solid ${baseColor}`,
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative',
        width: '100%', // Return to 100% for React Flow compatibility
        height: '100%', // Return to 100% for React Flow compatibility
        minWidth: `${NODE_MIN_WIDTH}px`,
        minHeight: `${nodeMinHeight}px`,
        maxWidth: `${NODE_MAX_WIDTH}px`,
        maxHeight: `${NODE_MAX_HEIGHT}px`,
        backdropFilter: 'blur(10px)',
        boxShadow: selected 
          ? `0 0 0 2px ${baseColor}, 0 8px 24px ${baseColor}30`
          : `0 4px 12px ${baseColor}20`,
        transition: isResizing ? 'none' : 'box-shadow 0.2s ease, transform 0.1s ease, height 0.2s ease-out',
        transform: dragging ? 'scale(1.02)' : 'scale(1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
                {/* Фоновая иконка приглушенная */}
                <span className="absolute opacity-30">{typeIcon}</span>
                
                {/* Индикатор загрузки */}
                <div className="w-5 h-5 relative">
                  <div className="w-full h-full border-2 border-slate-400 border-t-sky-500 rounded-full animate-spin"></div>
                  
                  {/* Пульсирующая точка в центре */}
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
                <span className="text-blue-300" title="Есть прикрепленные файлы">
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
              title={collapsed ? "Развернуть" : "Свернуть"}
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
            title="Изменить цвет"
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowSettingsModal(true);
            }}
            title="Настройки ноды"
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (window.confirm('Удалить эту ноду?')) {
                onDelete(node.node_id);
              }
            }}
            title="Удалить ноду"
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
          paddingTop: isImprovedAiNode && collapsed ? '0' : '16px',
          paddingBottom: node.type === 'image' ? '0' : '8px', // Less padding at bottom since footer provides separation
          display: 'flex', 
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          transition: 'padding 0.2s ease-out'
        }}
      >
        {isImprovedAiNode ? (
          <>
            {/* Main Input Area - resizable content area */}
            {!collapsed && (
              <div className="flex-1 min-h-0">
                <textarea
                  value={contentValue}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Введите ваш промпт для агента..."
                  disabled={disabled}
                  className="w-full h-full p-3 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  draggable={false}
                  data-nodrag="true"
                  style={{ 
                    minHeight: '80px',
                    resize: 'none',
                    fontSize: '13px',
                    lineHeight: '1.4'
                  }}
                />
              </div>
            )}
            
            {/* Control Panel with Separators */}
            <div 
              className="mt-2 border-t border-b border-white/10"
              style={{ 
                backgroundColor: `${baseColor}10`,
                flexShrink: 0,
                margin: '8px -12px',
                padding: '8px 12px'
              }}
            >
              <div className="flex gap-2 items-center justify-between">
                {/* Left Side - Function Buttons (no text labels) */}
                <div className="flex gap-1">
                  {/* Agent Settings Button */}
                  <button
                    type="button"
                    onClick={() => setActiveAiTab(activeAiTab === 'settings' ? '' : 'settings')}
                    className={`w-7 h-7 rounded border transition flex items-center justify-center ${
                      activeAiTab === 'settings'
                        ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                        : 'bg-black/20 border-white/10 text-white/70 hover:bg-black/30 hover:text-white'
                    }`}
                    title="Настройки агента"
                    disabled={disabled}
                  >
                    ⚙️
                  </button>

                  {/* AI Configuration Button */}
                  <button
                    type="button"
                    onClick={() => setActiveAiTab(activeAiTab === 'ai_config' ? '' : 'ai_config')}
                    className={`w-7 h-7 rounded border transition flex items-center justify-center ${
                      activeAiTab === 'ai_config'
                        ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                        : 'bg-black/20 border-white/10 text-white/70 hover:bg-black/30 hover:text-white'
                    }`}
                    title="Настройки ИИ"
                    disabled={disabled}
                  >
                    🧠
                  </button>

                  {/* Routing Configuration Button */}
                  <button
                    type="button"
                    onClick={() => setActiveAiTab(activeAiTab === 'routing' ? '' : 'routing')}
                    className={`w-7 h-7 rounded border transition flex items-center justify-center ${
                      activeAiTab === 'routing'
                        ? 'bg-green-600/30 border-green-500/50 text-green-300'
                        : 'bg-black/20 border-white/10 text-white/70 hover:bg-black/30 hover:text-white'
                    }`}
                    title="Настройки роутинга"
                    disabled={disabled}
                  >
                    🔀
                  </button>

                  {/* Logs Button */}
                  <button
                    type="button"
                    onClick={() => setShowLogsModal(true)}
                    className="w-7 h-7 rounded border transition flex items-center justify-center bg-black/20 border-white/10 text-white/70 hover:bg-black/30 hover:text-white"
                    title="Просмотр логов"
                    disabled={disabled}
                  >
                    📝
                  </button>

                  {/* Output Example Button */}
                  <button
                    type="button"
                    onClick={() => setShowOutputExampleModal(true)}
                    className="w-7 h-7 rounded border transition flex items-center justify-center bg-black/20 border-white/10 text-white/70 hover:bg-black/30 hover:text-white"
                    title="Пример вывода"
                    disabled={disabled}
                  >
                    📋
                  </button>
                </div>

                {/* Right Side - Action Buttons */}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRegenerate(node.node_id);
                    }}
                    className="px-3 py-1.5 text-xs rounded border border-orange-500/50 bg-orange-600/20 text-orange-300 hover:bg-orange-600/30 transition"
                    title="Перегенерировать ответ"
                    disabled={disabled}
                  >
                    🔄
                  </button>
                  
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRun(node.node_id);
                    }}
                    className="px-3 py-1.5 text-xs rounded border border-green-500/50 bg-green-600/20 text-green-300 hover:bg-green-600/30 transition"
                    title="Запустить генерацию"
                    disabled={disabled}
                  >
                    ▶️
                  </button>
                </div>
              </div>
            </div>

            {/* Expandable Settings Panels */}
            {activeAiTab === 'settings' && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
                <div>
                  <label className="text-xs text-white/70 block mb-2">Системный промпт</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        const plannerPrompt = `Ты - агент-планировщик workflow. Твоя задача создавать структурированные планы в виде множественных нод.

ДОСТУПНЫЕ ТИПЫ НОД:
- text: Текстовый контент
- ai: AI-агент для генерации
- ai_improved: Улучшенный AI-агент  
- image: Изображение
- video: Видео
- audio: Аудио
- html: HTML контент
- json: JSON данные
- markdown: Markdown документ
- file: Файл
- python: Python код
- router: Маршрутизатор

ФОРМАТ ОТВЕТА:
Всегда отвечай JSON объектом с массивом "nodes". Каждая нода должна содержать:
- type: тип ноды (обязательно)
- title: заголовок (обязательно)
- content: содержимое (опционально)
- x, y: координаты (опционально, будут назначены автоматически)
- meta: дополнительные метаданные (опционально)
- ai: конфигурация AI для AI-нод (опционально)

Создавай логичные workflow с последовательностью операций.`;
                        handleSystemPromptChange(plannerPrompt);
                      }}
                      disabled={disabled}
                      className="px-2 py-1 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
                    >
                      Планировщик
                    </button>
                  </div>
                  <textarea
                    value={systemPromptValue}
                    onChange={(e) => handleSystemPromptChange(e.target.value)}
                    placeholder="Например: Ты — полезный ассистент."
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
                </div>
                
                <div>
                  <label className="text-xs text-white/70 block mb-2">Пример вывода</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        const exampleFormat = JSON.stringify({
                          nodes: [
                            {
                              type: "text",
                              title: "Анализ данных",
                              content: "Проведем анализ предоставленных данных...",
                            },
                            {
                              type: "ai",
                              title: "Генерация отчета",
                              content: "Создай подробный отчет на основе анализа",
                              ai: {
                                system_prompt: "Ты - эксперт по анализу данных. Создавай детальные отчеты.",
                                model: "gpt-4",
                                temperature: 0.7
                              }
                            }
                          ]
                        }, null, 2);
                        handleOutputExampleChange(exampleFormat);
                      }}
                      disabled={disabled}
                      className="px-2 py-1 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
                    >
                      Пример
                    </button>
                  </div>
                  <textarea
                    value={outputExampleValue}
                    onChange={(e) => handleOutputExampleChange(e.target.value)}
                    placeholder='Например: {"nodes": [{"type": "text", "title": "...", "content": "..."}]}'
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
                </div>
              </div>
            )}

            {activeAiTab === 'ai_config' && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
                <div>
                  <label className="text-xs text-white/70 block mb-2">Провайдер</label>
                  <select
                    value={String(node.ai?.provider || '')}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    disabled={disabled}
                    className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag"
                    data-nodrag="true"
                  >
                    {providers.map(p => (
                      <option key={p.id} value={p.id} disabled={!p.available}>
                        {p.name} {!p.available && `(${p.reason || 'Недоступен'})`}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProvider && (
                  <div>
                    <label className="text-xs text-white/70 block mb-2">Модель</label>
                    <select
                      value={String(node.ai?.model || selectedProvider.defaultModel)}
                      onChange={(e) => handleModelChange(e.target.value)}
                      disabled={disabled}
                      className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag"
                      data-nodrag="true"
                    >
                      {selectedProvider.models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-white/70 block mb-2">Температура</label>
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
                  <div className="text-xs text-white/50 mt-1">От 0 (строго) до 2 (креативно)</div>
                </div>
              </div>
            )}

            {activeAiTab === 'routing' && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
                <div className="text-xs text-white/70">
                  <div className="mb-2">Настройки роутинга выходов:</div>
                  <div className="text-white/50 text-[10px]">
                    Здесь можно настроить типы входящих и исходящих данных, 
                    количество портов ввода/вывода и правила обработки.
                  </div>
                </div>
                {/* Placeholder for routing configuration */}
                <div className="p-2 bg-black/20 border border-white/5 rounded text-xs text-white/50 text-center">
                  Конфигурация роутинга будет добавлена в следующих версиях
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
            {node.type === 'html' ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-node-id={node.node_id}>
                {/* Content Area */}
                <div className="w-full bg-white/5 border border-white/10 rounded flex-1 mb-2 overflow-hidden">
                  {htmlViewMode === 'render' ? (
                    htmlUrl ? (
                      <iframe
                        src={htmlUrl}
                        className="w-full h-full border-0"
                        style={{ 
                          width: `${htmlViewportWidth}px`,
                          height: '100%',
                          minHeight: '200px',
                          transformOrigin: 'top left',
                          transform: htmlViewportWidth > nodeWidth ? `scale(${nodeWidth / htmlViewportWidth})` : 'none'
                        }}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                        loading="lazy"
                        title="Website Preview"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                        Введите URL для предпросмотра сайта
                      </div>
                    )
                  ) : (
                    <textarea
                      value={htmlSourceCode}
                      onChange={(e) => handleHtmlSourceCodeChange(e.target.value)}
                      placeholder="Введите HTML код для предпросмотра..."
                      className="w-full h-full p-3 bg-transparent border-0 text-white text-xs font-mono resize-none nodrag"
                      style={{
                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                        lineHeight: '1.4',
                        outline: 'none'
                      }}
                      data-nodrag="true"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
                
                {/* Enhanced Controls Panel */}
                <div className="space-y-1">
                  {/* URL and controls in one compact row */}
                  {htmlViewMode === 'render' && (
                    <div className="flex gap-1 items-end">
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] text-white/70 block mb-0.5">URL</label>
                        <input
                          type="url"
                          value={htmlUrl}
                          onChange={(e) => handleHtmlUrlChange(e.target.value)}
                          placeholder="https://wikipedia.org"
                          className="w-full p-1 bg-black/20 border border-white/10 rounded text-[10px] text-white nodrag"
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          draggable={false}
                          data-nodrag="true"
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              handleHtmlRefresh();
                            }
                          }}
                        />
                      </div>
                      <button
                        onClick={handleHtmlRefresh}
                        className="p-1 bg-black/20 border border-white/10 rounded text-white/70 hover:text-white hover:bg-black/30 transition-colors text-[10px]"
                        title="Обновить страницу"
                      >
                        🔄
                      </button>
                    </div>
                  )}
                  
                  {/* Viewport and Scale in compact row */}
                  <div className="flex gap-1 items-end">
                    <div className="w-16">
                      <label className="text-[10px] text-white/70 block mb-0.5">Viewport</label>
                      <input
                        type="number"
                        value={htmlViewportWidth}
                        onChange={(e) => handleHtmlViewportWidthChange(Number(e.target.value) || 1024)}
                        placeholder="1024"
                        min="320"
                        max="1920"
                        className="w-full p-1 bg-black/20 border border-white/10 rounded text-[10px] text-white nodrag"
                        data-nodrag="true"
                        title="Ширина viewport в пикселях"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] text-white/70 block mb-0.5">Масштаб</label>
                      <select
                        value={screenWidth}
                        onChange={(e) => handleScreenWidthChange(e.target.value)}
                        className="w-full p-1 bg-black/20 border border-white/10 rounded text-[10px] text-white nodrag"
                        title="Предустановленные размеры экранов"
                        data-nodrag="true"
                      >
                        {SCREEN_WIDTHS.map(sw => (
                          <option key={sw.id} value={sw.id}>
                            {sw.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-16">
                      <label className="text-[10px] text-white/70 block mb-0.5">Режим</label>
                      <select
                        value={htmlViewMode}
                        onChange={(e) => handleHtmlViewModeChange(e.target.value as 'render' | 'code')}
                        className="w-full p-1 bg-black/20 border border-white/10 rounded text-[10px] text-white nodrag"
                        title="Режим отображения"
                        data-nodrag="true"
                      >
                        <option value="render">🌐 Рендер</option>
                        <option value="code">📝 HTML</option>
                      </select>
                    </div>
                    {htmlViewMode === 'code' && htmlSourceCode && (
                      <button
                        onClick={() => {
                          // Create a blob URL from HTML source code
                          const blob = new Blob([htmlSourceCode], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          setHtmlUrl(url);
                          handleHtmlUrlChange(url);
                          handleHtmlViewModeChange('render');
                        }}
                        className="p-1 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] transition-colors"
                        title="Превью HTML кода"
                      >
                        👁️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : node.type === 'image' ? (
              // Image node content - заполняем всю область
              <div className="flex-1 flex flex-col">
                {/* Image Preview - заполняем всю доступную область */}
                {(() => {
                  const imageUrl = node.meta?.image_url;
                  const imageData = node.meta?.image_data;
                  const imageSrc = (typeof imageData === 'string' && imageData) || (typeof imageUrl === 'string' && imageUrl);
                  const imageScale = (node.meta?.image_scale as number) || 1;
                  
                  return imageSrc ? (
                    <div className="flex-1 overflow-hidden bg-black/20 rounded-none border-0">
                      <img
                        src={imageSrc}
                        alt="Preview"
                        className="w-full h-full object-cover cursor-pointer"
                        style={{
                          objectFit: 'cover',
                          backgroundColor: 'rgba(0,0,0,0.1)',
                          transform: `scale(${imageScale})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s ease'
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        onClick={() => {
                          // Cycle through scale values: 1 -> 1.5 -> 2 -> 0.5 -> 1
                          const scales = [1, 1.5, 2, 0.5];
                          const currentIndex = scales.indexOf(imageScale);
                          const nextScale = scales[(currentIndex + 1) % scales.length];
                          onChangeMeta(node.node_id, { image_scale: nextScale });
                        }}
                        title={`Масштаб: ${Math.round(imageScale * 100)}% (клик для изменения)`}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm bg-black/10">
                      Изображение не загружено
                    </div>
                  );
                })()}

                {/* Controls */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => onChangeMeta(node.node_id, { display_mode: 'url' })}
                    className={`px-3 py-1 text-xs rounded border transition ${
                      (node.meta?.display_mode || 'url') === 'url'
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-black/20 border-white/10 text-white/70 hover:bg-black/30'
                    }`}
                  >
                    🔗 По ссылке
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMeta(node.node_id, { display_mode: 'upload' })}
                    className={`px-3 py-1 text-xs rounded border transition ${
                      (node.meta?.display_mode || 'url') === 'upload'
                        ? 'bg-green-600/20 border-green-500/50 text-green-300'
                        : 'bg-black/20 border-white/10 text-white/70 hover:bg-black/30'
                    }`}
                  >
                    📁 Загрузить
                  </button>
                  
                  {/* Scale controls - показываем только если есть изображение */}
                  {((node.meta?.image_url as string) || (node.meta?.image_data as string)) && (
                    <>
                      <div className="w-px bg-white/20 mx-1"></div>
                      <button
                        type="button"
                        onClick={() => {
                          const currentScale = (node.meta?.image_scale as number) || 1;
                          const newScale = Math.max(0.25, currentScale - 0.25);
                          onChangeMeta(node.node_id, { image_scale: newScale });
                        }}
                        className="px-2 py-1 text-xs rounded border border-white/10 bg-black/20 text-white/70 hover:bg-black/30 transition"
                        title="Уменьшить"
                      >
                        🔍−
                      </button>
                      <span className="px-2 py-1 text-xs text-white/60 flex items-center">
                        {Math.round(((node.meta?.image_scale as number) || 1) * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const currentScale = (node.meta?.image_scale as number) || 1;
                          const newScale = Math.min(3, currentScale + 0.25);
                          onChangeMeta(node.node_id, { image_scale: newScale });
                        }}
                        className="px-2 py-1 text-xs rounded border border-white/10 bg-black/20 text-white/70 hover:bg-black/30 transition"
                        title="Увеличить"
                      >
                        🔍+
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeMeta(node.node_id, { image_scale: 1 })}
                        className="px-2 py-1 text-xs rounded border border-white/10 bg-black/20 text-white/70 hover:bg-black/30 transition"
                        title="Сбросить масштаб"
                      >
                        🎯
                      </button>
                    </>
                  )}
                </div>

                {(node.meta?.display_mode || 'url') === 'url' ? (
                  <div>
                    <input
                      type="url"
                      value={node.meta?.image_url as string || ''}
                      onChange={(e) => onChangeMeta(node.node_id, { image_url: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                      className="w-full p-2 bg-black/20 border border-white/10 rounded text-sm text-white nodrag"
                      data-nodrag="true"
                    />
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                            // Создаем URL для предпросмотра
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const imageData = event.target?.result as string;
                              onChangeMeta(node.node_id, { 
                                image_file: file.name,
                                image_data: imageData,
                                file_size: file.size,
                                file_type: file.type
                              });
                            };
                            reader.readAsDataURL(file);
                          }
                        };
                        input.click();
                      }}
                      className="w-full p-4 bg-black/20 border border-dashed border-white/30 rounded text-sm text-white/70 hover:bg-black/30 hover:border-white/50 transition"
                    >
                      📁 Выберите файл изображения
                    </button>
                    {(() => {
                      const imageFile = node.meta?.image_file;
                      const fileSize = node.meta?.file_size;
                      return imageFile && typeof imageFile === 'string' ? (
                        <div className="mt-2 flex justify-between items-center text-xs">
                          <span className="text-white/70">
                            📄 {imageFile}
                          </span>
                          {typeof fileSize === 'number' && (
                            <span className="text-white/50">
                              {(fileSize / 1024 / 1024).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            ) : node.type === 'video' ? (
              // Video node content
              <div className="space-y-3">
                {/* Video Preview - показываем сверху */}
                {(() => {
                  const videoUrl = node.meta?.video_url;
                  const videoData = node.meta?.video_data;
                  const videoSrc = (typeof videoData === 'string' && videoData) || (typeof videoUrl === 'string' && videoUrl);
                  const videoScale = (node.meta?.video_scale as number) || 1;
                  
                  return videoSrc ? (
                    <div className="border border-white/10 rounded overflow-hidden bg-black/20">
                      <video
                        src={videoSrc}
                        controls={node.meta?.controls !== false}
                        autoPlay={false}
                        className="w-full h-auto cursor-pointer"
                        preload="metadata"
                        style={{
                          maxHeight: `${200 * videoScale}px`,
                          minHeight: '120px',
                          backgroundColor: 'rgba(0,0,0,0.1)',
                          transform: `scale(${videoScale})`,
                          transformOrigin: 'center',
                          transition: 'transform 0.2s ease'
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          // Cycle through scale values: 1 -> 1.5 -> 2 -> 0.5 -> 1
                          const scales = [1, 1.5, 2, 0.5];
                          const currentIndex = scales.indexOf(videoScale);
                          const nextIndex = (currentIndex + 1) % scales.length;
                          const nextScale = scales[nextIndex];
                          onChangeMeta(node.node_id, { video_scale: nextScale });
                        }}
                      >
                        Ваш браузер не поддерживает видео.
                      </video>
                    </div>
                  ) : null;
                })()}

                {/* Controls */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => onChangeMeta(node.node_id, { display_mode: 'url' })}
                    className={`px-3 py-1 text-xs rounded border transition ${
                      (node.meta?.display_mode || 'url') === 'url'
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-black/20 border-white/10 text-white/70 hover:bg-black/30'
                    }`}
                  >
                    🔗 По ссылке
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMeta(node.node_id, { display_mode: 'upload' })}
                    className={`px-3 py-1 text-xs rounded border transition ${
                      (node.meta?.display_mode || 'url') === 'upload'
                        ? 'bg-green-600/20 border-green-500/50 text-green-300'
                        : 'bg-black/20 border-white/10 text-white/70 hover:bg-black/30'
                    }`}
                  >
                    🎬 Загрузить
                  </button>
                </div>

                {(node.meta?.display_mode || 'url') === 'url' ? (
                  <div>
                    <input
                      type="url"
                      value={node.meta?.video_url as string || ''}
                      onChange={(e) => onChangeMeta(node.node_id, { video_url: e.target.value })}
                      placeholder="https://youtube.com/watch?v=... или прямая ссылка на видео"
                      className="w-full p-2 bg-black/20 border border-white/10 rounded text-sm text-white nodrag"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      draggable={false}
                      data-nodrag="true"
                    />
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'video/*';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                            // Создаем URL для предпросмотра
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const videoData = event.target?.result as string;
                              onChangeMeta(node.node_id, { 
                                video_file: file.name,
                                video_data: videoData,
                                file_size: file.size,
                                file_type: file.type
                              });
                            };
                            reader.readAsDataURL(file);
                          }
                        };
                        input.click();
                      }}
                      className="w-full p-4 bg-black/20 border border-dashed border-white/30 rounded text-sm text-white/70 hover:bg-black/30 hover:border-white/50 transition"
                    >
                      🎬 Выберите видео файл
                    </button>
                    {(() => {
                      const videoFile = node.meta?.video_file;
                      const fileSize = node.meta?.file_size;
                      return videoFile && typeof videoFile === 'string' ? (
                        <div className="mt-2 flex justify-between items-center text-xs">
                          <span className="text-white/70">
                            🎬 {videoFile}
                          </span>
                          {typeof fileSize === 'number' && (
                            <span className="text-white/50">
                              {(fileSize / 1024 / 1024).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            ) : node.type === 'folder' ? (
              // Folder node content
              <div className="space-y-3">
                <div className="flex gap-2 items-center mb-3">
                  <span className="text-sm text-white/70">Папка для организации нод</span>
                  <button
                    type="button"
                    onClick={() => onChangeMeta(node.node_id, { collapsed: !(node.meta?.collapsed) })}
                    className={`px-2 py-1 text-xs rounded border transition ${
                      node.meta?.collapsed
                        ? 'bg-orange-600/20 border-orange-500/50 text-orange-300'
                        : 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                    }`}
                  >
                    {node.meta?.collapsed ? '📁 Свернута' : '📂 Развернута'}
                  </button>
                </div>

                <textarea
                  value={contentValue}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Описание папки или инструкции..."
                  disabled={disabled}
                  className="w-full p-2 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  draggable={false}
                  data-nodrag="true"
                  rows={3}
                />

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/70">Содержимое папки:</span>
                    <span className="text-xs text-white/50">
                      {(node.meta?.folder_items as string[] || []).length} элементов
                    </span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {(node.meta?.folder_items as string[] || []).map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-xs bg-black/20 rounded p-2">
                        <span className="text-white/80">{item}</span>
                        <button
                          onClick={() => {
                            const currentItems = (node.meta?.folder_items as string[] || []);
                            const newItems = currentItems.filter((_, i) => i !== index);
                            onChangeMeta(node.node_id, { folder_items: newItems });
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : node.type === 'file' ? (
              // File node content
              <div className="space-y-3">
                {/* File Preview */}
                {(() => {
                  const attachments = (node.meta?.attachments as string[]) || [];
                  const fileData = node.meta?.file_data;
                  const fileName = node.meta?.file_name as string | undefined;
                  
                  const hasFiles = attachments.length > 0 || fileName;
                  
                  return hasFiles ? (
                    <div className="space-y-2">
                      <div className="text-xs text-white/70 mb-2">Прикрепленные файлы:</div>
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
                          {typeof node.meta?.file_size === 'number' && (
                            <span className="text-xs text-white/50">
                              {((node.meta.file_size as number) / 1024 / 1024).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/50 text-sm border border-dashed border-white/20 rounded">
                      📁 Нет прикрепленных файлов
                    </div>
                  );
                })()}

                {/* File Upload Button */}
                <button
                  type="button"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files && files.length > 0) {
                        const fileNames = Array.from(files).map(f => f.name);
                        const currentAttachments = node.meta?.attachments as string[] || [];
                        
                        // For single file, also store file info
                        if (files.length === 1) {
                          const file = files[0];
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            onChangeMeta(node.node_id, { 
                              attachments: [...currentAttachments, ...fileNames],
                              file_name: file.name,
                              file_data: event.target?.result as string,
                              file_size: file.size,
                              file_type: file.type
                            });
                          };
                          reader.readAsDataURL(file);
                        } else {
                          onChangeMeta(node.node_id, { 
                            attachments: [...currentAttachments, ...fileNames] 
                          });
                        }
                      }
                    };
                    input.click();
                  }}
                  className="w-full p-3 bg-black/20 border border-dashed border-white/30 rounded text-sm text-white/70 hover:bg-black/30 hover:border-white/50 transition"
                >
                  📎 Прикрепить файлы
                </button>

                {/* Description/Notes */}
                <textarea
                  value={contentValue}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Описание файлов или заметки..."
                  disabled={disabled}
                  className="w-full p-2 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  draggable={false}
                  data-nodrag="true"
                  rows={2}
                />
              </div>
            ) : (
              // Regular textarea for other node types
              <textarea
                value={contentValue}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="Введите содержимое..."
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
                  fontSize: '13px',
                  lineHeight: '1.4'
                }}
              />
            )}
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div 
        className="flow-node__footer"
        style={{
          backgroundColor: `${baseColor}20`,
          borderTop: `1px solid ${baseColor}30`,
          flexShrink: 0,
        }}
      >
        <div className="flex justify-between items-center w-full px-3 py-2">
          {/* Show different info based on node type and collapsed state */}
          {collapsed ? (
            <>
              <span className="text-xs text-white/70">
                {node.type.toUpperCase()}
              </span>
              <span className="text-xs text-white/50">
                {(() => {
                  if (node.type === 'image') return 'Изображение';
                  if (node.type === 'file') return 'Файл';
                  return `${(node.content || '').length} симв.`;
                })()}
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-white/70">
                {(() => {
                  if (node.type === 'image') return 'Размер: —'; // Placeholder for image weight
                  if (node.type === 'file') return 'Размер: —'; // Placeholder for file weight
                  return `Символов: ${(node.content || '').length.toLocaleString()}`;
                })()}
              </span>
              {isAiNode && selectedProvider && (
                <span className="text-xs text-white/60">
                  {selectedProvider.name}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Connection Handles - Fixed at header bottom */}
      <Handle
        type="target"
        position={Position.Left}
        className="flow-node__handle flow-node__handle--target"
        style={{ 
          background: '#3b82f6',
          border: '2px solid #fff',
          width: 14,
          height: 14,
          top: '60px', // Fixed position at header bottom
          left: -7,
          zIndex: 10,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="flow-node__handle flow-node__handle--source"
        style={{ 
          background: '#10b981',
          border: '2px solid #fff',
          width: 14,
          height: 14,
          top: '60px', // Fixed position at header bottom
          right: -7,
          zIndex: 10,
        }}
      />

      {/* Resize Handle - hide for collapsed nodes */}
      {!collapsed && (
        <div 
          className="flow-node__resize-handle nodrag nopan" 
          onPointerDown={handleResizePointerDown}
          style={{
            position: 'absolute',
            bottom: '0px',
            right: '0px',
            width: '24px',
            height: '24px',
            cursor: 'nwse-resize',
            backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.9)' : 'rgba(148, 163, 184, 0.8)',
            borderRadius: '4px 0 4px 0',
            zIndex: 20,
            opacity: selected || isResizing ? 1 : 0.7,
            transition: isResizing ? 'none' : 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: 'white',
            userSelect: 'none',
            touchAction: 'none',
            pointerEvents: 'auto',
          }}
          title="Изменить размер (тащите для увеличения/уменьшения)"
        >
          ⟲
        </div>
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

      {/* File Dialog Modal */}
      {showFileDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Добавить файл</h3>
            
            {/* Mode selector */}
            <div className="flex rounded-lg overflow-hidden mb-4">
              <button
                className={`flex-1 py-2 px-4 text-sm font-medium transition ${
                  fileDialogMode === 'url' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
                onClick={() => setFileDialogMode('url')}
              >
                По ссылке
              </button>
              <button
                className={`flex-1 py-2 px-4 text-sm font-medium transition ${
                  fileDialogMode === 'upload' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
                onClick={() => setFileDialogMode('upload')}
              >
                Загрузить
              </button>
            </div>

            {/* URL input mode */}
            {fileDialogMode === 'url' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    URL файла
                  </label>
                  <input
                    type="url"
                    value={fileUrlInput}
                    onChange={(e) => setFileUrlInput(e.target.value)}
                    placeholder="https://example.com/file.pdf"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleFileUrlSubmit();
                      } else if (e.key === 'Escape') {
                        setShowFileDialog(false);
                      }
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowFileDialog(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleFileUrlSubmit}
                    disabled={!fileUrlInput.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Добавить
                  </button>
                </div>
              </div>
            )}

            {/* Upload mode */}
            {fileDialogMode === 'upload' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Выберите файлы
                  </label>
                  <div
                    className="border-2 border-dashed border-slate-600 rounded-md p-6 text-center cursor-pointer hover:border-slate-500 transition"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.onchange = (event) => {
                        const files = (event.target as HTMLInputElement).files;
                        if (files) {
                          handleFileUpload(files);
                        }
                      };
                      input.click();
                    }}
                  >
                    <div className="text-slate-400">
                      <div className="text-2xl mb-2">📁</div>
                      <div className="text-sm">
                        Нажмите для выбора файлов
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Можно выбрать несколько файлов
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowFileDialog(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent Routing Editor */}
      {showRoutingEditor && (node.type === 'ai_improved' || node.type === 'ai') && (
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
      {showLogsModal && (node.type === 'ai_improved' || node.type === 'ai') && (
        <AgentLogsModal
          nodeId={node.node_id}
          projectId={data.projectId || ''}
          onClose={() => setShowLogsModal(false)}
        />
      )}

      {/* Output Example Modal */}
      {showOutputExampleModal && (node.type === 'ai_improved' || node.type === 'ai') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowOutputExampleModal(false)}>
          <div className="bg-slate-900 border border-white/20 rounded-lg p-6 w-[600px] max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Пример вывода</h3>
              <button
                onClick={() => setShowOutputExampleModal(false)}
                className="text-white/60 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/70 block mb-2">
                  Описание формата ответа для агента-планировщика:
                </label>
                <div className="bg-black/30 border border-white/10 rounded p-3 text-xs text-white/80">
                  <p className="mb-2">Для создания множественных нод используйте JSON массив:</p>
                  <pre className="text-green-400">{`{
  "nodes": [
    {
      "type": "text",
      "title": "Заголовок ноды",
      "content": "Содержимое ноды",
      "x": 100,
      "y": 200
    }
  ]
}`}</pre>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-white/70 block mb-2">Пример вывода:</label>
                <textarea
                  value={outputExampleValue}
                  onChange={(e) => handleOutputExampleChange(e.target.value)}
                  placeholder='{"nodes": [{"type": "text", "title": "Заголовок", "content": "Содержимое"}]}'
                  className="w-full h-48 p-3 bg-black/30 border border-white/10 rounded text-sm text-white placeholder-white/40 resize-none"
                  style={{ fontSize: '13px', lineHeight: '1.4' }}
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    const exampleFormat = JSON.stringify({
                      nodes: [
                        {
                          type: "text",
                          title: "Анализ данных",
                          content: "Проведем анализ предоставленных данных...",
                        },
                        {
                          type: "ai",
                          title: "Генерация отчета",
                          content: "Создай подробный отчет на основе анализа",
                          ai: {
                            system_prompt: "Ты - эксперт по анализу данных. Создавай детальные отчеты.",
                            model: "gpt-4",
                            temperature: 0.7
                          }
                        }
                      ]
                    }, null, 2);
                    handleOutputExampleChange(exampleFormat);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition"
                >
                  Заполнить пример
                </button>
                <button
                  onClick={() => setShowOutputExampleModal(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
                >
                  Готово
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(FlowNodeCard);