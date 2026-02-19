import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { loadImageElement, mergeBaseAndOverlay } from './imageProcessing';
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

const DEFAULT_COLOR = '#f97316';
const DEFAULT_BRUSH = 4;
const ANNOTATION_TOOLBAR_HEIGHT = 40;
const ICON_BUTTON_BASE =
  'inline-flex h-[26px] w-[26px] items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-white/5 disabled:hover:text-white/70';

type StrokePoint = {
  x: number;
  y: number;
};

type BrushStroke = {
  kind: 'brush';
  color: string;
  size: number;
  points: StrokePoint[];
};

type EraserStroke = {
  kind: 'eraser';
  size: number;
  points: StrokePoint[];
};

type RectangleStroke = {
  kind: 'rectangle';
  color: string;
  size: number;
  start: StrokePoint;
  end: StrokePoint;
};

type CircleStroke = {
  kind: 'circle';
  color: string;
  size: number;
  start: StrokePoint;
  end: StrokePoint;
};

type TextStroke = {
  kind: 'text';
  color: string;
  fontSize: number;
  position: StrokePoint;
  text: string;
};

type Stroke = BrushStroke | EraserStroke | RectangleStroke | CircleStroke | TextStroke;

type ToolKind = Stroke['kind'];

type PendingTextInput = {
  id: string;
  position: StrokePoint;
  color: string;
  fontSize: number;
};

const TEXTAREA_MIN_WIDTH = 140;
const TEXTAREA_MAX_WIDTH = 320;
const TEXTAREA_PADDING = 6;
const TEXTAREA_LINE_HEIGHT = 1.25;

export interface ImageAnnotationEditorHandle {
  exportAnnotated: () => Promise<string | null>;
}

