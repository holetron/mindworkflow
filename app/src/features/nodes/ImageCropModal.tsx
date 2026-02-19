import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clamp,
  cropImageToDataUrl,
  type CropPresetId,
  type ImageColorAdjustments,
  type ImageCropFrame,
  type ImageCropSettings,
} from './imageProcessing';
import {
  type AdjustmentKey, type CropTab, type DragState,
  STATIC_PRESETS, BASE_FRAME_WIDTH, BASE_FRAME_HEIGHT, MIN_IMAGE_DIMENSION,
  MIN_CROP_DIMENSION, MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT,
  DEFAULT_COLOR_ADJUSTMENTS, TAB_SEQUENCE,
  clampValue, ensurePositive, isClose, toPercent, formatRatioValue,
  clampCropDimension, normalizePreset, getPresetRatio,
  buildBaseCrop, computeMinDimensions, clampOffset, computeFrameDimensions,
  sanitizeAdjustments, buildPreviewFilter, computeInitialCropWidth, computeInitialOffset,
} from './components/cropUtils';
import { CropTabContent } from './components/CropTabContent';
import { AdjustmentsTabContent } from './components/AdjustmentsTabContent';

interface ImageCropModalProps {
  source: string;
  naturalWidth: number;
  naturalHeight: number;
  initialSettings?: ImageCropSettings | null;
  onCancel: () => void;
  onApply: (payload: { dataUrl: string; settings: ImageCropSettings }) => void | Promise<void>;
}

