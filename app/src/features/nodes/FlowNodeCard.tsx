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
import MarkdownIt from 'markdown-it';
import { Handle, Position, useStore, useUpdateNodeInternals, type NodeProps } from 'reactflow';
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
} from '../../constants/nodeDefaults';
import { SettingsIcon } from '../../ui/icons/SettingsIcon';
import { NodeSettingsModal } from '../../ui/NodeSettingsModal';

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
  '#ef4444', '#f97316', '#facc15', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#fb7185', '#fda4af', '#84cc16',
];

const DEFAULT_COLOR = NODE_DEFAULT_COLOR;
const DEFAULT_MODEL = 'gpt-4.1-mini';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface ResizeConstraints {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

const RESIZE_CONSTRAINTS: ResizeConstraints = {
  minWidth: NODE_MIN_WIDTH,
  minHeight: NODE_MIN_HEIGHT,
  maxWidth: NODE_MAX_WIDTH,
  maxHeight: NODE_MAX_HEIGHT,
};

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

interface ProviderFieldValuePersisted {
  value?: string;
  source_node_id?: string | null;
}

interface ProviderFieldState {
  value: string;
  sourceNodeId: string | null;
}

function parseProviderFieldRecord(value: unknown): Record<string, ProviderFieldValuePersisted> {
  if (!value || typeof value !== 'object') return {};
  const record: Record<string, ProviderFieldValuePersisted> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const typed = entry as Record<string, unknown>;
    const field: ProviderFieldValuePersisted = {
      value:
        typeof typed.value === 'string'
          ? typed.value
          : typeof typed.value === 'number'
            ? String(typed.value)
            : undefined,
      source_node_id: typeof typed.source_node_id === 'string' ? typed.source_node_id : null,
    };
    record[key] = field;
  }
  return record;
}

function buildInitialFieldState(
  defs: IntegrationFieldConfig[],
  stored: Record<string, ProviderFieldValuePersisted>,
): Map<string, ProviderFieldState> {
  const map = new Map<string, ProviderFieldState>();
  defs.forEach((field, index) => {
    const storedValue = stored[field.key];
    map.set(field.key, {
      value:
        storedValue && typeof storedValue.value === 'string'
          ? storedValue.value
          : typeof field.default_value === 'string'
            ? field.default_value
            : '',
      sourceNodeId:
        storedValue && typeof storedValue.source_node_id === 'string'
          ? storedValue.source_node_id
          : null,
    });
  });
  return map;
}

function serializeFieldState(map: Map<string, ProviderFieldState>): Record<string, ProviderFieldValuePersisted> {
  const record: Record<string, ProviderFieldValuePersisted> = {};
  for (const [key, value] of map.entries()) {
    record[key] = {
      value: value.value,
      source_node_id: value.sourceNodeId ?? undefined,
    };
  }
  return record;
}

function fieldStateMapsEqual(
  a: Map<string, ProviderFieldState>,
  b: Map<string, ProviderFieldState>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a.entries()) {
    const other = b.get(key);
    if (!other) return false;
    if (other.value !== value.value) return false;
    if ((other.sourceNodeId ?? null) !== (value.sourceNodeId ?? null)) return false;
  }
  return true;
}

export const NODE_DIMENSIONS = Object.freeze({
  minWidth: NODE_MIN_WIDTH,
  minHeight: NODE_MIN_HEIGHT,
  maxWidth: NODE_MAX_WIDTH,
  maxHeight: NODE_MAX_HEIGHT,
  defaultWidth: NODE_DEFAULT_WIDTH,
  defaultHeight: NODE_DEFAULT_HEIGHT,
});

const HEADER_HEIGHT = 44;
const MIN_TITLE_WIDTH = 160;

const markdown = new MarkdownIt({ linkify: true, breaks: true });
markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet('src') ?? '';
  const isFullWidth = src.includes('#full-width');
  if (isFullWidth) {
    token.attrSet('src', src.replace('#full-width', ''));
  }
  const html = self.renderToken(tokens, idx, options);
  if (isFullWidth) {
    return `<div style="width:100%">${html}</div>`;
  }
  return html;
};

interface TooltipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip: string;
  colorClass?: string;
}

