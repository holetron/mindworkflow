/**
 * FlowNodeCard - Thin orchestrator composing sub-components and hooks.
 * Refactored from 8333 lines.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { NodeResizer, useUpdateNodeInternals, useReactFlow, type NodeProps } from 'reactflow';
import { NODE_DEFAULT_WIDTH, NODE_MIN_HEIGHT, NODE_MIN_WIDTH, NODE_MAX_HEIGHT, NODE_MAX_WIDTH, normalizeNodeHeight, normalizeNodeWidth, calculateContentBasedHeight } from '../../constants/nodeDefaults';
import { NODE_HEADER_HEIGHT, NODE_TOOLBAR_HEIGHT, TOTAL_FIXED_HEIGHT_NORMAL, TOTAL_FIXED_HEIGHT_ANNOTATION, MIN_CONTENT_WIDTH, MAX_CONTENT_WIDTH, MIN_CONTENT_HEIGHT, MAX_CONTENT_HEIGHT, calculateNodeHeight, getFooterHeight } from '../../constants/nodeSizes';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import { useProjectStore } from '../../state/store';

// Hooks
import { useNodeContent } from './hooks/useNodeContent';
import { useNodeAi } from './hooks/useNodeAi';
import { useNodeHtml } from './hooks/useNodeHtml';
import { useNodeImage } from './hooks/useNodeImage';
import { useNodeVideo } from './hooks/useNodeVideo';
import { useNodeText } from './hooks/useNodeText';
import { useNodeFolder } from './hooks/useNodeFolder';
import { useNodeEmail } from './hooks/useNodeEmail';

// Components
import {
  type FlowNodeCardData,
  TYPE_ICONS,
  DEFAULT_COLOR,
  FALLBACK_PROVIDERS,
  VIDEO_NOTES_MIN_HEIGHT,
  VIDEO_NOTES_VERTICAL_EXTRA,
  VIDEO_EXTRA_MIN_HEIGHT,
  IMAGE_VIEWPORT_MIN_HEIGHT,
  IMAGE_NOTES_MIN_HEIGHT,
  IMAGE_CONTENT_VERTICAL_GAP,
} from './components';
import { NodeHeader } from './components/NodeHeader';
import { NodeFooter } from './components/NodeFooter';
import { NodeHandles } from './components/NodeHandles';
import { NodeModals } from './components/NodeModals';
import { NodeContentBody } from './components/NodeContentBody';

function FlowNodeCard({ data, selected, dragging }: NodeProps<FlowNodeCardData>): React.ReactElement {
  const {
    node, projectId: projectIdFromProps, onRun, onRegenerate, onDelete,
    onChangeMeta, onChangeContent, onCommitContent, onChangeTitle, onChangeAi,
    onChangeUi, onOpenSettings, onOpenConnections,
    providers = FALLBACK_PROVIDERS, sources = [], targets = [], allNodes = [],
    disabled: initialDisabled = false, isGenerating: initialIsGenerating = false,
    onRemoveNodeFromFolder, onRemoveInvalidPorts, onSplitText,
  } = data;

  // --- Core UI state ---
  const [collapsed, setCollapsed] = useState(() => node.type === 'data' || node.type === 'parser');
  const [colorOpen, setColorOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(node.title);
  const [isResizing, setIsResizing] = useState(false);
  const titleSubmitRef = useRef(false);
  const [currentColor, setCurrentColor] = useState(node.ui?.color ?? DEFAULT_COLOR);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [activeAiModalTab, setActiveAiModalTab] = useState<'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request'>('ai_config');
  const [activeAiTab, setActiveAiTab] = useState<string>('');
  const [showRoutingEditor, setShowRoutingEditor] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);

  const nodeRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizeStartPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const projectIdFromStore = useProjectStore((state) => state.project?.project_id);
  const projectId = projectIdFromProps ?? projectIdFromStore ?? null;

  const isAiNode = node.type === 'ai';
  const isImprovedAiNode = node.type === 'ai' || node.meta?.ui_mode === 'improved';
  const typeIcon = TYPE_ICONS[node.type] || '?';

  const updateNodeInternals = useUpdateNodeInternals();
  const reactFlow = useReactFlow();

  // --- Hooks ---
  const content = useNodeContent({
    nodeId: node.node_id,
    nodeContent: node.content,
    onChangeContent,
    onCommitContent,
  });

  const ai = useNodeAi({
    node, isAiNode, disabled: initialDisabled, providers, allNodes,
    onChangeAi, onChangeMeta, onRemoveInvalidPorts, updateNodeInternals,
  });

  const disabled = ai.disabled;
  const isGenerating = ai.isGenerating;

  const text = useNodeText({
    node, contentValue: content.contentValue, disabled,
    onChangeMeta, onSplitText,
  });

  // Title helpers
  const applyAutoTitle = useCallback((rawTitle: string | undefined | null) => {
    if (editingTitle || typeof rawTitle !== 'string') return;
    const trimmed = rawTitle.trim();
    if (!trimmed || trimmed === node.title) return;
    const normalized = trimmed.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    const finalTitle = normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
    onChangeTitle(node.node_id, finalTitle);
    setTitleValue(finalTitle);
  }, [editingTitle, node.node_id, node.title, onChangeTitle]);

  const autoRenameFromSource = useCallback((rawSource: string | undefined | null) => {
    if (!rawSource) return;
    try {
      let source = String(rawSource).trim();
      if (!source) return;
      if (/^https?:\/\//i.test(source)) {
        try { const url = new URL(source); source = url.pathname.split('/').filter(Boolean).pop() || url.hostname; } catch { source = source.split('/').filter(Boolean).pop() ?? source; }
      }
      source = decodeURIComponent(source).replace(/[?#].*$/, '').replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
      if (source) applyAutoTitle(source);
    } catch { /* ignore */ }
  }, [applyAutoTitle]);

  const autoRenameFromTitle = useCallback((rawTitle: string | undefined | null) => { if (rawTitle) applyAutoTitle(rawTitle); }, [applyAutoTitle]);

  const image = useNodeImage({ node, disabled, projectId, onChangeMeta, onChangeUi, autoRenameFromSource });

  const html = useNodeHtml({ node, disabled, nodeWidth: NODE_DEFAULT_WIDTH, nodeHeight: 400, onChangeMeta, autoRenameFromTitle });

  const video = useNodeVideo({
    node, disabled, projectId, nodeWidth: NODE_DEFAULT_WIDTH, nodeHeight: 400,
    reactFlowWidth: reactFlow.getNode(node.node_id)?.style?.width,
    reactFlowHeight: reactFlow.getNode(node.node_id)?.style?.height,
    onChangeMeta, onChangeUi, autoRenameFromSource,
  });

  const folder = useNodeFolder({ node, disabled, allNodes, onChangeMeta, onRemoveNodeFromFolder });

  const email = useNodeEmail({ node, contentValue: content.contentValue, disabled, onChangeMeta, onContentChange: content.handleContentChange });

  // --- Derived dimensions ---
  const currentReactFlowNode = reactFlow.getNode(node.node_id);
  const reactFlowWidth = currentReactFlowNode?.style?.width;
  const reactFlowHeight = currentReactFlowNode?.style?.height;

  const nodeWidth = useMemo(() => {
    if (reactFlowWidth && typeof reactFlowWidth === 'number' && reactFlowWidth > 0) return reactFlowWidth;
    const bbox = node.ui?.bbox;
    if (bbox) return normalizeNodeWidth(bbox.x2 - bbox.x1);
    return NODE_DEFAULT_WIDTH;
  }, [reactFlowWidth, node.ui?.bbox]);

  const nodeHeight = useMemo(() => {
    if (reactFlowHeight && typeof reactFlowHeight === 'number' && reactFlowHeight > 0) return reactFlowHeight;
    const bbox = node.ui?.bbox;
    if (bbox) { if (collapsed) return Math.max(110, bbox.y2 - bbox.y1); return normalizeNodeHeight(bbox.y2 - bbox.y1, node.type); }
    return calculateContentBasedHeight(node.content || '', isAiNode && !collapsed, collapsed);
  }, [reactFlowHeight, node.ui?.bbox, node.type, node.content, isAiNode, collapsed]);

  const nodeMinHeight = useMemo(() => {
    if (collapsed) return isImprovedAiNode ? 150 : 110;
    if (node.type === 'video' && video.videoDisplayHeightMeta) {
      const contentAreaHeight = video.videoDisplayHeightMeta + VIDEO_NOTES_MIN_HEIGHT + VIDEO_NOTES_VERTICAL_EXTRA;
      return Math.max(NODE_MIN_HEIGHT + VIDEO_EXTRA_MIN_HEIGHT, calculateNodeHeight(contentAreaHeight, false) + VIDEO_EXTRA_MIN_HEIGHT);
    }
    if (node.type === 'image') {
      const contentH = IMAGE_VIEWPORT_MIN_HEIGHT + IMAGE_NOTES_MIN_HEIGHT + IMAGE_CONTENT_VERTICAL_GAP;
      return Math.max(NODE_MIN_HEIGHT, calculateNodeHeight(contentH, image.imageViewMode === 'edit'));
    }
    if (isImprovedAiNode) return 280;
    return NODE_MIN_HEIGHT;
  }, [collapsed, isImprovedAiNode, node.type, video.videoDisplayHeightMeta, image.imageViewMode]);

  const baseColor = currentColor;
  const statusBorderColor = baseColor;

  // --- Sync effects ---
  useEffect(() => { setTitleValue(node.title); }, [node.title]);
  useEffect(() => { setCurrentColor(node.ui?.color ?? DEFAULT_COLOR); }, [node.ui?.color]);
  useEffect(() => { if (editingTitle && titleInputRef.current) { titleInputRef.current.focus(); titleInputRef.current.select(); } }, [editingTitle]);

  // Flush content on drag/resize/deselect end
  useEffect(() => { if (!dragging && (content.pendingContentRef.current !== null || content.isContentDirty)) void content.flushContent(); }, [dragging]);
  useEffect(() => { if (!isResizing && (content.pendingContentRef.current !== null || content.isContentDirty)) void content.flushContent(); }, [isResizing]);

  // --- Title handlers ---
  const handleTitleEdit = useCallback((e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault(); e?.stopPropagation(); setEditingTitle(true); setTitleValue(node.title);
  }, [node.title]);

  const handleTitleSubmit = useCallback(() => {
    titleSubmitRef.current = true; onChangeTitle(node.node_id, titleValue.trim()); setEditingTitle(false);
    setTimeout(() => { titleSubmitRef.current = false; }, 0);
  }, [onChangeTitle, node.node_id, titleValue]);

  const handleTitleCancel = useCallback(() => { setTitleValue(node.title); setEditingTitle(false); titleSubmitRef.current = false; }, [node.title]);
  const handleTitleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => { e.stopPropagation(); if (e.key === 'Enter') handleTitleSubmit(); else if (e.key === 'Escape') handleTitleCancel(); }, [handleTitleSubmit, handleTitleCancel]);
  const handleTitleInputBlur = useCallback(() => { if (titleSubmitRef.current) { titleSubmitRef.current = false; return; } handleTitleCancel(); }, [handleTitleCancel]);

  // --- Color handlers ---
  const handleColorChange = useCallback((color: string) => { setCurrentColor(color); onChangeUi?.(node.node_id, { color }); setColorOpen(false); }, [onChangeUi, node.node_id]);
  const handleColorButtonClick = useCallback((e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); setColorOpen(!colorOpen); }, [colorOpen]);

  // --- File download ---
  const handleFileDownload = useCallback((fileName: string, fileData: string | ArrayBuffer | null) => {
    if (!fileData || !fileName) return;
    try {
      if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        fetch(fileData).then(res => res.blob()).then(blob => { const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url); });
        return;
      }
      const blob = new Blob([fileData], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (error) { console.error('Error downloading file:', error); }
  }, []);

  // --- Resize handlers ---
  const handleResizeStart = useCallback((e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (collapsed) return;
    setIsResizing(true);
    resizeStartPos.current = { x: e.clientX, y: e.clientY, width: nodeWidth, height: nodeHeight };
    const handleResizeMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - resizeStartPos.current.x;
      const deltaY = moveEvent.clientY - resizeStartPos.current.y;
      const newWidth = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, resizeStartPos.current.width + deltaX));
      const newHeight = Math.max(nodeMinHeight, Math.min(NODE_MAX_HEIGHT, resizeStartPos.current.height + deltaY));
      reactFlow.setNodes((nodes) => nodes.map((n) => n.id === node.node_id ? { ...n, style: { ...n.style, width: newWidth, height: newHeight } } : n));
    };
    const handleResizeEnd = (finalEvent: PointerEvent) => {
      setIsResizing(false);
      const deltaX = finalEvent.clientX - resizeStartPos.current.x;
      const deltaY = finalEvent.clientY - resizeStartPos.current.y;
      const finalWidth = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, resizeStartPos.current.width + deltaX));
      const finalHeight = Math.max(nodeMinHeight, Math.min(NODE_MAX_HEIGHT, resizeStartPos.current.height + deltaY));
      const currentBbox = node.ui?.bbox || { x1: 0, y1: 0, x2: nodeWidth, y2: nodeHeight };
      onChangeUi?.(node.node_id, { bbox: { x1: currentBbox.x1, y1: currentBbox.y1, x2: currentBbox.x1 + finalWidth, y2: currentBbox.y1 + finalHeight } });
      document.removeEventListener('pointermove', handleResizeMove);
      document.removeEventListener('pointerup', handleResizeEnd);
      document.removeEventListener('pointercancel', handleResizeEnd);
    };
    document.addEventListener('pointermove', handleResizeMove);
    document.addEventListener('pointerup', handleResizeEnd);
    document.addEventListener('pointercancel', handleResizeEnd);
  }, [nodeWidth, nodeHeight, node.node_id, node.ui?.bbox, onChangeUi, reactFlow, collapsed, nodeMinHeight]);

  const handleResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); handleResizeStart(e.nativeEvent);
  }, [handleResizeStart]);

  // --- renderHtmlNode callback for HtmlNodeContent ---
  const renderHtmlNode = useCallback(() => {
    return (
      <div className="flex flex-col h-full" data-node-id={node.node_id}>
        <div ref={html.htmlPreviewRef} className="relative w-full flex-1 mb-2 border border-white/10 bg-white/5 rounded overflow-hidden">
          {html.showLivePreview ? (
            html.htmlUrl ? (
              <iframe key={html.htmlUrl} ref={html.htmlIframeRef} src={html.htmlUrl} onLoad={html.handleIframeLoad} className="block w-full h-full border-0" style={{ width: '100%', height: '100%', minHeight: '200px' }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" loading="lazy" title="Website Preview" />
            ) : (<div className="w-full h-full flex items-center justify-center text-white/50 text-sm">Enter URL for website preview</div>)
          ) : html.htmlScreenshot ? (
            <img src={html.htmlScreenshot} alt="Page screenshot" className="w-full h-full object-contain bg-slate-950" draggable={false} />
          ) : (<div className="w-full h-full flex items-center justify-center text-white/50 text-sm">Screenshot not yet created</div>)}
          {html.isHtmlLoading && (<div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white">Loading page...</div>)}
          {html.isScreenshotCapturing && (<div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white">Capturing screenshot...</div>)}
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-white/10 bg-slate-900/40/70 backdrop-blur-sm px-2 py-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[190px]">
                <input type="url" value={html.htmlUrlInput} onChange={(e) => html.handleHtmlUrlChange(e.target.value)} placeholder="https://wikipedia.org" className="w-full rounded bg-black/30 px-2 py-1 text-[11px] text-white border border-white/10 focus:border-primary/70 focus:outline-none transition-colors nodrag" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} data-nodrag="true" disabled={disabled} readOnly={disabled} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') html.handleHtmlRefresh(); }} />
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={html.handleHtmlRefresh} disabled={disabled || html.isHtmlLoading} className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/30 text-white/70 text-base hover:bg-black/40 hover:text-white transition disabled:opacity-60" title="Refresh page">{'\u{1F504}'}</button>
                <button type="button" onClick={html.handleTogglePreviewMode} disabled={html.showLivePreview && !html.htmlScreenshot} className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/30 text-white/70 text-base hover:bg-black/40 hover:text-white transition disabled:opacity-40" title={html.showLivePreview ? 'Show screenshot' : 'Open live preview'}>{html.showLivePreview ? '\u{1F5BC}\uFE0F' : '\u{1F310}'}</button>
                <button type="button" onClick={html.handleCaptureScreenshot} disabled={disabled || html.isScreenshotCapturing || html.isHtmlLoading || !html.htmlUrl.trim()} className="flex h-7 w-7 items-center justify-center rounded border border-primary/50 bg-primary/30 text-white text-base hover:bg-primary/40 transition disabled:opacity-60" title="Capture screenshot">{'\u{1F4F8}'}</button>
                <button type="button" onClick={() => html.setShowHtmlSettingsModal(true)} className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/30 text-white text-base hover:bg-black/40 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed" data-nodrag="true" disabled={disabled} title="HTML node settings">{'\u2699\uFE0F'}</button>
              </div>
              <div className="w-[5.15rem] min-w-[93px]">
                <select value={html.htmlOutputType} onChange={(e) => html.handleHtmlOutputTypeChange(e.target.value as 'link' | 'image' | 'code')} className="w-full rounded bg-black/30 px-2 py-1 text-[11px] text-white border border-white/10 focus:border-primary/70 focus:outline-none transition-colors nodrag disabled:opacity-50 disabled:cursor-not-allowed" title="Determines what next nodes will receive" data-nodrag="true" disabled={disabled}>
                  <option value="link">Link</option>
                  <option value="image" disabled={!html.htmlScreenshot}>Screenshot</option>
                  <option value="code">HTML</option>
                </select>
              </div>
            </div>
          </div>
          {html.htmlError && (<div className="text-[10px] text-rose-200 bg-rose-500/20 border border-rose-500/40 rounded px-2 py-1">{html.htmlError}</div>)}
        </div>
      </div>
    );
  }, [html, node.node_id, disabled]);

  // --- Assemble allProps for sub-components ---
  const allProps = useMemo(() => ({
    // Core
    node, disabled, projectId, onChangeMeta, onChangeUi, onChangeAi, onRun,
    onRegenerate, onDelete, onOpenSettings, onOpenConnections,
    providers, sources, targets, allNodes,
    autoRenameFromSource, autoRenameFromTitle,
    // Content
    ...content,
    // AI
    ...ai,
    // Text
    ...text,
    // Image
    ...image,
    // Video
    ...video,
    // Folder
    ...folder,
    // Email
    ...email,
    // HTML
    ...html,
    renderHtmlNode,
    handleFileDownload,
    // UI state
    collapsed, setCollapsed, colorOpen, setColorOpen,
    editingTitle, setEditingTitle, titleValue, setTitleValue,
    showSettingsModal, setShowSettingsModal,
    showAiSettingsModal, setShowAiSettingsModal,
    activeAiModalTab, setActiveAiModalTab,
    activeAiTab, setActiveAiTab,
    showRoutingEditor, setShowRoutingEditor,
    showLogsModal, setShowLogsModal,
    showPresetSave, setShowPresetSave,
    isFileUploading, setIsFileUploading,
    baseColor, isAiNode, isImprovedAiNode, typeIcon,
    nodeWidth, nodeHeight,
    // Title handlers
    handleTitleEdit, handleTitleSubmit, handleTitleCancel,
    handleTitleKeyDown, handleTitleInputBlur,
    handleColorChange, handleColorButtonClick,
    titleInputRef,
    // Confirm dialog
    showConfirm,
  }), [
    node, disabled, projectId, onChangeMeta, onChangeUi, onChangeAi, onRun,
    onRegenerate, onDelete, onOpenSettings, onOpenConnections,
    providers, sources, targets, allNodes,
    autoRenameFromSource, autoRenameFromTitle,
    content, ai, text, image, video, folder, email, html,
    renderHtmlNode, handleFileDownload,
    collapsed, colorOpen, editingTitle, titleValue,
    showSettingsModal, showAiSettingsModal, activeAiModalTab, activeAiTab,
    showRoutingEditor, showLogsModal, showPresetSave, isFileUploading,
    baseColor, isAiNode, isImprovedAiNode, typeIcon, nodeWidth, nodeHeight,
    handleTitleEdit, handleTitleSubmit, handleTitleCancel,
    handleTitleKeyDown, handleTitleInputBlur,
    handleColorChange, handleColorButtonClick, showConfirm,
  ]);

  // --- Render ---
  return (
    <div
      ref={nodeRef}
      className={`flow-node flow-node__card ${selected ? 'flow-node--selected' : ''} ${dragging ? 'flow-node--dragging' : ''} ${isResizing ? 'flow-node--resizing' : ''} ${isGenerating ? 'flow-node--generating' : ''}`}
      style={{
        backgroundColor: `${baseColor}15`,
        border: `2px solid ${statusBorderColor}`,
        borderRadius: '8px',
        overflow: 'visible',
        position: 'relative',
        width: '100%',
        height: '100%',
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
        opacity: (isGenerating || image.isImageUploading) ? 0.7 : 1,
        pointerEvents: (isGenerating || image.isImageUploading) ? 'none' : 'auto',
        animation: (isGenerating || image.isImageUploading) ? 'gentle-pulse 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* NodeResizer for image/video nodes */}
      {selected && (node.type === 'image' || node.type === 'video') && (() => {
        const naturalWidth = node.meta?.natural_width as number | undefined;
        const naturalHeight = node.meta?.natural_height as number | undefined;
        const isAnnotationMode = (node.meta?.annotation_mode ?? false) as boolean;
        const footerHeight = getFooterHeight(isAnnotationMode);
        const fixedPartsHeight = NODE_HEADER_HEIGHT + NODE_TOOLBAR_HEIGHT + footerHeight;
        const maxResizeWidth = naturalWidth ? Math.min(naturalWidth, MAX_CONTENT_WIDTH) : MAX_CONTENT_WIDTH;
        const maxResizeHeight = naturalHeight ? naturalHeight + fixedPartsHeight : (image.imageViewMode === 'edit' ? MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION : MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL);
        return (
          <NodeResizer
            minWidth={MIN_CONTENT_WIDTH}
            minHeight={image.imageViewMode === 'edit' ? MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION : MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL}
            maxWidth={maxResizeWidth}
            maxHeight={maxResizeHeight}
            keepAspectRatio={false}
            isVisible={selected}
            onResize={() => { setIsResizing(true); }}
            onResizeEnd={(event, params) => {
              setIsResizing(false);
              const nw = node.meta?.natural_width as number | undefined;
              const nh = node.meta?.natural_height as number | undefined;
              if (!nw || !nh) {
                if (onChangeUi && node.ui?.bbox) onChangeUi(node.node_id, { bbox: { x1: node.ui.bbox.x1, y1: node.ui.bbox.y1, x2: node.ui.bbox.x1 + params.width, y2: node.ui.bbox.y1 + params.height } });
                return;
              }
              const aspectRatio = nw / nh;
              const contentHeight = params.width / aspectRatio;
              if (onChangeUi && node.ui?.bbox) onChangeUi(node.node_id, { bbox: { x1: node.ui.bbox.x1, y1: node.ui.bbox.y1, x2: node.ui.bbox.x1 + params.width, y2: node.ui.bbox.y1 + contentHeight } });
            }}
          />
        );
      })()}

      {/* Header */}
      <NodeHeader node={node} baseColor={baseColor} selected={selected} {...allProps} />

      {/* Content area */}
      <div
        ref={contentRef}
        className="flow-node__content"
        style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', padding: collapsed && !isImprovedAiNode ? '0' : '8px 12px', display: 'flex', flexDirection: 'column' }}
      >
        <NodeContentBody
          node={node}
          disabled={disabled}
          collapsed={collapsed}
          isImprovedAiNode={isImprovedAiNode}
          isTextualNode={text.isTextualNode}
          contentValue={content.contentValue}
          contentInputRef={content.contentInputRef}
          handleContentChange={content.handleContentChange}
          startContentEditing={content.startContentEditing}
          finishContentEditing={content.finishContentEditing}
          contentFontSizeStyle={text.contentFontSizeStyle}
          allProps={allProps}
        />
      </div>

      {/* Footer */}
      <NodeFooter node={node} baseColor={baseColor} collapsed={collapsed} imageViewMode={image.imageViewMode} {...allProps} />

      {/* Handles */}
      <NodeHandles node={node} sources={sources} targets={targets} {...allProps} />

      {/* Resize handle */}
      {!collapsed && node.type !== 'image' && node.type !== 'video' && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          style={{ zIndex: 10 }}
          onPointerDown={handleResizePointerDown}
        />
      )}

      {/* Modals */}
      <NodeModals node={node} projectId={projectId} {...allProps} />

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </div>
  );
}

export default memo(FlowNodeCard);
