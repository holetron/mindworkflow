import { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react';
import { useUpdateNodeInternals, useReactFlow } from 'reactflow';

import Modal from './Modal';
import { useConfirmDialog } from './ConfirmDialog';
import type { FlowNode, PromptPreset, AutoPort, ModelSchemaInput } from '../state/api';
import { fetchQuickPromptPresets, searchPromptPresets, fetchModelSchema } from '../state/api';
import type { AgentInputField } from '../features/chat/types';
import { defaultMindmapExample, defaultPlannerPrompt } from '../data/promptPresets';
import { buildUserPromptTemplate, extractPlaceholderInfo, PlaceholderInfo } from '../utils/promptPlaceholders';
import { useDebouncedUpdateNodeInternals } from '../utils/debounce';
import { ModelInfoModal } from '../features/ai/ModelInfoModal';

// ========== ОПТИМИЗИРОВАННЫЕ КОМПОНЕНТЫ ДЛЯ AI SETTINGS ==========

/**
 * Мемоизированный компонент для редактирования output_example
 * Изолирован от ре-рендеров родительской модалки для устранения лагов при вводе
 */
interface OutputExampleEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const OutputExampleEditor = memo(({ value, onChange, onBlur, disabled, placeholder }: OutputExampleEditorProps) => {
  return (
    <textarea
      className="w-full h-32 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
      placeholder={placeholder || 'Например: {"nodes": [{"type": "text", "title": "...", "content": "..."}]}'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      spellCheck={false}
    />
  );
});
OutputExampleEditor.displayName = 'OutputExampleEditor';

/**
 * Мемоизированный компонент для редактирования system_prompt
 * Аналогичная оптимизация для избежания лагов
 */
interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const SystemPromptEditor = memo(({ value, onChange, onBlur, disabled, placeholder }: SystemPromptEditorProps) => {
  return (
    <textarea
      className="w-full h-48 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
      placeholder={placeholder || 'Введите системный промпт...'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      spellCheck={false}
    />
  );
});
SystemPromptEditor.displayName = 'SystemPromptEditor';

// ========== УТИЛИТЫ ==========

// Утилита для генерации автоматических портов из схемы модели
function generateAutoPorts(inputs: ModelSchemaInput[], enabledPorts: string[] = []): AutoPort[] {
  const ports: AutoPort[] = [];
  
  // ИСКЛЮЧАЕМ порт "prompt" - он собирается автоматически из:
  // - системного промпта (system_prompt)
  // - контекста входящих нод
  // - примера выходных данных (output_example)
  // Показываем только ОБЯЗАТЕЛЬНЫЕ или ВРУЧНУЮ ВКЛЮЧЕННЫЕ порты (кроме prompt)
  const filtered = inputs.filter(input => {
    // Исключаем prompt - он не является входным портом
    if (input.name === 'prompt') {
      return false;
    }
    return input.required || enabledPorts.includes(input.name);
  });
  
  filtered.forEach(input => {
      // ✅ Определяем тип порта по названию и типу данных из схемы
      let portType = input.type;
      
      // Если в названии есть "image" или "video" или формат указывает на медиа
      const nameLC = input.name.toLowerCase();
      if (nameLC.includes('image') || nameLC.includes('img') || nameLC.includes('photo') || nameLC.includes('picture')) {
        portType = 'image';
      } else if (nameLC.includes('video') || nameLC.includes('vid')) {
        portType = 'video';
      } else if (nameLC.includes('audio') || nameLC.includes('sound')) {
        portType = 'audio';
      }
      
      // Также проверяем формат в description или format
      const descLC = (input.description || '').toLowerCase();
      if (descLC.includes('image') || descLC.includes('picture') || descLC.includes('photo')) {
        portType = 'image';
      } else if (descLC.includes('video')) {
        portType = 'video';
      }
      
      ports.push({
        id: input.name,
        label: input.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: portType,
        required: input.required,
        position: 'left',  // ВСЕ входы слева!
        description: input.description,
        default: input.default,
        options: input.options,  // ✅ Передаём options для select
        min: input.min,          // ✅ Передаём min для number/slider
        max: input.max,          // ✅ Передаём max для number/slider
      });
    });
  
  return ports;
}

const MIDJOURNEY_DEFAULT_PORTS: Record<'photo' | 'video', string[]> = {
  photo: [
    'reference_image',      // Старые модели (V5, V5.1, V5.2) - generic ссылка на одно или несколько изображений
    'image_prompt',         // Новые модели (V7, V6.1, V6) - основные визуальные ссылки
    'style_reference',      // Новые модели - стиль
    'character_reference',  // Только V6! (--cref флаг не работает в V7)
    'omni',                 // Только V7! (--omni флаг, замена --cref для мультимодальных ссылок)
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

// ⚠️ Порты несовместимые с V7 (будут автоматически удалены, edges переключены на context)
const V7_INCOMPATIBLE_PORTS = [
  'character_reference', // --cref не работает в V7, только в V6. В V7 используйте omni (--omni)
];

// ⚠️ Порты несовместимые с V6 (будут автоматически удалены, edges переключены на context)
const V6_INCOMPATIBLE_PORTS: string[] = [
  'omni', // --omni только для V7, в V6 используйте character_reference (--cref)
];

// Функция определения версии модели по ID
function getMidjourneyVersion(modelId: string): 6 | 7 | null {
  const normalized = modelId.toLowerCase();
  if (normalized.includes('v7') || normalized.includes('-7')) return 7;
  if (normalized.includes('v6') || normalized.includes('-6')) return 6;
  return null; // Неизвестная или старая версия (V5, V5.1, V5.2)
}


interface AiProviderOption {
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

interface AiSettingsModalProps {
  node: FlowNode;
  onClose: () => void;
  activeTab: 'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request';
  onTabChange: (tab: 'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request') => void;
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
  edges?: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>; // ✅ Добавлено для проверки подключённых портов
}

const FALLBACK_SYSTEM_PRESETS: PromptPreset[] = [
  {
    preset_id: 'fallback-system-planner',
    category: 'system_prompt',
    label: 'Планировщик',
    description: 'Базовый системный промпт для генерации workflow планов',
    content: defaultPlannerPrompt,
    tags: ['default', 'planner'],
    is_quick_access: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

const FALLBACK_OUTPUT_PRESETS: PromptPreset[] = [
  {
    preset_id: 'fallback-output-mindmap',
    category: 'output_example',
    label: 'Mindmap',
    description: 'Пример выходных данных в формате mindmap',
    content: defaultMindmapExample,
    tags: ['default', 'mindmap'],
    is_quick_access: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

export function AiSettingsModal({ 
  node, 
  onClose, 
  activeTab, 
  onTabChange, 
  onChangeAi, 
  onUpdateNodeMeta,
  onRemoveInvalidPorts,
  providers = [],
  loading = false,
  dynamicModels: externalDynamicModels = {},
  loadingModels: externalLoadingModels = {},
  onOpen,
  allNodes = [],
  sources = [],
  targets = [],
  edges = [], // ✅ Добавлено для проверки подключённых портов
}: AiSettingsModalProps) {
  // ReactFlow hooks
  const updateNodeInternals = useUpdateNodeInternals();
  // ✅ Дебаунсированная версия для предотвращения множественных вызовов
  const debouncedUpdateNodeInternals = useDebouncedUpdateNodeInternals(updateNodeInternals, node.node_id, 50);
  const { getEdges } = useReactFlow();
  
  // ✅ Отслеживаем предыдущую модель чтобы детектить изменение
  const prevModelRef = useRef<string | number | undefined>(node.ai?.model);
  const prevProviderRef = useRef<string | undefined>(node.ai?.provider);
  
  // ✅ Новое: Отслеживаем инициализацию modal - пока идёт загрузка, показываем loading состояние
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
  
  // Model info for input mapping
  const [modelInputs, setModelInputs] = useState<ModelSchemaInput[]>([]);
  const [contextLimit, setContextLimit] = useState<number>(32000);
  const [loadingModelInfo, setLoadingModelInfo] = useState(false);
  
  // Pending port changes (применяются только при сохранении)
  const [pendingEnabledPorts, setPendingEnabledPorts] = useState<string[]>(node.meta?.enabled_ports as string[] || []);
  const [pendingAutoPorts, setPendingAutoPorts] = useState<AutoPort[]>(node.ai?.auto_ports || []);
  
  // ⚠️ Невалидные порты с подключениями (для красной подсветки)
  const [invalidPortsWithEdges, setInvalidPortsWithEdges] = useState<string[]>([]);
  
  // Field mapping TARGET (куда идут данные) и SOURCE (откуда берём)
  const [systemPromptTarget, setSystemPromptTarget] = useState<string>(
    String(node.ai?.field_mapping?.system_prompt_target || 'prompt')
  );
  const [systemPromptSource, setSystemPromptSource] = useState<'manual' | 'port'>(
    (node.ai?.field_mapping?.system_prompt_source as 'manual' | 'port') || 'manual'
  );
  
  const [outputExampleTarget, setOutputExampleTarget] = useState<string>(
    String(node.ai?.field_mapping?.output_example_target || 'prompt')
  );
  const [outputExampleSource, setOutputExampleSource] = useState<'manual' | 'port'>(
    (node.ai?.field_mapping?.output_example_source as 'manual' | 'port') || 'manual'
  );
  
  const [temperatureTarget, setTemperatureTarget] = useState<string>(
    String(node.ai?.field_mapping?.temperature_target || 'temperature')
  );
  const [temperatureSource, setTemperatureSource] = useState<'manual' | 'port'>(
    (node.ai?.field_mapping?.temperature_source as 'manual' | 'port') || 'manual'
  );
  
  // Дополнительные поля из схемы модели
  const [additionalFieldsMapping, setAdditionalFieldsMapping] = useState<Record<string, any>>(
    (node.ai?.field_mapping?.additional_fields as Record<string, any>) || {}
  );
  
  // Значения дополнительных полей (храним отдельно от mapping)
  const [additionalFieldsValues, setAdditionalFieldsValues] = useState<Record<string, string>>(
    () => {
      const values: Record<string, string> = {};
      const meta = node.meta as any;
      if (meta) {
        Object.keys(meta).forEach(key => {
          if (typeof meta[key] === 'string' || typeof meta[key] === 'number') {
            values[key] = String(meta[key]);
          }
        });
      }
      return values;
    }
  );

  const fileDeliveryFormat: 'url' | 'base64' =
    typeof node.ai?.file_delivery_format === 'string' &&
    node.ai.file_delivery_format.trim().toLowerCase() === 'base64'
      ? 'base64'
      : 'url';
  
  // Preview payload from backend (reactive to field_mapping changes)
  const [previewPayload, setPreviewPayload] = useState<Record<string, any>>({});
  const [previewLoading, setPreviewLoading] = useState(false);

  // ✅ Fetch preview payload when activeTab is 'request' or when field_mapping changes
  const fetchPreviewPayload = useCallback(async () => {
    if (!node.project_id) return;
    try {
      setPreviewLoading(true);
      const response = await fetch(`/api/node/${node.node_id}/ai/preview-payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: node.project_id }),
      });

      if (!response.ok) {
        console.error('Failed to fetch preview payload:', response.statusText);
        setPreviewPayload({});
        return;
      }

      const payload = await response.json();
      setPreviewPayload(payload);
    } catch (error) {
      console.error('Error fetching preview payload:', error);
      setPreviewPayload({});
    } finally {
      setPreviewLoading(false);
    }
  }, [node.node_id, node.project_id]);

  useEffect(() => {
    if (activeTab !== 'request') return;
    // Initial fetch when user opens the Request tab
    fetchPreviewPayload();
  }, [activeTab, fetchPreviewPayload]);

  const handleFileDeliveryFormatChange = (format: 'url' | 'base64') => {
    if (!onChangeAi) {
      return;
    }
    onChangeAi(node.node_id, { ...(node.ai ?? {}), file_delivery_format: format });
    setHasChanges(true);
  };
  
  // Режим отображения для вкладки "Вывод"
  const [viewMode, setViewMode] = useState<'simple' | 'full'>('full');
  
  // Вычисляем placeholder info БЕЗ useMemo (избегаем проблем с зависимостями)
  const placeholderInfo = extractPlaceholderInfo(systemPromptValue, allNodes, node);
  const generatedUserPrompt = buildUserPromptTemplate(placeholderInfo);
  const unresolvedPlaceholders = placeholderInfo.filter((item) => item.reference && item.resolvedValue === undefined);

  // Вычисляем входящие и исходящие ноды из sources/targets (БЕЗ useMemo чтобы избежать проблем с зависимостями)
  const incomingNodes = !sources || !allNodes ? [] : sources
    .map((source) => allNodes.find((n) => n.node_id === source.node_id))
    .filter((n): n is FlowNode => !!n);

  const outgoingNodes = !targets || !allNodes ? [] : targets
    .map((target) => allNodes.find((n) => n.node_id === target.node_id))
    .filter((n): n is FlowNode => !!n);

  // Helper: Get node type icon
  const getNodeIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      text: '📝',
      ai: '🤖',
      markdown: '📄',
      image: '🖼️',
      video: '🎥',
      audio: '🎵',
      pdf: '📕',
      file: '📎',
      code: '💻',
      html: '🌐',
      data: '🗂️',
    };
    return iconMap[type] || '📦';
  };

  // Функция для получения превью содержимого ноды (50 символов)
  const getNodeContentPreview = (n: FlowNode): React.ReactNode => {
    const MAX_LENGTH = 50;
    let content = '';

    if (n.type === 'text' && n.content) {
      content = String(n.content);
    } else if (n.type === 'image') {
      const meta = n.meta as any;
      content = meta?.image_url || meta?.original_image || '';
    } else if (n.type === 'video') {
      const meta = n.meta as any;
      content = meta?.video_url || '';
    } else if (n.type === 'pdf' || n.type === 'file') {
      const meta = n.meta as any;
      content = meta?.file_url || meta?.pdf_url || n.content || '';
    } else if (n.type === 'code' && n.content) {
      content = String(n.content);
    } else if (n.type === 'ai' || n.type === 'ai_improved') {
      content = n.content || '';
    } else if (n.content) {
      content = String(n.content);
    }

    if (!content) return <span className="text-slate-500 italic">(нет содержимого)</span>;
    
    const trimmed = content.trim();
    
    // Проверка на URL
    const isUrl = /^https?:\/\//i.test(trimmed);
    
    if (isUrl) {
      const displayUrl = trimmed.length <= MAX_LENGTH ? trimmed : trimmed.substring(0, MAX_LENGTH) + '...';
      return (
        <a
          href={trimmed}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline break-all"
          title={trimmed}
        >
          {displayUrl}
        </a>
      );
    }
    
    if (trimmed.length <= MAX_LENGTH) return <span>{trimmed}</span>;
    return <span title={trimmed}>{trimmed.substring(0, MAX_LENGTH) + '...'}</span>;
  };

  // Функция для рекурсивного сбора нод по уровням глубины
  const getNodesAtDepth = (targetDepth: number, direction: 'incoming' | 'outgoing'): FlowNode[] => {
    if (targetDepth <= 0 || !allNodes) return [];
    
    const result: Set<string> = new Set();
    const visited: Set<string> = new Set();
    let currentLevel: Set<string> = new Set();
    
    // Начальный уровень
    if (direction === 'incoming' && sources) {
      sources.forEach(s => currentLevel.add(s.node_id));
    } else if (direction === 'outgoing' && targets) {
      targets.forEach(t => currentLevel.add(t.node_id));
    }
    
    const edges = getEdges();
    
    // Обходим граф на нужную глубину
    for (let depth = 0; depth < targetDepth && currentLevel.size > 0; depth++) {
      const nextLevel: Set<string> = new Set();
      
      for (const nodeId of currentLevel) {
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        result.add(nodeId);
        
        // Ищем следующий уровень в направлении
        if (direction === 'incoming') {
          // Ищем edges которые заканчиваются на currentNode (target === nodeId)
          edges.forEach(edge => {
            if (edge.target === nodeId && !visited.has(edge.source)) {
              nextLevel.add(edge.source);
            }
          });
        } else {
          // Ищем edges которые начинаются от currentNode (source === nodeId)
          edges.forEach(edge => {
            if (edge.source === nodeId && !visited.has(edge.target)) {
              nextLevel.add(edge.target);
            }
          });
        }
      }
      
      currentLevel = nextLevel;
    }
    
    // Преобразуем Set в массив нод
    return Array.from(result)
      .map(nodeId => allNodes.find(n => n.node_id === nodeId))
      .filter((n): n is FlowNode => !!n);
  };

  // ✨ Новая функция: получить ВСЕ данные из всех подключённых нод к порту (массив!)
  const getPortDataList = (portId: string, portType?: string): string[] => {
    const currentEdges = getEdges();
    
    // Находим ВСЕ edges, которые ведут к нашей ноде и этому порту
    const incomingEdges = currentEdges.filter((edge: any) => 
      edge.target === node.node_id && 
      (edge.targetHandle === portId || (!edge.targetHandle && portId === 'prompt'))
    );
    
    if (incomingEdges.length === 0) {
      return [];
    }

    const results: string[] = [];

    for (const incomingEdge of incomingEdges) {
      // Находим исходную ноду
      const sourceNode = allNodes.find((n: FlowNode) => n.node_id === incomingEdge.source);
      
      if (sourceNode) {
        // Используем логику из getPortData
        const meta = (sourceNode.meta ?? {}) as Record<string, unknown>;
        const handle = incomingEdge.sourceHandle;
        const lowerPortId = portId.toLowerCase();
        const normalizedPortType = (portType || '').toLowerCase();
        const isImagePort =
          normalizedPortType === 'image' ||
          sourceNode.type === 'image' ||
          lowerPortId.includes('image');

        const pickImageMetaValue = () => {
          const candidates: Array<unknown> = [];
          const rawMode =
            typeof meta.image_output_mode === 'string' ? meta.image_output_mode.trim().toLowerCase() : '';
          if (rawMode === 'crop') {
            candidates.push(meta.image_crop, meta.crop_image);
          } else if (rawMode === 'annotated') {
            candidates.push(meta.image_edited, meta.edited_image, meta.annotated_image);
          }
          candidates.push(
            meta.image_url,
            meta.local_url,
            meta.image_original,
            meta.original_image,
            meta.image_edited,
            meta.edited_image,
            meta.image_crop,
            meta.crop_image,
            meta.annotated_image,
          );
          for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
              return candidate.trim();
            }
          }
          return null;
        };

        // Получаем значение
        let portValue = '';
        if (!handle || handle === 'output') {
          if (isImagePort) {
            const url = pickImageMetaValue() ?? String(sourceNode.content || '');
            portValue = String(url || '').trim();
          }
        } else {
          const metaValue = meta?.[handle];
          if (typeof metaValue === 'string' && metaValue.trim().length > 0) {
            portValue = metaValue.trim();
          } else {
            portValue = pickImageMetaValue() || String(sourceNode.content || '').trim();
          }
        }

        if (portValue) {
          results.push(portValue);
        }
      }
    }

    return results;
  };

  // Функция для получения данных из порта через React Flow edges
  const getPortData = (portId: string, portType?: string): string => {
    // Получаем текущие edges из React Flow
    const currentEdges = getEdges();
    
    // Находим edge, который ведет к нашей ноде и этому порту
    const incomingEdge = currentEdges.find((edge: any) => 
      edge.target === node.node_id && 
      (edge.targetHandle === portId || (!edge.targetHandle && portId === 'prompt'))
    );
    
    if (incomingEdge) {
      // Находим исходную ноду
      const sourceNode = allNodes.find((n: FlowNode) => n.node_id === incomingEdge.source);
      
      if (sourceNode) {
        // Получаем данные из исходной ноды
        const meta = (sourceNode.meta ?? {}) as Record<string, unknown>;
        const handle = incomingEdge.sourceHandle;
        const lowerPortId = portId.toLowerCase();
        const normalizedPortType = (portType || '').toLowerCase();
        const isImagePort =
          normalizedPortType === 'image' ||
          sourceNode.type === 'image' ||
          lowerPortId.includes('image');
        const isVideoPort =
          normalizedPortType === 'video' ||
          sourceNode.type === 'video' ||
          lowerPortId.includes('video');
        const isAudioPort =
          normalizedPortType === 'audio' ||
          sourceNode.type === 'audio' ||
          lowerPortId.includes('audio');
        const isFilePort =
          normalizedPortType === 'file' ||
          ['pdf', 'file'].includes(sourceNode.type) ||
          lowerPortId.includes('file') ||
          lowerPortId.includes('pdf');

        const preferNodeContent = () => String(sourceNode.content || '');
        const pickImageMetaValue = () => {
          const candidates: Array<unknown> = [];
          const rawMode =
            typeof meta.image_output_mode === 'string' ? meta.image_output_mode.trim().toLowerCase() : '';
          if (rawMode === 'crop') {
            candidates.push(meta.image_crop, meta.crop_image);
          } else if (rawMode === 'annotated') {
            candidates.push(meta.image_edited, meta.edited_image, meta.annotated_image);
          }
          candidates.push(
            meta.image_url,
            meta.local_url,
            meta.image_original,
            meta.original_image,
            meta.image_edited,
            meta.edited_image,
            meta.image_crop,
            meta.crop_image,
            meta.annotated_image,
          );
          for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
              return candidate.trim();
            }
          }
          return null;
        };

        // Если handle пустой либо стандартный output — используем контент/мета в зависимости от типа
        if (!handle || handle === 'output') {
          if (isImagePort) {
            const url = pickImageMetaValue() ?? preferNodeContent();
            return String(url || '').trim();
          }
          if (isVideoPort) {
            const videoUrl =
              typeof meta.video_url === 'string' && meta.video_url.trim().length > 0
                ? meta.video_url
                : preferNodeContent();
            return String(videoUrl || '').trim();
          }
          if (isAudioPort) {
            const audioUrl =
              typeof meta.audio_url === 'string' && meta.audio_url.trim().length > 0
                ? meta.audio_url
                : preferNodeContent();
            return String(audioUrl || '').trim();
          }
          if (isFilePort) {
            const fileUrl =
              typeof meta.file_url === 'string' && meta.file_url.trim().length > 0
                ? meta.file_url
                : typeof meta.pdf_url === 'string' && meta.pdf_url.trim().length > 0
                  ? meta.pdf_url
                  : preferNodeContent();
            return String(fileUrl || '').trim();
          }
          return preferNodeContent().trim();
        }

        // Пробуем достать значение по source handle напрямую из meta
        const metaValue = meta?.[handle];
        if (typeof metaValue === 'string' && metaValue.trim().length > 0) {
          return metaValue.trim();
        }

        if (handle === 'image-crop') {
          const cropEnabled = Boolean(
            (typeof meta.image_crop_expose_port === 'boolean' && meta.image_crop_expose_port) ||
              (meta.image_crop_settings &&
                typeof (meta.image_crop_settings as Record<string, unknown>).exposePort === 'boolean' &&
                (meta.image_crop_settings as Record<string, unknown>).exposePort === true),
          );
          if (!cropEnabled) {
            return '';
          }
          const directCrop = ((): string | null => {
            if (typeof meta.image_crop === 'string' && meta.image_crop.trim().length > 0) {
              return meta.image_crop.trim();
            }
            if (typeof meta.crop_image === 'string' && meta.crop_image.trim().length > 0) {
              return meta.crop_image.trim();
            }
            return null;
          })();
          if (directCrop) {
            return directCrop;
          }
          return '';
        }

        // Дополнительные эвристики для типизированных портов
        if (isImagePort) {
          const fallbackImage =
            pickImageMetaValue() ??
            (typeof meta.image_url === 'string' && meta.image_url.trim().length > 0
              ? meta.image_url
              : preferNodeContent());
          return String(fallbackImage || '').trim();
        }
        if (isVideoPort) {
          const fallbackVideo =
            typeof meta.video_url === 'string' && meta.video_url.trim().length > 0
              ? meta.video_url
              : preferNodeContent();
          return String(fallbackVideo || '').trim();
        }
        if (isAudioPort) {
          const fallbackAudio =
            typeof meta.audio_url === 'string' && meta.audio_url.trim().length > 0
              ? meta.audio_url
              : preferNodeContent();
          return String(fallbackAudio || '').trim();
        }
        if (isFilePort) {
          const fallbackFile =
            typeof meta.file_url === 'string' && meta.file_url.trim().length > 0
              ? meta.file_url
              : typeof meta.pdf_url === 'string' && meta.pdf_url.trim().length > 0
                ? meta.pdf_url
                : preferNodeContent();
          return String(fallbackFile || '').trim();
        }

        // По умолчанию используем содержимое ноды
        return preferNodeContent().trim();
      }
    }
    
    return '';
  };

  // Функция для форматирования ноды в контекст (4 режима)
  const formatNodeForContext = (n: FlowNode, mode: 'simple' | 'full_json' | 'clean' | 'simple_json'): string => {
    if (mode === 'full_json') {
      // Полный JSON с заменой connections на edges
      const nodeObj = { ...n };
      
      // Строим edges из sources/targets вместо пустых connections
      const nodeEdges: any[] = [];
      if (sources && sources.length > 0) {
        for (const source of sources) {
          if (source.node_id) {
            nodeEdges.push({ from: source.node_id, to: n.node_id });
          }
        }
      }
      if (targets && targets.length > 0) {
        for (const target of targets) {
          if (target.node_id) {
            nodeEdges.push({ from: n.node_id, to: target.node_id });
          }
        }
      }
      
      // Удаляем connections и добавляем edges
      delete (nodeObj as any).connections;
      if (nodeEdges.length > 0) {
        (nodeObj as any).edges = nodeEdges;
      }
      
      return JSON.stringify(nodeObj, null, 2);
    }

    if (mode === 'clean') {
      // Чистый формат: ТОЛЬКО контент без префиксов (raw data для Replicate)
      let content = '';
      if (n.type === 'text' && n.content) {
        content = String(n.content).trim();
      } else if (n.type === 'image') {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        const imageUrl = meta?.image_url || meta?.original_image;
        content = typeof imageUrl === 'string' ? imageUrl.trim() : '';
      } else if (n.type === 'video') {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        const videoUrl = meta?.video_url;
        content = typeof videoUrl === 'string' ? videoUrl.trim() : '';
      } else if (n.type === 'pdf' || n.type === 'file') {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        const fileUrl = meta?.file_url || meta?.pdf_url;
        content = typeof fileUrl === 'string' ? fileUrl.trim() : String(n.content || '').trim();
      } else if (n.type === 'ai' || n.type === 'ai_improved') {
        content = (n.content || '').trim();
      } else if (n.content) {
        content = String(n.content).trim();
      }
      // Возвращаем только контент (без Title:)
      return content;
    }

    if (mode === 'simple_json') {
      // Упрощенный JSON с edges
      const nodeObj: any = {
        type: n.type,
        title: n.title,
        content: n.content || undefined,
      };

      // Добавляем AI конфигурацию если есть
      if (n.ai && Object.keys(n.ai).length > 0) {
        nodeObj.ai = {
          system_prompt: n.ai.system_prompt || undefined,
          model: n.ai.model || undefined,
        };
      }

      // Добавляем edges (находим из sources/targets)
      const nodeEdges: any[] = [];
      if (sources && sources.length > 0) {
        for (const source of sources) {
          if (source.node_id) {
            nodeEdges.push({ from: source.node_id, to: n.node_id });
          }
        }
      }
      if (targets && targets.length > 0) {
        for (const target of targets) {
          if (target.node_id) {
            nodeEdges.push({ from: n.node_id, to: target.node_id });
          }
        }
      }
      if (nodeEdges.length > 0) {
        nodeObj.edges = nodeEdges;
      }

      return JSON.stringify(nodeObj, null, 2);
    }

    // Simple mode (по умолчанию)
    const parts: string[] = [];
    parts.push(`Context from "${n.title || n.node_id}":`);

    switch (n.type) {
      case 'text': {
        if (n.content) {
          parts.push(String(n.content));
        }
        break;
      }
      case 'image': {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        const imageUrl = meta?.image_url || meta?.original_image;
        parts.push(`Image: ${n.title || 'Untitled'}`);
        if (imageUrl && typeof imageUrl === 'string') {
          parts.push(`URL: ${imageUrl}`);
        }
        break;
      }
      case 'video': {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        const videoUrl = meta?.video_url;
        parts.push(`Video: ${n.title || 'Untitled'}`);
        if (videoUrl && typeof videoUrl === 'string') {
          parts.push(`URL: ${videoUrl}`);
        }
        break;
      }
      case 'pdf':
      case 'file': {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        const fileUrl = meta?.file_url || meta?.pdf_url;
        parts.push(`File: ${n.title || 'Untitled'}`);
        if (fileUrl && typeof fileUrl === 'string') {
          parts.push(`URL: ${fileUrl}`);
        }
        if (n.content) {
          parts.push(`Content: ${n.content}`);
        }
        break;
      }
      case 'code': {
        parts.push(`Code: ${n.title || 'Untitled'}`);
        if (n.content) {
          parts.push('```');
          parts.push(String(n.content));
          parts.push('```');
        }
        break;
      }
      case 'ai':
      case 'ai_improved': {
        parts.push(`AI Node: ${n.title || 'Untitled'}`);
        if (n.content) {
          parts.push(String(n.content));
        }
        break;
      }
      default: {
        if (n.content) {
          parts.push(String(n.content));
        }
        break;
      }
    }

    return parts.join('\n');
  };

  // Вычисляем реальный контекст для отображения (БЕЗ useMemo)
  const edgesToCurrentNode = getEdges().filter((edge: any) => edge.target === node.node_id);

  const activeAutoPortIdSet = new Set<string>();
  pendingAutoPorts
    .filter((port) => port.id !== 'prompt')
    .forEach((port) => {
      if (port.required || pendingEnabledPorts.includes(port.id)) {
        activeAutoPortIdSet.add(port.id);
      }
    });

  const autoPortSourceIds = new Set<string>();
  edgesToCurrentNode.forEach((edge: any) => {
    if (edge.targetHandle && activeAutoPortIdSet.has(edge.targetHandle)) {
      autoPortSourceIds.add(edge.source);
    }
  });

  const autoInputsPreview = pendingAutoPorts
    .filter((port) => port.id !== 'prompt' && (port.required || pendingEnabledPorts.includes(port.id)))
    .map((port) => {
      const linkedEdge = edgesToCurrentNode.find(
        (edge: any) => edge.targetHandle === port.id || (!edge.targetHandle && port.id === 'prompt'),
      );
      const sourceNode = linkedEdge
        ? allNodes.find((n: FlowNode) => n.node_id === linkedEdge.source)
        : undefined;
      const rawValue = getPortData(port.id, port.type);
      const previewValue =
        rawValue.length > 0
          ? rawValue.length > 140
            ? `${rawValue.slice(0, 137)}...`
            : rawValue
          : '';
      return {
        port,
        sourceNode,
        value: previewValue,
        hasValue: rawValue.trim().length > 0,
      };
    });

  const { contextPreview, contextCharCount } = useMemo(() => {
    const mode = (node.ai?.context_mode as 'simple' | 'full_json' | 'clean' | 'simple_json') ?? 'simple';
    const contextParts: string[] = [];
    const processedNodeIds: Set<string> = new Set(); // Чтобы не добавить одну ноду дважды
    
    // Входящие ноды - с учётом context_left_depth
    const filteredIncomingNodes = getNodesAtDepth(
      Number(node.ai?.context_left_depth ?? 1),
      'incoming'
    );
    
    for (const n of filteredIncomingNodes) {
      if (autoPortSourceIds.has(n.node_id) || processedNodeIds.has(n.node_id)) {
        continue;
      }
      processedNodeIds.add(n.node_id);
      const formatted = formatNodeForContext(n, mode);
      if (formatted.trim().length > 0) {
        contextParts.push(formatted);
      }
    }
    
    // Выходящие ноды - с учётом context_right_depth
    const filteredOutgoingNodes = getNodesAtDepth(
      Number(node.ai?.context_right_depth ?? 0),
      'outgoing'
    );
    
    for (const n of filteredOutgoingNodes) {
      if (autoPortSourceIds.has(n.node_id) || processedNodeIds.has(n.node_id)) {
        continue;
      }
      processedNodeIds.add(n.node_id);
      const formatted = formatNodeForContext(n, mode);
      if (formatted.trim().length > 0) {
        contextParts.push(formatted);
      }
    }
    
    // Для режима 'clean' используем разделитель " ; ", для остальных - "\n\n---\n\n"
    const separator = mode === 'clean' ? ' ; ' : '\n\n---\n\n';
    const preview = contextParts.join(separator);
    
    return {
      contextPreview: preview,
      contextCharCount: preview.length
    };
  }, [node.ai?.context_left_depth, node.ai?.context_right_depth, node.ai?.context_mode, autoPortSourceIds]);

  // Состояние для динамической загрузки моделей - используем внешние если доступны
  const [localDynamicModels, setLocalDynamicModels] = useState<Record<string, string[]>>({});
  const [localLoadingModels, setLocalLoadingModels] = useState<Record<string, boolean>>({});

  const metaRecord = (node.meta ?? {}) as Record<string, unknown>;
  const replicatePredictionUrl =
    typeof metaRecord['replicate_prediction_url'] === 'string'
      ? (metaRecord['replicate_prediction_url'] as string)
      : '';
  const replicatePredictionApiUrl =
    typeof metaRecord['replicate_prediction_api_url'] === 'string'
      ? (metaRecord['replicate_prediction_api_url'] as string)
      : '';
  const replicatePredictionId =
    typeof metaRecord['replicate_prediction_id'] === 'string'
      ? (metaRecord['replicate_prediction_id'] as string)
      : '';
  const replicateStatusRaw =
    typeof metaRecord['replicate_status'] === 'string' ? (metaRecord['replicate_status'] as string) : '';
  const replicateStatus = replicateStatusRaw.trim();
  const replicateStatusLabel = replicateStatus
    ? replicateStatus.charAt(0).toUpperCase() + replicateStatus.slice(1)
    : '—';
  const replicateStatusColor =
    replicateStatus === 'succeeded'
      ? 'text-emerald-300'
      : replicateStatus === 'failed'
        ? 'text-rose-300'
        : replicateStatus
          ? 'text-sky-200'
          : 'text-slate-400';
  const replicatePredictionIdMasked =
    replicatePredictionId.length > 18
      ? `${replicatePredictionId.slice(0, 8)}…${replicatePredictionId.slice(-6)}`
      : replicatePredictionId;
  
  // Use external models if provided, otherwise use local state
  const dynamicModels = Object.keys(externalDynamicModels).length > 0 ? externalDynamicModels : localDynamicModels;
  const loadingModels = Object.keys(externalLoadingModels).length > 0 ? externalLoadingModels : localLoadingModels;
  
  // Состояние для принудительного ререндеринга
  const [forceRender, setForceRender] = useState(0);
  const [currentProvider, setCurrentProvider] = useState(String(node.ai?.provider || ''));
  const [midjourneyMode, setMidjourneyMode] = useState<'photo' | 'video'>(() => {
    const raw = typeof node.ai?.midjourney_mode === 'string' ? node.ai.midjourney_mode : '';
    return raw === 'video' ? 'video' : 'photo';
  });

  // Confirm dialog hook
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  // Sync currentProvider with node changes
  useEffect(() => {
    setCurrentProvider(String(node.ai?.provider || ''));
  }, [node.ai?.provider]);

  useEffect(() => {
    const raw = typeof node.ai?.midjourney_mode === 'string' ? node.ai.midjourney_mode : '';
    setMidjourneyMode(raw === 'video' ? 'video' : 'photo');
  }, [node.ai?.midjourney_mode]);

  // Force sync on modal mount - ensure currentProvider is synced immediately
  useEffect(() => {
    console.log('🔄 AiSettingsModal mounted, syncing provider:', {
      nodeProvider: node.ai?.provider,
      currentProvider
    });
    setCurrentProvider(String(node.ai?.provider || ''));
    setForceRender(prev => prev + 1);
    
    // Call onOpen if provided
    if (onOpen) {
      onOpen();
    }
  }, []); // Empty deps - runs only on mount

  useEffect(() => {
    let cancelled = false;
    const loadQuickPrompts = async () => {
      try {
        const [system, output] = await Promise.all([
          fetchQuickPromptPresets('system_prompt', 12),
          fetchQuickPromptPresets('output_example', 12),
        ]);
        if (cancelled) {
          return;
        }
        setQuickSystemPrompts(system.length > 0 ? system : FALLBACK_SYSTEM_PRESETS);
        setQuickOutputExamples(output.length > 0 ? output : FALLBACK_OUTPUT_PRESETS);
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load quick prompt presets', error);
          setQuickSystemPrompts(FALLBACK_SYSTEM_PRESETS);
          setQuickOutputExamples(FALLBACK_OUTPUT_PRESETS);
        }
      }
    };

    void loadQuickPrompts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const next = String(node.ai?.user_prompt_template || '');
    setUserPromptValue(next);
    setAutoGenerateUserPrompt(next.trim().length === 0);
  }, [node.node_id, node.ai?.user_prompt_template]);

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
          setPromptSearchError(error instanceof Error ? error.message : 'Не удалось выполнить поиск');
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
    if (!autoGenerateUserPrompt) {
      return;
    }
    if (placeholderInfo.length === 0) {
      return;
    }
    if (!generatedUserPrompt.trim()) {
      return;
    }
    setUserPromptValue((prev) => {
      if (prev === generatedUserPrompt) {
        return prev;
      }
      setHasChanges(true);
      return generatedUserPrompt;
    });
  }, [autoGenerateUserPrompt, generatedUserPrompt, placeholderInfo.length]);

  // Fetch model info for input mapping when routing tab is active
  useEffect(() => {
    const fetchModelInfo = async () => {
      if (activeTab !== 'routing' || !node.ai?.model || !node.ai?.provider) {
        return;
      }

      setLoadingModelInfo(true);
      try {
        const token = localStorage.getItem('authToken');
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let url = `/api/integrations/models/${node.ai.provider}/info?modelId=${encodeURIComponent(String(node.ai.model))}`;
        if (node.ai.provider === 'replicate') {
          url += '&apiToken=r8_Uu6iTMDO39VM0upvBO3ogKsZG6lSJdQ2YCKQ4';
        }

        const response = await fetch(url, { headers });
        if (response.ok) {
          const data = await response.json();
          setModelInputs(data.inputs || []);
          setContextLimit(data.limits?.context_tokens || 32000);
        }
      } catch (err) {
        console.error('Failed to fetch model info:', err);
      } finally {
        setLoadingModelInfo(false);
      }
    };

    fetchModelInfo();
  }, [activeTab, node.ai?.model, node.ai?.provider]);

  // ✅ Восстанавливаем pendingEnabledPorts из field_mapping при загрузке
  // Это нужно чтобы порты отображались для существующих проектов
  useEffect(() => {
    // ⚠️ НЕ восстанавливаем если модель только что изменилась
    // (field_mapping еще содержит данные от старой модели)
    const modelJustChanged = prevModelRef.current !== node.ai?.model;
    const providerJustChanged = prevProviderRef.current !== node.ai?.provider;
    
    if (modelJustChanged || providerJustChanged) {
      console.log('⏭️ Skipping field_mapping restore - model/provider just changed');
      return;
    }
    
    const portsToEnable: string[] = [];
    
    // Проверяем field_mapping
    if (node.ai?.field_mapping) {
      const mapping = node.ai.field_mapping as any;
      
      // System prompt
      if (mapping.system_prompt_source === 'port') {
        portsToEnable.push('system_prompt');
        setSystemPromptSource('port'); // ✅ Обновляем state чекбокса
      }
      
      // Output example
      if (mapping.output_example_source === 'port') {
        portsToEnable.push('output_example');
        setOutputExampleSource('port'); // ✅ Обновляем state чекбокса
      }
      
      // Temperature
      if (mapping.temperature_source === 'port') {
        portsToEnable.push('temperature');
        setTemperatureSource('port'); // ✅ Обновляем state чекбокса
      }
      
      // Additional fields
      if (mapping.additional_fields) {
        setAdditionalFieldsMapping(mapping.additional_fields); // ✅ Обновляем state дополнительных полей
        Object.entries(mapping.additional_fields).forEach(([key, value]: [string, any]) => {
          if (value?.source === 'port') {
            portsToEnable.push(key);
          }
        });
      }
    }
    
    // ТАКЖЕ восстанавливаем из auto_ports (например при перезагрузке модала)
    if (node.ai?.auto_ports && node.ai.auto_ports.length > 0) {
      node.ai.auto_ports.forEach((port: any) => {
        if (!portsToEnable.includes(port.id)) {
          portsToEnable.push(port.id);
        }
      });
    }
    
    // Обновляем pendingEnabledPorts если есть что восстанавливать
    if (portsToEnable.length > 0) {
      console.log('🔄 Restoring ports from field_mapping or auto_ports:', portsToEnable);
      setPendingEnabledPorts(prev => {
        const combined = [...new Set([...prev, ...portsToEnable])];
        return combined;
      });
    }
  }, [node.ai?.field_mapping, node.ai?.auto_ports]); // Запускаем при изменении field_mapping или auto_ports

  // ✅ Вызываем updateNodeInternals при изменении pendingEnabledPorts (ДЕБАУНСИРОВАНО)
  // Это нужно чтобы ReactFlow обновил Handle компоненты после добавления/удаления портов
  useEffect(() => {
    if (pendingEnabledPorts.length > 0 || node.ai?.auto_ports) {
      console.log('🔄 [AiSettingsModal] Enabled ports changed, updating internals:', pendingEnabledPorts);
      debouncedUpdateNodeInternals();
    }
  }, [pendingEnabledPorts, node.node_id, debouncedUpdateNodeInternals, node.ai?.auto_ports]);

  // Функции для загрузки моделей
  const fetchGoogleModels = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/google/models', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Google models API error:', response.status, response.statusText);
        return [];
      }
      
      const data = await response.json();
      return Array.isArray(data.models) ? data.models : [];
    } catch (error) {
      console.error('Error fetching Google models:', error);
      return [];
    }
  }, []);

  const fetchOpenAIModels = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/openai/models', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('OpenAI models API error:', response.status, response.statusText);
        return [];
      }
      
      const data = await response.json();
      return Array.isArray(data.models) ? data.models : [];
    } catch (error) {
      console.error('Error fetching OpenAI models:', error);
      return [];
    }
  }, []);

  // Функция для принудительного ререндеринга
  const triggerRerender = useCallback(() => {
    setForceRender(prev => prev + 1);
  }, []);

  // Загрузка моделей для провайдера
  const loadModelsForProvider = useCallback(async (providerId: string) => {
    console.log('🔄 Loading models for provider:', providerId);
    
    // If external loading state is controlled, don't manage local state
    if (Object.keys(externalLoadingModels).length > 0) {
      console.log('🔄 External loading models controlled, skipping local load for:', providerId);
      return;
    }
    
    // Проверяем, поддерживает ли провайдер динамическую загрузку
    const supportedProviders = ['google_gemini', 'google_workspace', 'google', 'openai_gpt', 'openai'];
    if (!supportedProviders.includes(providerId)) {
      console.log('⚠️ Provider not supported for dynamic loading:', providerId);
      return;
    }
    
    // Защита от повторных запросов
    if (loadingModels[providerId]) {
      console.log('⏭️ Already loading for:', providerId);
      return;
    }
    
    if (dynamicModels[providerId] && dynamicModels[providerId].length > 0) {
      console.log('✅ Already loaded for:', providerId, dynamicModels[providerId]);
      return;
    }

    // Update local state only if we're not using external models
    if (Object.keys(externalDynamicModels).length === 0) {
      setLocalLoadingModels(prev => ({ ...prev, [providerId]: true }));
    }

    try {
      let models: string[] = [];
      
      const providerConfig = providers.find(p => p.id === providerId);

      if (providerId === 'google_gemini' || providerId === 'google_workspace' || providerId === 'google') {
        console.log('📡 Fetching Google models...');
        models = await fetchGoogleModels();
      } else if (providerId === 'openai_gpt' || providerId === 'openai') {
        console.log('📡 Fetching OpenAI models...');
        models = await fetchOpenAIModels();
      }

      if ((!models || models.length === 0) && providerConfig?.models?.length) {
        console.log('ℹ️ Using provider fallback models for', providerId);
        models = providerConfig.models;
      }

      console.log('✅ Loaded models:', models?.length || 0, 'models');

      if (models && models.length > 0 && Object.keys(externalDynamicModels).length === 0) {
        setLocalDynamicModels(prev => ({ ...prev, [providerId]: models }));
      } else {
        console.log('⚠️ No models loaded for provider:', providerId);
      }
    } catch (error) {
      console.error('❌ Error loading models for provider:', providerId, error);
      // Не устанавливаем пустой массив при ошибке - оставляем как есть
    } finally {
      if (Object.keys(externalDynamicModels).length === 0) {
        setLocalLoadingModels(prev => ({ ...prev, [providerId]: false }));
      }
    }
  }, [loadingModels, dynamicModels, fetchGoogleModels, fetchOpenAIModels, externalLoadingModels, externalDynamicModels, providers]);

  // Получаем выбранного провайдера и его модели (с защитой от ошибок)
  const selectedProvider = useMemo(() => {
    try {
      const providerFound = providers.find(p => p.id === (currentProvider || node.ai?.provider));
      return providerFound || null;
    } catch (error) {
      console.error('❌ Error finding provider:', error);
      return null;
    }
  }, [providers, currentProvider, node.ai?.provider, forceRender]);
  
  const availableModels = useMemo(() => {
    try {
      if (!selectedProvider) return [];
      const dynamicModelsForProvider = dynamicModels[selectedProvider.id];
      if (dynamicModelsForProvider && dynamicModelsForProvider.length > 0) {
        return dynamicModelsForProvider;
      }
      if (selectedProvider.id.startsWith('midjourney_') && selectedProvider.modelFamilies) {
        const family =
          selectedProvider.modelFamilies.find((entry) => entry.id === midjourneyMode) ??
          selectedProvider.modelFamilies[0];
        if (family) {
          return family.models.map((model) => model.id);
        }
      }
      return selectedProvider.models || [];
    } catch (error) {
      console.error('❌ Error getting available models:', error);
      return [];
    }
  }, [selectedProvider, dynamicModels, midjourneyMode, forceRender]);

  const getModelLabel = useCallback(
    (modelId: string): string => {
      if (selectedProvider?.modelFamilies) {
        for (const family of selectedProvider.modelFamilies) {
          const found = family.models.find((model) => model.id === modelId);
          if (found) {
            return found.label;
          }
        }
      }
      return modelId;
    },
    [selectedProvider],
  );

  const handleProviderSelect = useCallback(
    (providerId: string) => {
      setCurrentProvider(providerId);
      if (!onChangeAi) {
        return;
      }

      const provider = providers.find((p) => p.id === providerId);
      if (!provider) {
        return;
      }

      const dynamicSet = dynamicModels[providerId];
      const computedModel = (
        (dynamicSet && dynamicSet.length > 0 && dynamicSet[0]) ||
        provider.defaultModel ||
        (provider.models && provider.models.length > 0 ? provider.models[0] : '') ||
        ''
      ).toString();

      let nextMode: 'photo' | 'video' | undefined;
      if (provider.id.startsWith('midjourney_') && provider.modelFamilies) {
        const familyForModel = provider.modelFamilies.find((family) =>
          family.models.some((model) => model.id === computedModel),
        );
        nextMode = familyForModel?.id === 'video' ? 'video' : 'photo';
        if (nextMode) {
          setMidjourneyMode(nextMode);
        }
      }

      onChangeAi(node.node_id, {
        ...node.ai,
        provider: providerId,
        model: computedModel,
        ...(provider.id.startsWith('midjourney_') ? { midjourney_mode: nextMode ?? midjourneyMode } : {}),
      });
      setForceRender((prev) => prev + 1);

      if (!dynamicModels[providerId] && !loadingModels[providerId]) {
        void loadModelsForProvider(providerId);
      }
    },
    [onChangeAi, providers, dynamicModels, loadingModels, loadModelsForProvider, node.ai, node.node_id, midjourneyMode],
  );

  // ✅ NEW: Собираем input_fields для агентского чата из полей с source='port'
  const buildInputFieldsFromPortSources = useCallback((): AgentInputField[] => {
    const fields: AgentInputField[] = [];
    
    // System prompt
    if (systemPromptSource === 'port') {
      fields.push({
        name: 'system_prompt',
        label: 'System Prompt',
        type: 'textarea',
        required: false,
        placeholder: 'Enter system prompt...'
      });
    }
    
    // Output example
    if (outputExampleSource === 'port') {
      fields.push({
        name: 'output_example',
        label: 'Output Example',
        type: 'textarea',
        required: false,
        placeholder: 'Enter output example...'
      });
    }
    
    // Temperature
    if (temperatureSource === 'port') {
      fields.push({
        name: 'temperature',
        label: 'Temperature',
        type: 'number',
        required: false,
        placeholder: '0.7'
      });
    }
    
    // Custom fields from field_mapping
    if (additionalFieldsMapping && typeof additionalFieldsMapping === 'object') {
      Object.entries(additionalFieldsMapping).forEach(([fieldKey, fieldMapping]) => {
        if (fieldMapping.source === 'port') {
          const fieldInfo = modelInputs.find(i => i.name === fieldKey);
          
          // Определяем тип поля
          let fieldType: 'text' | 'textarea' | 'number' | 'select' = 'text';
          if (fieldInfo?.type === 'number' || fieldInfo?.type === 'integer') {
            fieldType = 'number';
          } else if (fieldInfo?.options && fieldInfo.options.length > 0) {
            fieldType = 'select';
          } else if (fieldInfo?.type === 'textarea' || fieldInfo?.type === 'string' && fieldInfo.description?.toLowerCase().includes('long')) {
            fieldType = 'textarea';
          }
          
          fields.push({
            name: fieldKey,
            label: fieldInfo?.description || fieldKey,
            type: fieldType,
            required: fieldInfo?.required || false,
            placeholder: fieldInfo?.description || `Enter ${fieldKey}...`,
            options: fieldInfo?.options?.map(opt => opt.value),
            defaultValue: fieldInfo?.default
          });
        }
      });
    }
    
    return fields;
  }, [systemPromptSource, outputExampleSource, temperatureSource, additionalFieldsMapping, modelInputs]);

  const handleSave = () => {
    if (hasChanges) {
      // Создаём порты для полей с source='port'
      const updatedAutoPorts = [...pendingAutoPorts];
      
      // Системный промпт - добавляем порт если source='port'
      if (systemPromptSource === 'port') {
        const existingPort = updatedAutoPorts.find(p => p.id === 'system_prompt');
        if (!existingPort) {
          updatedAutoPorts.push({
            id: 'system_prompt',
            label: 'System Prompt',
            type: 'text',
            required: false,
            position: 'left',
            description: 'Системный промпт из входящей ноды'
          });
        }
      } else {
        // Удаляем порт если переключили на manual
        const index = updatedAutoPorts.findIndex(p => p.id === 'system_prompt');
        if (index !== -1) updatedAutoPorts.splice(index, 1);
      }
      
      // Output Example - добавляем порт если source='port'
      if (outputExampleSource === 'port') {
        const existingPort = updatedAutoPorts.find(p => p.id === 'output_example');
        if (!existingPort) {
          updatedAutoPorts.push({
            id: 'output_example',
            label: 'Output Example',
            type: 'text',
            required: false,
            position: 'left',
            description: 'Пример выходных данных из входящей ноды'
          });
        }
      } else {
        const index = updatedAutoPorts.findIndex(p => p.id === 'output_example');
        if (index !== -1) updatedAutoPorts.splice(index, 1);
      }
      
      // Temperature - добавляем порт если source='port'
      if (temperatureSource === 'port') {
        const existingPort = updatedAutoPorts.find(p => p.id === 'temperature');
        if (!existingPort) {
          updatedAutoPorts.push({
            id: 'temperature',
            label: 'Temperature',
            type: 'number',
            required: false,
            position: 'left',
            description: 'Температура из входящей ноды'
          });
        }
      } else {
        const index = updatedAutoPorts.findIndex(p => p.id === 'temperature');
        if (index !== -1) updatedAutoPorts.splice(index, 1);
      }
      
      // Additional Fields - создаём порты для дополнительных полей с source='port'
      // Используем локальный state additionalFieldsMapping вместо node.ai
      for (const [fieldKey, fieldMapping] of Object.entries(additionalFieldsMapping)) {
        if (fieldMapping.source === 'port') {
          const existingPort = updatedAutoPorts.find(p => p.id === fieldKey);
          if (!existingPort) {
            // Находим описание поля из схемы
            const fieldInfo = modelInputs.find(i => i.name === fieldKey);
            updatedAutoPorts.push({
              id: fieldKey,
              label: fieldKey,
              type: fieldInfo?.type === 'number' || fieldInfo?.type === 'integer' ? 'number' : 'text',
              required: fieldInfo?.required || false,
              position: 'left',
              description: fieldInfo?.description || `${fieldKey} из входящей ноды`
            });
          }
        } else {
          // Удаляем порт если source='manual'
          const index = updatedAutoPorts.findIndex(p => p.id === fieldKey);
          if (index !== -1) updatedAutoPorts.splice(index, 1);
        }
      }
      
      // Применяем изменения портов И значения дополнительных полей в meta
      if (onUpdateNodeMeta) {
        const updatedMeta: Record<string, any> = {
          ...node.meta,
          enabled_ports: pendingEnabledPorts,
          invalid_ports_with_edges: invalidPortsWithEdges // ⚠️ Сохраняем список невалидных портов для красной подсветки
        };
        
        // Сохраняем значения дополнительных полей в meta
        for (const [fieldKey, fieldValue] of Object.entries(additionalFieldsValues)) {
          if (fieldValue !== '') {
            updatedMeta[fieldKey] = fieldValue;
          }
        }
        
        onUpdateNodeMeta(node.node_id, updatedMeta);
      }
      
      if (onChangeAi) {
        const aiConfig = {
          ...node.ai,
          system_prompt: systemPromptValue,
          user_prompt_template: userPromptValue,
          output_example: outputExampleValue,
          auto_ports: updatedAutoPorts,  // Используем обновлённые порты
          input_fields: buildInputFieldsFromPortSources(), // ✅ NEW: Сохраняем динамические поля для агентского чата
          // НОВОЕ: Сохраняем field_mapping с TARGET и SOURCE
          field_mapping: {
            // Системный промпт
            system_prompt_target: systemPromptTarget,
            system_prompt_source: systemPromptSource,
            
            // Пример выходных данных
            output_example_target: outputExampleTarget,
            output_example_source: outputExampleSource,
            
            // Температура
            temperature_target: temperatureTarget,
            temperature_source: temperatureSource,
            
            // Дополнительные поля - берём из локального state
            additional_fields: additionalFieldsMapping,
          },
        };
        
        console.log('[AiSettingsModal] Saving AI config:', {
          input_fields: aiConfig.input_fields,
          field_mapping: aiConfig.field_mapping,
        });
        
        onChangeAi(node.node_id, aiConfig);
      }
      
      setHasChanges(false);
      setForceRender(prev => prev + 1);
    }
  };

  const handleClose = async () => {
    if (hasChanges) {
      // Автоматически сохраняем изменения перед закрытием
      handleSave();
    }
    onClose();
  };

  const updateSystemPrompt = useCallback((value: string) => {
    setSystemPromptValue(value);
    // setHasChanges будет вызван в onBlur, а не на каждый символ
  }, []);

  const updateOutputExample = useCallback((value: string) => {
    setOutputExampleValue(value);
    // setHasChanges будет вызван в onBlur, а не на каждый символ
  }, []);

  const handleSystemPromptBlur = useCallback(() => {
    setHasChanges(true);
  }, []);

  const handleOutputExampleBlur = useCallback(() => {
    setHasChanges(true);
  }, []);

  const handleUserPromptChange = (value: string) => {
    if (autoGenerateUserPrompt) {
      setAutoGenerateUserPrompt(false);
    }
    setUserPromptValue(value);
    setHasChanges(true);
  };

  const handleRegenerateUserPrompt = () => {
    if (!generatedUserPrompt.trim()) {
      return;
    }
    setUserPromptValue(generatedUserPrompt);
    setHasChanges(true);
  };

  const handleToggleAutoGenerateUserPrompt = (checked: boolean) => {
    setAutoGenerateUserPrompt(checked);
    if (checked) {
      if (generatedUserPrompt.trim()) {
        setUserPromptValue(generatedUserPrompt);
        setHasChanges(true);
      }
    } else {
      setHasChanges(true);
    }
  };

  const handleTemperatureChange = useCallback((temperature: number) => {
    if (onChangeAi) {
      const newAiConfig = { ...node.ai, temperature };
      onChangeAi(node.node_id, newAiConfig);
    }
  }, [onChangeAi, node.ai, node.node_id]);

  const resolveMidjourneyModeForModel = useCallback(
    (modelId: string): 'photo' | 'video' => {
      if (selectedProvider?.modelFamilies) {
        for (const family of selectedProvider.modelFamilies) {
          if (family.models.some((entry) => entry.id === modelId)) {
            return family.id === 'video' ? 'video' : 'photo';
          }
        }
      }

      const normalized = modelId.toLowerCase();
      if (normalized.includes('/video-') || normalized.includes('-video')) {
        return 'video';
      }

      return midjourneyMode === 'video' ? 'video' : 'photo';
    },
    [selectedProvider, midjourneyMode],
  );

  const handleModelChange = useCallback(
    async (modelId: string): Promise<Record<string, unknown> | null> => {
      if (!onChangeAi || !currentProvider) {
        return null;
      }

      const preservedContextMode = node.ai?.context_mode || 'simple';
      const providerSupportsAutoPorts =
        ['replicate', 'openai_gpt', 'google_workspace', 'google_gemini', 'google_ai_studio', 'anthropic'].includes(
          currentProvider,
        ) || currentProvider.startsWith('midjourney_');

      let appliedConfig: Record<string, unknown> = {
        ...node.ai,
        model: modelId,
        context_mode: preservedContextMode,
      };

      try {
        if (providerSupportsAutoPorts) {
          setLoadingModelInfo(true);
          const schema = await fetchModelSchema(currentProvider, modelId);
          const inputs = schema.inputs || [];
          const requiredFields = inputs.filter((input) => input.required && input.name !== 'prompt');
          const requiredPortNames = requiredFields.map((field) => field.name);

          const availablePortNames = inputs.map((input) => input.name);
          let inferredMidjourneyMode: 'photo' | 'video' | null = null;
          let defaultPortNames: string[] = [];

          if (currentProvider.startsWith('midjourney_')) {
            inferredMidjourneyMode = resolveMidjourneyModeForModel(modelId);
            const candidates = inferredMidjourneyMode ? MIDJOURNEY_DEFAULT_PORTS[inferredMidjourneyMode] : [];
            
            // ⚠️ Фильтруем порты по совместимости с версией модели
            const mjVersion = getMidjourneyVersion(modelId);
            let compatibleCandidates = candidates;
            
            if (mjVersion === 7) {
              // V7: исключаем несовместимые порты (character_reference использует --cref)
              compatibleCandidates = candidates.filter(name => !V7_INCOMPATIBLE_PORTS.includes(name));
              console.log('🔄 Midjourney V7 detected - excluding incompatible ports:', V7_INCOMPATIBLE_PORTS);
            } else if (mjVersion === 6) {
              // V6: исключаем несовместимые порты (если есть)
              compatibleCandidates = candidates.filter(name => !V6_INCOMPATIBLE_PORTS.includes(name));
            }
            
            defaultPortNames = compatibleCandidates.filter((name) => availablePortNames.includes(name));
          }

          const invalidPorts = pendingEnabledPorts.filter((port) => !availablePortNames.includes(port));
          
          // ⚠️ Дополнительно: проверяем порты на совместимость с версией (для Midjourney)
          if (currentProvider.startsWith('midjourney_')) {
            const mjVersion = getMidjourneyVersion(modelId);
            const versionIncompatiblePorts: string[] = [];
            
            if (mjVersion === 7) {
              // V7: добавляем в invalid все порты из V7_INCOMPATIBLE_PORTS
              pendingEnabledPorts.forEach(port => {
                if (V7_INCOMPATIBLE_PORTS.includes(port)) {
                  versionIncompatiblePorts.push(port);
                }
              });
            } else if (mjVersion === 6) {
              // V6: добавляем в invalid все порты из V6_INCOMPATIBLE_PORTS
              pendingEnabledPorts.forEach(port => {
                if (V6_INCOMPATIBLE_PORTS.includes(port)) {
                  versionIncompatiblePorts.push(port);
                }
              });
            }
            
            if (versionIncompatiblePorts.length > 0) {
              console.log(`⚠️ Found version-incompatible ports for MJ V${mjVersion}:`, versionIncompatiblePorts);
              // Добавляем их в список невалидных
              invalidPorts.push(...versionIncompatiblePorts.filter(p => !invalidPorts.includes(p)));
            }
          }

          if (invalidPorts.length > 0) {
            console.log('🗑️ Found invalid ports (not in new model schema):', invalidPorts);
            console.log('🔄 All edges from invalid ports will be redirected to "context" port');
            
            // ✅ Удаляем ВСЕ невалидные порты (включая с подключениями)
            // Edges автоматически переключатся на "context" через onRemoveInvalidPorts
            if (onRemoveInvalidPorts) {
              try {
                await onRemoveInvalidPorts(node.node_id, invalidPorts);
              } catch (removeError) {
                console.error('Failed to remove invalid ports:', removeError);
              }
            }

            setPendingEnabledPorts((prev) => prev.filter((port) => !invalidPorts.includes(port)));
            
            // Очищаем список невалидных портов (красная подсветка больше не нужна)
            setInvalidPortsWithEdges([]);
          } else {
            // Нет невалидных портов - очищаем список
            setInvalidPortsWithEdges([]);
          }

          const validEnabledPorts = pendingEnabledPorts.filter((port) => availablePortNames.includes(port));
          const portsToForceEnable = [...requiredPortNames, ...defaultPortNames];
          const enabledPortsSet = new Set([...validEnabledPorts, ...portsToForceEnable]);
          const enabledPorts = Array.from(enabledPortsSet);

          const autoPorts = generateAutoPorts(inputs, enabledPorts);
          setPendingAutoPorts(autoPorts);

          appliedConfig = {
            ...appliedConfig,
            auto_ports: autoPorts,
            ...(inferredMidjourneyMode ? { midjourney_mode: inferredMidjourneyMode } : {}),
          };

          if (inferredMidjourneyMode && inferredMidjourneyMode !== midjourneyMode) {
            setMidjourneyMode(inferredMidjourneyMode);
          }

          setModelInputs(inputs);
          setContextLimit(schema.context_limit || 32000);
          if (portsToForceEnable.length > 0 || invalidPorts.length > 0) {
            setPendingEnabledPorts((prev) => {
              const merged = new Set(prev);
              portsToForceEnable.forEach((name) => merged.add(name));
              return Array.from(merged).filter((name) => availablePortNames.includes(name));
            });
          }

          requiredFields.forEach((field) => {
            if (field.name === 'system_prompt') {
              setSystemPromptSource('port');
            } else if (field.name === 'output_example') {
              setOutputExampleSource('port');
            } else if (field.name === 'temperature') {
              setTemperatureSource('port');
            } else {
              setAdditionalFieldsMapping((prev) => ({
                ...prev,
                [field.name]: { source: 'port' },
              }));
            }
          });
        } else {
          appliedConfig = {
            ...appliedConfig,
            auto_ports: undefined,
          };
          setPendingAutoPorts([]);
        }

        onChangeAi(node.node_id, appliedConfig);
        setForceRender((prev) => prev + 1);
        return appliedConfig;
      } catch (error) {
        console.error('❌ Error loading model schema:', error);
        const fallbackConfig = {
          ...node.ai,
          model: modelId,
          auto_ports: undefined,
        };
        onChangeAi(node.node_id, fallbackConfig);
        setForceRender((prev) => prev + 1);
        return fallbackConfig;
      } finally {
        if (providerSupportsAutoPorts) {
          setLoadingModelInfo(false);
        }
      }
    },
    [
      currentProvider,
      node.ai,
      node.node_id,
      onChangeAi,
      onRemoveInvalidPorts,
      pendingEnabledPorts,
      resolveMidjourneyModeForModel,
      midjourneyMode,
    ],
  );

  const handleMidjourneyModeChange = useCallback(
    async (mode: 'photo' | 'video') => {
      if (!onChangeAi || !currentProvider || !currentProvider.startsWith('midjourney_')) {
        return;
      }
      if (!selectedProvider) {
        return;
      }

      setMidjourneyMode(mode);

      const family = selectedProvider.modelFamilies?.find((entry) => entry.id === mode);
      const fallbackModel =
        family?.defaultModel ||
        family?.models?.[0]?.id ||
        selectedProvider.defaultModel ||
        selectedProvider.models?.[0] ||
        '';

      if (fallbackModel) {
        const updatedConfig = (await handleModelChange(fallbackModel)) ?? node.ai ?? {};
        onChangeAi(node.node_id, {
          ...updatedConfig,
          midjourney_mode: mode,
          model: fallbackModel,
        });
      } else {
        onChangeAi(node.node_id, {
          ...node.ai,
          midjourney_mode: mode,
        });
      }
    },
    [currentProvider, handleModelChange, node.ai, node.node_id, onChangeAi, selectedProvider],
  );
  // Автозагрузка схемы модели при монтировании компонента (если модель уже выбрана)
  useEffect(() => {
    const loadInitialModelSchema = async () => {
      // ✅ Загружаем схему для Replicate и OpenAI/Google/Anthropic (как у Replicate)
      const supportsAutoInputs =
        ['replicate', 'openai_gpt', 'google_workspace', 'google_gemini', 'google_ai_studio', 'anthropic'].includes(
          currentProvider,
        ) || currentProvider.startsWith('midjourney_');
      if (supportsAutoInputs && node.ai?.model && !loadingModelInfo) {
        try {
          setLoadingModelInfo(true);
          const schema = await fetchModelSchema(currentProvider, String(node.ai.model));
          const inputs = schema.inputs || [];
          setModelInputs(inputs);
          setContextLimit(schema.context_limit || 32000);
          setLoadingModelInfo(false);

          const requiredFields = inputs.filter((i) => i.required && i.name !== 'prompt');
          const requiredPortNames = requiredFields.map((field) => field.name);

          if (!node.ai.auto_ports || node.ai.auto_ports.length === 0) {
            const defaultPortNames =
              currentProvider.startsWith('midjourney_')
                ? (MIDJOURNEY_DEFAULT_PORTS[midjourneyMode] ?? []).filter((name) =>
                    inputs.some((input) => input.name === name),
                  )
                : [];
            const mergedEnabled = Array.from(
              new Set([...pendingEnabledPorts, ...requiredPortNames, ...defaultPortNames]),
            );
            setPendingAutoPorts(generateAutoPorts(inputs, mergedEnabled));
            setPendingEnabledPorts(mergedEnabled);
          }
          
          // Если есть system_prompt в схеме - автоматически выбираем его как target (ТОЛЬКО если ещё не настроено)
          if (inputs.some(i => i.name === 'system_prompt')) {
            if (!node.ai.field_mapping?.system_prompt_target) {
              setSystemPromptTarget('system_prompt');
              console.log('🔄 Auto-set system_prompt_target = "system_prompt"');
            }
          }
          
          // Если есть temperature в схеме - автоматически выбираем его как target (ТОЛЬКО если ещё не настроено)
          if (inputs.some(i => i.name === 'temperature')) {
            if (!node.ai.field_mapping?.temperature_target) {
              setTemperatureTarget('temperature');
              console.log('🔄 Auto-set temperature_target = "temperature"');
            }
          }
          
          // ✅ АВТОВКЛЮЧЕНИЕ ОБЯЗАТЕЛЬНЫХ ПОРТОВ
          // Все обязательные поля автоматически помечаются как source='port' (ТОЛЬКО если field_mapping пустой)
          if (requiredFields.length > 0 && !node.ai.field_mapping) {
            console.log('🔄 Auto-enabling required ports:', requiredFields.map(f => f.name));
            
            // Создаём начальный field_mapping с обязательными портами
            const initialMapping: any = {};
            
            requiredFields.forEach(field => {
              if (field.name === 'system_prompt') {
                setSystemPromptSource('port');
              } else if (field.name === 'output_example') {
                setOutputExampleSource('port');
              } else if (field.name === 'temperature') {
                setTemperatureSource('port');
              } else {
                // Дополнительные поля
                if (!initialMapping.additional_fields) {
                  initialMapping.additional_fields = {};
                }
                initialMapping.additional_fields[field.name] = { source: 'port' };
              }
            });
            
            // Добавляем обязательные порты в pendingEnabledPorts
            setPendingEnabledPorts(prev => {
              const merged = new Set(prev);
              requiredPortNames.forEach(name => merged.add(name));
              return Array.from(merged);
            });
          } else if (requiredFields.length > 0) {
            // ✅ Если field_mapping УЖЕ есть - проверяем каждое обязательное поле индивидуально
            console.log('🔍 Checking individual required fields (field_mapping exists):', requiredFields.map(f => f.name));
            
            requiredFields.forEach(field => {
              const existingMapping = node.ai.field_mapping?.additional_fields?.[field.name];
              
              if (field.name === 'system_prompt') {
                // Проверяем настроен ли system_prompt
                if (!node.ai.field_mapping?.system_prompt_source) {
                  console.log('  🔄 Auto-enabling system_prompt (required)');
                  setSystemPromptSource('port');
                }
              } else if (field.name === 'output_example') {
                if (!node.ai.field_mapping?.output_example_source) {
                  console.log('  🔄 Auto-enabling output_example (required)');
                  setOutputExampleSource('port');
                }
              } else if (field.name === 'temperature') {
                if (!node.ai.field_mapping?.temperature_source) {
                  console.log('  🔄 Auto-enabling temperature (required)');
                  setTemperatureSource('port');
                }
              } else {
                // Дополнительные обязательные поля
                if (!existingMapping || !existingMapping.source) {
                  console.log(`  🔄 Auto-enabling ${field.name} (required, not configured)`);
                  setAdditionalFieldsMapping((prev) => ({
                    ...prev,
                    [field.name]: { source: 'port' },
                  }));
                }
              }
            });
            
            // Добавляем обязательные порты в pendingEnabledPorts (только те, которых там нет)
            setPendingEnabledPorts(prev => {
              const merged = new Set(prev);
              requiredPortNames.forEach(name => merged.add(name));
              return Array.from(merged);
            });
          }
        } catch (error) {
          console.error('❌ Error loading initial model schema:', error);
          setLoadingModelInfo(false);
        }
      }
      
      // ✅ Завершить инициализацию modal после загрузки schema
      // (даже если ошибка - всё равно показываем UI)
      if (!initializationCompleteRef.current) {
        initializationCompleteRef.current = true;
        setIsInitializing(false);
        console.log('✅ [AiSettingsModal] Initialization complete');
      }
    };
    
    loadInitialModelSchema();
  }, [node.ai?.model, currentProvider]); // Перезагружаем схему если меняется модель или провайдер
  
  // 🔄 При смене ПРОВАЙДЕРА - сразу загружаем схему и маппинг для новой модели
  useEffect(() => {
    if (!currentProvider || currentProvider === node.ai?.provider) {
      return; // Провайдер не менялся
    }
    
    console.log('🔄 Provider changed to:', currentProvider, '- reloading schema for new model');
    
    // Сбрасываем маппинги на значения по умолчанию
    setSystemPromptSource('manual');
    setSystemPromptTarget('prompt');
    setOutputExampleSource('manual');
    setOutputExampleTarget('prompt');
    setTemperatureSource('manual');
    setTemperatureTarget('temperature');
    setAdditionalFieldsMapping({});
    
    // Загружаем схему для новой модели, которая выбралась при смене провайдера
    const loadSchemaForNewProvider = async () => {
      const model = node.ai?.model;
      if (!model) {
        console.log('⚠️ No model selected yet for provider:', currentProvider);
        return;
      }
      
      try {
        setLoadingModelInfo(true);
        const schema = await fetchModelSchema(currentProvider, String(model));
        const inputs = schema.inputs || [];
        setModelInputs(inputs);
        setContextLimit(schema.context_limit || 32000);
        
        console.log('✅ Schema loaded for provider:', currentProvider, 'model:', model, 'inputs:', inputs.length);
        
        // Автоматически выбираем обязательные поля
        const requiredFields = inputs.filter((i) => i.required && i.name !== 'prompt');
        const requiredPortNames = requiredFields.map((field) => field.name);
        
        if (requiredFields.length > 0) {
          console.log('🔄 Auto-enabling required ports:', requiredPortNames);
          requiredFields.forEach((field) => {
            if (field.name === 'system_prompt') {
              setSystemPromptSource('port');
            } else if (field.name === 'output_example') {
              setOutputExampleSource('port');
            } else if (field.name === 'temperature') {
              setTemperatureSource('port');
            } else {
              setAdditionalFieldsMapping((prev) => ({
                ...prev,
                [field.name]: { source: 'port' },
              }));
            }
          });
        }
        
        setLoadingModelInfo(false);
      } catch (error) {
        console.error('❌ Error loading schema for new provider:', error);
        setLoadingModelInfo(false);
      }
    };
    
    void loadSchemaForNewProvider();
  }, [currentProvider, node.ai?.provider, node.ai?.model]); // Срабатывает при смене провайдера

  // 🔄 Сбрасываем field_mapping при смене модели (чтобы показать новые поля)
  useEffect(() => {
    // Проверяем действительно ли модель или провайдер изменились
    const modelChanged = prevModelRef.current !== node.ai?.model;
    const providerChanged = prevProviderRef.current !== node.ai?.provider;
    
    if (!modelChanged && !providerChanged) {
      return; // Модель и провайдер не менялись
    }
    
    console.log('🔄 Model/Provider changed - resetting field mapping', {
      oldModel: prevModelRef.current,
      newModel: node.ai?.model,
      oldProvider: prevProviderRef.current,
      newProvider: node.ai?.provider
    });
    
    // ✅ НОВОЕ: Сохраняем текущие порты перед сбросом
    const previousPorts = [...pendingEnabledPorts];
    const previousAdditionalFields = { ...additionalFieldsMapping };
    const previousSystemPromptSource = systemPromptSource;
    const previousOutputExampleSource = outputExampleSource;
    const previousTemperatureSource = temperatureSource;
    
    // Обновляем refs
    prevModelRef.current = node.ai?.model;
    prevProviderRef.current = node.ai?.provider;
    
    // Загружаем схему новой модели и проверяем какие порты можно перенести
    const transferCompatiblePorts = async () => {
      try {
        const provider = node.ai?.provider;
        const model = node.ai?.model;
        
        if (!provider || !model) {
          console.log('⚠️ No provider/model - clearing all ports');
          setSystemPromptSource('manual');
          setSystemPromptTarget('prompt');
          setOutputExampleSource('manual');
          setOutputExampleTarget('prompt');
          setTemperatureSource('manual');
          setTemperatureTarget('temperature');
          setAdditionalFieldsMapping({});
          setPendingEnabledPorts([]);
          return;
        }
        
        // Загружаем схему новой модели
        const schema = await fetchModelSchema(provider, String(model));
        const newInputs = schema.inputs || [];
        const newPortNames = newInputs.map(i => i.name);
        
        console.log('📋 Previous ports:', previousPorts);
        console.log('📋 New model ports:', newPortNames);
        
        // Находим общие порты
        const commonPorts = previousPorts.filter(port => newPortNames.includes(port));
        console.log('✅ Common ports to transfer:', commonPorts);
        
        // Переносим только общие порты
        setPendingEnabledPorts(commonPorts);
        
        // Переносим маппинги для общих портов
        if (commonPorts.includes('system_prompt') && previousSystemPromptSource === 'port') {
          setSystemPromptSource('port');
        } else {
          setSystemPromptSource('manual');
        }
        
        if (commonPorts.includes('output_example') && previousOutputExampleSource === 'port') {
          setOutputExampleSource('port');
        } else {
          setOutputExampleSource('manual');
        }
        
        if (commonPorts.includes('temperature') && previousTemperatureSource === 'port') {
          setTemperatureSource('port');
        } else {
          setTemperatureSource('manual');
        }
        
        // Переносим дополнительные поля
        const newAdditionalFields: Record<string, any> = {};
        Object.entries(previousAdditionalFields).forEach(([key, value]) => {
          if (commonPorts.includes(key)) {
            newAdditionalFields[key] = value;
          }
        });
        setAdditionalFieldsMapping(newAdditionalFields);
        
        console.log('🔄 Port transfer complete:', {
          transferred: commonPorts.length,
          total: previousPorts.length
        });
      } catch (error) {
        console.error('❌ Error transferring ports:', error);
        // При ошибке сбрасываем всё
        setSystemPromptSource('manual');
        setSystemPromptTarget('prompt');
        setOutputExampleSource('manual');
        setOutputExampleTarget('prompt');
        setTemperatureSource('manual');
        setTemperatureTarget('temperature');
        setAdditionalFieldsMapping({});
        setPendingEnabledPorts([]);
      }
    };
    
    void transferCompatiblePorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.ai?.model, node.ai?.provider]); // Сбрасываем при смене модели/провайдера
  // Не добавляем в deps: pendingEnabledPorts, additionalFieldsMapping и другие source состояния
  // т.к. они читаются из snapshot в момент вызова useEffect

  // 🔄 Сбрасываем field_mapping при смене Midjourney режима
  useEffect(() => {
    if (currentProvider?.startsWith('midjourney_')) {
      console.log('🔄 Midjourney mode changed - resetting field mapping');
      setSystemPromptSource('manual');
      setSystemPromptTarget('prompt');
      setOutputExampleSource('manual');
      setOutputExampleTarget('prompt');
      setTemperatureSource('manual');
      setTemperatureTarget('temperature');
      setAdditionalFieldsMapping({});
    }
  }, [midjourneyMode, currentProvider]); // Сбрасываем при смене режима
  
  // Автозагрузка моделей при смене провайдера
  useEffect(() => {
    const providerStr = typeof currentProvider === 'string' ? currentProvider : '';
    if (providerStr && !dynamicModels[providerStr] && !loadingModels[providerStr]) {
      console.log('🚀 Auto-loading models for current provider:', providerStr);
      const timer = setTimeout(() => {
        loadModelsForProvider(providerStr);
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [currentProvider, loadModelsForProvider, dynamicModels, loadingModels]);  // Отслеживание изменений в node.ai и принудительный ререндеринг (упрощено)
  useEffect(() => {
    const providerStr = typeof node.ai?.provider === 'string' ? node.ai.provider : '';
    if (providerStr && providerStr !== currentProvider) {
      setCurrentProvider(providerStr);
    }
  }, [node.ai?.provider, currentProvider]);

  // Ререндеринг при изменении моделей (с защитой от циклов)
  useEffect(() => {
    // Только принудительно ререндерим при реальном изменении количества провайдеров с моделями
    const providersWithModels = Object.keys(dynamicModels).filter(
      id => dynamicModels[id] && dynamicModels[id].length > 0
    ).length;
    
    if (providersWithModels > 0) {
      const timer = setTimeout(() => {
        setForceRender(prev => prev + 1);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [Object.keys(dynamicModels).join(',')]); // Защита от постоянных изменений

  const handleSavePreset = useCallback(async () => {
    // Используем имя ноды как имя агента
    const title = node.title || 'Новый агент';

    // Собираем полный шаблон ноды
    const nodeTemplate = {
      node_id: `agent-${Date.now()}`,
      type: node.type,
      title: title,
      content: node.content || '',
      content_type: node.content_type || 'text/plain',
      ui: {
        bbox: { x1: 0, y1: 0, x2: 450, y2: 200 },
        color: node.ui?.color || '#8b5cf6',
      },
      meta: {
        ...node.meta,
        icon: node.meta?.icon || '🤖',
        tags: node.meta?.tags || [],
        is_favorite: true, // Помечаем как избранное
      },
      ai: {
        ...node.ai,
        enabled: true,
        system_prompt: systemPromptValue,
        output_example: outputExampleValue,
      },
      ai_visible: true,
      connections: { incoming: [], outgoing: [] },
    };

    try {
      const response = await fetch('/api/agent-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: node.content || `Личный агент ${title}`,
          icon: node.meta?.icon || '🤖',
          node_template: nodeTemplate,
          tags: node.meta?.tags || ['личный'],
          is_favorite: true, // Сохраняем как избранное
        }),
      });

      if (!response.ok) throw new Error('Failed to save agent');

      const saved = await response.json();
      alert(`✅ Агент "${title}" сохранён в библиотеке агентов и добавлен в избранное`);
      
      // НЕ привязываем preset_id к текущей ноде на воркфлоу
      // Агент просто сохраняется в библиотеку
    } catch (error) {
      console.error('Failed to save agent:', error);
      alert('❌ Ошибка сохранения агента');
    }
  }, [node, systemPromptValue, outputExampleValue]);

  const OutputExampleSection = () => (
    <div className="border-t border-slate-600 pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-300">Пример выходных данных</label>
        <div className="flex gap-3 items-center">
          {/* TARGET: Куда идёт output example */}
          <select
            value={outputExampleTarget}
            onChange={(e) => {
              setOutputExampleTarget(e.target.value);
              setHasChanges(true);
            }}
            className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={loading}
            title="В какое API поле отправляется пример"
          >
            <option value="prompt">📝 В Prompt (общий)</option>
            {modelInputs.filter(i => i.type === 'string' || i.type === 'text').map(input => (
              <option key={input.name} value={input.name}>
                📤 В {input.name}
              </option>
            ))}
          </select>
          
          {/* SOURCE: Чекбокс "Из входящей ноды" */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={outputExampleSource === 'port'}
              onChange={(e) => {
                const newSource = e.target.checked ? 'port' : 'manual';
                setOutputExampleSource(newSource);
                setHasChanges(true);
                
                // ✅ НОВОЕ: Добавляем/удаляем порт из pendingEnabledPorts
                setPendingEnabledPorts(prev => {
                  if (newSource === 'port') {
                    return prev.includes('output_example') ? prev : [...prev, 'output_example'];
                  } else {
                    return prev.filter(p => p !== 'output_example');
                  }
                });
                
              }}
              className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
              disabled={loading}
            />
            <span className="text-xs text-slate-300">Из входящей ноды</span>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {quickOutputExamples.map((preset) => (
          <button
            key={preset.preset_id}
            type="button"
            onClick={() => updateOutputExample(preset.content)}
            className="px-3 py-1 text-xs bg-purple-600/20 border border-purple-500/50 text-purple-300 hover:bg-purple-600/30 rounded transition"
            disabled={loading}
            title={preset.description ?? undefined}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {outputExampleSource === 'manual' ? (
        <OutputExampleEditor
          value={outputExampleValue}
          onChange={updateOutputExample}
          onBlur={handleOutputExampleBlur}
          disabled={loading}
          placeholder='Например: {"nodes": [{"type": "text", "title": "...", "content": "..."}]}'
        />
      ) : (
        <div className="w-full min-h-24 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2">
          <div className="text-xs text-blue-400 mb-2">
            🔗 Данные поступают через порт "Output Example"
          </div>
          {(() => {
            const portData = getPortData('output_example');
            if (portData) {
              return (
                <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                  {portData.length > 200 ? portData.substring(0, 200) + '...' : portData}
                </div>
              );
            } else {
              return (
                <div className="text-xs text-slate-500 italic">
                  (порт не подключен - данные будут доступны после подключения)
                </div>
              );
            }
          })()}
        </div>
      )}
    </div>
  );

  return (
    <Modal
      title={`AI настройки: ${node.title} (${String(node.ai?.model || 'модель не выбрана')})`}
      onClose={handleClose}
      actions={
        <div className="flex justify-between items-center w-full">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSavePreset}
              className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30 rounded transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              disabled={loading}
              title="Сохранить агента в библиотеку с пометкой избранное"
            >
              ⭐ Сохранить агента
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={handleSave}
              disabled={loading}
            >
              💾 Сохранить
            </button>
            <button
              type="button"
              className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600"
              onClick={handleClose}
              title="Закрыть без сохранения несохранённых изменений"
            >
              🚫 Закрыть без сохранения
            </button>
            <button
              type="button"
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              onClick={handleClose}
            >
              ✖ Закрыть
            </button>
          </div>
        </div>
      }
    >
      {/* ✅ Loading overlay при инициализации modal */}
      {isInitializing && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-lg z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-sm text-slate-300">Загрузка параметров модели...</p>
          </div>
        </div>
      )}
      
      <div className="flex flex-col gap-6 p-6 h-[500px] overflow-y-auto"  style={{ opacity: isInitializing ? 0.5 : 1, pointerEvents: isInitializing ? 'none' : 'auto' }}>
        {/* Tab Navigation */}
        <div className="flex gap-2 flex-wrap">
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'ai_config'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            onClick={() => {
              handleSave();
              onTabChange('ai_config');
            }}
          >
            Конфигурация
          </button>
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            onClick={() => {
              handleSave();
              onTabChange('settings');
            }}
          >
            Настройки
          </button>
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'model_info'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            onClick={() => {
              handleSave();
              onTabChange('model_info');
            }}
          >
            Модель
          </button>
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'context'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            onClick={() => {
              handleSave();
              onTabChange('context');
            }}
          >
            Контекст
          </button>
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'routing'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            onClick={() => {
              handleSave();
              onTabChange('routing');
            }}
          >
            Роутинг
          </button>
          <button
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === 'request'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            onClick={() => {
              handleSave();
              onTabChange('request');
            }}
          >
            Вывод
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'ai_config' && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-medium text-slate-300">Конфигурация</h3>
              <div className="space-y-4">
                {/* Убираем выбор провайдера - он теперь только в карточке узла */}
                {providers.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Оператор</label>
                    <select
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      value={currentProvider || String(node.ai?.provider || '')}
                      onChange={(event) => handleProviderSelect(event.target.value)}
                      disabled={loading || providers.length === 0}
                    >
                      <option value="" disabled>
                        Выберите оператора
                      </option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id} disabled={!provider.available}>
                          {provider.name}
                          {!provider.available && provider.reason ? ` (${provider.reason})` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-[11px] text-slate-500">
                      После смены оператора модель сбрасывается на значение по умолчанию.
                    </div>
                  </div>
                )}

                {selectedProvider && (
                  <div className="space-y-4">
                    {selectedProvider.id.startsWith('midjourney_') && selectedProvider.modelFamilies && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Режим Midjourney</label>
                        <div className="flex gap-2">
                          {selectedProvider.modelFamilies.map((family) => {
                            const isActive = family.id === midjourneyMode;
                            return (
                              <button
                                key={family.id}
                                type="button"
                                className={`rounded px-3 py-1 text-sm transition border ${
                                  isActive
                                    ? 'border-blue-500/60 bg-blue-500/20 text-blue-100'
                                    : 'border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-blue-500/40 hover:text-blue-100'
                                }`}
                                onClick={() => handleMidjourneyModeChange(family.id as 'photo' | 'video')}
                              >
                                {family.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Переключите режим, чтобы выбрать модели для фото или видео Midjourney.
                        </div>
                      </div>
                    )}

                    {/* Модель сразу после оператора */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-400 mb-2">Модель</label>
                      <select
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        value={String(node.ai?.model || availableModels[0] || '')}
                        onChange={(e) => handleModelChange(e.target.value)}
                        disabled={loading || availableModels.length === 0}
                      >
                        {availableModels.length === 0 ? (
                          <option value="" disabled>
                            Нет доступных моделей
                          </option>
                        ) : (
                          availableModels.map((modelId) => (
                            <option key={modelId} value={modelId}>
                              {getModelLabel(modelId)}
                            </option>
                          ))
                        )}
                      </select>
                      <div className="text-[11px] text-slate-500">
                        Выберите модель для данной AI-ноды. Подробную информацию см. во вкладке "ℹ️ Модель".
                      </div>
                      {selectedProvider && dynamicModels[selectedProvider.id] && (
                        <div className="text-[11px] text-slate-400">
                          Загружено динамических моделей: {dynamicModels[selectedProvider.id].length}
                        </div>
                      )}
                    </div>

                    {/* Статус для Replicate */}
                    {selectedProvider.id === 'replicate' && (
                      <div className="rounded border border-slate-600/60 bg-slate-900/40 p-3 text-xs text-slate-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="uppercase text-[0.65rem] tracking-wide text-slate-500">Статус</div>
                            <div className={`text-sm font-medium ${replicateStatusColor}`}>{replicateStatusLabel}</div>
                          </div>
                          {replicatePredictionId && (
                            <div className="text-right">
                              <div className="uppercase text-[0.65rem] tracking-wide text-slate-500">Prediction</div>
                              <div className="font-mono text-slate-300">{replicatePredictionIdMasked}</div>
                            </div>
                          )}
                        </div>
                        {replicatePredictionUrl ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={replicatePredictionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[0.7rem] text-blue-200 transition hover:bg-blue-500/20"
                            >
                              🔗 Открыть prediction
                            </a>
                            {replicatePredictionApiUrl && (
                              <a
                                href={replicatePredictionApiUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded border border-slate-500/40 bg-slate-700/30 px-2 py-1 text-[0.7rem] text-slate-200 transition hover:bg-slate-700/50"
                              >
                                API
                              </a>
                            )}
                            {typeof metaRecord['replicate_last_run_at'] === 'string' && (
                              <span className="text-[0.7rem] text-slate-400">
                                Обновлено: {new Date(metaRecord['replicate_last_run_at'] as string).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[0.7rem] text-slate-500">Prediction появится после первого запуска агента.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Дополнительная информация */}
                <div className="border-t border-slate-700 pt-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2">📊 Текущая конфигурация</h4>
                  <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs">
                    {/* Two columns layout */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">🤖 Оператор:</span> 
                        <span className="font-medium truncate" title={String(currentProvider || node.ai?.provider || 'Не задан')}>
                          {String(currentProvider || node.ai?.provider || 'Не задан')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">🧠 Модель:</span> 
                        <span className="font-medium truncate" title={String(node.ai?.model || 'Не задана')}>
                          {String(node.ai?.model || 'Не задана')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">🌡️ Температура:</span> 
                        <span className="font-medium">{String(node.ai?.temperature || 0.7)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">🔌 Режим контекста:</span> 
                        <span className="font-medium">{String(node.ai?.context_mode || 'simple')}</span>
                      </div>
                      {selectedProvider?.id?.startsWith('midjourney_') && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">🎛️ Midjourney режим:</span>
                          <span className="font-medium">
                            {midjourneyMode === 'video' ? 'Video' : 'Photo'}
                          </span>
                        </div>
                      )}
                      {node.ai?.auto_ports && node.ai.auto_ports.length > 0 && (
                        <div className="flex items-center gap-2 col-span-2">
                          <span className="text-slate-400">⚡ Автопорты:</span> 
                          <span className="font-medium">{node.ai.auto_ports.length} портов</span>
                          <span className="text-xs text-slate-500">
                            ({node.ai.auto_ports.filter((p: any) => p.required).length} обязательных)
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">✅ Доступно:</span> 
                        <span className="font-medium">{providers.filter(p => p.available).length}/{providers.length} провайдеров</span>
                      </div>
                      {selectedProvider && dynamicModels[selectedProvider.id] && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">📚 Динамических моделей:</span> 
                          <span className="font-medium">{dynamicModels[selectedProvider.id].length}</span>
                        </div>
                      )}
                      {selectedProvider && loadingModels[selectedProvider.id] && (
                        <div className="flex items-center gap-2 col-span-2">
                          <span className="text-blue-400">⏳ Статус:</span> 
                          <span className="text-blue-300 animate-pulse">Загружаем модели...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'context' && (
          <div className="space-y-6">
            {/* РЕЖИМЫ КОНТЕКСТА - СВЕРХУ */}
            <div className="bg-slate-900 p-4 rounded border border-slate-700">
              <h4 className="text-sm font-medium text-slate-300 mb-3">Режим контекста</h4>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    onChangeAi?.(node.node_id, {
                      ...node.ai,
                      context_mode: 'simple',
                    });
                  }}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    (node.ai?.context_mode ?? 'simple') === 'simple'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Упрощённый
                </button>
                <button
                  onClick={() => {
                    onChangeAi?.(node.node_id, {
                      ...node.ai,
                      context_mode: 'clean',
                    });
                  }}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    node.ai?.context_mode === 'clean'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Чистый
                </button>
                <button
                  onClick={() => {
                    onChangeAi?.(node.node_id, {
                      ...node.ai,
                      context_mode: 'simple_json',
                    });
                  }}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    node.ai?.context_mode === 'simple_json'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Упрощенный JSON
                </button>
                <button
                  onClick={() => {
                    onChangeAi?.(node.node_id, {
                      ...node.ai,
                      context_mode: 'full_json',
                    });
                  }}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    node.ai?.context_mode === 'full_json'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Полный JSON
                </button>
              </div>
            </div>

            <section>
              <h3 className="mb-3 font-medium text-slate-300">Контекст для агента</h3>
              <p className="text-sm text-slate-400 mb-4">
                Контекст автоматически обновляется при изменении режима отображения или содержимого входящих нод.
              </p>
              <div className="bg-slate-900/50 border border-slate-700/50 rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">Превью контекста</span>
                  <span className="text-xs text-slate-400">
                    <span className="font-mono">{contextCharCount.toLocaleString()}</span> символов
                  </span>
                </div>
                {contextPreview ? (
                  <div className="bg-slate-900 p-3 rounded border border-slate-700 overflow-auto max-h-96 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {contextPreview}
                  </div>
                ) : (
                  <div className="bg-slate-900 p-4 rounded border border-dashed border-slate-700 text-xs text-slate-500 text-center">
                    Контекст отсутствует — подключите входящие ноды или включите нужные порты.
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-medium text-slate-300">Активные авто-порты</h4>
              {autoInputsPreview.length > 0 ? (
                <div className="grid gap-3">
                  {autoInputsPreview.map(({ port, sourceNode, value, hasValue }) => (
                    <div key={port.id} className="bg-slate-900/60 border border-slate-700 rounded p-3 text-xs text-slate-300 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{port.label}</span>
                        <span className="text-slate-500">{port.type}</span>
                      </div>
                      <div className="text-slate-400">
                        Источник:{' '}
                        {sourceNode
                          ? `«${sourceNode.title || sourceNode.node_id}» (${sourceNode.type})`
                          : '— не подключен —'}
                      </div>
                      <div className="text-slate-400">
                        Значение:{' '}
                        {hasValue ? (
                          <span className="text-slate-300 break-all">{value}</span>
                        ) : (
                          <span className="text-rose-400">нет данных — подключите ноду</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Автоматические входы не настроены. Включите порты во вкладке «Конфигурация».
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'routing' && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-medium text-slate-300">Конфигурация роутинга</h3>
              <div className="space-y-4">
                <div className="text-slate-400 text-sm">
                  <p className="mb-2">Настройки роутинга определяют как данные поступают и выходят из ноды.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Входные порты (слева - prompt) */}
                  <div className="bg-slate-900 p-4 rounded border border-slate-700 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-2">Входной контекст</h4>
                      <div className="text-xs text-slate-400 mb-1">
                        Количество входящих нод: {incomingNodes.length}
                      </div>
                    </div>

                    {/* Ползунок контекстной глубины слева */}
                    <div className="border-t border-slate-700 pt-3">
                      <label className="block text-xs font-medium text-slate-300 mb-2">
                        Глубина контекста (уровней)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={Number(node.ai?.context_left_depth ?? 1)}
                          onChange={(e) => {
                            const depth = Number(e.target.value);
                            onChangeAi?.(node.node_id, {
                              ...node.ai,
                              context_left_depth: depth,
                            });
                          }}
                          className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <span className="text-xs font-medium text-slate-300 min-w-[3rem]">
                          {Number(node.ai?.context_left_depth ?? 1)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Количество уровней нод слева, видимых в контексте
                      </p>
                    </div>

                    {/* Прогресс-бар использования контекста */}
                    <div className="border-t border-slate-700 pt-3">
                      <div className="text-xs text-slate-300 mb-1">Использование контекста:</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              ((incomingNodes.length * 100) / contextLimit) > 80 
                                ? 'bg-red-500' 
                                : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(100, (incomingNodes.length * 100) / contextLimit)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 min-w-[80px] text-right">
                          {incomingNodes.length * 100} / {(contextLimit / 1000).toFixed(1)}K tokens
                        </span>
                      </div>
                    </div>

                    {/* Список входящих нод */}
                    {(() => {
                      const filteredIncoming = getNodesAtDepth(
                        Number(node.ai?.context_left_depth ?? 1),
                        'incoming'
                      );
                      return filteredIncoming.length > 0 ? (
                        <div className="border-t border-slate-700 pt-2 space-y-2">
                          {filteredIncoming.map((n) => (
                            <div key={n.node_id} className="bg-slate-800 p-2 rounded text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-mono text-[10px] uppercase flex-shrink-0">{n.type}</span>
                                <span className="text-slate-400 font-mono text-[9px] flex-shrink-0">({n.node_id})</span>
                                <span className="text-slate-300 font-medium flex-1 truncate" title={n.title}>
                                  {n.title}
                                </span>
                              </div>
                              <div className="text-slate-400 text-[11px] leading-relaxed truncate">
                                {getNodeContentPreview(n)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic pt-2 border-t border-slate-700">
                          Нет входящих нод
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Выходные порты (справа - исходящие ноды) */}
                  <div className="bg-slate-900 p-4 rounded border border-slate-700 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-2">Выход из ноды</h4>
                      <div className="text-xs text-slate-400 mb-1">
                        Количество исходящих нод: {outgoingNodes.length}
                      </div>
                    </div>

                    {/* Ползунок контекстной глубины справа */}
                    <div className="border-t border-slate-700 pt-3">
                      <label className="block text-xs font-medium text-slate-300 mb-2">
                        Глубина контекста (уровней)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={Number(node.ai?.context_right_depth ?? 0)}
                          onChange={(e) => {
                            const depth = Number(e.target.value);
                            onChangeAi?.(node.node_id, {
                              ...node.ai,
                              context_right_depth: depth,
                            });
                          }}
                          className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <span className="text-xs font-medium text-slate-300 min-w-[3rem]">
                          {Number(node.ai?.context_right_depth ?? 0)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Количество уровней нод справа, видимых в контексте
                      </p>
                    </div>

                    {/* Список исходящих нод */}
                    {(() => {
                      const filteredOutgoing = getNodesAtDepth(
                        Number(node.ai?.context_right_depth ?? 0),
                        'outgoing'
                      );
                      return filteredOutgoing.length > 0 ? (
                        <div className="border-t border-slate-700 pt-2 space-y-2">
                          {filteredOutgoing.map((n) => (
                            <div key={n.node_id} className="bg-slate-800 p-2 rounded text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-mono text-[10px] uppercase flex-shrink-0">{n.type}</span>
                                <span className="text-slate-400 font-mono text-[9px] flex-shrink-0">({n.node_id})</span>
                                <span className="text-slate-300 font-medium flex-1 truncate" title={n.title}>
                                  {n.title}
                                </span>
                              </div>
                              <div className="text-slate-400 text-[11px] leading-relaxed truncate">
                                {getNodeContentPreview(n)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic pt-2 border-t border-slate-700">
                          Нет исходящих нод
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Роутинг обязательных параметров */}
                {(() => {
                  const requiredPorts = (node.ai?.auto_ports || []).filter(p => p.required && p.position === 'right');
                  
                  if (requiredPorts.length === 0) {
                    return null;
                  }
                  
                  return (
                    <div className="border-t border-slate-700 pt-4 mt-4">
                      <h3 className="mb-3 font-medium text-slate-300">Роутинг обязательных параметров</h3>
                      <div className="bg-slate-900 p-4 rounded border border-slate-700">
                        <div className="space-y-3">
                          {requiredPorts.map((port) => (
                            <div key={port.id} className="space-y-1">
                              <label className="block text-xs font-medium text-red-400">
                                {port.label} <span className="text-red-500">*</span>
                              </label>
                              {port.description && (
                                <div className="text-[10px] text-slate-500 mb-1">
                                  {port.description}
                                </div>
                              )}
                              <select
                                value={node.meta?.input_mappings?.[port.id] || ''}
                                onChange={(e) => {
                                  const newMappings = { ...(node.meta?.input_mappings as Record<string, string> || {}) };
                                  if (e.target.value) {
                                    newMappings[port.id] = e.target.value;
                                  } else {
                                    delete newMappings[port.id];
                                  }
                                  onUpdateNodeMeta?.(node.node_id, {
                                    ...node.meta,
                                    input_mappings: newMappings
                                  });
                                }}
                                className="w-full bg-slate-700 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-600 focus:border-red-500 focus:outline-none"
                              >
                                <option value="">-- Выберите источник --</option>
                                {incomingNodes.map((n) => (
                                  <option key={n.node_id} value={n.node_id}>
                                    {n.type}: {n.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Превью контекста для отправки агенту */}
                <div className="border-t border-slate-700 pt-4 mt-4">
                  {/* Реальный контекст для отправки агенту */}
                  <div className="bg-slate-900/50 border border-slate-700/50 rounded p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-slate-300">
                        Превью контекста для агента
                      </h4>
                      <div className="text-xs text-slate-400">
                        <span className="font-mono">{contextCharCount.toLocaleString()}</span> символов
                      </div>
                    </div>
                    {contextPreview ? (
                      <div className="bg-slate-900 p-3 rounded border border-slate-700">
                        <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                          {contextPreview}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        Нет входящих нод для формирования контекста
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'request' && (
          <div className="space-y-6">
            {/* ✅ Preview payload from backend with field_mapping configuration */}
            {previewLoading ? (
              <div className="bg-slate-800/50 border border-slate-700 rounded p-4 flex items-center justify-center gap-3">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span className="text-sm text-slate-400">Загружаем превью запроса...</span>
              </div>
            ) : Object.keys(previewPayload).length > 0 ? (
              <div className="bg-slate-900/50 border border-slate-700 rounded p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-300">📤 Конфигурация поля (field_mapping)</h4>
                  <span className="text-xs text-slate-500">
                    {previewPayload.provider && `Provider: ${previewPayload.provider}`}
                  </span>
                </div>
                
                {/* AI Config summary */}
                <div className="bg-slate-800/50 rounded border border-slate-700/50 p-3 mb-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500 font-semibold mb-1">System Prompt</div>
                      <div className="flex gap-2 items-center text-slate-300">
                        <span className="px-2 py-1 bg-slate-700/60 rounded">
                          {previewPayload.ai_config?.system_prompt_source === 'port' ? '🔗 Port' : '✏️ Manual'}
                        </span>
                        <span className="text-slate-400">→ {previewPayload.ai_config?.system_prompt_target || 'prompt'}</span>
                      </div>
                      {previewPayload.ai_config?.system_prompt && (
                        <div className="text-slate-500 mt-1 text-[11px] max-w-xs truncate">
                          {previewPayload.ai_config.system_prompt}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <div className="text-slate-500 font-semibold mb-1">Output Example</div>
                      <div className="flex gap-2 items-center text-slate-300">
                        <span className="px-2 py-1 bg-slate-700/60 rounded">
                          {previewPayload.ai_config?.output_example_source === 'port' ? '🔗 Port' : '✏️ Manual'}
                        </span>
                        <span className="text-slate-400">→ {previewPayload.ai_config?.output_example_target || 'prompt'}</span>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-slate-500 font-semibold mb-1">Temperature</div>
                      <div className="flex gap-2 items-center text-slate-300">
                        <span className="px-2 py-1 bg-slate-700/60 rounded">
                          {previewPayload.ai_config?.temperature_source === 'port' ? '🔗 Port' : '✏️ Manual'}
                        </span>
                        <span className="text-slate-400">{previewPayload.ai_config?.temperature || 0.7}</span>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-slate-500 font-semibold mb-1">Model</div>
                      <div className="text-slate-300 text-sm">
                        {previewPayload.ai_config?.model || 'default'}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Additional fields */}
                {Object.keys(previewPayload.ai_config?.additional_fields || {}).length > 0 && (
                  <div className="bg-slate-800/50 rounded border border-slate-700/50 p-3">
                    <div className="text-xs text-slate-500 font-semibold mb-2">Additional Fields</div>
                    <div className="space-y-1">
                      {Object.entries(previewPayload.ai_config?.additional_fields || {}).map(([key, val]: [string, any]) => (
                        <div key={key} className="text-xs text-slate-400 flex justify-between gap-2">
                          <span className="font-mono">{key}</span>
                          <span className="text-slate-500">source: {val?.source || 'manual'} → {val?.target || key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Auto ports info */}
                {previewPayload.ai_config?.auto_ports && Array.isArray(previewPayload.ai_config.auto_ports) && previewPayload.ai_config.auto_ports.length > 0 && (
                  <div className="bg-slate-800/50 rounded border border-slate-700/50 p-3 mt-3">
                    <div className="text-xs text-slate-500 font-semibold mb-2">Auto Ports ({previewPayload.ai_config.auto_ports.length})</div>
                    <div className="space-y-1">
                      {previewPayload.ai_config.auto_ports.map((port: any) => (
                        <div key={port.id} className="text-xs text-slate-400">
                          <span className="font-mono">{port.id}</span>
                          <span className="text-slate-600 ml-2">({port.type})</span>
                          {port.required && <span className="text-red-400 ml-2">*required</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-slate-300">Превью API запроса</h3>
                <div>
                  <button
                    type="button"
                    onClick={() => fetchPreviewPayload()}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded"
                  >
                    Обновить превью
                  </button>
                </div>
              </div>
              {(() => {
                // ✅ СПЕЦИАЛЬНАЯ ОБРАБОТКА ДЛЯ MIDJOURNEY
                const isMidjourney = String(node.ai?.provider || '') === 'midjourney';
                if (isMidjourney && previewPayload.midjourney) {
                  return (
                    <div className="space-y-3">
                      <div className="bg-slate-800 border border-slate-700 rounded p-3">
                        <div className="text-xs text-slate-400 font-mono mb-2">POST /mj/submit/imagine</div>
                        <div className="bg-slate-900 rounded p-3 font-mono text-sm text-slate-200 overflow-auto max-h-48">
                          <pre className="whitespace-pre-wrap break-words">{JSON.stringify({
                            prompt: previewPayload.midjourney.prompt
                          }, null, 2)}</pre>
                        </div>
                      </div>
                      
                      {previewPayload.midjourney.referenceImages && previewPayload.midjourney.referenceImages.length > 0 && (
                        <div className="bg-slate-800 border border-slate-700 rounded p-3">
                          <div className="text-xs text-slate-400 font-semibold mb-2">📎 Reference Images ({previewPayload.midjourney.referenceImages.length})</div>
                          <div className="space-y-2">
                            {previewPayload.midjourney.referenceImages.map((ref: any, idx: number) => (
                              <div key={idx} className="text-xs bg-slate-900 rounded p-2">
                                <div className="text-slate-400">{ref.purpose}</div>
                                <div className="text-slate-500 font-mono truncate text-[11px]">{ref.url}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // Формируем РЕАЛЬНЫЙ request payload как он будет отправлен в API
                const currentProvider = String(node.ai?.provider || 'openai');
                const currentModel = String(node.ai?.model || 'gpt-4o-mini');
                const systemPrompt = String(node.ai?.system_prompt || '');
                const temperature = Number(node.ai?.temperature ?? 0.7);
                const contextMode = String(node.ai?.context_mode || 'simple');
                
                // Исключаем ноды, которые уже подключены к auto-портам (перечень собран выше)
                const filteredSources = (sources ?? []).filter(
                  (src) => !autoPortSourceIds.has(src.node_id),
                );

                // Основной промпт
                const primaryPrompt = (() => {
                  const contentValue =
                    typeof node.content === 'string' ? node.content.trim() : '';
                  if (contentValue.length > 0) {
                    return contentValue;
                  }
                  const template =
                    typeof node.ai?.user_prompt_template === 'string'
                      ? node.ai.user_prompt_template.trim()
                      : '';
                  if (template.length > 0) {
                    return template;
                  }
                  return '';
                })();

                // Контекст из входящих нод
                let contextLabel = 'Context:';
                let contextBody = '';

                if (filteredSources.length > 0) {
                  if (contextMode === 'full_json') {
                    contextLabel = 'Context (Full JSON):';
                    const contextNodesData = filteredSources
                      .map((src) => {
                        const sourceNode = allNodes?.find((n) => n.node_id === src.node_id);
                        return sourceNode
                          ? {
                              node_id: sourceNode.node_id,
                              type: sourceNode.type,
                              title: sourceNode.title,
                              content: sourceNode.content,
                              ai: sourceNode.ai,
                            }
                          : null;
                      })
                      .filter(Boolean);
                    contextBody = JSON.stringify(contextNodesData, null, 2);
                  } else if (contextMode === 'clean') {
                    const contents = filteredSources
                      .map((src) => {
                        const sourceNode = allNodes?.find((n) => n.node_id === src.node_id);
                        if (!sourceNode) return '';
                        const rawContent =
                          typeof sourceNode.content === 'string' ? sourceNode.content.trim() : '';
                        return rawContent;
                      })
                      .filter((c) => c.trim().length > 0)
                      .join('; ');
                    contextBody = contents;
                  } else {
                    const lines: string[] = [];
                    filteredSources.forEach((src) => {
                      const sourceNode = allNodes?.find((n) => n.node_id === src.node_id);
                      if (sourceNode) {
                        lines.push(`• **${sourceNode.title}** (${sourceNode.type})`);
                        if (sourceNode.content) {
                          lines.push(String(sourceNode.content));
                        }
                      }
                    });
                    contextBody = lines.join('\n');
                  }
                }

                const fullUserPromptParts: string[] = [];
                if (primaryPrompt.length > 0) {
                  fullUserPromptParts.push(primaryPrompt);
                }
                if (contextBody.length > 0) {
                  const formattedContext =
                    contextMode === 'clean'
                      ? `${contextLabel}${contextBody}`
                      : `${contextLabel}\n${contextBody}`;
                  fullUserPromptParts.push(formattedContext);
                }
                
                // ✅ Добавляем пример выходных данных в промпт
                if (outputExampleSource === 'manual' && outputExampleValue && outputExampleValue.trim().length > 0) {
                  fullUserPromptParts.push(`Output Example:\n${outputExampleValue.trim()}`);
                }

                const fullUserPrompt = fullUserPromptParts.join('\n\n');
                
                const activeAutoPorts = pendingAutoPorts.filter((port) => {
                  if (port.id === 'prompt') {
                    return false;
                  }
                  return port.required || pendingEnabledPorts.includes(port.id);
                });

                const looksLikeMediaValue = (value: string): boolean =>
                  /^https?:\/\//i.test(value) || value.startsWith('data:');

                const expandMediaValue = (raw: string): string[] => {
                  const trimmed = raw.trim();
                  if (!trimmed) {
                    return [];
                  }
                  const separators = /[;\n\r]+/;
                  if (separators.test(trimmed)) {
                    const tokens = trimmed
                      .split(separators)
                      .map((token) => token.trim())
                      .filter(Boolean);
                    if (tokens.length > 1 && tokens.every(looksLikeMediaValue)) {
                      return tokens;
                    }
                  }
                  return [trimmed];
                };

                const autoPortPayload = activeAutoPorts.reduce<Record<string, unknown>>((acc, port) => {
                  // 🎯 НОВОЕ: используем getPortDataList чтобы получить ВСЕ подключённые значения
                  const rawValueList = getPortDataList(port.id, port.type);
                  if (!rawValueList || rawValueList.length === 0) {
                    return acc;
                  }

                  const normalizedPortType = (port.type || '').toLowerCase();
                  const normalizedPortId = port.id.toLowerCase();
                  const expectsMediaList =
                    normalizedPortType === 'image' ||
                    normalizedPortType === 'video' ||
                    normalizedPortType === 'audio' ||
                    normalizedPortId === 'image_input' ||
                    /^image_input[\w-]*$/.test(normalizedPortId);

                  if (expectsMediaList) {
                    // Для портов которые ожидают массив - расширяем все значения
                    const allEntries: string[] = [];
                    const seen = new Set<string>();
                    
                    for (const rawValue of rawValueList) {
                      const entries = expandMediaValue(rawValue.trim());
                      for (const entry of entries) {
                        if (!seen.has(entry)) {
                          seen.add(entry);
                          allEntries.push(entry);
                        }
                      }
                    }
                    
                    if (allEntries.length > 0) {
                      acc[port.id] = allEntries;
                    }
                    return acc;
                  }

                  // Для обычных портов - берём первое значение (если несколько нод подключено, берём первую)
                  acc[port.id] = rawValueList[0].trim();
                  return acc;
                }, {});

                const summarizeScalar = (value: string): string => {
                  if (value.startsWith('data:')) {
                    const approxKb = Math.round(value.length / 1024);
                    return `<data uri ~${approxKb}KB>`;
                  }
                  if (looksLikeMediaValue(value)) {
                    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
                  }
                  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
                };

                const pickImageCandidate = (node: any): string | null => {
                  if (!node || node.type !== 'image') {
                    return null;
                  }
                  const meta = (node.meta ?? {}) as Record<string, unknown>;
                  const candidates = [
                    typeof meta.image_url === 'string' ? meta.image_url : null,
                    typeof meta.original_image === 'string' ? meta.original_image : null,
                    typeof meta.image_original === 'string' ? meta.image_original : null,
                    typeof meta.image_edited === 'string' ? meta.image_edited : null,
                    typeof meta.annotated_image === 'string' ? meta.annotated_image : null,
                    typeof meta.local_url === 'string' ? meta.local_url : null,
                    typeof node.content === 'string' ? node.content : null,
                  ];
                  const found = candidates.find((item) => typeof item === 'string' && item.trim().length > 0);
                  return found ? found.trim() : null;
                };

                if (
                  currentProvider === 'replicate' &&
                  !('image_input' in autoPortPayload)
                ) {
                  const fallbackImages: string[] = [];
                  const seen = new Set<string>();
                  filteredSources.forEach((src) => {
                    const sourceNode = allNodes?.find((n) => n.node_id === src.node_id);
                    const candidate = pickImageCandidate(sourceNode);
                    if (candidate) {
                      const entries = expandMediaValue(candidate);
                      entries.forEach((entry) => {
                        if (!seen.has(entry)) {
                          seen.add(entry);
                          fallbackImages.push(entry);
                        }
                      });
                    }
                  });
                  if (fallbackImages.length > 0) {
                    autoPortPayload.image_input = fallbackImages;
                  }
                }

                const autoPortSummary = Object.entries(autoPortPayload).reduce<Record<string, string | string[]>>(
                  (acc, [key, value]) => {
                    if (Array.isArray(value)) {
                      // 🎯 НОВОЕ: Для массивов сохраняем как массив, чтобы потом показать каждый элемент отдельно
                      acc[key] = value.map((item) => summarizeScalar(String(item)));
                    } else if (typeof value === 'string') {
                      acc[key] = summarizeScalar(value);
                    } else {
                      acc[key] = JSON.stringify(value);
                    }
                    return acc;
                  },
                  {},
                );
                
                // УПРОЩЕННЫЙ режим - краткая структура
                const recordedPayload = (node.meta?.last_request_payload ?? null) as
                  | { request?: unknown }
                  | Record<string, unknown>
                  | null;
                const recordedRequest =
                  recordedPayload && typeof recordedPayload === 'object'
                    ? (recordedPayload as { request?: unknown }).request ?? recordedPayload
                    : null;

                let simplePreview: unknown = {};
                if (currentProvider === 'openai' || currentProvider === 'openai_gpt') {
                  const sysPromptSrc = systemPromptSource === 'port' ? '🔗 Port' : '📝 Manual';
                  const hasPromptPort = pendingEnabledPorts.includes('prompt');
                  const promptSrc = hasPromptPort ? '🔗 Port' : '📝 Manual';
                  const tempSrc = temperatureSource === 'port' ? '🔗 Port' : '📝 Manual';
                  
                  simplePreview = {
                    model: currentModel,
                    temperature: `${tempSrc} • ${temperature}`,
                    messages: [
                      { 
                        role: 'system', 
                        content: systemPrompt 
                          ? `${sysPromptSrc} • ${systemPrompt.substring(0, 50)}...` 
                          : 'Default system prompt' 
                      },
                      { 
                        role: 'user', 
                        content: `${promptSrc} • <${fullUserPrompt.length} chars>` 
                      }
                    ]
                  };
                } else if (currentProvider === 'replicate') {
                  // ✅ Упрощенный вид с указанием источников данных
                  const simpleInput: Record<string, string> = {};
                  
                  // Prompt - проверяем, есть ли порт 'prompt' в enabled портах
                  const hasPromptPort = pendingEnabledPorts.includes('prompt');
                  const promptSrc = hasPromptPort ? '🔗 Port' : '📝 Manual';
                  simpleInput.prompt = `${promptSrc} • <${fullUserPrompt.length} chars>`;
                  
                  // System Prompt (если есть)
                  if (systemPrompt && systemPrompt.trim().length > 0) {
                    const sysPromptSrc = systemPromptSource === 'port' ? '🔗 Port' : '📝 Manual';
                    simpleInput.system_prompt = `${sysPromptSrc} • <${systemPrompt.length} chars>`;
                  }
                  
                  // Temperature
                  const tempSrc = temperatureSource === 'port' ? '🔗 Port' : '📝 Manual';
                  simpleInput.temperature = `${tempSrc} • ${temperature}`;
                  
                  // Max tokens
                  simpleInput.max_tokens = `📝 Manual • ${Number(node.ai?.max_tokens) || 2000}`;
                  
                  // Auto-ports (если есть активные)
                  for (const [key, value] of Object.entries(autoPortSummary)) {
                    if (Array.isArray(value)) {
                      // 🎯 НОВОЕ: Для массивов показываем каждый элемент отдельной строкой
                      if (value.length === 0) {
                        simpleInput[key] = `🔗 Port • []`;
                      } else if (value.length === 1) {
                        simpleInput[key] = `🔗 Port • ${value[0]}`;
                      } else {
                        // Создаём строку "array [1], [2], [3]" стиля с индексами
                        simpleInput[key] = `🔗 Port • array (${value.length} items)`;
                        // Добавляем каждый элемент как отдельное поле
                        value.forEach((item: string, index: number) => {
                          simpleInput[`${key}[${index}]`] = `  📤 ${item}`;
                        });
                      }
                    } else {
                      simpleInput[key] = `🔗 Port • ${typeof value === 'string' ? value : JSON.stringify(value)}`;
                    }
                  }
                  
                  simplePreview = {
                    version: currentModel,
                    input: simpleInput,
                  };
                } else if (currentProvider === 'gemini' || currentProvider === 'google_gemini' || currentProvider === 'google_ai_studio' || currentProvider === 'google_workspace') {
                  const hasPromptPort = pendingEnabledPorts.includes('prompt');
                  const promptSrc = hasPromptPort ? '🔗 Port' : '📝 Manual';
                  const tempSrc = temperatureSource === 'port' ? '🔗 Port' : '📝 Manual';
                  
                  simplePreview = {
                    contents: [{ 
                      parts: [{ 
                        text: `${promptSrc} • <${fullUserPrompt.length} chars>` 
                      }] 
                    }],
                    generationConfig: { 
                      temperature: `${tempSrc} • ${temperature}` 
                    }
                  };
                } else if (currentProvider === 'anthropic') {
                  const hasPromptPort = pendingEnabledPorts.includes('prompt');
                  const promptSrc = hasPromptPort ? '🔗 Port' : '📝 Manual';
                  const tempSrc = temperatureSource === 'port' ? '🔗 Port' : '📝 Manual';
                  
                  simplePreview = {
                    model: currentModel,
                    temperature: `${tempSrc} • ${temperature}`,
                    messages: [
                      { 
                        role: 'user', 
                        content: `${promptSrc} • <${fullUserPrompt.length} chars>` 
                      }
                    ]
                  };
                } else if (currentProvider === 'midjourney_mindworkflow_relay' || currentProvider === 'midjourney') {
                  // Midjourney: построить Discord промпт
                  const refImages = filteredSources
                    .map((src) => {
                      const sourceNode = allNodes?.find((n) => n.node_id === src.node_id);
                      const candidate = pickImageCandidate(sourceNode);
                      return candidate ? `🖼️ ${candidate.slice(0, 60)}...` : null;
                    })
                    .filter(Boolean);
                  
                  const hasAspectRatio = node.ai?.aspect_ratio ? `--ar ${node.ai.aspect_ratio}` : '';
                  const hasStyle = node.ai?.mode === 'raw' ? '--style raw' : '';
                  const hasStylization = node.ai?.stylization && Number(node.ai.stylization) !== 100 ? `--s ${node.ai.stylization}` : '';
                  const hasWeirdness = node.ai?.weirdness && Number(node.ai.weirdness) > 0 ? `--w ${node.ai.weirdness}` : '';
                  const hasVariety = node.ai?.variety && Number(node.ai.variety) > 0 ? `--vary ${node.ai.variety}` : '';
                  const hasSpeed = node.ai?.speed ? `--${node.ai.speed}` : '';
                  
                  const flags = [hasAspectRatio, hasStyle, hasStylization, hasWeirdness, hasVariety, hasSpeed]
                    .filter(Boolean)
                    .join(' ');
                  
                  simplePreview = {
                    command: '/imagine',
                    prompt: `📝 ${fullUserPrompt.substring(0, 60)}...`,
                    references: refImages.length > 0 ? refImages : 'None',
                    parameters: flags || 'Default',
                  };
                }
                
                // ПОЛНЫЙ режим - реальный запрос с полным контентом
                let fullRequest: unknown = {};
                if (currentProvider === 'openai' || currentProvider === 'openai_gpt') {
                  fullRequest = {
                    model: currentModel,
                    temperature,
                    messages: [
                      { role: 'system', content: systemPrompt || 'Ты полезный AI ассистент' },
                      { role: 'user', content: fullUserPrompt }
                    ],
                    max_tokens: Number(node.ai?.max_tokens) || undefined
                  };
                } else if (currentProvider === 'replicate') {
                  // ✅ ИСПРАВЛЕНО: Не склеиваем system_prompt с prompt, а добавляем отдельными полями
                  const replicateInput: Record<string, unknown> = {
                    prompt: fullUserPrompt,  // Только основной промпт
                    max_tokens: Number(node.ai?.max_tokens) || 2000,
                    temperature,
                  };
                  
                  // Добавляем system_prompt отдельным полем если есть
                  if (systemPrompt && systemPrompt.trim().length > 0) {
                    replicateInput.system_prompt = systemPrompt.trim();
                  }

                  for (const [key, value] of Object.entries(autoPortPayload)) {
                    replicateInput[key] = value;
                  }

                  if (
                    node.ai &&
                    typeof node.ai.negative_prompt === 'string' &&
                    node.ai.negative_prompt.trim().length > 0
                  ) {
                    replicateInput.negative_prompt = node.ai.negative_prompt.trim();
                  }

                  fullRequest = {
                    version: currentModel,
                    input: replicateInput,
                  };
                } else if (currentProvider === 'gemini' || currentProvider === 'google_gemini' || currentProvider === 'google_ai_studio' || currentProvider === 'google_workspace') {
                  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${fullUserPrompt}`.trim() : fullUserPrompt;
                  fullRequest = {
                    contents: [
                      {
                        parts: [
                          { text: combinedPrompt }
                        ]
                      }
                    ],
                    generationConfig: {
                      temperature,
                      maxOutputTokens: Number(node.ai?.max_tokens) || 2000,
                      topP: 0.9
                    }
                  };
                } else if (currentProvider === 'anthropic') {
                  fullRequest = {
                    model: currentModel,
                    temperature,
                    messages: [
                      { role: 'user', content: fullUserPrompt }
                    ],
                    max_tokens: Number(node.ai?.max_tokens) || 2000
                  };
                  
                  if (systemPrompt && systemPrompt.trim().length > 0) {
                    (fullRequest as Record<string, unknown>).system = systemPrompt.trim();
                  }
                } else if (currentProvider === 'midjourney_mindworkflow_relay' || currentProvider === 'midjourney') {
                  // Midjourney: построить полный Discord промпт с правильной структурой
                  const imagePromptUrls: string[] = [];  // Основной визуальный референс
                  const styleRefUrls: string[] = [];      // Стиль
                  const charRefUrls: string[] = [];       // Персонаж (--cref)
                  
                  filteredSources.forEach((src) => {
                    const sourceNode = allNodes?.find((n) => n.node_id === src.node_id);
                    const candidate = pickImageCandidate(sourceNode);
                    if (candidate) {
                      const nodeType = sourceNode?.type || '';
                      // Классификация по типу ноды
                      if (nodeType === 'image' && sourceNode?.title?.toLowerCase().includes('character')) {
                        charRefUrls.push(candidate);
                      } else if (nodeType === 'image' && sourceNode?.title?.toLowerCase().includes('style')) {
                        styleRefUrls.push(candidate);
                      } else if (nodeType === 'image') {
                        imagePromptUrls.push(candidate);
                      }
                    }
                  });
                  
                  // Собрать все флаги
                  const flags: string[] = [];
                  
                  // Version из modelId
                  if (currentModel && currentModel !== 'default') {
                    const versionMatch = currentModel.match(/v7|v6\.1|v6|v5\.2|v5\.1|v5|niji-6|niji-5|niji-4/);
                    if (versionMatch) {
                      const version = versionMatch[0];
                      if (version.startsWith('niji-')) {
                        flags.push(`--${version.replace('-', ' ')}`);
                      } else {
                        flags.push(`--v ${version.substring(1)}`);
                      }
                    }
                  }
                  
                  if (node.ai?.mode === 'raw') {
                    flags.push('--style raw');
                  }
                  
                  if (node.ai?.aspect_ratio) {
                    const arMap: Record<string, string> = { 'portrait': '2:3', 'square': '1:1', 'landscape': '3:2' };
                    if (arMap[node.ai.aspect_ratio as string]) {
                      flags.push(`--ar ${arMap[node.ai.aspect_ratio as string]}`);
                    }
                  }
                  
                  if (node.ai?.stylization && Number(node.ai.stylization) !== 100) {
                    flags.push(`--s ${node.ai.stylization}`);
                  }
                  
                  if (node.ai?.weirdness && Number(node.ai.weirdness) > 0) {
                    flags.push(`--w ${node.ai.weirdness}`);
                  }
                  
                  if (node.ai?.variety && Number(node.ai.variety) > 0) {
                    flags.push(`--vary ${node.ai.variety}`);
                  }
                  
                  if (node.ai?.speed) {
                    flags.push(`--${node.ai.speed}`);
                  }
                  
                  // Character References: --cref url1 url2 --cw 80
                  if (charRefUrls.length > 0) {
                    flags.push(`--cref ${charRefUrls.join(' ')}`);
                    flags.push('--cw 80');
                  }
                  
                  const flagsStr = flags.length > 0 ? ' ' + flags.join(' ') : '';
                  // Structure: /imagine [imagePrompt URLs] [styleRef URLs] [text] [flags --cref URLs]
                  const discordPrompt = [
                    '/imagine',
                    ...imagePromptUrls,
                    ...styleRefUrls,
                    fullUserPrompt,
                    flagsStr.trim(),
                  ].filter(Boolean).join(' ');
                  
                  // Midjourney API sends only the Discord prompt
                  fullRequest = {
                    prompt: discordPrompt,
                  };
                }
                
                const effectiveFullRequest =
                  recordedRequest && currentProvider === 'replicate' ? recordedRequest : fullRequest;
                const effectiveSimplePreview =
                  recordedRequest && currentProvider === 'replicate' ? recordedRequest : simplePreview;

                const displayedRequest = viewMode === 'simple' ? effectiveSimplePreview : effectiveFullRequest;
                
                const handleCopy = () => {
                  navigator.clipboard.writeText(JSON.stringify(displayedRequest, null, 2));
                };
                
                const handleDownload = () => {
                  const blob = new Blob([JSON.stringify(displayedRequest, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `request_${viewMode}_${node.node_id}_${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                };
                
                return (
                  <div className="space-y-4">
                    {/* JSON Payload с переносом строк */}
                    <div className="p-4 bg-slate-900 rounded-lg border border-slate-700 overflow-auto max-h-[500px]">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(displayedRequest, null, 2)}
                      </pre>
                    </div>
                    
                    {/* Кнопки: режим слева, действия справа */}
                    <div className="flex justify-between items-center">
                      {/* Переключатель режима слева */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setViewMode('simple')}
                          className={`px-4 py-2 rounded-md transition ${
                            viewMode === 'simple'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          📋 Упрощенный
                        </button>
                        <button
                          onClick={() => setViewMode('full')}
                          className={`px-4 py-2 rounded-md transition ${
                            viewMode === 'full'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          📄 Полный запрос
                        </button>
                      </div>
                      
                      {/* Кнопки действий справа */}
                      <div className="flex gap-2">
                        <button
                          onClick={handleCopy}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition flex items-center gap-2"
                        >
                          📋 Copy JSON
                        </button>
                        <button
                          onClick={handleDownload}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition flex items-center gap-2"
                        >
                          💾 Download
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Системный промпт */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-300">Системный промпт</label>
                <div className="flex gap-3 items-center">
                  {/* TARGET: Куда идёт системный промпт */}
                  <select
                    value={systemPromptTarget}
                    onChange={(e) => {
                      setSystemPromptTarget(e.target.value);
                      setHasChanges(true);
                    }}
                    className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    disabled={loading}
                    title="В какое API поле отправляется системный промпт"
                  >
                    <option value="prompt">📝 В Prompt (общий)</option>
                    {modelInputs.filter(i => i.type === 'string' || i.type === 'text').map(input => (
                      <option key={input.name} value={input.name}>
                        📤 В {input.name}
                      </option>
                    ))}
                  </select>
                  
                  {/* SOURCE: Чекбокс "Из входящей ноды" */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={systemPromptSource === 'port'}
                      onChange={(e) => {
                        const newSource = e.target.checked ? 'port' : 'manual';
                        setSystemPromptSource(newSource);
                        setHasChanges(true);
                        
                        // ✅ НОВОЕ: Добавляем/удаляем порт из pendingEnabledPorts
                        setPendingEnabledPorts(prev => {
                          if (newSource === 'port') {
                            return prev.includes('system_prompt') ? prev : [...prev, 'system_prompt'];
                          } else {
                            return prev.filter(p => p !== 'system_prompt');
                          }
                        });
                        
                      }}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                      disabled={loading}
                    />
                    <span className="text-xs text-slate-300">Из входящей ноды</span>
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <div className="flex flex-wrap gap-2">
                  {quickSystemPrompts.map((preset) => (
                    <button
                      key={preset.preset_id}
                      type="button"
                      onClick={() => {
                        updateSystemPrompt(preset.content);
                        setPromptSearchTerm('');
                        setPromptSearchResults([]);
                        setPromptSearchError(null);
                      }}
                      className="px-3 py-1.5 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
                      disabled={loading}
                      title={preset.description ?? undefined}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[220px]">
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
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Поиск по библиотеке промптов..."
                    disabled={loading}
                  />
                  {promptSearchTerm.trim().length >= 2 && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
                      {promptSearchLoading && (
                        <div className="px-3 py-2 text-sm text-slate-400">Поиск...</div>
                      )}
                      {promptSearchError && !promptSearchLoading && (
                        <div className="px-3 py-2 text-sm text-rose-400">{promptSearchError}</div>
                      )}
                      {!promptSearchLoading && !promptSearchError && promptSearchResults.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-400">Ничего не найдено</div>
                      )}
                      {!promptSearchLoading && promptSearchResults.map((preset) => (
                        <button
                          key={preset.preset_id}
                          type="button"
                          className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-700/70"
                          onClick={() => {
                            updateSystemPrompt(preset.content);
                            setPromptSearchTerm('');
                            setPromptSearchResults([]);
                            setPromptSearchError(null);
                          }}
                          disabled={loading}
                        >
                          <span className="text-sm text-slate-200">{preset.label}</span>
                          {preset.description && (
                            <span className="text-xs text-slate-400">{preset.description}</span>
                          )}
                          {preset.tags.length > 0 && (
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">
                              {preset.tags.join(' • ')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {systemPromptSource === 'manual' ? (
                <SystemPromptEditor
                  value={systemPromptValue}
                  onChange={updateSystemPrompt}
                  onBlur={handleSystemPromptBlur}
                  disabled={loading}
                  placeholder="Введите системный промпт для AI..."
                />
              ) : (
                <div className="w-full min-h-24 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2">
                  <div className="text-xs text-blue-400 mb-2">
                    🔗 Данные поступают через порт "System Prompt"
                  </div>
                  {(() => {
                    const portData = getPortData('system_prompt');
                    if (portData) {
                      return (
                        <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                          {portData.length > 200 ? portData.substring(0, 200) + '...' : portData}
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-xs text-slate-500 italic">
                          (порт не подключен - данные будут доступны после подключения)
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>
            
            {/* Output Example Section */}
            <OutputExampleSection />

            {/* File Delivery Format */}
            <div className="border-t border-slate-700 pt-4">
              <h3 className="mb-3 text-sm font-medium text-slate-300">Формат передачи файлов</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleFileDeliveryFormatChange('url')}
                  disabled={loading || fileDeliveryFormat === 'url'}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    fileDeliveryFormat === 'url'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  🔗 URL
                </button>
                <button
                  type="button"
                  onClick={() => handleFileDeliveryFormatChange('base64')}
                  disabled={loading || fileDeliveryFormat === 'base64'}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    fileDeliveryFormat === 'base64'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  🧬 Base64
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                URL — предпочтительный вариант: файлы остаются лёгкими, их можно кешировать и переиспользовать.
                Выберите Base64 только если модель не может загрузить файл по ссылке.
              </p>
            </div>
            
            {/* Temperature Control */}
            <div className="border-t border-slate-600 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-300">🌡️ Температура</label>
                <div className="flex gap-3 items-center">
                  {/* TARGET: Куда идёт температура */}
                  <select
                    value={temperatureTarget}
                    onChange={(e) => {
                      setTemperatureTarget(e.target.value);
                      setHasChanges(true);
                    }}
                    className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    disabled={loading}
                    title="В какое API поле отправляется температура"
                  >
                    {modelInputs.filter(i => i.type === 'number' || i.type === 'integer').map(input => (
                      <option key={input.name} value={input.name}>
                        📤 В {input.name}
                      </option>
                    ))}
                    {!modelInputs.some(i => i.name === 'temperature') && (
                      <option value="temperature">📤 В temperature (default)</option>
                    )}
                  </select>
                  
                  {/* SOURCE: Чекбокс "Из входящей ноды" */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={temperatureSource === 'port'}
                      onChange={(e) => {
                        const newSource = e.target.checked ? 'port' : 'manual';
                        setTemperatureSource(newSource);
                        setHasChanges(true);
                        
                        // ✅ НОВОЕ: Добавляем/удаляем порт из pendingEnabledPorts
                        setPendingEnabledPorts(prev => {
                          if (newSource === 'port') {
                            return prev.includes('temperature') ? prev : [...prev, 'temperature'];
                          } else {
                            return prev.filter(p => p !== 'temperature');
                          }
                        });
                        
                      }}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                      disabled={loading}
                    />
                    <span className="text-xs text-slate-300">Из входящей ноды</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {temperatureSource === 'manual' ? (
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={Number(node.ai?.temperature || 0.7)}
                    onChange={(e) => handleTemperatureChange(parseFloat(e.target.value) || 0.7)}
                    className="w-32 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    disabled={loading}
                  />
                ) : (
                  <div className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2">
                    <div className="text-xs text-blue-400 mb-1">
                      🔗 Значение поступает через порт "Temperature"
                    </div>
                    {(() => {
                      const portDataList = getPortDataList('temperature');
                      if (portDataList && portDataList.length > 0) {
                        return (
                          <div className="text-sm text-slate-300 font-mono space-y-1">
                            {portDataList.length === 1 ? (
                              <div>{portDataList[0]}</div>
                            ) : (
                              <div>
                                <div className="text-xs text-slate-400 mb-1">array ({portDataList.length} items)</div>
                                {portDataList.map((item, idx) => (
                                  <div key={idx} className="text-xs text-slate-300 ml-2 flex items-start gap-2">
                                    <span className="text-slate-500">📤 [{idx}]</span>
                                    <span>{item}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div className="text-xs text-slate-500 italic">
                            (порт не подключен)
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
              {temperatureSource === 'manual' && (
                <p className="text-xs text-slate-400 mt-2">
                  Чем выше значение, тем более креативные ответы. 0 = детерминированный, 1 = сбалансированный, 2 = максимум творчества.
                </p>
              )}
            </div>

            {/* Дополнительные поля из схемы модели */}
            <div className="pt-4 mt-4">
              {(() => {
                // Фильтруем поля: исключаем те, что уже есть в основных настройках или определяются через выбор модели
                const mainFields = ['prompt', 'system_prompt', 'temperature', 'version'];
                let additionalFields = modelInputs.filter(input => 
                  !mainFields.includes(input.name)
                );
                
                // ✅ ДЛЯ MIDJOURNEY: Фильтруем несовместимые с версией поля
                if (currentProvider.startsWith('midjourney_')) {
                  const currentModel = String(node.ai?.model || '');
                  const mjVersion = getMidjourneyVersion(currentModel);
                  
                  if (mjVersion === 7) {
                    // V7: исключаем character_reference (--cref не работает)
                    additionalFields = additionalFields.filter(field => 
                      !V7_INCOMPATIBLE_PORTS.includes(field.name)
                    );
                    console.log('🔄 Midjourney V7 - filtered out incompatible fields:', V7_INCOMPATIBLE_PORTS);
                  } else if (mjVersion === 6) {
                    // V6: исключаем omni (--omni только для V7)
                    additionalFields = additionalFields.filter(field => 
                      !V6_INCOMPATIBLE_PORTS.includes(field.name)
                    );
                    console.log('🔄 Midjourney V6 - filtered out incompatible fields:', V6_INCOMPATIBLE_PORTS);
                  }
                }
                
                if (additionalFields.length === 0) {
                  return (
                    <div className="text-xs text-slate-500 italic">
                      Нет дополнительных полей для этой модели
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-4">
                    {additionalFields.map(field => {
                      const fieldKey = field.name;
                      const mapping = additionalFieldsMapping[fieldKey];
                      const targetValue = mapping?.target || field.name;
                      const sourceValue = mapping?.source || 'manual';
                      // Значение поля из локального state
                      const fieldValue = additionalFieldsValues[fieldKey] || '';
                      
                      return (
                        <div key={fieldKey} className="border-t border-slate-600 pt-4">
                          {/* Заголовок с названием, типом и селектами */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <label className="text-sm font-medium text-slate-300">
                                {field.name}
                              </label>
                              <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-400">
                                {field.type}
                              </span>
                              {field.required && (
                                <span className="text-xs text-rose-400">✓ Обязательно</span>
                              )}
                            </div>
                            
                            <div className="flex gap-3 items-center">
                              {/* SELECT: Target (куда отправить) */}
                              <select
                                value={targetValue}
                                onChange={(e) => {
                                  setHasChanges(true);
                                  setAdditionalFieldsMapping(prev => ({
                                    ...prev,
                                    [fieldKey]: {
                                      target: e.target.value,
                                      source: prev[fieldKey]?.source || 'manual'
                                    }
                                  }));
                                }}
                                className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                disabled={loading}
                              >
                                <option value={field.name}>📤 В {field.name}</option>
                                {field.type === 'string' || field.type === 'text' ? (
                                  <option value="prompt">📝 В Prompt (общий)</option>
                                ) : null}
                              </select>
                              
                              {/* Чекбокс: Source (из входящей ноды) */}
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={sourceValue === 'port'}
                                  onChange={(e) => {
                                    const newSource = e.target.checked ? 'port' : 'manual';
                                    setHasChanges(true);
                                    
                                    // Обновляем маппинг
                                    setAdditionalFieldsMapping(prev => ({
                                      ...prev,
                                      [fieldKey]: {
                                        target: prev[fieldKey]?.target || field.name,
                                        source: newSource
                                      }
                                    }));
                                    
                                    // ✅ НОВОЕ: Добавляем/удаляем порт из pendingEnabledPorts
                                    setPendingEnabledPorts(prev => {
                                      if (newSource === 'port') {
                                        // Включен чекбокс - добавляем порт
                                        return prev.includes(fieldKey) ? prev : [...prev, fieldKey];
                                      } else {
                                        // Выключен чекбокс - удаляем порт
                                        return prev.filter(p => p !== fieldKey);
                                      }
                                    });
                                    
                                  }}
                                  className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                                  disabled={loading}
                                />
                                <span className="text-xs text-slate-300">Из входящей ноды</span>
                              </label>
                            </div>
                          </div>                          {/* Input, Select или preview данных из порта */}
                          <div className="flex items-center gap-3">
                            {sourceValue === 'manual' ? (
                              <>
                                {/* SELECT: Если есть options */}
                                {field.options && field.options.length > 0 ? (
                                  <select
                                    value={fieldValue || field.default || ''}
                                    onChange={(e) => {
                                      setHasChanges(true);
                                      setAdditionalFieldsValues(prev => ({
                                        ...prev,
                                        [fieldKey]: e.target.value
                                      }));
                                    }}
                                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    disabled={loading}
                                  >
                                    <option value="">Выберите {field.name}</option>
                                    {field.options.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (field.type === 'number' || field.type === 'integer') && field.min !== undefined && field.max !== undefined ? (
                                  /* SLIDER: Если number с min/max */
                                  <div className="flex-1 space-y-2">
                                    <input
                                      type="range"
                                      min={field.min}
                                      max={field.max}
                                      step={field.type === 'integer' ? 1 : (field.max - field.min) / 100}
                                      value={fieldValue || field.default || field.min}
                                      onChange={(e) => {
                                        setHasChanges(true);
                                        setAdditionalFieldsValues(prev => ({
                                          ...prev,
                                          [fieldKey]: e.target.value
                                        }));
                                      }}
                                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                                      disabled={loading}
                                    />
                                    <div className="flex justify-between text-xs text-slate-400">
                                      <span>{field.min}</span>
                                      <span className="text-slate-200 font-medium">{fieldValue || field.default || field.min}</span>
                                      <span>{field.max}</span>
                                    </div>
                                  </div>
                                ) : (
                                  /* TEXT/NUMBER INPUT: По умолчанию */
                                  <input
                                    type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                                    value={fieldValue}
                                    onChange={(e) => {
                                      setHasChanges(true);
                                      setAdditionalFieldsValues(prev => ({
                                        ...prev,
                                        [fieldKey]: e.target.value
                                      }));
                                    }}
                                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    disabled={loading}
                                    placeholder={`Введите ${field.name}...`}
                                    min={field.min}
                                    max={field.max}
                                  />
                                )}
                              </>
                            ) : (
                              <div className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2">
                                <div className="text-xs text-blue-400 mb-1">
                                  🔗 Значение поступает через порт "{field.name}"
                                </div>
                                {(() => {
                                  const portDataList = getPortDataList(fieldKey);
                                  if (portDataList && portDataList.length > 0) {
                                    return (
                                      <div className="text-sm text-slate-300 font-mono space-y-1">
                                        {portDataList.length === 1 ? (
                                          // Одно значение - просто выводим
                                          <div>
                                            {portDataList[0].length > 100 ? portDataList[0].substring(0, 100) + '...' : portDataList[0]}
                                          </div>
                                        ) : (
                                          // Несколько значений - выводим массив с индексами
                                          <div>
                                            <div className="text-xs text-slate-400 mb-1">array ({portDataList.length} items)</div>
                                            {portDataList.map((item, idx) => (
                                              <div key={idx} className="text-xs text-slate-300 ml-2 flex items-start gap-2">
                                                <span className="text-slate-500">📤 [{idx}]</span>
                                                <span className="break-all">{item.length > 80 ? item.substring(0, 80) + '...' : item}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div className="text-xs text-slate-500 italic">
                                        (порт не подключен)
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            )}
                          </div>
                          
                          {/* Описание поля */}
                          {field.description && (
                            <p className="text-xs text-slate-400 mt-2">
                              {field.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'model_info' && node.ai?.model && selectedProvider && (
          <div className="space-y-6">
            <ModelInfoModal
              isOpen={true}
              onClose={() => {}} // Tab stays open, close button handled by parent modal
              provider={selectedProvider.id as 'replicate' | 'openai' | 'google' | 'anthropic'}
              modelId={String(node.ai.model)}
              nodeId={node.node_id}
              currentMappings={node.meta?.input_mappings as Record<string, string>}
              onSaveMappings={(mappings) => {
                if (onUpdateNodeMeta) {
                  onUpdateNodeMeta(node.node_id, {
                    ...node.meta,
                    input_mappings: mappings
                  });
                }
              }}
              inline={true}
              enabledPorts={pendingEnabledPorts}
              invalidPortsWithEdges={invalidPortsWithEdges} // ⚠️ Передаём список невалидных портов
              onTogglePort={(portId, enabled, portInfo) => {
                // Обновляем pending enabled ports
                const newPorts = enabled 
                  ? [...pendingEnabledPorts, portId]
                  : pendingEnabledPorts.filter(p => p !== portId);
                
                setPendingEnabledPorts(newPorts);
                
                // Регенерируем auto_ports с новым списком enabled
                const updatedAutoPorts = generateAutoPorts(modelInputs, newPorts);
                setPendingAutoPorts(updatedAutoPorts);
                
                setHasChanges(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog />

      {/* Model Info Modal */}
    </Modal>
  );
}
