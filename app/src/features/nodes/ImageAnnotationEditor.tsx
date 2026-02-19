import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { loadImageElement, mergeBaseAndOverlay } from './imageProcessing';
import type { Stroke, StrokePoint, ToolKind, PendingTextInput, BrushStroke, EraserStroke, RectangleStroke, CircleStroke, TextStroke } from './components/annotationTypes';
import { DEFAULT_COLOR, DEFAULT_BRUSH, TEXTAREA_MIN_WIDTH, TEXTAREA_MAX_WIDTH, TEXTAREA_PADDING, TEXTAREA_LINE_HEIGHT } from './components/annotationTypes';
import { redrawAllStrokes, drawLiveStroke as drawLiveStrokeFn, scaleStrokes } from './components/canvasDrawing';
import { AnnotationToolbar } from './components/AnnotationToolbar';

type ImageAnnotationEditorProps = {
  originalImage?: string | null;
  annotatedImage?: string | null;
  viewMode: 'annotated' | 'original' | 'edit';
  sessionKey?: number;
  disabled?: boolean;
  onExport: (dataUrl: string) => void | Promise<void>;
  onReset?: () => void | Promise<void>;
  viewportMinHeight?: number;
  hasEditedImage?: boolean;
};

export interface ImageAnnotationEditorHandle {
  exportAnnotated: () => Promise<string | null>;
}