const TooltipButton = forwardRef<HTMLButtonElement, TooltipButtonProps>(
  ({ tooltip, className = '', colorClass = '', disabled, style, children, onPointerDown, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const start = () => {
      if (disabled) return;
      timerRef.current = setTimeout(() => setVisible(true), 600);
    };

    const stop = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisible(false);
    };

    return (
      <div className="relative inline-flex">
        <button
          type="button"
          {...props}
          ref={ref}
          disabled={disabled}
          onMouseEnter={start}
          onMouseLeave={stop}
          onFocus={start}
          onBlur={stop}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            event.stopPropagation();
          }}
          className={`flex h-7 w-7 items-center justify-center rounded border border-transparent text-xs transition ${
            disabled ? 'cursor-not-allowed opacity-40' : colorClass
          } ${className}`.trim()}
          style={style}
        >
          {children}
        </button>
        <span
          className="pointer-events-none absolute right-0 top-0 z-20 -translate-y-full translate-x-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg transition-opacity"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {tooltip}
        </span>
      </div>
    );
  },
);
TooltipButton.displayName = 'TooltipButton';

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
    providers,
    sources = [],
    disabled,
  } = data;

  const isTextNode = node.type === 'text';
  const isAiNode = node.type === 'ai';
  const persistedMeta = (node.meta ?? {}) as { ui_collapsed?: unknown };
  const initialCollapsed =
    typeof persistedMeta.ui_collapsed === 'boolean' ? (persistedMeta.ui_collapsed as boolean) : false;

  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [colorOpen, setColorOpen] = useState(false);
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [titleDraft, setTitleDraft] = useState(node.title);
  const [editingTitle, setEditingTitle] = useState(false);

  const [textDraft, setTextDraft] = useState(node.content ?? '');
  const [editingText, setEditingText] = useState(false);

  const [promptDraft, setPromptDraft] = useState<string>(
    typeof node.ai?.user_prompt_template === 'string' ? String(node.ai.user_prompt_template) : '',
  );
  const [systemPromptDraft, setSystemPromptDraft] = useState(
    typeof node.ai?.system_prompt === 'string' ? node.ai.system_prompt : '',
  );
  const [outputSchemaDraft, setOutputSchemaDraft] = useState(
    typeof node.ai?.output_schema_ref === 'string' ? node.ai.output_schema_ref : '',
  );
  const [temperatureDraft, setTemperatureDraft] = useState(
    typeof node.ai?.temperature === 'number' || typeof node.ai?.temperature === 'string'
      ? String(node.ai.temperature ?? '')
      : '',
  );
  const [activeAiTab, setActiveAiTab] = useState<'template' | 'variables'>('template');
  const updateNodeInternals = useUpdateNodeInternals();
  const inputPorts = useMemo(() => normalizeInputPorts(node.meta?.input_ports), [node.meta?.input_ports]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeStateRef = useRef<{ active: boolean; originX: number; originY: number; width: number; height: number }>({
    active: false,
    originX: 0,
    originY: 0,
    width: 0,
    height: 0,
  });
  const [isResizing, setIsResizing] = useState(false);
  const rafRef = useRef<number | null>(null);
  const textSaveTimerRef = useRef<number | null>(null);
  const autoSizeCommitTimerRef = useRef<number | null>(null);

  const providerOptions = useMemo(() => {
    if (Array.isArray(providers) && providers.length > 0) {
      return providers;
    }
    return FALLBACK_PROVIDERS;
  }, [providers]);

  const connectionNodeId = useStore((state) => state.connectionNodeId);
  const connectionHandleType = useStore((state) => state.connectionHandleType);

  const highlightTargetHandle = connectionHandleType === 'source' && connectionNodeId !== node.node_id;
  const highlightSourceHandle = connectionHandleType === 'target' && connectionNodeId !== node.node_id;

  const incomingChips = useMemo(() => {
    if (!sources || sources.length === 0) return [] as Array<{ id: string; label: string; tone: 'in' }>;
    return sources.slice(0, 4).map((source) => ({
      id: source.node_id,
      label: source.title,
      tone: 'in' as const,
    }));
  }, [sources]);

  const outgoingChips = useMemo(() => {
    const outgoing = (node.connections?.outgoing ?? []).slice(0, 4);
    return outgoing.map((connection) => ({
      id: connection.edge_id,
      label: connection.routing && connection.routing.length > 0 ? connection.routing : connection.to,
      tone: 'out' as const,
    }));
  }, [node.connections?.outgoing]);

  const initialWidth = useMemo(() => {
    const bbox = node.ui?.bbox;
    const raw = bbox ? bbox.x2 - bbox.x1 : NODE_DIMENSIONS.defaultWidth;
    return clamp(raw || NODE_DIMENSIONS.defaultWidth, RESIZE_CONSTRAINTS.minWidth, RESIZE_CONSTRAINTS.maxWidth);
  }, [node.ui?.bbox]);

  const initialHeight = useMemo(() => {
    const bbox = node.ui?.bbox;
    const raw = bbox ? bbox.y2 - bbox.y1 : NODE_DIMENSIONS.defaultHeight;
    return clamp(raw || NODE_DIMENSIONS.defaultHeight, RESIZE_CONSTRAINTS.minHeight, RESIZE_CONSTRAINTS.maxHeight);
  }, [node.ui?.bbox]);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: initialWidth,
    height: initialHeight,
  });

  useEffect(() => {
    setSize((prev) => {
      if (prev.width === initialWidth && prev.height === initialHeight) {
        return prev;
      }
      return { width: initialWidth, height: initialHeight };
    });
  }, [initialWidth, initialHeight]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    if (!onChangeUi) return;
    if (dragging || isResizing) return;

    const bbox = node.ui?.bbox;
    const baseX = Number.isFinite(bbox?.x1) ? (bbox?.x1 as number) : 0;
    const baseY = Number.isFinite(bbox?.y1) ? (bbox?.y1 as number) : 0;
    const storedWidth = bbox
      ? clamp(bbox.x2 - bbox.x1, RESIZE_CONSTRAINTS.minWidth, RESIZE_CONSTRAINTS.maxWidth)
      : NODE_DIMENSIONS.defaultWidth;
    const storedHeight = bbox
      ? clamp(bbox.y2 - bbox.y1, RESIZE_CONSTRAINTS.minHeight, RESIZE_CONSTRAINTS.maxHeight)
      : NODE_DIMENSIONS.defaultHeight;

    const nextWidth = clamp(size.width, RESIZE_CONSTRAINTS.minWidth, RESIZE_CONSTRAINTS.maxWidth);
    const nextHeight = clamp(size.height, RESIZE_CONSTRAINTS.minHeight, RESIZE_CONSTRAINTS.maxHeight);

    if (Math.abs(storedWidth - nextWidth) < 1 && Math.abs(storedHeight - nextHeight) < 1) {
      return;
    }

    if (autoSizeCommitTimerRef.current) {
      window.clearTimeout(autoSizeCommitTimerRef.current);
    }

    autoSizeCommitTimerRef.current = window.setTimeout(() => {
      onChangeUi(node.node_id, {
        bbox: {
          x1: baseX,
          y1: baseY,
          x2: baseX + nextWidth,
          y2: baseY + nextHeight,
        },
      });
      autoSizeCommitTimerRef.current = null;
    }, 160);
  }, [onChangeUi, node.node_id, node.ui?.bbox, size.width, size.height, dragging, isResizing]);

  useEffect(() => () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    if (textSaveTimerRef.current) {
      window.clearTimeout(textSaveTimerRef.current);
    }
    if (autoSizeCommitTimerRef.current) {
      window.clearTimeout(autoSizeCommitTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!editingText) {
      if (textSaveTimerRef.current) {
        window.clearTimeout(textSaveTimerRef.current);
        textSaveTimerRef.current = null;
      }
      return;
    }

    if (textDraft === (node.content ?? '')) {
      return;
    }

    if (textSaveTimerRef.current) {
      window.clearTimeout(textSaveTimerRef.current);
    }

    textSaveTimerRef.current = window.setTimeout(() => {
      onChangeContent(node.node_id, textDraft);
    }, 400);

    return () => {
      if (textSaveTimerRef.current) {
        window.clearTimeout(textSaveTimerRef.current);
        textSaveTimerRef.current = null;
      }
    };
  }, [editingText, textDraft, node.content, node.node_id, onChangeContent]);

  const providerId = useMemo(() => {
    if (typeof node.ai?.provider === 'string' && node.ai.provider.trim().length > 0) {
      return node.ai.provider;
    }
    if (typeof (node.meta as { provider?: unknown })?.provider === 'string') {
      return (node.meta as { provider: string }).provider;
    }
    return providerOptions[0]?.id ?? 'stub';
  }, [node.ai?.provider, node.meta, providerOptions]);

  const provider = useMemo(() => {
    if (providerOptions.length === 0) return FALLBACK_PROVIDERS[0];
    return providerOptions.find((item) => item.id === providerId) ?? providerOptions[0];
  }, [providerId, providerOptions]);

  const providerFieldDefs = useMemo(() => provider?.inputFields ?? [], [provider]);
  const storedProviderFieldRecord = useMemo(
    () => parseProviderFieldRecord((node.ai as Record<string, unknown> | undefined)?.provider_fields),
    [node.ai],
  );
  const [fieldStates, setFieldStates] = useState<Map<string, ProviderFieldState>>(() =>
    buildInitialFieldState(providerFieldDefs, storedProviderFieldRecord),
  );

  useEffect(() => {
    setFieldStates((prev) => {
      const next = buildInitialFieldState(providerFieldDefs, storedProviderFieldRecord);
      return fieldStateMapsEqual(prev, next) ? prev : next;
    });
  }, [providerFieldDefs, storedProviderFieldRecord, node.node_id]);

  const rawModelId = useMemo(() => {
    if (typeof node.ai?.model === 'string' && node.ai.model.trim().length > 0) {
      return node.ai.model.trim();
    }
    if (typeof (node.meta as { model?: unknown })?.model === 'string') {
      return (node.meta as { model: string }).model;
    }
    return provider?.defaultModel ?? DEFAULT_MODEL;
  }, [node.ai?.model, node.meta, provider]);

  const availableModels = useMemo(() => {
    if (!provider) return [DEFAULT_MODEL];
    const models = provider.models.length > 0 ? provider.models : [provider.defaultModel];
    return models;
  }, [provider]);

  const modelId = useMemo(() => {
    if (availableModels.includes(rawModelId)) {
      return rawModelId;
    }
    return availableModels[0] ?? rawModelId;
  }, [availableModels, rawModelId]);

  const aiActionsDisabled = disabled || (isAiNode && !provider.available);

  const commitProviderFields = useCallback(
    (next?: Map<string, ProviderFieldState>) => {
      if (!onChangeAi) return;
      const source = next ?? fieldStates;
      onChangeAi(node.node_id, { provider_fields: serializeFieldState(source) });
    },
    [fieldStates, node.node_id, onChangeAi],
  );

  const handleFieldValueChange = useCallback((key: string, value: string) => {
    setFieldStates((prev) => {
      const next = new Map(prev);
      const current = next.get(key) ?? { value: '', sourceNodeId: null };
      next.set(key, { ...current, value });
      return next;
    });
  }, []);

  const handleFieldBlur = useCallback(() => {
    commitProviderFields();
  }, [commitProviderFields]);

  const handleFieldSourceChange = useCallback(
    (key: string, sourceNodeId: string | null) => {
      let nextState: Map<string, ProviderFieldState> | null = null;
      setFieldStates((prev) => {
        const next = new Map(prev);
        const current = next.get(key) ?? { value: '', sourceNodeId: null };
        next.set(key, { ...current, sourceNodeId });
        nextState = next;
        return next;
      });
      if (nextState) {
        commitProviderFields(nextState);
      }
    },
    [commitProviderFields],
  );

  const handleProviderSelect = useCallback(
    (nextProviderId: string) => {
      const nextProvider = providerOptions.find((item) => item.id === nextProviderId) ?? providerOptions[0];
      if (!nextProvider) return;
      onChangeMeta(node.node_id, { provider: nextProvider.id, model: nextProvider.defaultModel });
      onChangeAi?.(node.node_id, { provider: nextProvider.id, model: nextProvider.defaultModel });

      const existingRecord = serializeFieldState(fieldStates);
      const nextStates = buildInitialFieldState(nextProvider.inputFields ?? [], existingRecord);
      setFieldStates(nextStates);
      commitProviderFields(nextStates);
    },
    [commitProviderFields, fieldStates, node.node_id, onChangeAi, onChangeMeta, providerOptions],
  );

  const handleModelSelect = useCallback(
    (nextModelId: string) => {
      onChangeMeta(node.node_id, { model: nextModelId });
      onChangeAi?.(node.node_id, { model: nextModelId });
    },
    [node.node_id, onChangeAi, onChangeMeta],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.stopPropagation();
      event.preventDefault();

      const currentSize = sizeRef.current ?? { width: size.width, height: size.height };
      resizeStateRef.current = {
        active: true,
        originX: event.clientX,
        originY: event.clientY,
        width: currentSize.width,
        height: currentSize.height,
      };
      setIsResizing(true);

      const handleMove = (moveEvent: PointerEvent) => {
        const base = resizeStateRef.current;
        const deltaX = moveEvent.clientX - base.originX;
        const deltaY = moveEvent.clientY - base.originY;
        const nextWidth = clamp(
          base.width + deltaX,
          RESIZE_CONSTRAINTS.minWidth,
          RESIZE_CONSTRAINTS.maxWidth,
        );
        const nextHeight = clamp(
          base.height + deltaY,
          RESIZE_CONSTRAINTS.minHeight,
          RESIZE_CONSTRAINTS.maxHeight,
        );

        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(() => {
          setSize((prev) => {
            if (prev.width === nextWidth && prev.height === nextHeight) return prev;
            return { width: nextWidth, height: nextHeight };
          });
        });
      };

      const finishResize = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', finishResize);
        document.removeEventListener('pointercancel', finishResize);
        resizeStateRef.current.active = false;
        setIsResizing(false);

        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        const nextSize = sizeRef.current ?? size;
        const baseX = node.ui?.bbox?.x1 ?? 0;
        const baseY = node.ui?.bbox?.y1 ?? 0;
        onChangeUi?.(node.node_id, {
          bbox: {
            x1: baseX,
            y1: baseY,
            x2: baseX + clamp(nextSize.width, RESIZE_CONSTRAINTS.minWidth, RESIZE_CONSTRAINTS.maxWidth),
            y2: baseY + clamp(nextSize.height, RESIZE_CONSTRAINTS.minHeight, RESIZE_CONSTRAINTS.maxHeight),
          },
        });
        updateNodeInternals(node.node_id);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', finishResize, { once: true });
      document.addEventListener('pointercancel', finishResize, { once: true });
    },
    [disabled, node.node_id, node.ui?.bbox, onChangeUi, size, updateNodeInternals],
  );

  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const colorPopoverRef = useRef<HTMLDivElement | null>(null);

  const baseColor = node.ui?.color ?? DEFAULT_COLOR;
  const colorTokens = useMemo(() => buildColorTokens(baseColor), [baseColor]);

  const renderedMarkdown = useMemo(() => markdown.render(textDraft || ''), [textDraft]);

  useEffect(() => {
    updateNodeInternals(node.node_id);
  }, [collapsed, agentSettingsOpen, size.width, size.height, node.node_id, updateNodeInternals]);

  useEffect(() => {
    setCollapsed(initialCollapsed);
  }, [initialCollapsed]);

  useEffect(() => {
    setTitleDraft(node.title);
    setEditingTitle(false);
    setTextDraft(node.content ?? '');
    setEditingText(false);
    setPromptDraft(
      typeof node.ai?.user_prompt_template === 'string' ? String(node.ai.user_prompt_template) : '',
    );
    setSystemPromptDraft(
      typeof node.ai?.system_prompt === 'string' ? node.ai.system_prompt : '',
    );
    setOutputSchemaDraft(
      typeof node.ai?.output_schema_ref === 'string' ? node.ai.output_schema_ref : '',
    );
    setTemperatureDraft(
      typeof node.ai?.temperature === 'number' || typeof node.ai?.temperature === 'string'
        ? String(node.ai.temperature ?? '')
        : '',
    );
    setActiveAiTab('template');
  }, [node.title, node.content, node.node_id, node.ai]);

  useEffect(() => {
    if (!colorOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        colorPopoverRef.current &&
        !colorPopoverRef.current.contains(target as Node) &&
        colorButtonRef.current &&
        !colorButtonRef.current.contains(target as Node)
      ) {
        setColorOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorOpen]);


  const handleRun = useCallback(() => {
    if (disabled) return;
    onRun(node.node_id);
  }, [disabled, onRun, node.node_id]);

  const handleRegenerate = useCallback(() => {
    if (disabled) return;
    onRegenerate(node.node_id);
  }, [disabled, onRegenerate, node.node_id]);

  const commitAiField = useCallback(
    (key: string, raw: string) => {
      if (!onChangeAi) return;
      let value: unknown = raw;
      if (key === 'temperature') {
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          value = undefined;
        } else {
          const numeric = Number(trimmed);
          value = Number.isFinite(numeric) ? numeric : trimmed;
        }
      }
      onChangeAi(node.node_id, { [key]: value });
    },
    [node.node_id, onChangeAi],
  );

  const commitText = useCallback(() => {
    const current = typeof node.content === 'string' ? node.content : '';
    if (textSaveTimerRef.current) {
      window.clearTimeout(textSaveTimerRef.current);
      textSaveTimerRef.current = null;
    }
    if (current !== textDraft) {
      onChangeContent(node.node_id, textDraft);
    }
    setEditingText(false);
  }, [node.content, node.node_id, onChangeContent, textDraft]);

  const handleToggleCollapse = useCallback(
    (event?: MouseEvent<HTMLButtonElement>) => {
      event?.stopPropagation();
      if (disabled) return;
      setCollapsed((prev) => {
        const next = !prev;
        onChangeMeta(node.node_id, { ui_collapsed: next });
        return next;
      });
    },
    [disabled, node.node_id, onChangeMeta],
  );

  const handleDelete = useCallback(
    (event?: MouseEvent<HTMLButtonElement>) => {
      event?.stopPropagation();
      const confirmed = window.confirm('Удалить эту ноду?');
      if (confirmed) {
        onDelete(node.node_id);
      }
    },
    [onDelete, node.node_id],
  );

  const handleTitleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      event.stopPropagation();
      const next = titleDraft.trim();
      setEditingTitle(false);
      if (next.length === 0 || next === node.title) {
        setTitleDraft(node.title);
        return;
      }
      onChangeTitle(node.node_id, next);
    },
    [node.node_id, node.title, onChangeTitle, titleDraft],
  );

  const handleTitleKey = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setTitleDraft(node.title);
        setEditingTitle(false);
      }
    },
    [node.title],
  );

  const handlePromptBlur = useCallback(() => {
    commitAiField('user_prompt_template', promptDraft);
  }, [commitAiField, promptDraft]);

  const handleSystemPromptBlur = useCallback(() => {
    commitAiField('system_prompt', systemPromptDraft);
  }, [commitAiField, systemPromptDraft]);

  const handleOutputSchemaBlur = useCallback(() => {
    commitAiField('output_schema_ref', outputSchemaDraft);
  }, [commitAiField, outputSchemaDraft]);

  const handleTemperatureBlur = useCallback(() => {
    commitAiField('temperature', temperatureDraft);
  }, [commitAiField, temperatureDraft]);

  const charCount = isAiNode ? promptDraft.length : textDraft.length;

  const rootClassName = [
    'flow-node group relative flex min-h-0 flex-col rounded-xl border text-left text-xs text-white/80 shadow transition',
    selected ? 'border-primary/80 shadow-xl shadow-primary/30' : 'border-slate-600/80',
    dragging ? 'flow-node--dragging' : '',
    isResizing ? 'flow-node--resizing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      style={{
        background: colorTokens.card,
        borderColor: colorTokens.border,
        width: size.width,
        minWidth: RESIZE_CONSTRAINTS.minWidth,
        maxWidth: RESIZE_CONSTRAINTS.maxWidth,
        minHeight: collapsed ? HEADER_HEIGHT + 16 : RESIZE_CONSTRAINTS.minHeight,
        maxHeight: collapsed ? HEADER_HEIGHT + 16 : RESIZE_CONSTRAINTS.maxHeight,
        height: collapsed ? undefined : size.height,
        overflow: 'hidden',
        transition:
          dragging || isResizing
            ? 'box-shadow 80ms linear, border-color 80ms linear'
            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms ease, height 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        cursor: isResizing ? 'nwse-resize' : dragging ? 'grabbing' : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={`flow-node__handle flow-node__handle--target${highlightTargetHandle ? ' flow-node__handle--highlight' : ''}`}
        style={{ top: HEADER_HEIGHT / 2 }}
        onPointerDown={(event) => event.stopPropagation()}
        isConnectable={!disabled}
      />

      {inputPorts.length > 0 && (
        <div
          className="pointer-events-none absolute -left-32 flex max-w-[150px] flex-col gap-1 text-[10px] font-medium text-white/80"
          style={{ top: HEADER_HEIGHT / 2 - 12 }}
        >
          {inputPorts.map((port) => {
            const meta = findInputPortMeta(port.kind);
            const countLabel = meta.allowMultiple && port.maxItems > 1 ? `×${port.maxItems}` : undefined;
            return (
              <span
                key={port.id}
                className="flex items-center gap-1 rounded-full border border-white/20 bg-black/40 px-2 py-0.5 shadow"
                style={{ borderColor: `${meta.color}40`, backgroundColor: `${meta.color}20` }}
              >
                <span>{meta.icon}</span>
                <span className="truncate">{port.title}</span>
                {!port.required && <span className="text-white/60">(opt)</span>}
                {countLabel && <span className="text-white/70">{countLabel}</span>}
              </span>
            );
          })}
        </div>
      )}

      <header
        className="flow-node__header"
        style={{ backgroundColor: colorTokens.header, borderColor: colorTokens.border }}
      >
        <div className="flow-node__identity flow-node__drag-handle">
          <span
            className="flow-node__type-icon"
            style={{ background: colorTokens.accent, boxShadow: `0 0 0 4px ${colorTokens.accent}26` }}
          >
            {TYPE_ICONS[node.type] ?? '⚙️'}
          </span>
          <div className="flow-node__identity-text">
            {editingTitle ? (
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={(event) => {
                  event.stopPropagation();
                  handleTitleBlur(event);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  handleTitleKey(event);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="flow-node__title-input nodrag"
              />
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingTitle(true);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="flow-node__title-button"
              >
                {node.title}
              </button>
            )}
            <div className="flow-node__meta-row">
              <span className="flow-node__meta-pill">{node.type}</span>
              <span className="flow-node__meta-id">{node.node_id}</span>
            </div>
          </div>
        </div>
        <div className="flow-node__toolbar">
          <TooltipButton
            ref={colorButtonRef}
            tooltip="Изменить цвет"
            aria-label="Изменить цвет"
            onClick={(event) => {
              event.stopPropagation();
              setColorOpen((prev) => !prev);
            }}
            className="flow-node__toolbar-button"
            style={{ backgroundColor: baseColor }}
            colorClass=""
          >
            🎨
          </TooltipButton>
          <TooltipButton
            tooltip="Настройки"
            aria-label="Открыть настройки ноды"
            onClick={(event) => {
              event.stopPropagation();
              setSettingsOpen(true);
            }}
            className="flow-node__toolbar-button"
            style={{ backgroundColor: '#6366f1' }}
          >
            <SettingsIcon className="h-4 w-4" />
          </TooltipButton>
          <TooltipButton
            tooltip={collapsed ? 'Развернуть' : 'Свернуть'}
            aria-label={collapsed ? 'Развернуть ноду' : 'Свернуть ноду'}
            onClick={(event) => handleToggleCollapse(event)}
            className="flow-node__toolbar-button"
            style={{ backgroundColor: '#2563eb' }}
          >
            {collapsed ? '▴' : '▾'}
          </TooltipButton>
          <TooltipButton
            tooltip="Удалить"
            aria-label="Удалить ноду"
            onClick={(event) => handleDelete(event)}
            className="flow-node__toolbar-button flow-node__toolbar-button--danger"
            style={{ backgroundColor: '#dc2626' }}
          >
            ✕
          </TooltipButton>
        </div>
      </header>

      {(incomingChips.length > 0 || outgoingChips.length > 0) && (
        <div className="flow-node__connections">
          {incomingChips.map((chip) => (
            <span key={`in-${chip.id}`} className="flow-node__chip flow-node__chip--incoming">
              <span className="flow-node__chip-dot" />
              {chip.label}
            </span>
          ))}
          {outgoingChips.map((chip) => (
            <span key={`out-${chip.id}`} className="flow-node__chip flow-node__chip--outgoing">
              {chip.label}
              <span className="flow-node__chip-arrow">→</span>
            </span>
          ))}
        </div>
      )}

      {colorOpen && (
        <div
          ref={colorPopoverRef}
          className="absolute right-6 top-[60px] z-40 rounded-3xl border border-white/15 bg-slate-950/95 px-4 py-4 shadow-2xl"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="grid grid-cols-8 gap-2 justify-items-center">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className="h-6 w-6 rounded-full border border-white/20 transition hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: color === baseColor ? '#ffffff' : 'transparent',
                }}
                onClick={() => {
                  onChangeUi?.(node.node_id, { color });
                  setColorOpen(false);
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            ))}
          </div>
        </div>
      )}

      {settingsOpen && (
        <NodeSettingsModal
          node={node}
          onClose={() => setSettingsOpen(false)}
          onSave={(updatedNode) => {
            onChangeContent(node.node_id, updatedNode.content ?? '');
            if (updatedNode.ai) {
              onChangeAi?.(node.node_id, updatedNode.ai);
            }
            setSettingsOpen(false);
          }}
        />
      )}

      {!collapsed && (
        <div className="flow-node__body">
          {isAiNode && (
            <section className="flex flex-col gap-3">
              <textarea
                className="nodrag min-h-[160px] w-full resize-none rounded-lg bg-black/10 p-3 text-sm leading-relaxed text-white/90 focus:outline-none focus:ring-2 focus:ring-primary/60"
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onBlur={handlePromptBlur}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/20 text-white transition hover:bg-primary/40 disabled:opacity-40"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAgentSettingsOpen((prev) => !prev);
                  }}
                  disabled={disabled}
                  title={agentSettingsOpen ? 'Скрыть настройки' : 'Показать настройки'}
                >
                  ⚙
                </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/30 text-white transition hover:bg-amber-500/50 disabled:opacity-40"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRegenerate();
                  }}
                  disabled={aiActionsDisabled}
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/40 text-white transition hover:bg-emerald-500/60 disabled:opacity-40"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRun();
                  }}
                  disabled={aiActionsDisabled}
                >
                  ⚡
                </button>
              </div>
            </div>
            <section className="rounded-lg border border-white/15 bg-black/20 p-3 text-[11px] text-white/85">
              <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-white/50">Поставщик</span>
                  <div className="mt-1 text-sm font-semibold text-white">{provider.name}</div>
                  {provider.description && (
                    <p className="text-[10px] text-white/50">{provider.description}</p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    provider.available ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {provider.available ? 'активен' : 'нет ключа'}
                </span>
              </header>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  Выбор поставщика
                  <select
                    value={provider.id}
                    onChange={(event) => handleProviderSelect(event.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  >
                    {providerOptions.map((option) => (
                      <option key={option.id} value={option.id} disabled={!option.available}>
                        {option.name}
                        {!option.available ? ' · нет ключа' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  Модель
                  <select
                    value={modelId}
                    onChange={(event) => handleModelSelect(event.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  >
                    {availableModels.map((model) => {
                      const label = model === provider.defaultModel ? `${model} · по умолчанию` : model;
                      return (
                        <option key={`${provider.id}-${model}`} value={model}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              {providerFieldDefs.length > 0 && (
                <div className="mt-4 space-y-3">
                  {providerFieldDefs.map((field) => {
                    const state = fieldStates.get(field.key) ?? { value: '', sourceNodeId: null };
                    const manualInputDisabled = Boolean(state.sourceNodeId);
                    return (
                      <div key={String(field.id ?? field.key)} className="rounded border border-white/10 bg-black/30 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-white">{field.label}</h4>
                            {field.description && (
                              <p className="text-[10px] text-white/60">{field.description}</p>
                            )}
                          </div>
                          <label className="flex flex-col gap-1 text-xs text-slate-300 min-w-[160px]">
                            Источник
                            <select
                              value={state.sourceNodeId ?? ''}
                              onChange={(event) =>
                                handleFieldSourceChange(
                                  field.key,
                                  event.target.value ? event.target.value : null,
                                )
                              }
                              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-primary focus:outline-none"
                              disabled={sources.length === 0}
                            >
                              <option value="">Ручной ввод</option>
                              {sources.map((sourceNode) => (
                                <option key={sourceNode.node_id} value={sourceNode.node_id}>
                                  {sourceNode.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="mt-3 space-y-1">
                          {field.type === 'textarea' ? (
                            <textarea
                              className="nodrag min-h-[80px] w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                              value={state.value}
                              onChange={(event) => handleFieldValueChange(field.key, event.target.value)}
                              onBlur={handleFieldBlur}
                              disabled={manualInputDisabled}
                              placeholder={field.placeholder ?? 'Введите значение'}
                            />
                          ) : (
                            <input
                              type="text"
                              className="nodrag w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                              value={state.value}
                              onChange={(event) => handleFieldValueChange(field.key, event.target.value)}
                              onBlur={handleFieldBlur}
                              disabled={manualInputDisabled}
                              placeholder={field.placeholder ?? 'Введите значение'}
                            />
                          )}
                          {manualInputDisabled && state.sourceNodeId && (
                            <p className="text-[10px] text-slate-400">
                              Значение будет взято из ноды «
                              {sources.find((item) => item.node_id === state.sourceNodeId)?.title ??
                                state.sourceNodeId}
                              ».
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!provider.available && (
                <p className="mt-3 text-[10px] text-amber-300">
                  Настройте интеграцию «{provider.name}» на главной странице, чтобы запускать этот агент.
                </p>
              )}
            </section>
              {agentSettingsOpen && (
                <section className="rounded-lg border border-white/15 bg-black/25 p-3 text-[11px] text-white/85">
                  <header className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-white/60">Дополнительные настройки</span>
                    <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] text-white/50">{provider.name}</span>
                  </header>

                  <div className="flex items-center gap-2 rounded-full bg-black/30 p-1 text-[10px]">
                    <button
                      type="button"
                      className={`flex-1 rounded-full px-3 py-1 font-semibold transition ${
                        activeAiTab === 'template'
                          ? 'bg-primary/50 text-white'
                          : 'text-white/60 hover:text-white/90'
                      }`}
                      onClick={() => setActiveAiTab('template')}
                    >
                      Шаблон ответа
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-full px-3 py-1 font-semibold transition ${
                        activeAiTab === 'variables'
                          ? 'bg-primary/50 text-white'
                          : 'text-white/60 hover:text-white/90'
                      }`}
                      onClick={() => setActiveAiTab('variables')}
                    >
                      Переменные
                    </button>
                  </div>
                  {activeAiTab === 'template' ? (
                    <div className="mt-3 space-y-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-white/50">Системный промпт</span>
                        <textarea
                          className="nodrag min-h-[80px] w-full rounded bg-black/20 p-2 text-xs leading-relaxed text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                          value={systemPromptDraft}
                          onChange={(event) => setSystemPromptDraft(event.target.value)}
                          onBlur={handleSystemPromptBlur}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-white/50">Схема ответа</span>
                        <input
                          type="text"
                          className="nodrag w-full rounded bg-black/20 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                          value={outputSchemaDraft}
                          onChange={(event) => setOutputSchemaDraft(event.target.value)}
                          onBlur={handleOutputSchemaBlur}
                          placeholder="PLAN_SCHEMA"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-white/50">temperature</span>
                        <input
                          type="number"
                          step="0.1"
                          className="nodrag w-full rounded bg-black/20 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                          value={temperatureDraft}
                          onChange={(event) => setTemperatureDraft(event.target.value)}
                          onBlur={handleTemperatureBlur}
                          placeholder="0.7"
                        />
                      </label>
                    </div>
                  )}
                </section>
              )}
            </section>
          )}
          {isTextNode && (
            <section className="flex flex-col gap-2">
              {editingText ? (
                <textarea
                  className="nodrag h-56 w-full resize-none rounded-lg border border-white/15 bg-black/15 p-3 text-sm leading-relaxed text-white/90 focus:border-primary focus:outline-none"
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  onBlur={commitText}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setTextDraft(node.content ?? '');
                      setEditingText(false);
                    }
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      commitText();
                    }
                  }}
                  autoFocus
                />
              ) : (
                <div
                  className="nodrag min-h-[160px] whitespace-pre-wrap rounded-lg bg-black/10 p-3 text-sm leading-relaxed text-white/85"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (!collapsed) setEditingText(true);
                  }}
                  role="textbox"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (!collapsed && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      setEditingText(true);
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  dangerouslySetInnerHTML={{
                    __html:
                      renderedMarkdown.length > 0
                        ? renderedMarkdown
                        : '<p class=\"text-white/50\">Пустой текст</p>',
                  }}
                />
              )}
            </section>
          )}

          {!isTextNode && !isAiNode && node.content && (
            <section className="rounded-lg bg-black/10 p-3 text-sm leading-relaxed">
              {node.content_type?.includes('json') ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-100">
                  {node.content}
                </pre>
              ) : node.content_type?.includes('image') ? (
                <img src={node.content} alt={node.title} className="max-h-48 w-full object-contain" />
              ) : (
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-100">{node.content}</p>
              )}
            </section>
          )}
        </div>
      )}

      {!collapsed && (
        <footer
          className="flex items-center justify-between gap-3 rounded-b-xl border-t px-3 py-2 text-[10px] text-white/70"
          style={{ borderColor: colorTokens.border, background: shadeColor(baseColor, 0.2) }}
        >
          <div className="flex items-center gap-2 text-white/70">
            <span>{node.node_id}</span>
            <span className="text-white/40">•</span>
            <span>{charCount} символов</span>
            {isAiNode && (
              <>
                <span className="text-white/40">•</span>
                <span>{provider.name}</span>
                <span className="text-white/40">•</span>
                <span>{modelId}</span>
              </>
            )}
          </div>
        </footer>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className={`flow-node__handle flow-node__handle--source${highlightSourceHandle ? ' flow-node__handle--highlight' : ''}`}
        style={{ top: HEADER_HEIGHT / 2 }}
        onPointerDown={(event) => event.stopPropagation()}
        isConnectable={!disabled}
      />
      {!collapsed && !disabled && <div className="flow-node__resize-handle" onPointerDown={startResize} />}
    </div>
  );
}

function normalizeInputPorts(raw: unknown): Array<{ id: string; kind: InputPortKind; title: string; required: boolean; maxItems: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return createDefaultPort(`port-${index}`);
      }
      const value = item as Record<string, unknown>;
      const kind = isInputPortKind(value.kind) ? value.kind : 'text';
      const meta = findInputPortMeta(kind);
      const title = typeof value.title === 'string' && value.title.trim().length > 0 ? value.title.trim() : meta.label;
      const required = Boolean(value.required);
      const maxItems = meta.allowMultiple
        ? Math.max(1, Math.floor(Number(value.max_items) || 1))
        : 1;
      return {
        id: typeof value.id === 'string' && value.id.length > 0 ? value.id : generatePortId(`${kind}-${index}`),
        kind,
        title,
        required,
        maxItems,
      };
    })
    .filter(Boolean);
}

function createDefaultPort(seed: string) {
  const meta = findInputPortMeta('text');
  return {
    id: generatePortId(seed),
    kind: 'text' as InputPortKind,
    title: meta.label,
    required: false,
    maxItems: 1,
  };
}

function buildColorTokens(hex: string) {
  const card = shadeColor(hex, 0.18);
  const header = shadeColor(hex, -0.28);
  const border = shadeColor(hex, -0.36);
  const accent = shadeColor(hex, -0.12);
  const muted = shadeColor(hex, 0.38);
  return { card, header, border, accent, muted };
}

function shadeColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const R = Math.round((target - r) * p) + r;
  const G = Math.round((target - g) * p) + g;
  const B = Math.round((target - b) * p) + b;
  return toHex(R, G, B);
}

function hexToRgb(hex: string) {
  let value = hex.replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const intValue = Number.parseInt(value, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((component) => {
      const clamped = Math.min(255, Math.max(0, component));
      const hex = clamped.toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    })
    .join('')}`;
}

let portIdCounter = 0;
function generatePortId(seed: string): string {
  portIdCounter += 1;
  return `${seed}-${Date.now()}-${portIdCounter}`;
}

function isInputPortKind(value: unknown): value is InputPortKind {
  return INPUT_PORT_TYPES.some((item) => item.kind === value);
}

export default memo(FlowNodeCard);