export function ImageCropModal({
  source, naturalWidth, naturalHeight, initialSettings, onApply, onCancel,
}: ImageCropModalProps) {
  const resolvedInitialCustomWidth = clampCropDimension(ensurePositive(initialSettings?.customWidth, naturalWidth), naturalWidth);
  const resolvedInitialCustomHeight = clampCropDimension(ensurePositive(initialSettings?.customHeight, naturalHeight), naturalHeight);

  const [selectedPreset, setSelectedPreset] = useState<CropPresetId>(() => normalizePreset(initialSettings?.preset));
  const [customWidth, setCustomWidth] = useState(resolvedInitialCustomWidth);
  const [customHeight, setCustomHeight] = useState(resolvedInitialCustomHeight);
  const [customWidthInput, setCustomWidthInput] = useState(() => Math.round(resolvedInitialCustomWidth).toString());
  const [customHeightInput, setCustomHeightInput] = useState(() => Math.round(resolvedInitialCustomHeight).toString());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageColorAdjustments>(() => sanitizeAdjustments(initialSettings?.adjustments));
  const [activeTab, setActiveTab] = useState<CropTab>('crop');
  const sanitizedAdjustments = useMemo(() => sanitizeAdjustments(adjustments), [adjustments]);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    const nextW = clampCropDimension(ensurePositive(initialSettings?.customWidth, naturalWidth), naturalWidth);
    const nextH = clampCropDimension(ensurePositive(initialSettings?.customHeight, naturalHeight), naturalHeight);
    setCustomWidth(nextW); setCustomHeight(nextH); setCropHeight(nextH);
    setCustomWidthInput(Math.round(nextW).toString());
    setCustomHeightInput(Math.round(nextH).toString());
  }, [initialSettings, naturalHeight, naturalWidth]);

  useEffect(() => { setError(null); }, [adjustments, customHeight, customWidth, selectedPreset]);
  useEffect(() => { setAdjustments(sanitizeAdjustments(initialSettings?.adjustments)); }, [initialSettings]);

  const ratio = useMemo(() => {
    if (selectedPreset === 'free') return ensurePositive(customWidth, naturalWidth) / ensurePositive(customHeight, naturalHeight);
    if (selectedPreset === 'original') return naturalWidth / Math.max(1, naturalHeight);
    const preset = STATIC_PRESETS.find((c) => c.id === selectedPreset);
    return preset ? preset.width / preset.height : naturalWidth / Math.max(1, naturalHeight);
  }, [customHeight, customWidth, naturalHeight, naturalWidth, selectedPreset]);

  const safeRatio = useMemo(() => {
    const fallback = naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : fallback || 1;
  }, [naturalHeight, naturalWidth, ratio]);

  const baseCrop = useMemo(() => buildBaseCrop(safeRatio, naturalWidth, naturalHeight), [naturalHeight, naturalWidth, safeRatio]);
  const minDimensions = useMemo(() => computeMinDimensions(baseCrop.width, baseCrop.height, safeRatio, naturalWidth, naturalHeight), [baseCrop, naturalHeight, naturalWidth, safeRatio]);
  const { minWidth: minCropWidth, minHeight: minCropHeight } = minDimensions;

  const initialCropWidth = useMemo(() => computeInitialCropWidth(baseCrop.width, baseCrop.height, safeRatio, initialSettings, minCropWidth), [baseCrop, initialSettings, minCropWidth, safeRatio]);
  const initialCropHeight = initialCropWidth / safeRatio;

  const [cropWidth, setCropWidth] = useState(initialCropWidth);
  const [cropHeight, setCropHeight] = useState(initialCropHeight);
  const [offset, setOffset] = useState(() => computeInitialOffset(initialSettings, naturalWidth, naturalHeight, initialCropWidth, initialCropHeight));

  useEffect(() => {
    setCropWidth((p) => clampValue(p, minCropWidth, baseCrop.width));
    setCropHeight((p) => clampValue(p, minCropHeight, baseCrop.height));
  }, [baseCrop.width, baseCrop.height, minCropWidth, minCropHeight]);

  const maxOffsetX = Math.max(0, naturalWidth - cropWidth);
  const maxOffsetY = Math.max(0, naturalHeight - cropHeight);

  useEffect(() => {
    setOffset((prev) => {
      const next = clampOffset(prev.x, prev.y, cropWidth, cropHeight, naturalWidth, naturalHeight);
      return (!isClose(next.x, prev.x) || !isClose(next.y, prev.y)) ? next : prev;
    });
  }, [cropHeight, cropWidth, naturalHeight, naturalWidth]);

  const scale = baseCrop.width > 0 ? baseCrop.width / cropWidth : 1;
  const widthRatio = baseCrop.width > 0 ? cropWidth / baseCrop.width : 1;
  const currentZoomPercent = clampValue(widthRatio * 100, MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT);

  const handlePresetChange = useCallback((nextPreset: CropPresetId, options: { allowSame?: boolean } = {}) => {
    const { allowSame = true } = options;
    setActiveTab('crop');
    if (!allowSame && nextPreset === selectedPreset) return;
    if (nextPreset === 'free') {
      const nw = clampCropDimension(cropWidth, naturalWidth);
      const nh = clampCropDimension(cropHeight, naturalHeight);
      if (selectedPreset !== 'free' || !isClose(customWidth, nw) || !isClose(customHeight, nh)) {
        setSelectedPreset('free'); setCustomWidth(nw); setCustomWidthInput(Math.round(nw).toString());
        setCustomHeight(nh); setCustomHeightInput(Math.round(nh).toString());
      }
      return;
    }
    const targetRatio = getPresetRatio(nextPreset, naturalWidth, naturalHeight, customWidth, customHeight);
    const currentRatio = cropHeight > 0 ? cropWidth / cropHeight : targetRatio;
    if (Math.abs(currentRatio - targetRatio) <= 0.01 && nextPreset === selectedPreset) return;
    const presetBase = buildBaseCrop(targetRatio, naturalWidth, naturalHeight);
    const { minWidth: pMinW, minHeight: pMinH } = computeMinDimensions(presetBase.width, presetBase.height, targetRatio, naturalWidth, naturalHeight);
    const pct = currentZoomPercent / 100;
    let nw = clampValue(presetBase.width * pct, pMinW, presetBase.width);
    let nh = nw / targetRatio;
    if (!Number.isFinite(nh) || nh > presetBase.height || nh < pMinH) {
      nh = clampValue(presetBase.height * pct, pMinH, presetBase.height); nw = nh * targetRatio;
    }
    if (!Number.isFinite(nw) || nw <= 0) nw = presetBase.width;
    if (!Number.isFinite(nh) || nh <= 0) nh = presetBase.height;
    nw = clampValue(nw, pMinW, presetBase.width); nh = clampValue(nh, pMinH, presetBase.height);
    const cx = offset.x + cropWidth / 2, cy = offset.y + cropHeight / 2;
    const nextOff = clampOffset(cx - nw / 2, cy - nh / 2, nw, nh, naturalWidth, naturalHeight);
    setSelectedPreset(nextPreset); setCropWidth(nw); setCropHeight(nh); setOffset(nextOff);
    setCustomWidth(nw); setCustomWidthInput(Math.round(nw).toString());
    setCustomHeight(nh); setCustomHeightInput(Math.round(nh).toString());
  }, [cropHeight, cropWidth, currentZoomPercent, customHeight, customWidth, naturalHeight, naturalWidth, offset.x, offset.y, selectedPreset]);

  const initialPresetRef = useRef<CropPresetId>(normalizePreset(initialSettings?.preset));
  useEffect(() => {
    const np = normalizePreset(initialSettings?.preset);
    if (initialPresetRef.current === np) return;
    initialPresetRef.current = np;
    handlePresetChange(np, { allowSame: false });
  }, [handlePresetChange, initialSettings?.preset]);

  const ensureFreeMode = useCallback(() => {
    if (selectedPreset !== 'free') handlePresetChange('free');
  }, [handlePresetChange, selectedPreset]);

  const applyZoomPercent = useCallback((percent: number, ref: { width: number; height: number; offset: { x: number; y: number } }) => {
    const pct = clampValue(percent, MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT) / 100;
    let nw = clampValue(baseCrop.width * pct, minCropWidth, baseCrop.width);
    let nh = clampValue(baseCrop.height * pct, minCropHeight, baseCrop.height);
    const aw = nh * safeRatio, ah = nw / safeRatio;
    if (Math.abs(aw - nw) > Math.abs(ah - nh)) nw = aw; else nh = ah;
    nw = clampValue(nw, minCropWidth, baseCrop.width); nh = clampValue(nh, minCropHeight, baseCrop.height);
    const cx = ref.offset.x + ref.width / 2, cy = ref.offset.y + ref.height / 2;
    const no = clampOffset(cx - nw / 2, cy - nh / 2, nw, nh, naturalWidth, naturalHeight);
    setCropWidth(nw); setCropHeight(nh);
    if (selectedPreset === 'free') { setCustomWidth(nw); setCustomWidthInput(Math.round(nw).toString()); setCustomHeight(nh); setCustomHeightInput(Math.round(nh).toString()); }
    setOffset(no);
  }, [baseCrop, minCropHeight, minCropWidth, naturalHeight, naturalWidth, safeRatio]);

  useEffect(() => {
    if (currentZoomPercent < MIN_ZOOM_PERCENT - 0.1) applyZoomPercent(MIN_ZOOM_PERCENT, { width: cropWidth, height: cropHeight, offset });
    else if (currentZoomPercent > MAX_ZOOM_PERCENT + 0.1) applyZoomPercent(MAX_ZOOM_PERCENT, { width: cropWidth, height: cropHeight, offset });
  }, [applyZoomPercent, cropHeight, cropWidth, currentZoomPercent, offset]);

  // Derived preview values
  const preview = useMemo(() => computeFrameDimensions(), []);
  const previewFilter = useMemo(() => buildPreviewFilter(sanitizedAdjustments), [sanitizedAdjustments]);
  const isAdjustmentsPristine = useMemo(() => (Object.keys(DEFAULT_COLOR_ADJUSTMENTS) as AdjustmentKey[]).every((k) => adjustments[k] === DEFAULT_COLOR_ADJUSTMENTS[k]), [adjustments]);
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const modalMaxWidth = Math.min(Math.max(BASE_FRAME_WIDTH + 160, 320), viewportWidth - 80);
  const imageScale = naturalWidth > 0 && naturalHeight > 0 ? Math.min(BASE_FRAME_WIDTH / naturalWidth, BASE_FRAME_HEIGHT / naturalHeight, 1) : 1;
  const previewImageWidth = clampValue(naturalWidth * imageScale, MIN_IMAGE_DIMENSION, BASE_FRAME_WIDTH);
  const previewImageHeight = clampValue(naturalHeight * imageScale, MIN_IMAGE_DIMENSION, BASE_FRAME_HEIGHT);
  const imageOffsetX = (BASE_FRAME_WIDTH - previewImageWidth) / 2;
  const imageOffsetY = (BASE_FRAME_HEIGHT - previewImageHeight) / 2;
  const cropPreviewLeft = imageOffsetX + offset.x * imageScale;
  const cropPreviewTop = imageOffsetY + offset.y * imageScale;
  const cropPreviewWidth = cropWidth * imageScale;
  const cropPreviewHeight = cropHeight * imageScale;
  const offsetPercentX = toPercent(offset.x, maxOffsetX);
  const offsetPercentY = toPercent(offset.y, maxOffsetY);

  const aspectRatioLabel = useMemo(() => {
    if (selectedPreset === 'free') return `${Math.round(customWidth)} x ${Math.round(customHeight)} px`;
    if (selectedPreset === 'original') return `Original (${formatRatioValue(safeRatio)} : 1)`;
    const p = STATIC_PRESETS.find((c) => c.id === selectedPreset);
    return p ? p.label : `${formatRatioValue(safeRatio)} : 1`;
  }, [customHeight, customWidth, safeRatio, selectedPreset]);

  const presetOptions = useMemo(() => [
    { value: 'original' as CropPresetId, label: 'original' },
    ...STATIC_PRESETS.map((p) => ({ value: p.id, label: p.label })),
  ], []);

  const handleWheelZoom = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const dir = event.deltaY > 0 ? -1 : 1;
    const mag = Math.min(10, Math.max(1, Math.abs(event.deltaY) / 40));
    const step = event.shiftKey ? 1 : 5;
    const mod = event.altKey ? 0.5 : 1;
    applyZoomPercent(currentZoomPercent + dir * step * mag * mod, { width: cropWidth, height: cropHeight, offset });
  }, [applyZoomPercent, cropHeight, cropWidth, currentZoomPercent, offset]);

  const handleAdjustmentSliderChange = useCallback((key: AdjustmentKey, nextValue: number) => {
    const limits = ADJUSTMENT_LIMITS[key];
    const clamped = clampValue(nextValue, limits.min, limits.max);
    setAdjustments((prev) => prev[key] === clamped ? prev : { ...prev, [key]: clamped });
  }, []);

  const handleResetAdjustments = useCallback(() => { setAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS }); }, []);

  // Drag handlers
  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    dragStateRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startRect: { x: offset.x, y: offset.y, width: cropWidth, height: cropHeight } };
    setIsDragging(true); event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [cropHeight, cropWidth, offset.x, offset.y]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds || ds.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = imageScale > 0 ? (event.clientX - ds.startX) / imageScale : 0;
    const dy = imageScale > 0 ? (event.clientY - ds.startY) / imageScale : 0;
    setOffset(clampOffset(ds.startRect.x + dx, ds.startRect.y + dy, ds.startRect.width, ds.startRect.height, naturalWidth, naturalHeight));
  }, [imageScale, naturalHeight, naturalWidth]);

  const endDragging = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStateRef.current = null; setIsDragging(false);
  }, []);

  // Custom dimension handlers
  const handleCustomWidthChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!/^\d*$/.test(event.target.value)) return;
    setCustomWidthInput(event.target.value);
    if (selectedPreset !== 'free') ensureFreeMode();
  }, [ensureFreeMode, selectedPreset]);

  const handleCustomWidthBlur = useCallback(() => {
    if (selectedPreset !== 'free') ensureFreeMode();
    if (!customWidthInput?.trim()) { setCustomWidthInput(Math.round(customWidth).toString()); return; }
    const n = Number(customWidthInput);
    if (!Number.isFinite(n)) { setCustomWidthInput(Math.round(customWidth).toString()); return; }
    const c = clampCropDimension(n, naturalWidth);
    setCustomWidth(c); setCustomWidthInput(Math.round(c).toString()); setCropWidth(c);
    setOffset((prev) => ({ x: clampValue(prev.x + cropWidth / 2 - c / 2, 0, Math.max(0, naturalWidth - c)), y: clampValue(prev.y, 0, Math.max(0, naturalHeight - cropHeight)) }));
  }, [cropHeight, cropWidth, customWidth, customWidthInput, ensureFreeMode, naturalHeight, naturalWidth, selectedPreset]);

  const handleCustomHeightChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!/^\d*$/.test(event.target.value)) return;
    setCustomHeightInput(event.target.value);
    if (selectedPreset !== 'free') ensureFreeMode();
  }, [ensureFreeMode, selectedPreset]);

  const handleCustomHeightBlur = useCallback(() => {
    if (selectedPreset !== 'free') ensureFreeMode();
    if (!customHeightInput?.trim()) { setCustomHeightInput(Math.round(customHeight).toString()); return; }
    const n = Number(customHeightInput);
    if (!Number.isFinite(n)) { setCustomHeightInput(Math.round(customHeight).toString()); return; }
    const c = clampCropDimension(n, naturalHeight);
    setCustomHeight(c); setCustomHeightInput(Math.round(c).toString()); setCropHeight(c);
    setOffset((prev) => ({ x: clampValue(prev.x, 0, Math.max(0, naturalWidth - cropWidth)), y: clampValue(prev.y + cropHeight / 2 - c / 2, 0, Math.max(0, naturalHeight - c)) }));
  }, [cropHeight, cropWidth, customHeight, customHeightInput, ensureFreeMode, naturalHeight, naturalWidth, selectedPreset]);

  const handleApply = useCallback(async () => {
    try {
      setIsProcessing(true); setError(null);
      const cx = offset.x + cropWidth / 2, cy = offset.y + cropHeight / 2;
      const ncx = clampValue(cx / Math.max(1, naturalWidth), 0, 1);
      const ncy = clampValue(cy / Math.max(1, naturalHeight), 0, 1);
      const frameInfo: ImageCropFrame = {
        width: Number(preview.width.toFixed(2)), height: Number(preview.height.toFixed(2)),
        displayWidth: Number(previewImageWidth.toFixed(2)), displayHeight: Number(previewImageHeight.toFixed(2)),
        scale: Number(imageScale.toFixed(4)), centerOffsetX: Number(ncx.toFixed(6)), centerOffsetY: Number(ncy.toFixed(6)),
      };
      const settings: ImageCropSettings = {
        preset: selectedPreset, ratio: safeRatio, offsetXPercent: offsetPercentX, offsetYPercent: offsetPercentY,
        customWidth: selectedPreset === 'free' ? cropWidth : initialSettings?.customWidth,
        customHeight: selectedPreset === 'free' ? cropHeight : initialSettings?.customHeight,
        cropWidth, cropHeight, zoom: scale, exposePort: false,
        adjustments: { ...sanitizedAdjustments }, frame: frameInfo,
      };
      const dataUrl = await cropImageToDataUrl({ imageSrc: source, naturalWidth, naturalHeight, settings, mimeType: 'image/webp', quality: 0.92 });
      await onApply({ dataUrl, settings });
    } catch (applyError) {
      console.error('[ImageCropModal] Failed to crop image:', applyError);
      setError(applyError instanceof Error ? applyError.message : 'Failed to crop image');
    } finally { setIsProcessing(false); }
  }, [adjustments, cropHeight, cropWidth, initialSettings?.customHeight, initialSettings?.customWidth, naturalHeight, naturalWidth, offsetPercentX, offsetPercentY, offset, onApply, preview, previewImageHeight, previewImageWidth, safeRatio, scale, selectedPreset, imageScale, source]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handleKeyDown); document.body.style.overflow = prevOverflow; };
  }, [onCancel]);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  const zoomDisplayValue = Math.round(currentZoomPercent);

  const modalContent = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 px-4 py-8 sm:px-8"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900/90 shadow-2xl ring-1 ring-sky-500/10 backdrop-blur-md"
        style={{ maxWidth: `${modalMaxWidth}px` }}>
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8">
          <div>
            <h2 className="text-lg font-semibold text-white">Image Crop</h2>
            <p className="text-xs text-white/50">Drag and scale the frame to select the crop area.</p>
          </div>
          <button type="button" onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/70 transition hover:bg-white/10" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          {/* Preview area */}
          <div className="mx-auto w-full" style={{ maxWidth: `${preview.width}px` }}>
            <div className="relative mx-auto overflow-hidden rounded-3xl border border-white/15 bg-slate-950/70 shadow-lg shadow-slate-950/40 transition-all duration-150"
              style={{ width: `${preview.width}px`, height: `${preview.height}px` }}>
              <img alt="Crop preview" src={source} draggable={false} className="absolute select-none rounded-2xl"
                style={{ width: `${previewImageWidth}px`, height: `${previewImageHeight}px`, left: `${imageOffsetX}px`, top: `${imageOffsetY}px`, userSelect: 'none', pointerEvents: 'none', filter: previewFilter }} />
              <div role="presentation" className={`absolute cursor-move border-2 border-sky-400/80 transition ${isDragging ? 'shadow-none' : 'shadow-lg shadow-sky-500/20'}`}
                style={{ left: `${cropPreviewLeft}px`, top: `${cropPreviewTop}px`, width: `${cropPreviewWidth}px`, height: `${cropPreviewHeight}px`, boxShadow: `0 0 0 9999px rgba(15, 23, 42, ${isDragging ? '0.65' : '0.5'})`, borderRadius: '2px', background: 'radial-gradient(rgba(56, 189, 248, 0.12), rgba(8, 47, 73, 0.18))' }}
                onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endDragging} onPointerLeave={endDragging} onWheel={handleWheelZoom} />
            </div>
          </div>
          {/* Stats bar */}
          <div className="w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/80">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="flex flex-col gap-1"><span className="text-white/40">Aspect Ratio</span><span className="text-white/70">{aspectRatioLabel}</span></div>
              <div className="flex flex-col gap-1"><span className="text-white/40">Frame Size</span><span className="text-white/70">{Math.round(cropWidth)} x {Math.round(cropHeight)} px</span></div>
              <div className="flex flex-col gap-1"><span className="text-white/40">Offset</span><span className="text-white/70">{offsetPercentX.toFixed(0)}% / {offsetPercentY.toFixed(0)}%</span></div>
              <div className="flex flex-col gap-1"><span className="text-white/40">Frame Scale</span><span className="text-white/70">{zoomDisplayValue}%</span></div>
            </div>
          </div>
          {/* Tab buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TAB_SEQUENCE.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.id ? 'border-sky-400 bg-sky-500/20 text-sky-100 shadow-sm shadow-sky-500/25' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'}`}>
                {tab.label}
              </button>
            ))}
          </div>
          {/* Tab content */}
          {activeTab === 'crop' && (
            <CropTabContent customWidthInput={customWidthInput} customHeightInput={customHeightInput}
              naturalWidth={naturalWidth} naturalHeight={naturalHeight} selectedPreset={selectedPreset}
              presetOptions={presetOptions} onCustomWidthChange={handleCustomWidthChange}
              onCustomWidthBlur={handleCustomWidthBlur} onCustomHeightChange={handleCustomHeightChange}
              onCustomHeightBlur={handleCustomHeightBlur} onFocusFreeMode={ensureFreeMode}
              onPresetChange={(p) => handlePresetChange(p)} />
          )}
          {activeTab === 'adjustments' && (
            <AdjustmentsTabContent adjustments={adjustments} isAdjustmentsPristine={isAdjustmentsPristine}
              onSliderChange={handleAdjustmentSliderChange} onReset={handleResetAdjustments} />
          )}
          {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
          <button type="button" onClick={onCancel} disabled={isProcessing}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleApply} disabled={isProcessing}
            className="rounded-lg bg-sky-500/80 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50">{isProcessing ? 'Saving...' : 'Save crop'}</button>
        </footer>
      </div>
    </div>
  );
  return createPortal(modalContent, portalTarget);
}
