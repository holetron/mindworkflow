import type { Stroke, StrokePoint } from './annotationTypes';
import { TEXTAREA_LINE_HEIGHT } from './annotationTypes';

/**
 * Redraws all committed strokes onto the canvas.
 */
export function redrawAllStrokes(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (const stroke of strokes) {
    ctx.save();
    switch (stroke.kind) {
      case 'brush': {
        const points = stroke.points;
        if (!points.length) { ctx.restore(); continue; }
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
        if (points.length === 1) ctx.lineTo(points[0].x, points[0].y + 0.01);
        ctx.stroke();
        break;
      }
      case 'eraser': {
        const points = stroke.points;
        if (!points.length) { ctx.restore(); continue; }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
        if (points.length === 1) ctx.lineTo(points[0].x, points[0].y + 0.01);
        ctx.stroke();
        break;
      }
      case 'rectangle': {
        const w = stroke.end.x - stroke.start.x;
        const h = stroke.end.y - stroke.start.y;
        if (Math.abs(w) < 0.5 && Math.abs(h) < 0.5) { ctx.restore(); continue; }
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        ctx.strokeRect(Math.min(stroke.start.x, stroke.end.x), Math.min(stroke.start.y, stroke.end.y), Math.abs(w), Math.abs(h));
        break;
      }
      case 'circle': {
        const w = stroke.end.x - stroke.start.x;
        const h = stroke.end.y - stroke.start.y;
        if (Math.abs(w) < 0.5 && Math.abs(h) < 0.5) { ctx.restore(); continue; }
        const rw = Math.abs(w);
        const rh = Math.abs(h);
        const rx = rw / 2;
        const ry = rh / 2;
        const cx = Math.min(stroke.start.x, stroke.end.x) + rx;
        const cy = Math.min(stroke.start.y, stroke.end.y) + ry;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'text': {
        if (!stroke.text.trim()) { ctx.restore(); continue; }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = stroke.color;
        ctx.textBaseline = 'top';
        ctx.font = `${stroke.fontSize}px sans-serif`;
        const lines = stroke.text.split('\n');
        for (let index = 0; index < lines.length; index += 1) {
          ctx.fillText(lines[index], stroke.position.x, stroke.position.y + index * stroke.fontSize * TEXTAREA_LINE_HEIGHT);
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draws a single stroke in real-time (for live drawing feedback).
 */
export function drawLiveStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  options?: { fromIndex?: number },
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  switch (stroke.kind) {
    case 'brush': {
      const points = stroke.points;
      if (points.length === 0) { ctx.restore(); return; }
      const fromIndex = options?.fromIndex ?? 0;
      ctx.lineWidth = stroke.size;
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      const start = Math.max(0, fromIndex - 1);
      ctx.moveTo(points[start].x, points[start].y);
      for (let i = start + 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      if (points.length === 1) ctx.lineTo(points[0].x, points[0].y + 0.01);
      ctx.stroke();
      break;
    }
    case 'eraser': {
      const points = stroke.points;
      if (points.length === 0) { ctx.restore(); return; }
      const fromIndex = options?.fromIndex ?? 0;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = stroke.size;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      const start = Math.max(0, fromIndex - 1);
      ctx.moveTo(points[start].x, points[start].y);
      for (let i = start + 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      if (points.length === 1) ctx.lineTo(points[0].x, points[0].y + 0.01);
      ctx.stroke();
      break;
    }
    case 'rectangle':
    case 'circle': {
      ctx.lineWidth = stroke.size;
      ctx.strokeStyle = stroke.color;
      const left = Math.min(stroke.start.x, stroke.end.x);
      const top = Math.min(stroke.start.y, stroke.end.y);
      const width = Math.abs(stroke.end.x - stroke.start.x);
      const height = Math.abs(stroke.end.y - stroke.start.y);
      ctx.beginPath();
      if (stroke.kind === 'rectangle') {
        ctx.strokeRect(left, top, width, height);
      } else {
        const rx = width / 2;
        const ry = height / 2;
        ctx.ellipse(left + rx, top + ry, rx, ry, 0, 0, Math.PI * 2);
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
        ctx.fillText(lines[index], stroke.position.x, stroke.position.y + index * stroke.fontSize * TEXTAREA_LINE_HEIGHT);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/**
 * Scales all strokes when canvas is resized.
 */
export function scaleStrokes(strokes: Stroke[], scaleX: number, scaleY: number): Stroke[] {
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return strokes;
  }
  const scalePoint = (point: StrokePoint): StrokePoint => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  });
  const scaleFont = (fontSize: number): number => {
    const factor = (scaleX + scaleY) / 2;
    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    return Math.max(6, fontSize * safeFactor);
  };

  return strokes.map((stroke): Stroke => {
    switch (stroke.kind) {
      case 'brush':
      case 'eraser':
        return { ...stroke, points: stroke.points.map(scalePoint) };
      case 'rectangle':
      case 'circle':
        return { ...stroke, start: scalePoint(stroke.start), end: scalePoint(stroke.end) };
      case 'text':
        return { ...stroke, position: scalePoint(stroke.position), fontSize: scaleFont(stroke.fontSize) };
      default:
        return stroke;
    }
  });
}