export const ImageAnnotationEditor = forwardRef<ImageAnnotationEditorHandle, ImageAnnotationEditorProps>(
  (
    {
      originalImage,
      annotatedImage,
      viewMode,
      sessionKey = 0,
      disabled = false,
      onExport,
      onReset,
      viewportMinHeight = 280,
      hasEditedImage = false,
    },
    ref,
  ) => {
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
  const [showBrushPicker, setShowBrushPicker] = useState(false);
  const brushButtonRef = useRef<HTMLButtonElement | null>(null);
  const brushPopoverRef = useRef<HTMLDivElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [historyCounters, setHistoryCounters] = useState<{ undo: number; redo: number }>({
    undo: 0,
    redo: 0,
  });
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pendingText, setPendingText] = useState<PendingTextInput | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const baseImage = useMemo(
    () => annotatedImage || originalImage || null,
    [annotatedImage, originalImage],
  );

  const isEditMode = viewMode === 'edit' && !disabled && Boolean(baseImage);
  const updateHistoryCounters = useCallback(() => {
    setHistoryCounters({
      undo: strokesRef.current.length,
      redo: redoStackRef.current.length,
    });
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const stroke of strokesRef.current) {
      ctx.save();
      switch (stroke.kind) {
        case 'brush': {
          const points = stroke.points;
          if (!points.length) {
            ctx.restore();
            continue;
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = stroke.size;
          ctx.strokeStyle = stroke.color;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          if (points.length === 1) {
            ctx.lineTo(points[0].x, points[0].y + 0.01);
          }
          ctx.stroke();
          break;
        }
        case 'eraser': {
          const points = stroke.points;
          if (!points.length) {
            ctx.restore();
            continue;
          }
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = stroke.size;
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          if (points.length === 1) {
            ctx.lineTo(points[0].x, points[0].y + 0.01);
          }
          ctx.stroke();
          break;
        }
        case 'rectangle': {
          const width = stroke.end.x - stroke.start.x;
          const height = stroke.end.y - stroke.start.y;
          if (Math.abs(width) < 0.5 && Math.abs(height) < 0.5) {
            ctx.restore();
            continue;
          }
          const left = Math.min(stroke.start.x, stroke.end.x);
          const top = Math.min(stroke.start.y, stroke.end.y);
          const rectWidth = Math.abs(width);
          const rectHeight = Math.abs(height);
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineWidth = stroke.size;
          ctx.strokeStyle = stroke.color;
          ctx.strokeRect(left, top, rectWidth, rectHeight);
          break;
        }
        case 'circle': {
          const width = stroke.end.x - stroke.start.x;
          const height = stroke.end.y - stroke.start.y;
          if (Math.abs(width) < 0.5 && Math.abs(height) < 0.5) {
            ctx.restore();
            continue;
          }
          const left = Math.min(stroke.start.x, stroke.end.x);
          const top = Math.min(stroke.start.y, stroke.end.y);
          const rectWidth = Math.abs(width);
          const rectHeight = Math.abs(height);
          const radiusX = rectWidth / 2;
          const radiusY = rectHeight / 2;
          const centerX = left + radiusX;
          const centerY = top + radiusY;
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineWidth = stroke.size;
          ctx.strokeStyle = stroke.color;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, Math.max(radiusX, 0.5), Math.max(radiusY, 0.5), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'text': {
          if (!stroke.text.trim()) {
            ctx.restore();
            continue;
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = stroke.color;
          ctx.textBaseline = 'top';
          ctx.font = `${stroke.fontSize}px sans-serif`;
          const lines = stroke.text.split('\n');
          for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            ctx.fillText(line, stroke.position.x, stroke.position.y + index * stroke.fontSize * TEXTAREA_LINE_HEIGHT);
          }
          break;
        }
        default:
          break;
      }
      ctx.restore();
    }
    ctx.restore();
  }, []);

  const commitPendingText = useCallback(
    (options?: { cancel?: boolean }) => {
      if (!pendingText) {
        setPendingTextValue('');
        return;
      }
      const text = pendingTextValue.trim();
      setPendingText(null);
      setPendingTextValue('');
      if (options?.cancel || text.length === 0) {
        redrawCanvas();
        return;
      }
      const stroke: TextStroke = {
        kind: 'text',
        color: pendingText.color,
        fontSize: pendingText.fontSize,
        position: pendingText.position,
        text,
      };
      strokesRef.current = [...strokesRef.current, stroke];
      redoStackRef.current = [];
      redrawCanvas();
      updateHistoryCounters();
    },
    [pendingText, pendingTextValue, redrawCanvas, updateHistoryCounters],
  );

  const cancelPendingText = useCallback(() => {
    commitPendingText({ cancel: true });
  }, [commitPendingText]);

  const adjustPendingTextarea = useCallback(() => {
    if (!pendingText) {
      return;
    }
    const element = textAreaRef.current;
    if (!element) {
      return;
    }
    element.style.height = 'auto';
    element.style.width = `${TEXTAREA_MIN_WIDTH}px`;
    const nextHeight = Math.max(
      pendingText.fontSize * TEXTAREA_LINE_HEIGHT,
      element.scrollHeight + TEXTAREA_PADDING,
    );
    element.style.height = `${nextHeight}px`;
    const nextWidth = Math.min(
      TEXTAREA_MAX_WIDTH,
      Math.max(TEXTAREA_MIN_WIDTH, element.scrollWidth + TEXTAREA_PADDING * 2),
    );
    element.style.width = `${nextWidth}px`;
  }, [pendingText]);

  const resizeCanvas = useCallback(
    (width: number, height: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const logicalWidth = Math.max(1, width);
      const logicalHeight = Math.max(1, height);
      const prevWidth = canvasSizeRef.current.width || logicalWidth;
      const prevHeight = canvasSizeRef.current.height || logicalHeight;
      const pixelWidth = Math.max(1, Math.round(logicalWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(logicalHeight * dpr));
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      contextRef.current = context;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (prevWidth > 0 && prevHeight > 0 && (prevWidth !== logicalWidth || prevHeight !== logicalHeight)) {
        const scaleX = logicalWidth / prevWidth;
        const scaleY = logicalHeight / prevHeight;
        if (Number.isFinite(scaleX) && Number.isFinite(scaleY) && scaleX > 0 && scaleY > 0) {
          const scalePoint = (point: StrokePoint): StrokePoint => ({
            x: point.x * scaleX,
            y: point.y * scaleY,
          });
          const scaleFont = (fontSize: number): number => {
            const factor = (scaleX + scaleY) / 2;
            const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
            return Math.max(6, fontSize * safeFactor);
          };
          const scaleStroke = (stroke: Stroke): Stroke => {
            switch (stroke.kind) {
              case 'brush':
              case 'eraser':
                return {
                  ...stroke,
                  points: stroke.points.map(scalePoint),
                };
              case 'rectangle':
              case 'circle':
                return {
                  ...stroke,
                  start: scalePoint(stroke.start),
                  end: scalePoint(stroke.end),
                };
              case 'text':
                return {
                  ...stroke,
                  position: scalePoint(stroke.position),
                  fontSize: scaleFont(stroke.fontSize),
                };
              default:
                return stroke;
            }
          };
          strokesRef.current = strokesRef.current.map(scaleStroke);
          redoStackRef.current = redoStackRef.current.map(scaleStroke);
          if (currentStrokeRef.current) {
            currentStrokeRef.current = scaleStroke(currentStrokeRef.current);
          }
          setPendingText((draft) => {
            if (!draft) {
              return draft;
            }
            return {
              ...draft,
              position: scalePoint(draft.position),
              fontSize: scaleFont(draft.fontSize),
            };
          });
        }
      }
      canvasSizeRef.current = { width: logicalWidth, height: logicalHeight };
      redrawCanvas();
    },
    [redrawCanvas],
  );

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const styleWidth = canvas.offsetWidth || rect.width;
    const styleHeight = canvas.offsetHeight || rect.height;
    if (!rect.width || !rect.height) {
      return null;
    }
    const scaleX = styleWidth / rect.width;
    const scaleY = styleHeight / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  const drawLiveStroke = useCallback((stroke: Stroke, options?: { fromIndex?: number; preview?: boolean }) => {
    const ctx = contextRef.current;
    if (!ctx) {
      return;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    switch (stroke.kind) {
      case 'brush': {
        const points = stroke.points;
        if (points.length === 0) {
          ctx.restore();
          return;
        }
        const fromIndex = options?.fromIndex ?? 0;
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        ctx.beginPath();
        const start = Math.max(0, fromIndex - 1);
        ctx.moveTo(points[start].x, points[start].y);
        for (let i = start + 1; i < points.length; i += 1) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        if (points.length === 1) {
          ctx.lineTo(points[0].x, points[0].y + 0.01);
        }
        ctx.stroke();
        break;
      }
      case 'eraser': {
        const points = stroke.points;
        if (points.length === 0) {
          ctx.restore();
          return;
        }
        const fromIndex = options?.fromIndex ?? 0;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        const start = Math.max(0, fromIndex - 1);
        ctx.moveTo(points[start].x, points[start].y);
        for (let i = start + 1; i < points.length; i += 1) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        if (points.length === 1) {
          ctx.lineTo(points[0].x, points[0].y + 0.01);
        }
        ctx.stroke();
        break;
      }
      case 'rectangle':
      case 'circle': {
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        const x1 = stroke.start.x;
        const y1 = stroke.start.y;
        const x2 = stroke.end.x;
        const y2 = stroke.end.y;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        ctx.beginPath();
        if (stroke.kind === 'rectangle') {
          ctx.strokeRect(left, top, width, height);
        } else {
          const radiusX = width / 2;
          const radiusY = height / 2;
          const centerX = left + radiusX;
          const centerY = top + radiusY;
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'text': {
        ctx.fillStyle = stroke.color;
        ctx.textBaseline = 'top';
        ctx.font = `${stroke.fontSize}px sans-serif`;
        const lines = stroke.text.split('\n');
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          ctx.fillText(
            line,
            stroke.position.x,
            stroke.position.y + index * stroke.fontSize * TEXTAREA_LINE_HEIGHT,
          );
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }, []);

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

  useEffect(() => {
    const target = containerRef.current;
    if (!target) {
      return;
    }

    const applySize = (width: number, height: number) => {
      if (!width || !height) {
        return;
      }
      setViewportSize({ width, height });
      resizeCanvas(width, height);
    };

    applySize(target.clientWidth, target.clientHeight);

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => applySize(target.clientWidth, target.clientHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      applySize(width, height);
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  const handleColorButtonClick = useCallback(() => {
    if (!isEditMode) return;
    colorInputRef.current?.click();
  }, [isEditMode]);

  const handleColorChange = useCallback(
    (value: string) => {
      setBrushColor(value);
      if (activeTool === 'eraser') {
        setActiveTool('brush');
      }
    },
    [activeTool],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isEditMode) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const point = getCanvasPoint(event);
      if (!point) {
        return;
      }
      if (pendingText) {
        commitPendingText();
      }
      const tool = activeTool;
      redoStackRef.current = [];
      updateHistoryCounters();

      if (tool === 'text') {
        const availableWidth = viewportSize.width || canvasSizeRef.current.width || 0;
        const availableHeight = viewportSize.height || canvasSizeRef.current.height || 0;
        const maxX = Math.max(0, availableWidth - TEXTAREA_MIN_WIDTH - TEXTAREA_PADDING * 2);
        const maxY = Math.max(0, availableHeight - brushSize * 6);
        const clampedX = Math.max(0, Math.min(point.x, maxX));
        const clampedY = Math.max(0, Math.min(point.y, maxY));
        setPendingText({
          id: `text-${Date.now()}`,
          position: { x: clampedX, y: clampedY },
          color: brushColor,
          fontSize: Math.max(12, brushSize * 4),
        });
        setPendingTextValue('');
        return;
      }

      if (tool === 'rectangle' || tool === 'circle') {
        const stroke: RectangleStroke | CircleStroke = {
          kind: tool,
          color: brushColor,
          size: brushSize,
          start: point,
          end: point,
        };
        currentStrokeRef.current = stroke;
        isDrawingRef.current = true;
        canvasRef.current?.setPointerCapture?.(event.pointerId);
        redrawCanvas();
        drawLiveStroke(stroke);
        return;
      }

      const stroke: BrushStroke | EraserStroke =
        tool === 'eraser'
          ? { kind: 'eraser', size: brushSize, points: [point] }
          : { kind: 'brush', color: brushColor, size: brushSize, points: [point] };

      currentStrokeRef.current = stroke;
      isDrawingRef.current = true;
      canvasRef.current?.setPointerCapture?.(event.pointerId);
      drawLiveStroke(stroke, { fromIndex: stroke.points.length - 1 });
    },
    [
      activeTool,
      brushColor,
      brushSize,
      commitPendingText,
      drawLiveStroke,
      getCanvasPoint,
      isEditMode,
      pendingText,
      redrawCanvas,
      updateHistoryCounters,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !isEditMode) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const point = getCanvasPoint(event);
      if (!point) {
        return;
      }
      const stroke = currentStrokeRef.current;
      if (!stroke) {
        return;
      }
      switch (stroke.kind) {
        case 'brush':
        case 'eraser':
          stroke.points.push(point);
          drawLiveStroke(stroke, { fromIndex: stroke.points.length - 1 });
          break;
        case 'rectangle':
        case 'circle':
          stroke.end = point;
          redrawCanvas();
          drawLiveStroke(stroke);
          break;
        default:
          break;
      }
    },
    [drawLiveStroke, getCanvasPoint, isEditMode, redrawCanvas],
  );

  const finalizeStroke = useCallback(() => {
    if (!isDrawingRef.current) {
      return;
    }
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (!stroke) {
      updateHistoryCounters();
      return;
    }
    let shouldCommit = true;
    switch (stroke.kind) {
      case 'brush':
      case 'eraser':
        if (stroke.points.length === 0) {
          shouldCommit = false;
        }
        break;
      case 'rectangle':
      case 'circle': {
        const width = Math.abs(stroke.end.x - stroke.start.x);
        const height = Math.abs(stroke.end.y - stroke.start.y);
        if (width < 1 && height < 1) {
          shouldCommit = false;
        }
        break;
      }
      case 'text':
        shouldCommit = Boolean(stroke.text.trim().length > 0);
        break;
      default:
        break;
    }
    if (!shouldCommit) {
      redrawCanvas();
      updateHistoryCounters();
      return;
    }
    strokesRef.current = [...strokesRef.current, stroke];
    redrawCanvas();
    updateHistoryCounters();
  }, [redrawCanvas, updateHistoryCounters]);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
      const point = getCanvasPoint(event);
      const stroke = currentStrokeRef.current;
      if (point && stroke) {
        switch (stroke.kind) {
          case 'brush':
          case 'eraser':
            stroke.points.push(point);
            drawLiveStroke(stroke, { fromIndex: stroke.points.length - 1 });
            break;
          case 'rectangle':
          case 'circle':
            stroke.end = point;
            redrawCanvas();
            drawLiveStroke(stroke);
            break;
          default:
            break;
        }
      }
      finalizeStroke();
    },
    [drawLiveStroke, finalizeStroke, getCanvasPoint, redrawCanvas],
  );

  const handlePointerLeave = useCallback(() => {
    finalizeStroke();
  }, [finalizeStroke]);

  const handleTextAreaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commitPendingText();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelPendingText();
      }
    },
    [cancelPendingText, commitPendingText],
  );

  useEffect(() => {
    if (!baseImage) {
      baseImageElementRef.current = null;
      setBaseImageSize(null);
      return;
    }

    let cancelled = false;
    loadImageElement(baseImage)
      .then((img) => {
        if (cancelled) {
          return;
        }
        baseImageElementRef.current = img;
        setBaseImageSize({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      })
      .catch((err) => {
        console.warn('Failed to prepare base image for annotation export', err);
        baseImageElementRef.current = null;
        setBaseImageSize(null);
      });

    return () => {
      cancelled = true;
    };
  }, [baseImage, sessionKey]);

  useEffect(() => {
    if (!isEditMode) {
      setShowBrushPicker(false);
    }
  }, [isEditMode]);

  useEffect(() => {
    if (!isEditMode) {
      cancelPendingText();
    }
  }, [cancelPendingText, isEditMode]);

  useEffect(() => {
    if (!pendingText) {
      return;
    }
    const element = textAreaRef.current;
    if (!element) {
      return;
    }
    element.focus();
    try {
      const length = element.value.length;
      element.setSelectionRange?.(length, length);
    } catch {
      // ignore selection errors
    }
    adjustPendingTextarea();
  }, [adjustPendingTextarea, pendingText]);

  useEffect(() => {
    if (!pendingText) {
      return;
    }
    adjustPendingTextarea();
  }, [adjustPendingTextarea, pendingText, pendingTextValue]);

  useEffect(() => {
    if (!showBrushPicker) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        brushButtonRef.current &&
        brushPopoverRef.current &&
        target &&
        !brushButtonRef.current.contains(target) &&
        !brushPopoverRef.current.contains(target)
      ) {
        setShowBrushPicker(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBrushPicker(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showBrushPicker]);

  const handleUndo = useCallback(() => {
    cancelPendingText();
    if (!strokesRef.current.length) {
      return;
    }
    const stroke = strokesRef.current.pop();
    if (stroke) {
      redoStackRef.current.push(stroke);
    }
    redrawCanvas();
    updateHistoryCounters();
  }, [cancelPendingText, redrawCanvas, updateHistoryCounters]);

  const handleRedo = useCallback(() => {
    cancelPendingText();
    if (!redoStackRef.current.length) {
      return;
    }
    const stroke = redoStackRef.current.pop();
    if (stroke) {
      strokesRef.current.push(stroke);
    }
    redrawCanvas();
    updateHistoryCounters();
  }, [cancelPendingText, redrawCanvas, updateHistoryCounters]);

  const handleClear = useCallback(() => {
    cancelPendingText();
    strokesRef.current = [];
    redoStackRef.current = [];
    redrawCanvas();
    updateHistoryCounters();
  }, [cancelPendingText, redrawCanvas, updateHistoryCounters]);

  const handleResetToOriginal = useCallback(async () => {
    cancelPendingText();
    if (onReset) {
      await onReset();
    }
    strokesRef.current = [];
    redoStackRef.current = [];
    redrawCanvas();
    updateHistoryCounters();
    setActiveTool('brush');
  }, [cancelPendingText, onReset, redrawCanvas, updateHistoryCounters]);

  const exportAnnotatedImage = useCallback(async (): Promise<string | null> => {
    commitPendingText();
    const canvas = canvasRef.current;
    const baseImg = baseImageElementRef.current;
    if (!canvas || !baseImg) {
      return null;
    }
    const overlayDataUrl = canvas.toDataURL('image/png');
    const overlayImage = await loadImageElement(overlayDataUrl);
    const width =
      baseImageSize?.width ??
      baseImg.naturalWidth ??
      baseImg.width ??
      overlayImage.naturalWidth ??
      overlayImage.width;
    const height =
      baseImageSize?.height ??
      baseImg.naturalHeight ??
      baseImg.height ??
      overlayImage.naturalHeight ??
      overlayImage.height;
    return mergeBaseAndOverlay({
      baseImage: baseImg,
      overlaySrc: overlayDataUrl,
      overlayImage,
      outputWidth: width,
      outputHeight: height,
    });
  }, [baseImageSize, commitPendingText]);

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      const finalDataUrl = await exportAnnotatedImage();
      if (!finalDataUrl) {
        setError('Нет изображения для сохранения аннотации');
        return;
      }
      await onExport(finalDataUrl);
      setError(null);
    } catch (err) {
      console.error('Failed to export image with annotations', err);
      setError('Не удалось сохранить аннотацию. Попробуйте ещё раз.');
    } finally {
      setIsSaving(false);
    }
  }, [exportAnnotatedImage, onExport]);

  useImperativeHandle(
    ref,
    () => ({
      exportAnnotated: exportAnnotatedImage,
    }),
    [exportAnnotatedImage],
  );


  useEffect(() => {
    if (!isEditMode) {
      setActiveTool('brush');
    }
  }, [isEditMode]);

  const hasUndoHistory = historyCounters.undo > 0;
  const hasRedoHistory = historyCounters.redo > 0;
  const canResetToOriginal = isEditMode && (hasEditedImage || hasUndoHistory);

  return (
    <div className="flex h-full flex-col gap-2">
      {baseImage ? (
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden rounded border border-white/10 bg-black/20"
          style={{
            minHeight: viewportMinHeight,
            aspectRatio:
              baseImageSize && baseImageSize.width > 0 && baseImageSize.height > 0
                ? `${baseImageSize.width} / ${baseImageSize.height}`
                : undefined,
          }}
        >
          <img
            src={baseImage}
            alt="Редактируемое изображение"
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ cursor: !isEditMode ? 'not-allowed' : 'crosshair', pointerEvents: isEditMode ? 'auto' : 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerLeave}
            onPointerLeave={handlePointerLeave}
          />
          {pendingText ? (
            <textarea
              ref={textAreaRef}
              value={pendingTextValue}
              onChange={(event) => setPendingTextValue(event.target.value)}
              onInput={adjustPendingTextarea}
              onBlur={() => commitPendingText()}
              onKeyDown={handleTextAreaKeyDown}
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute z-20 min-h-[1.5rem] rounded border border-white/20 bg-slate-900/80 px-2 py-1 text-white shadow-lg outline-none placeholder:text-white/40"
              style={{
                left: `${pendingText.position.x}px`,
                top: `${pendingText.position.y}px`,
                fontSize: `${pendingText.fontSize}px`,
                lineHeight: TEXTAREA_LINE_HEIGHT,
                minWidth: `${TEXTAREA_MIN_WIDTH}px`,
                maxWidth: `${TEXTAREA_MAX_WIDTH}px`,
                color: pendingText.color,
              }}
              rows={1}
              spellCheck={false}
              data-nodrag="true"
              draggable={false}
            />
          ) : null}
          {!isEditMode && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm text-center px-4">
              Включите режим редактирования, чтобы добавлять аннотации
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex-1 flex items-center justify-center text-sm text-white/60 bg-black/10 border border-dashed border-white/20 rounded"
          style={{ minHeight: viewportMinHeight }}
        >
          Загрузите изображение, чтобы начать аннотацию
        </div>
      )}

      <div
        className="relative flex flex-shrink-0 items-center gap-2 overflow-visible rounded-lg border border-white/10 bg-black/25 px-2 py-1"
        style={{ height: `${ANNOTATION_TOOLBAR_HEIGHT}px` }}
      >
        <div className="relative flex items-center gap-2">
          <span className="sr-only">Цвет кисти</span>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleColorButtonClick}
            disabled={!isEditMode}
            className={`${ICON_BUTTON_BASE} ${isEditMode ? '' : 'border-white/20 bg-black/30'}`}
            aria-label="Выбрать цвет кисти"
            title="Цвет кисти"
            style={isEditMode ? { backgroundColor: brushColor } : undefined}
          >
            {!isEditMode ? '🎨' : ''}
          </button>
          <input
            ref={colorInputRef}
            id={`annotation-color-${sessionKey}`}
            type="color"
            value={brushColor}
            onChange={(event) => handleColorChange(event.target.value)}
            disabled={!isEditMode}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-hidden
            tabIndex={-1}
          />
        </div>

        <div className="relative flex items-center gap-2">
          <span className="sr-only" id={`annotation-brush-size-label-${sessionKey}`}>
            Толщина кисти
          </span>
          <button
            ref={brushButtonRef}
            type="button"
            onClick={() => {
              if (!isEditMode) return;
              setShowBrushPicker((prev) => !prev);
            }}
            disabled={!isEditMode}
            className={`${ICON_BUTTON_BASE} ${showBrushPicker ? 'border-sky-400/70 bg-sky-500/20 text-sky-100' : ''}`}
            title="Толщина кисти"
            aria-label={`Толщина кисти ${brushSize}px`}
            aria-expanded={showBrushPicker}
            aria-controls={`annotation-brush-size-popover-${sessionKey}`}
          >
            🖌️
          </button>
          <span className="w-9 text-center font-mono text-[11px] text-white/60">
            {brushSize}px
          </span>
          {showBrushPicker && (
            <div
              ref={brushPopoverRef}
              id={`annotation-brush-size-popover-${sessionKey}`}
              role="dialog"
              aria-labelledby={`annotation-brush-size-label-${sessionKey}`}
              className="absolute left-0 top-full z-20 mt-2 w-40 rounded-lg border border-white/10 bg-slate-900/95 p-3 shadow-lg"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-white/40">
                <span>Толщина</span>
                <span className="font-mono text-[11px] text-white/60">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={1}
                max={24}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
                className="h-1 w-full accent-sky-400"
                aria-label="Толщина кисти"
              />
            </div>
          )}
        </div>

        <div className="h-5 w-px flex-shrink-0 rounded-full bg-white/10" />

        <button
          type="button"
          onClick={() => setActiveTool('brush')}
          disabled={!isEditMode}
          className={`${ICON_BUTTON_BASE} ${
            activeTool === 'brush'
              ? 'border-sky-400/70 bg-sky-500/20 text-sky-100 shadow-inner shadow-sky-500/30'
              : ''
          }`}
          title="Кисть"
          aria-label="Кисть"
          aria-pressed={activeTool === 'brush'}
        >
          ✏️
        </button>
        <button
          type="button"
          onClick={() => setActiveTool('eraser')}
          disabled={!isEditMode}
          className={`${ICON_BUTTON_BASE} ${
            activeTool === 'eraser'
              ? 'border-amber-400/70 bg-amber-500/20 text-amber-100 shadow-inner shadow-amber-500/30'
              : ''
          }`}
          title="Ластик"
          aria-label="Ластик"
          aria-pressed={activeTool === 'eraser'}
        >
          🧽
        </button>
        <button
          type="button"
          onClick={() => setActiveTool('rectangle')}
          disabled={!isEditMode}
          className={`${ICON_BUTTON_BASE} ${
            activeTool === 'rectangle'
              ? 'border-purple-400/70 bg-purple-500/20 text-purple-100 shadow-inner shadow-purple-500/30'
              : ''
          }`}
          title="Прямоугольник"
          aria-label="Прямоугольник"
          aria-pressed={activeTool === 'rectangle'}
        >
          ▭
        </button>
        <button
          type="button"
          onClick={() => setActiveTool('circle')}
          disabled={!isEditMode}
          className={`${ICON_BUTTON_BASE} ${
            activeTool === 'circle'
              ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100 shadow-inner shadow-emerald-500/30'
              : ''
          }`}
          title="Эллипс"
          aria-label="Эллипс"
          aria-pressed={activeTool === 'circle'}
        >
          ◯
        </button>
        <button
          type="button"
          onClick={() => setActiveTool('text')}
          disabled={!isEditMode}
          className={`${ICON_BUTTON_BASE} ${
            activeTool === 'text'
              ? 'border-pink-400/70 bg-pink-500/20 text-pink-100 shadow-inner shadow-pink-500/30'
              : ''
          }`}
          title="Текст"
          aria-label="Текст"
          aria-pressed={activeTool === 'text'}
        >
          T
        </button>
        <div className="h-5 w-px flex-shrink-0 rounded-full bg-white/10" />
        <button
          type="button"
          onClick={handleUndo}
          disabled={!isEditMode || !hasUndoHistory}
          className={ICON_BUTTON_BASE}
          title="Отменить шаг"
          aria-label="Отменить шаг"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={!isEditMode || !hasRedoHistory}
          className={ICON_BUTTON_BASE}
          title="Повторить шаг"
          aria-label="Повторить шаг"
        >
          ↷
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!isEditMode || !hasUndoHistory}
          className={ICON_BUTTON_BASE}
          title="Очистить слой"
          aria-label="Очистить слой"
        >
          🗑️
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleResetToOriginal}
          disabled={!canResetToOriginal}
          className={ICON_BUTTON_BASE}
          title="Сбросить до оригинала"
          aria-label="Сбросить до оригинала"
        >
          ⟲
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isEditMode || isSaving}
          className={`${ICON_BUTTON_BASE} border-sky-400/70 bg-sky-500/25 text-sky-100 hover:bg-sky-500/30`}
          title="Сохранить аннотации"
          aria-label="Сохранить аннотации"
        >
          {isSaving ? '⏳' : '💾'}
        </button>
      </div>

      {error ? <div className="text-xs text-red-400">{error}</div> : null}
    </div>
  );
});

ImageAnnotationEditor.displayName = 'ImageAnnotationEditor';
