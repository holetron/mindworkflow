import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FlowNode } from '../../../state/api';
import { useProjectStore } from '../../../state/store';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import { DEFAULT_TEXT_SPLITTER_CONFIG } from '../components/nodeConstants';
import type { TextSplitterConfig } from '../components/nodeTypes';
import { computeDynamicFontSize } from '../components/nodeUtils';

interface UseNodeTextOptions {
  node: FlowNode;
  contentValue: string;
  disabled: boolean;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onSplitText?: (nodeId: string, config: TextSplitterConfig, options?: { content: string }) => void | Promise<void>;
}

export function useNodeText({
  node,
  contentValue,
  disabled,
  onChangeMeta,
  onSplitText,
}: UseNodeTextOptions) {
  const uiSettings = useProjectStore((state) => state.uiSettings);

  // Text scaling
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

  // Markdown preview
  const markdownPreviewSettings = uiSettings?.markdownPreview ?? DEFAULT_UI_SETTINGS.markdownPreview;
  const markdownPreviewContainerStyle = useMemo(
    () => ({
      backgroundColor: markdownPreviewSettings.backgroundColor,
      borderColor: markdownPreviewSettings.borderColor,
    }),
    [markdownPreviewSettings.backgroundColor, markdownPreviewSettings.borderColor],
  );

  // Text view mode
  const isTextualNode = node.type === 'text' || node.type === 'markdown' || node.content_type === 'text/markdown';
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

  // Font size presets
  const TEXT_FONT_SIZE_PRESETS = useMemo(
    () => [
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
      if (value === 'auto') onChangeMeta(node.node_id, { text_font_size: null });
      else {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) onChangeMeta(node.node_id, { text_font_size: parsed });
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

  // Text splitter
  const rawTextSplitterConfig = node.meta?.text_splitter;
  const textSplitterConfig = useMemo<TextSplitterConfig>(() => {
    if (rawTextSplitterConfig && typeof rawTextSplitterConfig === 'object') {
      const parsed = rawTextSplitterConfig as Record<string, unknown>;
      const separator =
        typeof parsed.separator === 'string' && parsed.separator.trim().length > 0
          ? parsed.separator.replace(/\\n/g, '\n')
          : DEFAULT_TEXT_SPLITTER_CONFIG.separator;
      const subSeparator =
        typeof parsed.subSeparator === 'string'
          ? parsed.subSeparator.replace(/\\n/g, '\n')
          : DEFAULT_TEXT_SPLITTER_CONFIG.subSeparator;
      const namingMode: TextSplitterConfig['namingMode'] =
        parsed.namingMode === 'manual' ? 'manual' : DEFAULT_TEXT_SPLITTER_CONFIG.namingMode;
      return { separator, subSeparator, namingMode };
    }
    return { ...DEFAULT_TEXT_SPLITTER_CONFIG };
  }, [rawTextSplitterConfig]);

  const [isTextSplitterOpen, setIsTextSplitterOpen] = useState(false);
  const [textSplitterDraft, setTextSplitterDraft] = useState<TextSplitterConfig>(textSplitterConfig);
  const [textSplitterPopoverStyle, setTextSplitterPopoverStyle] = useState<React.CSSProperties | null>(null);
  const textSplitterButtonRef = useRef<HTMLButtonElement | null>(null);
  const textSplitterPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTextualNode || disabled) setIsTextSplitterOpen(false);
  }, [disabled, isTextualNode]);

  useEffect(() => {
    setTextSplitterDraft(textSplitterConfig);
  }, [textSplitterConfig]);

  const sanitizeTextSplitterConfig = useCallback((config: TextSplitterConfig): TextSplitterConfig => {
    const separator = config.separator.trim().length > 0 ? config.separator : DEFAULT_TEXT_SPLITTER_CONFIG.separator;
    const subSeparator = config.subSeparator && config.subSeparator.length > 0 ? config.subSeparator : DEFAULT_TEXT_SPLITTER_CONFIG.subSeparator;
    const namingMode: TextSplitterConfig['namingMode'] = config.namingMode === 'manual' ? 'manual' : DEFAULT_TEXT_SPLITTER_CONFIG.namingMode;
    return { separator, subSeparator, namingMode };
  }, []);

  const applyTextSplitterConfig = useCallback(
    (nextConfig: TextSplitterConfig) => {
      const sanitized = sanitizeTextSplitterConfig(nextConfig);
      onChangeMeta(node.node_id, { text_splitter: sanitized });
      return sanitized;
    },
    [node.node_id, onChangeMeta, sanitizeTextSplitterConfig],
  );

  const handleTextSplitterChange = useCallback(
    (patch: Partial<TextSplitterConfig>) => {
      setTextSplitterDraft((prev) => sanitizeTextSplitterConfig({ ...prev, ...patch }));
    },
    [sanitizeTextSplitterConfig],
  );

  const handleSplitTextConfirm = useCallback(async () => {
    const applied = applyTextSplitterConfig(textSplitterDraft);
    setTextSplitterDraft(applied);
    setIsTextSplitterOpen(false);
    try {
      if (onSplitText) await onSplitText(node.node_id, applied, { content: contentValue });
      else console.info('[useNodeText] Text split requested', { nodeId: node.node_id, config: applied });
    } catch (error) {
      console.error('[useNodeText] Failed to split text node', error);
    }
  }, [applyTextSplitterConfig, contentValue, node.node_id, onSplitText, textSplitterDraft]);

  // Popover positioning
  const updateTextSplitterPopoverPosition = useCallback(() => {
    const buttonEl = textSplitterButtonRef.current;
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    const width = 288;
    const gutter = 12;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, gutter), window.innerWidth - width - gutter);
    const top = rect.bottom + 8;
    setTextSplitterPopoverStyle({ position: 'fixed', top, left, width, zIndex: 2000 });
  }, []);

  useEffect(() => {
    if (!isTextSplitterOpen) { setTextSplitterPopoverStyle(null); return; }
    updateTextSplitterPopoverPosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if ((textSplitterPopoverRef.current && target && textSplitterPopoverRef.current.contains(target)) ||
          (textSplitterButtonRef.current && target && textSplitterButtonRef.current.contains(target))) return;
      setIsTextSplitterOpen(false);
    };
    const handleScroll = () => updateTextSplitterPopoverPosition();
    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('resize', updateTextSplitterPopoverPosition);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('resize', updateTextSplitterPopoverPosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isTextSplitterOpen, updateTextSplitterPopoverPosition]);

  return {
    isTextualNode,
    textViewMode,
    isTextPreviewVisible,
    canSplitTextContent,
    contentFontSizeStyle,
    markdownPreviewSettings,
    markdownPreviewContainerStyle,
    TEXT_FONT_SIZE_PRESETS,
    textFontSizeSelectValue,
    isTextSplitterOpen,
    textSplitterDraft,
    textSplitterPopoverStyle,
    textSplitterButtonRef,
    textSplitterPopoverRef,
    setIsTextSplitterOpen,
    handleTextFontSizeChange,
    handleSetTextViewMode,
    handleTextSplitterChange,
    handleSplitTextConfirm,
  };
}