export const ImageAnnotationEditor = forwardRef<ImageAnnotationEditorHandle, ImageAnnotationEditorProps>(
  ({ originalImage, annotatedImage, viewMode, sessionKey = 0, disabled = false, onExport, onReset, viewportMinHeight = 280, hasEditedImage = false }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const redoStackRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const [brushColor, setBrushColor] = useState<string>(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState<number>(DEFAULT_BRUSH);
  const [activeTool, setActiveTool] = useState<ToolKind>('brush');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseImageElementRef = useRef<HTMLImageElement | null>(null);
  const [baseImageSize, setBaseImageSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [historyCounters, setHistoryCounters] = useState<{ undo: number; redo: number }>({ undo: 0, redo: 0 });
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pendingText, setPendingText] = useState<PendingTextInput | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const baseImage = useMemo(() => annotatedImage || originalImage || null, [annotatedImage, originalImage]);
  const isEditMode = viewMode === 'edit' && !disabled && Boolean(baseImage);

  const updateHistoryCounters = useCallback(() => {
    setHistoryCounters({ undo: strokesRef.current.length, redo: redoStackRef.current.length });
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    redrawAllStrokes(canvas, ctx, strokesRef.current);
  }, []);

  const commitPendingText = useCallback((options?: { cancel?: boolean }) => {
    if (!pendingText) { setPendingTextValue(''); return; }
    const text = pendingTextValue.trim();
    setPendingText(null);
    setPendingTextValue('');
    if (options?.cancel || text.length === 0) { redrawCanvas(); return; }
    const stroke: TextStroke = { kind: 'text', color: pendingText.color, fontSize: pendingText.fontSize, position: pendingText.position, text };
    strokesRef.current = [...strokesRef.current, stroke];
    redoStackRef.current = [];
    redrawCanvas();
    updateHistoryCounters();
  }, [pendingText, pendingTextValue, redrawCanvas, updateHistoryCounters]);

  const cancelPendingText = useCallback(() => commitPendingText({ cancel: true }), [commitPendingText]);

  const adjustPendingTextarea = useCallback(() => {
    if (!pendingText) return;
    const element = textAreaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.width = `${TEXTAREA_MIN_WIDTH}px`;
    element.style.height = `${Math.max(pendingText.fontSize * TEXTAREA_LINE_HEIGHT, element.scrollHeight + TEXTAREA_PADDING)}px`;
    element.style.width = `${Math.min(TEXTAREA_MAX_WIDTH, Math.max(TEXTAREA_MIN_WIDTH, element.scrollWidth + TEXTAREA_PADDING * 2))}px`;
  }, [pendingText]);

  const resizeCanvas = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.max(1, width);
    const logicalHeight = Math.max(1, height);
    const prevWidth = canvasSizeRef.current.width || logicalWidth;
    const prevHeight = canvasSizeRef.current.height || logicalHeight;
    canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
    canvas.height = Math.max(1, Math.round(logicalHeight * dpr));
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    contextRef.current = context;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (prevWidth > 0 && prevHeight > 0 && (prevWidth !== logicalWidth || prevHeight !== logicalHeight)) {
      const scaleX = logicalWidth / prevWidth;
      const scaleY = logicalHeight / prevHeight;
      strokesRef.current = scaleStrokes(strokesRef.current, scaleX, scaleY);
      redoStackRef.current = scaleStrokes(redoStackRef.current, scaleX, scaleY);
      if (currentStrokeRef.current) {
        currentStrokeRef.current = scaleStrokes([currentStrokeRef.current], scaleX, scaleY)[0];
      }
      setPendingText((draft) => {
        if (!draft) return draft;
        const factor = (scaleX + scaleY) / 2;
        return { ...draft, position: { x: draft.position.x * scaleX, y: draft.position.y * scaleY }, fontSize: Math.max(6, draft.fontSize * (Number.isFinite(factor) && factor > 0 ? factor : 1)) };
      });
    }
    canvasSizeRef.current = { width: logicalWidth, height: logicalHeight };
    redrawCanvas();
  }, [redrawCanvas]);

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scaleX = (canvas.offsetWidth || rect.width) / rect.width;
    const scaleY = (canvas.offsetHeight || rect.height) / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }, []);

  // Session reset
  useEffect(() => {
    setBrushColor(DEFAULT_COLOR);
    setBrushSize(DEFAULT_BRUSH);
    setError(null);
    strokesRef.current = [];
    redoStackRef.current = [];
    setHistoryCounters({ undo: 0, redo: 0 });
    setPendingText(null);
    setPendingTextValue('');
    redrawCanvas();
  }, [sessionKey, baseImage, redrawCanvas]);

  // Resize observer
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const applySize = (w: number, h: number) => { if (w && h) { setViewportSize({ width: w, height: h }); resizeCanvas(w, h); } };
    applySize(target.clientWidth, target.clientHeight);
    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => applySize(target.clientWidth, target.clientHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) { const { width, height } = entry.contentRect; applySize(width, height); }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  // Pointer handlers
  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isEditMode) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    if (!point) return;
    if (pendingText) commitPendingText();
    redoStackRef.current = [];
    updateHistoryCounters();
    const tool = activeTool;

    if (tool === 'text') {
      const availW = viewportSize.width || canvasSizeRef.current.width || 0;
      const availH = viewportSize.height || canvasSizeRef.current.height || 0;
      setPendingText({ id: `text-${Date.now()}`, position: { x: Math.max(0, Math.min(point.x, Math.max(0, availW - TEXTAREA_MIN_WIDTH - TEXTAREA_PADDING * 2))), y: Math.max(0, Math.min(point.y, Math.max(0, availH - brushSize * 6))) }, color: brushColor, fontSize: Math.max(12, brushSize * 4) });
      setPendingTextValue('');
      return;
    }

    if (tool === 'rectangle' || tool === 'circle') {
      const stroke: RectangleStroke | CircleStroke = { kind: tool, color: brushColor, size: brushSize, start: point, end: point };
      currentStrokeRef.current = stroke;
      isDrawingRef.current = true;
      canvasRef.current?.setPointerCapture?.(event.pointerId);
      redrawCanvas();
      if (contextRef.current) drawLiveStrokeFn(contextRef.current, stroke);
      return;
    }

    const stroke: BrushStroke | EraserStroke = tool === 'eraser'
      ? { kind: 'eraser', size: brushSize, points: [point] }
      : { kind: 'brush', color: brushColor, size: brushSize, points: [point] };
    currentStrokeRef.current = stroke;
    isDrawingRef.current = true;
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    if (contextRef.current) drawLiveStrokeFn(contextRef.current, stroke, { fromIndex: stroke.points.length - 1 });
  }, [activeTool, brushColor, brushSize, commitPendingText, getCanvasPoint, isEditMode, pendingText, redrawCanvas, updateHistoryCounters, viewportSize.height, viewportSize.width]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !isEditMode) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    if (!point) return;
    const stroke = currentStrokeRef.current;
    if (!stroke || !contextRef.current) return;
    switch (stroke.kind) {
      case 'brush': case 'eraser': stroke.points.push(point); drawLiveStrokeFn(contextRef.current, stroke, { fromIndex: stroke.points.length - 1 }); break;
      case 'rectangle': case 'circle': stroke.end = point; redrawCanvas(); drawLiveStrokeFn(contextRef.current, stroke); break;
      default: break;
    }
  }, [getCanvasPoint, isEditMode, redrawCanvas]);

  const finalizeStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (!stroke) { updateHistoryCounters(); return; }
    let shouldCommit = true;
    switch (stroke.kind) {
      case 'brush': case 'eraser': if (stroke.points.length === 0) shouldCommit = false; break;
      case 'rectangle': case 'circle': { const w = Math.abs(stroke.end.x - stroke.start.x); const h = Math.abs(stroke.end.y - stroke.start.y); if (w < 1 && h < 1) shouldCommit = false; break; }
      case 'text': shouldCommit = Boolean(stroke.text.trim().length > 0); break;
      default: break;
    }
    if (!shouldCommit) { redrawCanvas(); updateHistoryCounters(); return; }
    strokesRef.current = [...strokesRef.current, stroke];
    redrawCanvas();
    updateHistoryCounters();
  }, [redrawCanvas, updateHistoryCounters]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    const point = getCanvasPoint(event);
    const stroke = currentStrokeRef.current;
    if (point && stroke && contextRef.current) {
      switch (stroke.kind) {
        case 'brush': case 'eraser': stroke.points.push(point); drawLiveStrokeFn(contextRef.current, stroke, { fromIndex: stroke.points.length - 1 }); break;
        case 'rectangle': case 'circle': stroke.end = point; redrawCanvas(); drawLiveStrokeFn(contextRef.current, stroke); break;
        default: break;
      }
    }
    finalizeStroke();
  }, [finalizeStroke, getCanvasPoint, redrawCanvas]);

  const handlePointerLeave = useCallback(() => finalizeStroke(), [finalizeStroke]);

  // Text area keyboard
  const handleTextAreaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitPendingText(); }
    else if (event.key === 'Escape') { event.preventDefault(); cancelPendingText(); }
  }, [cancelPendingText, commitPendingText]);

  // Load base image
  useEffect(() => {
    if (!baseImage) { baseImageElementRef.current = null; setBaseImageSize(null); return; }
    let cancelled = false;
    loadImageElement(baseImage)
      .then((img) => { if (!cancelled) { baseImageElementRef.current = img; setBaseImageSize({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height }); } })
      .catch(() => { baseImageElementRef.current = null; setBaseImageSize(null); });
    return () => { cancelled = true; };
  }, [baseImage, sessionKey]);

  useEffect(() => { if (!isEditMode) cancelPendingText(); }, [cancelPendingText, isEditMode]);

  // Focus pending text area
  useEffect(() => {
    if (!pendingText) return;
    const el = textAreaRef.current;
    if (!el) return;
    el.focus();
    try { el.setSelectionRange?.(el.value.length, el.value.length); } catch { /* ignore */ }
    adjustPendingTextarea();
  }, [adjustPendingTextarea, pendingText]);

  useEffect(() => { if (pendingText) adjustPendingTextarea(); }, [adjustPendingTextarea, pendingText, pendingTextValue]);

  // Undo/redo/clear handlers
  const handleUndo = useCallback(() => { cancelPendingText(); if (!strokesRef.current.length) return; const s = strokesRef.current.pop(); if (s) redoStackRef.current.push(s); redrawCanvas(); updateHistoryCounters(); }, [cancelPendingText, redrawCanvas, updateHistoryCounters]);
  const handleRedo = useCallback(() => { cancelPendingText(); if (!redoStackRef.current.length) return; const s = redoStackRef.current.pop(); if (s) strokesRef.current.push(s); redrawCanvas(); updateHistoryCounters(); }, [cancelPendingText, redrawCanvas, updateHistoryCounters]);
  const handleClear = useCallback(() => { cancelPendingText(); strokesRef.current = []; redoStackRef.current = []; redrawCanvas(); updateHistoryCounters(); }, [cancelPendingText, redrawCanvas, updateHistoryCounters]);
  const handleResetToOriginal = useCallback(async () => { cancelPendingText(); if (onReset) await onReset(); strokesRef.current = []; redoStackRef.current = []; redrawCanvas(); updateHistoryCounters(); setActiveTool('brush'); }, [cancelPendingText, onReset, redrawCanvas, updateHistoryCounters]);

  const exportAnnotatedImage = useCallback(async (): Promise<string | null> => {
    commitPendingText();
    const canvas = canvasRef.current;
    const baseImg = baseImageElementRef.current;
    if (!canvas || !baseImg) return null;
    const overlayDataUrl = canvas.toDataURL('image/png');
    const overlayImage = await loadImageElement(overlayDataUrl);
    const width = baseImageSize?.width ?? baseImg.naturalWidth ?? baseImg.width ?? overlayImage.naturalWidth ?? overlayImage.width;
    const height = baseImageSize?.height ?? baseImg.naturalHeight ?? baseImg.height ?? overlayImage.naturalHeight ?? overlayImage.height;
    return mergeBaseAndOverlay({ baseImage: baseImg, overlaySrc: overlayDataUrl, overlayImage, outputWidth: width, outputHeight: height });
  }, [baseImageSize, commitPendingText]);

  const handleSave = useCallback(async () => {
    try { setIsSaving(true); const finalDataUrl = await exportAnnotatedImage(); if (!finalDataUrl) { setError('No image to save annotation'); return; } await onExport(finalDataUrl); setError(null); }
    catch { setError('Failed to save annotation. Please try again.'); }
    finally { setIsSaving(false); }
  }, [exportAnnotatedImage, onExport]);

  useImperativeHandle(ref, () => ({ exportAnnotated: exportAnnotatedImage }), [exportAnnotatedImage]);
  useEffect(() => { if (!isEditMode) setActiveTool('brush'); }, [isEditMode]);

  const hasUndoHistory = historyCounters.undo > 0;
  const hasRedoHistory = historyCounters.redo > 0;

  return (
    <div className="flex h-full flex-col gap-2">
      {baseImage ? (
        <div ref={containerRef} className="relative flex-1 overflow-hidden rounded border border-white/10 bg-black/20"
          style={{ minHeight: viewportMinHeight, aspectRatio: baseImageSize && baseImageSize.width > 0 && baseImageSize.height > 0 ? `${baseImageSize.width} / ${baseImageSize.height}` : undefined }}>
          <img src={baseImage} alt="Editable image" className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
          <canvas ref={canvasRef} className="absolute inset-0"
            style={{ cursor: !isEditMode ? 'not-allowed' : 'crosshair', pointerEvents: isEditMode ? 'auto' : 'none' }}
            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerLeave} onPointerLeave={handlePointerLeave} />
          {pendingText && (
            <textarea ref={textAreaRef} value={pendingTextValue}
              onChange={(e) => setPendingTextValue(e.target.value)} onInput={adjustPendingTextarea}
              onBlur={() => commitPendingText()} onKeyDown={handleTextAreaKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-20 min-h-[1.5rem] rounded border border-white/20 bg-slate-900/80 px-2 py-1 text-white shadow-lg outline-none placeholder:text-white/40"
              style={{ left: `${pendingText.position.x}px`, top: `${pendingText.position.y}px`, fontSize: `${pendingText.fontSize}px`, lineHeight: TEXTAREA_LINE_HEIGHT, minWidth: `${TEXTAREA_MIN_WIDTH}px`, maxWidth: `${TEXTAREA_MAX_WIDTH}px`, color: pendingText.color }}
              rows={1} spellCheck={false} data-nodrag="true" draggable={false} />
          )}
          {!isEditMode && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm text-center px-4">Enable edit mode to add annotations</div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-white/60 bg-black/10 border border-dashed border-white/20 rounded" style={{ minHeight: viewportMinHeight }}>
          Upload an image to start annotating
        </div>
      )}

      <AnnotationToolbar
        isEditMode={isEditMode} activeTool={activeTool} setActiveTool={setActiveTool}
        brushColor={brushColor} setBrushColor={setBrushColor} brushSize={brushSize} setBrushSize={setBrushSize}
        hasUndoHistory={hasUndoHistory} hasRedoHistory={hasRedoHistory}
        canResetToOriginal={isEditMode && (hasEditedImage || hasUndoHistory)}
        isSaving={isSaving} sessionKey={sessionKey}
        onUndo={handleUndo} onRedo={handleRedo} onClear={handleClear}
        onResetToOriginal={handleResetToOriginal} onSave={handleSave}
      />
      {error ? <div className="text-xs text-red-400">{error}</div> : null}
    </div>
  );
});

ImageAnnotationEditor.displayName = 'ImageAnnotationEditor';
