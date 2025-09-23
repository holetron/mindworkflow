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
}

const TYPE_ICONS: Record<string, string> = {
  text: '📝',
  ai: '🤖',
  parser: '🧩',
  python: '🐍',
  file: '📁',
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
    disabled = false
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeAiTab, setActiveAiTab] = useState<'settings' | 'fields' | 'routing'>('settings');
  
  // Color state for immediate UI updates
  const [currentColor, setCurrentColor] = useState(node.ui?.color ?? DEFAULT_COLOR);
  
  // Text content states for controlled components
  const [contentValue, setContentValue] = useState(node.content || '');
  const [systemPromptValue, setSystemPromptValue] = useState(String(node.ai?.system_prompt || ''));
  
  // HTML node specific states
  const [htmlUrl, setHtmlUrl] = useState<string>((node.meta?.htmlUrl as string) || 'https://wikipedia.org');
  const [screenWidth, setScreenWidth] = useState<string>((node.meta?.screenWidth as string) || 'desktop');

  // Refs for DOM manipulation
  const nodeRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const reactFlow = useReactFlow();
  const resizeStartPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Node properties
  const baseColor = currentColor; // Use local state for immediate updates
  const isAiNode = node.type === 'ai';
  const typeIcon = TYPE_ICONS[node.type] || '❓';

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
        return Math.max(110, bboxHeight); // Minimum for collapsed: header + footer
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
  }, [reactFlowHeight, node.ui?.bbox, node.type, node.content, isAiNode, collapsed]);

  // Remove auto-resize logic - manual resizing only

  // Remove ResizeObserver - manual resizing only

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
      const newHeight = Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, resizeStartPos.current.height + deltaY));
      
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
      const finalHeight = Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT, resizeStartPos.current.height + deltaY));
      
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
    
  }, [nodeWidth, nodeHeight, node.node_id, node.ui?.bbox, onChangeUi, updateNodeInternals, reactFlow, collapsed]);

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
        minHeight: collapsed ? `110px` : `${NODE_MIN_HEIGHT}px`, // Fixed collapsed height
        maxWidth: `${NODE_MAX_WIDTH}px`,
        maxHeight: `${NODE_MAX_HEIGHT}px`,
        backdropFilter: 'blur(10px)',
        boxShadow: selected 
          ? `0 0 0 2px ${baseColor}, 0 8px 24px ${baseColor}30`
          : `0 4px 12px ${baseColor}20`,
        transition: isResizing ? 'none' : 'box-shadow 0.2s ease, transform 0.1s ease',
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
            className="flow-node__type-icon"
            style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              boxShadow: `0 2px 4px ${baseColor}30`
            }}
          >
            {typeIcon}
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
          {/* Collapse/Expand button - hidden only for data and parser nodes */}
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
            >
              {collapsed ? '🔼' : '🔽'}
            </button>
          )}

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
          >
            <SettingsIcon />
          </button>

          {/* Color picker button */}
          <button
            type="button"
            className="flow-node__toolbar-button"
            onClick={handleColorButtonClick}
            title="Изменить цвет"
            disabled={disabled}
          >
            🎨
          </button>

          {/* File attachment button */}
          <button
            type="button"
            className="flow-node__toolbar-button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.onchange = (event) => {
                const files = (event.target as HTMLInputElement).files;
                if (files) {
                  const fileNames = Array.from(files).map(f => f.name);
                  const currentAttachments = node.meta?.attachments as string[] || [];
                  onChangeMeta(node.node_id, { 
                    attachments: [...currentAttachments, ...fileNames] 
                  });
                  console.log('Files attached:', fileNames);
                }
              };
              input.click();
            }}
            title="Прикрепить файлы"
            disabled={disabled}
          >
            📎
          </button>

          {/* Run button for AI nodes */}
          {isAiNode && (
            <button
              type="button"
              className="flow-node__toolbar-button text-green-400 hover:text-green-300"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRun(node.node_id);
              }}
              title="Запустить ноду"
              disabled={disabled}
            >
              ▶️
            </button>
          )}

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
      {!collapsed ? (
        <div 
          ref={contentRef} 
          className="flow-node__content nodrag"
          style={{ 
            padding: '16px', 
            paddingBottom: '8px', // Less padding at bottom since footer provides separation
            display: 'flex', 
            flexDirection: 'column',
            height: '100%'
          }}
        >
          {isAiNode && (
            <div className="space-y-4" style={{ flexShrink: 0 }}>
              {/* AI Content */}
              <div>
                {activeAiTab === 'settings' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-white/70 block mb-1">Провайдер</label>
                      <select
                        value={String(node.ai?.provider || '')}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        disabled={disabled}
                        className="w-full p-2 bg-black/20 border border-white/10 rounded text-sm nodrag"
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
                        <label className="text-xs text-white/70 block mb-1">Модель</label>
                        <select
                          value={String(node.ai?.model || selectedProvider.defaultModel)}
                          onChange={(e) => handleModelChange(e.target.value)}
                          disabled={disabled}
                          className="w-full p-2 bg-black/20 border border-white/10 rounded text-sm nodrag"
                          data-nodrag="true"
                        >
                          {selectedProvider.models.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-white/70 block mb-1">Системный промпт</label>
                      <textarea
                        value={systemPromptValue}
                        onChange={(e) => handleSystemPromptChange(e.target.value)}
                        placeholder="Например: Ты — полезный ассистент."
                        rows={3}
                        disabled={disabled}
                        className="w-full p-2 bg-black/20 border border-white/10 rounded text-sm resize-y nodrag"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        draggable={false}
                        data-nodrag="true"
                      />
                    </div>
                  </div>
                )}

                {activeAiTab === 'fields' && (
                  <div className="p-4 text-center text-white/50 text-sm">
                    Настройка полей временно отключена
                  </div>
                )}

                {activeAiTab === 'routing' && (
                  <div className="p-4 text-center text-white/50 text-sm">
                    Настройка маршрутизации временно отключена
                  </div>
                )}
              </div>
              
              {/* AI Tabs - positioned above footer */}
              <div className="absolute bottom-12 left-0 right-0 flex justify-center z-10">
                <div className="flex bg-black/40 rounded-lg p-1 backdrop-blur-sm border border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveAiTab('settings')}
                    className={`px-3 py-1 text-xs rounded transition ${
                      activeAiTab === 'settings' 
                        ? 'bg-white/20 text-white' 
                        : 'text-white/60 hover:text-white/80'
                    }`}
                    disabled={disabled}
                  >
                    ⚙️ Настройки
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveAiTab('fields')}
                    className={`px-3 py-1 text-xs rounded transition ${
                      activeAiTab === 'fields' 
                        ? 'bg-white/20 text-white' 
                        : 'text-white/60 hover:text-white/80'
                    }`}
                    disabled={disabled}
                  >
                    📝 Поля
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveAiTab('routing')}
                    className={`px-3 py-1 text-xs rounded transition ${
                      activeAiTab === 'routing' 
                        ? 'bg-white/20 text-white' 
                        : 'text-white/60 hover:text-white/80'
                    }`}
                    disabled={disabled}
                  >
                    🔀 Маршрутизация
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            minHeight: 0 
          }}>
            {node.type === 'html' ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-node-id={node.id}>
                {/* Website Preview */}
                <div className="w-full bg-white/5 border border-white/10 rounded flex-1 mb-3 overflow-hidden">
                  {htmlUrl ? (
                    <iframe
                      src={htmlUrl}
                      className="w-full h-full border-0"
                      style={{ 
                        width: '100%', // Always fill the container width
                        height: '100%', // Always fill the container height
                        minHeight: '200px',
                        transformOrigin: 'top left',
                        // Scale content to fit if needed
                        transform: screenWidth !== 'desktop' ? `scale(${getScaleForScreenWidth(screenWidth, nodeWidth)})` : 'none'
                      }}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                      loading="lazy"
                      title="Website Preview"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                      Введите URL для предпросмотра сайта
                    </div>
                  )}
                </div>
                
                {/* HTML Controls - in one row at bottom */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-white/70 block mb-1">URL</label>
                    <input
                      type="url"
                      value={htmlUrl}
                      onChange={(e) => handleHtmlUrlChange(e.target.value)}
                      placeholder="https://wikipedia.org"
                      className="w-full p-1.5 bg-black/20 border border-white/10 rounded text-xs text-white nodrag"
                      onMouseDown={(e) => e.stopPropagation()} // Prevent node dragging when clicking in input
                      onPointerDown={(e) => e.stopPropagation()} // Prevent pointer events from bubbling
                      draggable={false} // Explicitly disable dragging
                      data-nodrag="true" // Additional React Flow hint
                      onKeyDown={(e) => {
                        e.stopPropagation(); // Prevent keyboard events from bubbling
                        if (e.key === 'Enter') {
                          // Force iframe reload on Enter
                          const iframe = e.currentTarget.closest('.flex')?.previousElementSibling?.querySelector('iframe') as HTMLIFrameElement;
                          if (iframe && htmlUrl) {
                            iframe.src = htmlUrl;
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="w-32">
                    <label className="text-xs text-white/70 block mb-1">Масштаб</label>
                    <select
                      value={screenWidth}
                      onChange={(e) => handleScreenWidthChange(e.target.value)}
                      className="w-full p-1.5 bg-black/20 border border-white/10 rounded text-xs text-white nodrag"
                      title="Масштабирование для разных размеров экранов"
                      data-nodrag="true"
                    >
                      {SCREEN_WIDTHS.map(sw => (
                        <option key={sw.id} value={sw.id}>
                          {sw.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      // Force iframe reload
                      const iframe = document.querySelector(`[data-node-id="${node.id}"] iframe`) as HTMLIFrameElement;
                      if (iframe && htmlUrl) {
                        iframe.src = htmlUrl + '?t=' + Date.now(); // Add timestamp to force reload
                      }
                    }}
                    className="p-1.5 bg-black/20 border border-white/10 rounded text-white/70 hover:text-white hover:bg-black/30 transition-colors"
                    title="Обновить страницу"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 2.5a5.5 5.5 0 0 1 4.596 2.463l1.154-1.154a.5.5 0 0 1 .85.353v3.5a.5.5 0 0 1-.5.5h-3.5a.5.5 0 0 1-.353-.854l1.12-1.12A4.5 4.5 0 1 0 8 12.5a.5.5 0 0 1 0 1A5.5 5.5 0 1 1 8 2.5z"/>
                    </svg>
                  </button>
                </div>
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
        </div>
      ) : (
        <div 
          className="flow-node__content--collapsed"
          style={{ 
            padding: '8px 16px',
            flex: 0,
            backgroundColor: `${baseColor}10`,
            borderTop: `1px solid ${baseColor}20`,
            borderBottom: `1px solid ${baseColor}20`,
          }}
        >
          {/* Compact info when collapsed */}
          <div className="flex items-center justify-between text-xs text-white/70">
            <div className="flex items-center gap-2">
              {/* Content preview */}
              <span className="max-w-32 truncate">
                {node.content ? `"${node.content.substring(0, 40)}..."` : 'Нет содержимого'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* AI model indicator */}
              {isAiNode && selectedProvider && (
                <span className="text-blue-300 text-xs">
                  🤖 {selectedProvider.name}
                </span>
              )}
              {/* Character count */}
              <span className="text-white/50">
                {(node.content || '').length} сим.
              </span>
            </div>
          </div>
        </div>
      )}

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
          {/* Show different info based on collapsed state */}
          {collapsed ? (
            <>
              <span className="text-xs text-white/70">
                {node.type.toUpperCase()}
              </span>
              <span className="text-xs text-green-400/80">
                Готов
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-white/70">
                Символов: {(node.content || '').length.toLocaleString()}
              </span>
              {isAiNode && selectedProvider && (
                <span className="text-xs text-white/60">
                  {selectedProvider.name}
                </span>
              )}
              <span className="text-xs text-green-400/80">
                Готов
              </span>
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
            width: '16px',
            height: '16px',
            cursor: 'nwse-resize',
            backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.9)' : 'rgba(148, 163, 184, 0.8)',
            borderRadius: '2px 0 2px 0',
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
          onRunNode={onRun}
          onRegenerateNode={onRegenerate}
          onDeleteNode={onDelete}
          onUpdateNodeMeta={onChangeMeta}
          loading={disabled}
        />
      )}
    </div>
  );
}

export default memo(FlowNodeCard);