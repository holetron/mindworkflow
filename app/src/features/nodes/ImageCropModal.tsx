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

interface CropPreset {
  id: CropPresetId;
  label: string;
  width: number;
  height: number;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getPresetRatio = (
  preset: CropPresetId,
  naturalWidth: number,
  naturalHeight: number,
  customWidth: number,
  customHeight: number,
): number => {
  if (preset === 'free') {
    const safeWidth = ensurePositive(customWidth, naturalWidth);
    const safeHeight = ensurePositive(customHeight, naturalHeight);
    return safeWidth / safeHeight;
  }
  if (preset === 'original') {
    return naturalWidth / Math.max(1, naturalHeight);
  }
  const match = STATIC_PRESETS.find((candidate) => candidate.id === preset);
  if (!match) {
    return naturalWidth / Math.max(1, naturalHeight);
  }
  return match.width / match.height;
};

const buildBaseCrop = (ratio: number, naturalWidth: number, naturalHeight: number): { width: number; height: number } => {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : naturalWidth / Math.max(1, naturalHeight);
  let width = naturalWidth;
  let height = width / safeRatio;
  if (height > naturalHeight) {
    height = naturalHeight;
    width = height * safeRatio;
  }
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
};

const computeMinDimensions = (
  baseWidth: number,
  baseHeight: number,
  ratio: number,
  naturalWidth: number,
  naturalHeight: number,
): { minWidth: number; minHeight: number } => {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const minByImage = Math.max(MIN_CROP_DIMENSION, Math.min(naturalWidth, naturalHeight) * 0.05);
  const minByHeight = MIN_CROP_DIMENSION * safeRatio;
  const minByZoomWidth = baseWidth * (MIN_ZOOM_PERCENT / 100);
  const minWidth = clampValue(Math.max(minByImage, minByHeight, minByZoomWidth), MIN_CROP_DIMENSION, baseWidth);

  const derivedHeight = minWidth / safeRatio;
  const minByImageHeight = Math.max(
    MIN_CROP_DIMENSION,
    Math.min(naturalWidth, naturalHeight) * 0.05 / Math.max(safeRatio, 0.0001),
  );
  const minByZoomHeight = baseHeight * (MIN_ZOOM_PERCENT / 100);
  const minHeight = clampValue(
    Math.max(derivedHeight, minByImageHeight, MIN_CROP_DIMENSION, minByZoomHeight),
    MIN_CROP_DIMENSION,
    baseHeight,
  );

  return { minWidth, minHeight };
};

const STATIC_PRESETS: CropPreset[] = [
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: '3:2', label: '3:2', width: 3, height: 2 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
  { id: '4:5', label: '4:5', width: 4, height: 5 },
  { id: '5:4', label: '5:4', width: 5, height: 4 },
  { id: '2:3', label: '2:3', width: 2, height: 3 },
  { id: '9:16', label: '9:16', width: 9, height: 16 },
];

const BASE_FRAME_WIDTH = 400;
const BASE_FRAME_HEIGHT = 300;
const MIN_IMAGE_DIMENSION = 40;
const MIN_CROP_DIMENSION = 48;
const MIN_ZOOM_PERCENT = 10;
const MAX_ZOOM_PERCENT = 100;

const DEFAULT_COLOR_ADJUSTMENTS: ImageColorAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 100,
};

const PRESET_SEQUENCE: CropPresetId[] = ['original', '16:9', '4:3', '1:1', '9:16', 'free'];

type CropTab = 'crop' | 'adjustments';

const TAB_SEQUENCE: Array<{ id: CropTab; label: string }> = [
  { id: 'crop', label: 'Кадрирование' },
  { id: 'adjustments', label: 'Цветокоррекция' },
];

const isPresetId = (candidate: unknown): candidate is CropPresetId =>
  typeof candidate === 'string' && PRESET_SEQUENCE.includes(candidate as CropPresetId);

const normalizePreset = (candidate: unknown): CropPresetId => {
  if (isPresetId(candidate)) {
    return candidate;
  }
  return 'original';
};

const formatRatioValue = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '1';
  }
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString().replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

const ADJUSTMENT_LIMITS: Record<keyof ImageColorAdjustments, { min: number; max: number; step: number }> = {
  brightness: { min: 50, max: 150, step: 1 },
  contrast: { min: 50, max: 150, step: 1 },
  saturation: { min: 0, max: 200, step: 1 },
  sharpness: { min: 0, max: 200, step: 1 },
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startRect: CropRect;
};

const clampValue = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

type AdjustmentKey = keyof ImageColorAdjustments;

const ADJUSTMENT_LABELS: Record<AdjustmentKey, string> = {
  brightness: 'Яркость',
  contrast: 'Контрастность',
  saturation: 'Насыщенность',
  sharpness: 'Резкость',
};

const clampCropDimension = (value: number, naturalLimit: number): number => {
  const max = Math.max(MIN_CROP_DIMENSION, naturalLimit);
  return clampValue(value, MIN_CROP_DIMENSION, max);
};

const ensurePositive = (value: number | null | undefined, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
};

const sanitizeAdjustments = (candidate: ImageColorAdjustments | null | undefined): ImageColorAdjustments => {
  const result: ImageColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  (Object.keys(result) as AdjustmentKey[]).forEach((key) => {
    const limits = ADJUSTMENT_LIMITS[key];
    const raw = candidate?.[key];
    const numeric = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_COLOR_ADJUSTMENTS[key];
    result[key] = clampValue(numeric, limits.min, limits.max);
  });
  return result;
};

const buildPreviewFilter = (adjustments: ImageColorAdjustments): string => {
  const brightness = (adjustments.brightness / 100).toFixed(3);
  const contrast = (adjustments.contrast / 100).toFixed(3);
  const saturation = (adjustments.saturation / 100).toFixed(3);
  const sharpnessBoost = adjustments.sharpness > 100 ? Math.min((adjustments.sharpness - 100) / 200 + 1, 1.2) : 1;
  return `brightness(${brightness}) contrast(${(contrast * sharpnessBoost).toFixed(3)}) saturate(${saturation})`;
};

const isClose = (a: number, b: number, epsilon = 0.5): boolean => Math.abs(a - b) <= epsilon;

const clampOffset = (
  x: number,
  y: number,
  cropWidth: number,
  cropHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): { x: number; y: number } => {
  const maxX = Math.max(0, naturalWidth - cropWidth);
  const maxY = Math.max(0, naturalHeight - cropHeight);
  return {
    x: clampValue(x, 0, maxX),
    y: clampValue(y, 0, maxY),
  };
};

const toPercent = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }
  return clampValue((value / max) * 100, 0, 100);
};

const computeFrameDimensions = (): { width: number; height: number } => ({
  width: BASE_FRAME_WIDTH,
  height: BASE_FRAME_HEIGHT,
});

const computeInitialCropWidth = (
  baseWidth: number,
  baseHeight: number,
  ratio: number,
  settings: ImageCropSettings | null | undefined,
  minWidth: number,
): number => {
  const fallbackWidth = clampValue(baseWidth, minWidth, baseWidth);
  if (!settings) {
    return fallbackWidth;
  }
  if (typeof settings.zoom === 'number' && Number.isFinite(settings.zoom) && settings.zoom > 0) {
    return clampValue(baseWidth / settings.zoom, minWidth, baseWidth);
  }
  const widthCandidate = ensurePositive(settings.cropWidth ?? settings.customWidth, fallbackWidth);
  const heightCandidate = ensurePositive(settings.cropHeight ?? settings.customHeight, baseHeight);
  const inferredWidth = heightCandidate * ratio;
  const resolved =
    Number.isFinite(inferredWidth) && inferredWidth > 0 ? Math.min(widthCandidate, inferredWidth) : widthCandidate;
  return clampValue(resolved, minWidth, baseWidth);
};

const computeInitialOffset = (
  settings: ImageCropSettings | null | undefined,
  naturalWidth: number,
  naturalHeight: number,
  cropWidth: number,
  cropHeight: number,
): { x: number; y: number } => {
  const percentX = clampValue(settings?.offsetXPercent ?? 0, 0, 100);
  const percentY = clampValue(settings?.offsetYPercent ?? 0, 0, 100);
  const maxX = Math.max(0, naturalWidth - cropWidth);
  const maxY = Math.max(0, naturalHeight - cropHeight);
  return {
    x: (percentX / 100) * maxX,
    y: (percentY / 100) * maxY,
  };
};

interface ImageCropModalProps {
  source: string;
  naturalWidth: number;
  naturalHeight: number;
  initialSettings?: ImageCropSettings | null;
  onCancel: () => void;
  onApply: (payload: { dataUrl: string; settings: ImageCropSettings }) => void | Promise<void>;
}

export function ImageCropModal({
  source,
  naturalWidth,
  naturalHeight,
  initialSettings,
  onApply,
  onCancel,
}: ImageCropModalProps) {
  const resolvedInitialCustomWidth = clampCropDimension(
    ensurePositive(initialSettings?.customWidth, naturalWidth),
    naturalWidth,
  );
  const resolvedInitialCustomHeight = clampCropDimension(
    ensurePositive(initialSettings?.customHeight, naturalHeight),
    naturalHeight,
  );

  const [selectedPreset, setSelectedPreset] = useState<CropPresetId>(() => {
    return normalizePreset(initialSettings?.preset);
  });
  const [customWidth, setCustomWidth] = useState<number>(resolvedInitialCustomWidth);
  const [customHeight, setCustomHeight] = useState<number>(resolvedInitialCustomHeight);
  const [customWidthInput, setCustomWidthInput] = useState<string>(() => Math.round(resolvedInitialCustomWidth).toString());
  const [customHeightInput, setCustomHeightInput] = useState<string>(() =>
    Math.round(resolvedInitialCustomHeight).toString(),
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageColorAdjustments>(() =>
    sanitizeAdjustments(initialSettings?.adjustments),
  );
  const [activeTab, setActiveTab] = useState<CropTab>('crop');
  const sanitizedAdjustments = useMemo(() => sanitizeAdjustments(adjustments), [adjustments]);

  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    const nextWidth = clampCropDimension(ensurePositive(initialSettings?.customWidth, naturalWidth), naturalWidth);
    const nextHeight = clampCropDimension(
      ensurePositive(initialSettings?.customHeight, naturalHeight),
      naturalHeight,
    );
    setCustomWidth(nextWidth);
    setCustomHeight(nextHeight);
    setCropHeight(nextHeight);
    setCustomWidthInput(Math.round(nextWidth).toString());
    setCustomHeightInput(Math.round(nextHeight).toString());
  }, [initialSettings, naturalHeight, naturalWidth]);

  useEffect(() => {
    setError(null);
  }, [adjustments, customHeight, customWidth, selectedPreset]);

  useEffect(() => {
    setAdjustments(sanitizeAdjustments(initialSettings?.adjustments));
  }, [initialSettings]);

  const ratio = useMemo(() => {
    if (selectedPreset === 'free') {
      const safeWidth = ensurePositive(customWidth, naturalWidth);
      const safeHeight = ensurePositive(customHeight, naturalHeight);
      return safeWidth / safeHeight;
    }
    if (selectedPreset === 'original') {
      return naturalWidth / Math.max(1, naturalHeight);
    }
    const preset = STATIC_PRESETS.find((candidate) => candidate.id === selectedPreset);
    if (!preset) {
      return naturalWidth / Math.max(1, naturalHeight);
    }
    return preset.width / preset.height;
  }, [customHeight, customWidth, naturalHeight, naturalWidth, selectedPreset]);

  const safeRatio = useMemo(() => {
    const fallback = naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
    if (Number.isFinite(ratio) && ratio > 0) {
      return ratio;
    }
    return fallback || 1;
  }, [naturalHeight, naturalWidth, ratio]);

  const baseCrop = useMemo(() => {
    return buildBaseCrop(safeRatio, naturalWidth, naturalHeight);
  }, [naturalHeight, naturalWidth, safeRatio]);

  const minDimensions = useMemo(
    () => computeMinDimensions(baseCrop.width, baseCrop.height, safeRatio, naturalWidth, naturalHeight),
    [baseCrop.height, baseCrop.width, naturalHeight, naturalWidth, safeRatio],
  );
  const minCropWidth = minDimensions.minWidth;
  const minCropHeight = minDimensions.minHeight;

  const initialCropWidth = useMemo(
    () => computeInitialCropWidth(baseCrop.width, baseCrop.height, safeRatio, initialSettings, minCropWidth),
    [baseCrop.height, baseCrop.width, initialSettings, minCropWidth, safeRatio],
  );

  const initialCropHeight = initialCropWidth / safeRatio;

  const [cropWidth, setCropWidth] = useState(initialCropWidth);
  const [cropHeight, setCropHeight] = useState(initialCropHeight);
  const [offset, setOffset] = useState(() =>
    computeInitialOffset(initialSettings, naturalWidth, naturalHeight, initialCropWidth, initialCropHeight),
  );

  useEffect(() => {
    setCropWidth((prev) => clampValue(prev, minCropWidth, baseCrop.width));
    setCropHeight((prev) => clampValue(prev, minCropHeight, baseCrop.height));
  }, [baseCrop.width, baseCrop.height, minCropWidth, minCropHeight]);

  const maxOffsetX = Math.max(0, naturalWidth - cropWidth);
  const maxOffsetY = Math.max(0, naturalHeight - cropHeight);

  useEffect(() => {
    setOffset((prev) => {
      const next = clampOffset(prev.x, prev.y, cropWidth, cropHeight, naturalWidth, naturalHeight);
      if (!isClose(next.x, prev.x) || !isClose(next.y, prev.y)) {
        return next;
      }
      return prev;
    });
  }, [cropHeight, cropWidth, naturalHeight, naturalWidth]);

  const scale = baseCrop.width > 0 ? baseCrop.width / cropWidth : 1;
  const widthRatio = baseCrop.width > 0 ? cropWidth / baseCrop.width : 1;
  const currentZoomPercent = clampValue(widthRatio * 100, MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT);

  const handlePresetChange = useCallback(
    (nextPreset: CropPresetId, options: { allowSame?: boolean } = {}) => {
      const { allowSame = true } = options;
      setActiveTab('crop');
      if (!allowSame && nextPreset === selectedPreset) {
        return;
      }

      if (nextPreset === 'free') {
        const nextWidth = clampCropDimension(cropWidth, naturalWidth);
        const nextHeight = clampCropDimension(cropHeight, naturalHeight);
        if (selectedPreset !== 'free' || !isClose(customWidth, nextWidth) || !isClose(customHeight, nextHeight)) {
          setSelectedPreset('free');
          setCustomWidth(nextWidth);
          setCustomWidthInput(Math.round(nextWidth).toString());
          setCustomHeight(nextHeight);
          setCustomHeightInput(Math.round(nextHeight).toString());
        }
        return;
      }

      const targetRatio = getPresetRatio(nextPreset, naturalWidth, naturalHeight, customWidth, customHeight);
      const currentRatio = cropHeight > 0 ? cropWidth / cropHeight : targetRatio;
      const ratioMismatch = Math.abs(currentRatio - targetRatio) > 0.01;

      if (!ratioMismatch && nextPreset === selectedPreset) {
        return;
      }

      const presetBase = buildBaseCrop(targetRatio, naturalWidth, naturalHeight);
      const { minWidth: presetMinWidth, minHeight: presetMinHeight } = computeMinDimensions(
        presetBase.width,
        presetBase.height,
        targetRatio,
        naturalWidth,
        naturalHeight,
      );

      const percentRatio = currentZoomPercent / 100;

      let nextWidth = clampValue(presetBase.width * percentRatio, presetMinWidth, presetBase.width);
      let nextHeight = nextWidth / targetRatio;

      if (!Number.isFinite(nextHeight) || nextHeight > presetBase.height || nextHeight < presetMinHeight) {
        nextHeight = clampValue(presetBase.height * percentRatio, presetMinHeight, presetBase.height);
        nextWidth = nextHeight * targetRatio;
      }

      if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
        nextWidth = presetBase.width;
      }
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
        nextHeight = presetBase.height;
      }

      nextWidth = clampValue(nextWidth, presetMinWidth, presetBase.width);
      nextHeight = clampValue(nextHeight, presetMinHeight, presetBase.height);

      const centerX = offset.x + cropWidth / 2;
      const centerY = offset.y + cropHeight / 2;
      const nextOffset = clampOffset(
        centerX - nextWidth / 2,
        centerY - nextHeight / 2,
        nextWidth,
        nextHeight,
        naturalWidth,
        naturalHeight,
      );

      setSelectedPreset(nextPreset);
      setCropWidth(nextWidth);
      setCropHeight(nextHeight);
      setOffset(nextOffset);
      setCustomWidth(nextWidth);
      setCustomWidthInput(Math.round(nextWidth).toString());
      setCustomHeight(nextHeight);
      setCustomHeightInput(Math.round(nextHeight).toString());
    },
    [
      cropHeight,
      cropWidth,
      currentZoomPercent,
      customHeight,
      customWidth,
      naturalHeight,
      naturalWidth,
      offset.x,
      offset.y,
      selectedPreset,
    ],
  );

  const initialPresetRef = useRef<CropPresetId>(normalizePreset(initialSettings?.preset));

  useEffect(() => {
    const normalizedPreset = normalizePreset(initialSettings?.preset);
    if (initialPresetRef.current === normalizedPreset) {
      return;
    }
    initialPresetRef.current = normalizedPreset;
    handlePresetChange(normalizedPreset, { allowSame: false });
  }, [handlePresetChange, initialSettings?.preset]);

  const ensureFreeMode = useCallback(() => {
    if (selectedPreset !== 'free') {
      handlePresetChange('free');
    }
  }, [handlePresetChange, selectedPreset]);

  const applyZoomPercent = useCallback(
    (percent: number, reference: { width: number; height: number; offset: { x: number; y: number } }) => {
      const clampedPercent = clampValue(percent, MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT);
      const percentRatio = clampedPercent / 100;

      let nextWidth = clampValue(baseCrop.width * percentRatio, minCropWidth, baseCrop.width);
      let nextHeight = clampValue(baseCrop.height * percentRatio, minCropHeight, baseCrop.height);

      const aspectWidth = nextHeight * safeRatio;
      const aspectHeight = nextWidth / safeRatio;

      if (Math.abs(aspectWidth - nextWidth) > Math.abs(aspectHeight - nextHeight)) {
        nextWidth = aspectWidth;
      } else {
        nextHeight = aspectHeight;
      }

      nextWidth = clampValue(nextWidth, minCropWidth, baseCrop.width);
      nextHeight = clampValue(nextHeight, minCropHeight, baseCrop.height);

      const centerX = reference.offset.x + reference.width / 2;
      const centerY = reference.offset.y + reference.height / 2;

      const nextOffset = clampOffset(
        centerX - nextWidth / 2,
        centerY - nextHeight / 2,
        nextWidth,
        nextHeight,
        naturalWidth,
        naturalHeight,
      );

      setCropWidth(nextWidth);
      setCropHeight(nextHeight);
      if (selectedPreset === 'free') {
        setCustomWidth(nextWidth);
        setCustomWidthInput(Math.round(nextWidth).toString());
        setCustomHeight(nextHeight);
        setCustomHeightInput(Math.round(nextHeight).toString());
      }
      setOffset(nextOffset);
    },
    [baseCrop.height, baseCrop.width, minCropHeight, minCropWidth, naturalHeight, naturalWidth, safeRatio],
  );

  useEffect(() => {
    if (currentZoomPercent < MIN_ZOOM_PERCENT - 0.1) {
      applyZoomPercent(MIN_ZOOM_PERCENT, { width: cropWidth, height: cropHeight, offset });
    } else if (currentZoomPercent > MAX_ZOOM_PERCENT + 0.1) {
      applyZoomPercent(MAX_ZOOM_PERCENT, { width: cropWidth, height: cropHeight, offset });
    }
  }, [applyZoomPercent, cropHeight, cropWidth, currentZoomPercent, offset]);

  const preview = useMemo(() => computeFrameDimensions(), []);
  const previewFilter = useMemo(() => buildPreviewFilter(sanitizedAdjustments), [sanitizedAdjustments]);
  const isAdjustmentsPristine = useMemo(
    () =>
      (Object.keys(DEFAULT_COLOR_ADJUSTMENTS) as AdjustmentKey[]).every(
        (key) => adjustments[key] === DEFAULT_COLOR_ADJUSTMENTS[key],
      ),
    [adjustments],
  );
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const modalMaxWidth = Math.min(Math.max(BASE_FRAME_WIDTH + 160, 320), viewportWidth - 80);
  const imageScale =
    naturalWidth > 0 && naturalHeight > 0
      ? Math.min(BASE_FRAME_WIDTH / naturalWidth, BASE_FRAME_HEIGHT / naturalHeight, 1)
      : 1;
  const previewImageWidth = clampValue(naturalWidth * imageScale, MIN_IMAGE_DIMENSION, BASE_FRAME_WIDTH);
  const previewImageHeight = clampValue(naturalHeight * imageScale, MIN_IMAGE_DIMENSION, BASE_FRAME_HEIGHT);
  const imageOffsetX = (BASE_FRAME_WIDTH - previewImageWidth) / 2;
  const imageOffsetY = (BASE_FRAME_HEIGHT - previewImageHeight) / 2;
  const cropPreviewWidth = cropWidth * imageScale;
  const cropPreviewHeight = cropHeight * imageScale;
  const cropPreviewLeft = imageOffsetX + offset.x * imageScale;
  const cropPreviewTop = imageOffsetY + offset.y * imageScale;

  const offsetPercentX = toPercent(offset.x, maxOffsetX);
  const offsetPercentY = toPercent(offset.y, maxOffsetY);

  const aspectRatioLabel = useMemo(() => {
    if (selectedPreset === 'free') {
      return `${Math.round(customWidth)} × ${Math.round(customHeight)} px`;
    }
    if (selectedPreset === 'original') {
      return `Оригинал (${formatRatioValue(safeRatio)} : 1)`;
    }
    const preset = STATIC_PRESETS.find((candidate) => candidate.id === selectedPreset);
    if (preset) {
      return preset.label;
    }
    return `${formatRatioValue(safeRatio)} : 1`;
  }, [customHeight, customWidth, safeRatio, selectedPreset]);

  const presetOptions = useMemo(
    () => [
      { value: 'original' as CropPresetId, label: 'original' },
      ...STATIC_PRESETS.map((preset) => ({
        value: preset.id,
        label: preset.label,
      })),
    ],
    [],
  );

  const handleWheelZoom = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      const magnitude = Math.min(10, Math.max(1, Math.abs(event.deltaY) / 40));
      const baseStep = event.shiftKey ? 1 : 5;
      const modifierFactor = event.altKey ? 0.5 : 1;
      const deltaPercent = direction * baseStep * magnitude * modifierFactor;
      const nextPercent = currentZoomPercent + deltaPercent;
      applyZoomPercent(nextPercent, { width: cropWidth, height: cropHeight, offset });
    },
    [applyZoomPercent, cropHeight, cropWidth, currentZoomPercent, offset],
  );

  const handleAdjustmentSliderChange = useCallback((key: AdjustmentKey, nextValue: number) => {
    const limits = ADJUSTMENT_LIMITS[key];
    const clamped = clampValue(nextValue, limits.min, limits.max);
    setAdjustments((prev) => {
      if (prev[key] === clamped) {
        return prev;
      }
      return { ...prev, [key]: clamped };
    });
  }, []);

  const handleResetAdjustments = useCallback(() => {
    setAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS });
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: { x: offset.x, y: offset.y, width: cropWidth, height: cropHeight },
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [cropHeight, cropWidth, offset.x, offset.y],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      const naturalDeltaX = imageScale > 0 ? deltaX / imageScale : 0;
      const naturalDeltaY = imageScale > 0 ? deltaY / imageScale : 0;
      const next = clampOffset(
        dragState.startRect.x + naturalDeltaX,
        dragState.startRect.y + naturalDeltaY,
        dragState.startRect.width,
        dragState.startRect.height,
        naturalWidth,
        naturalHeight,
      );
      setOffset(next);
    },
    [imageScale, naturalHeight, naturalWidth],
  );

  const endDragging = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current && dragStateRef.current.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const handleApply = useCallback(async () => {
    try {
      setIsProcessing(true);
      setError(null);

      const centerX = offset.x + cropWidth / 2;
      const centerY = offset.y + cropHeight / 2;
      const normalizedCenterX = clampValue(centerX / Math.max(1, naturalWidth), 0, 1);
      const normalizedCenterY = clampValue(centerY / Math.max(1, naturalHeight), 0, 1);
      const frameInfo: ImageCropFrame = {
        width: Number(preview.width.toFixed(2)),
        height: Number(preview.height.toFixed(2)),
        displayWidth: Number(previewImageWidth.toFixed(2)),
        displayHeight: Number(previewImageHeight.toFixed(2)),
        scale: Number(imageScale.toFixed(4)),
        centerOffsetX: Number(normalizedCenterX.toFixed(6)),
        centerOffsetY: Number(normalizedCenterY.toFixed(6)),
      };

      const settings: ImageCropSettings = {
        preset: selectedPreset,
        ratio: safeRatio,
        offsetXPercent: offsetPercentX,
        offsetYPercent: offsetPercentY,
        customWidth: selectedPreset === 'free' ? cropWidth : initialSettings?.customWidth,
        customHeight: selectedPreset === 'free' ? cropHeight : initialSettings?.customHeight,
        cropWidth,
        cropHeight,
        zoom: scale,
        exposePort: false,
        adjustments: { ...sanitizedAdjustments },
        frame: frameInfo,
      };

      const dataUrl = await cropImageToDataUrl({
        imageSrc: source,
        naturalWidth,
        naturalHeight,
        settings,
        mimeType: 'image/webp',
        quality: 0.92,
      });

      await onApply({ dataUrl, settings });
    } catch (applyError) {
      console.error('[ImageCropModal] Failed to crop image:', applyError);
      setError(applyError instanceof Error ? applyError.message : 'Не удалось обрезать изображение');
    } finally {
      setIsProcessing(false);
    }
  }, [
    adjustments,
    cropHeight,
    cropWidth,
    initialSettings?.customHeight,
    initialSettings?.customWidth,
    naturalHeight,
    naturalWidth,
    offsetPercentX,
    offsetPercentY,
    offset,
    onApply,
    preview,
    previewImageHeight,
    previewImageWidth,
    safeRatio,
    scale,
    selectedPreset,
    imageScale,
    source,
  ]);

  const handleCustomWidthChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    if (!/^\d*$/.test(rawValue)) {
      return;
    }
    setCustomWidthInput(rawValue);
    if (selectedPreset !== 'free') {
      ensureFreeMode();
    }
  }, [ensureFreeMode, selectedPreset]);

  const handleCustomWidthBlur = useCallback(() => {
    if (selectedPreset !== 'free') {
      ensureFreeMode();
    }
    if (!customWidthInput || customWidthInput.trim().length === 0) {
      setCustomWidthInput(Math.round(customWidth).toString());
      return;
    }
    const numeric = Number(customWidthInput);
    if (!Number.isFinite(numeric)) {
      setCustomWidthInput(Math.round(customWidth).toString());
      return;
    }
    const clamped = clampCropDimension(numeric, naturalWidth);
    setCustomWidth(clamped);
    setCustomWidthInput(Math.round(clamped).toString());
    setCropWidth(clamped);
    setOffset((prev) => {
      const centerX = prev.x + cropWidth / 2;
      const nextX = clampValue(centerX - clamped / 2, 0, Math.max(0, naturalWidth - clamped));
      return { x: nextX, y: clampValue(prev.y, 0, Math.max(0, naturalHeight - cropHeight)) };
    });
  }, [
    cropHeight,
    cropWidth,
    customWidth,
    customWidthInput,
    ensureFreeMode,
    naturalHeight,
    naturalWidth,
    selectedPreset,
  ]);

  const handleCustomHeightChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    if (!/^\d*$/.test(rawValue)) {
      return;
    }
    setCustomHeightInput(rawValue);
    if (selectedPreset !== 'free') {
      ensureFreeMode();
    }
  }, [ensureFreeMode, selectedPreset]);

  const handleCustomHeightBlur = useCallback(() => {
    if (selectedPreset !== 'free') {
      ensureFreeMode();
    }
    if (!customHeightInput || customHeightInput.trim().length === 0) {
      setCustomHeightInput(Math.round(customHeight).toString());
      return;
    }
    const numeric = Number(customHeightInput);
    if (!Number.isFinite(numeric)) {
      setCustomHeightInput(Math.round(customHeight).toString());
      return;
    }
    const clamped = clampCropDimension(numeric, naturalHeight);
    setCustomHeight(clamped);
    setCustomHeightInput(Math.round(clamped).toString());
    setCropHeight(clamped);
    setOffset((prev) => {
      const centerY = prev.y + cropHeight / 2;
      const nextY = clampValue(centerY - clamped / 2, 0, Math.max(0, naturalHeight - clamped));
      return { x: clampValue(prev.x, 0, Math.max(0, naturalWidth - cropWidth)), y: nextY };
    });
  }, [
    cropHeight,
    cropWidth,
    customHeight,
    customHeightInput,
    ensureFreeMode,
    naturalHeight,
    naturalWidth,
    selectedPreset,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) {
    return null;
  }

  const zoomDisplayValue = Math.round(currentZoomPercent);
  const isCropTab = activeTab === 'crop';
  const isAdjustmentsTab = activeTab === 'adjustments';

  const modalContent = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 px-4 py-8 sm:px-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900/90 shadow-2xl ring-1 ring-sky-500/10 backdrop-blur-md"
        style={{ maxWidth: `${modalMaxWidth}px` }}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8">
          <div>
            <h2 className="text-lg font-semibold text-white">Обрезка изображения</h2>
            <p className="text-xs text-white/50">Перетащите и масштабируйте рамку, чтобы выбрать область обрезки.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/70 transition hover:bg-white/10"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          <div className="mx-auto w-full" style={{ maxWidth: `${preview.width}px` }}>
            <div
              className="relative mx-auto overflow-hidden rounded-3xl border border-white/15 bg-slate-950/70 shadow-lg shadow-slate-950/40 transition-all duration-150"
              style={{ width: `${preview.width}px`, height: `${preview.height}px` }}
            >
              <img
                alt="Предпросмотр обрезки"
                src={source}
                draggable={false}
                className="absolute select-none rounded-2xl"
                style={{
                  width: `${previewImageWidth}px`,
                  height: `${previewImageHeight}px`,
                  left: `${imageOffsetX}px`,
                  top: `${imageOffsetY}px`,
                  userSelect: 'none',
                  pointerEvents: 'none',
                  filter: previewFilter,
                }}
              />
              <div
                role="presentation"
                className={`absolute cursor-move border-2 border-sky-400/80 transition ${isDragging ? 'shadow-none' : 'shadow-lg shadow-sky-500/20'}`}
                style={{
                  left: `${cropPreviewLeft}px`,
                  top: `${cropPreviewTop}px`,
                  width: `${cropPreviewWidth}px`,
                  height: `${cropPreviewHeight}px`,
                  boxShadow: `0 0 0 9999px rgba(15, 23, 42, ${isDragging ? '0.65' : '0.5'})`,
                  borderRadius: '2px',
                  background: 'radial-gradient(rgba(56, 189, 248, 0.12), rgba(8, 47, 73, 0.18))',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDragging}
                onPointerLeave={endDragging}
                onWheel={handleWheelZoom}
              />
          </div>
        </div>

        <div className="w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/80">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <span className="text-white/40">Соотношение сторон</span>
              <span className="text-white/70">{aspectRatioLabel}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-white/40">Размер кадра</span>
              <span className="text-white/70">
                {Math.round(cropWidth)} × {Math.round(cropHeight)} px
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-white/40">Смещение</span>
              <span className="text-white/70">
                {offsetPercentX.toFixed(0)}% · {offsetPercentY.toFixed(0)}%
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-white/40">Масштаб рамки</span>
              <span className="text-white/70">{zoomDisplayValue}%</span>
            </div>
          </div>
        </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {TAB_SEQUENCE.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === tab.id
                    ? 'border-sky-400 bg-sky-500/20 text-sky-100 shadow-sm shadow-sky-500/25'
                    : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isCropTab ? (
            <>
              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/80 sm:grid-cols-3">
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wide text-white/40">Ширина</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    min={MIN_CROP_DIMENSION}
                    max={naturalWidth}
                    value={customWidthInput}
                    onChange={handleCustomWidthChange}
                    onBlur={handleCustomWidthBlur}
                    onFocus={ensureFreeMode}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wide text-white/40">Высота</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    min={MIN_CROP_DIMENSION}
                    max={naturalHeight}
                    value={customHeightInput}
                    onChange={handleCustomHeightChange}
                    onBlur={handleCustomHeightBlur}
                    onFocus={ensureFreeMode}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wide text-white/40">Пресет</span>
                  <select
                    value={selectedPreset}
                    onChange={(event) => handlePresetChange(event.target.value as CropPresetId)}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40"
                  >
                    {presetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="sm:col-span-3 text-xs leading-relaxed text-white/40">
                  Значения ограничены размерами оригинала. Масштаб определяет, сколько изображения попадёт в кадр.
                </p>
              </div>
              <p className="text-xs leading-relaxed text-white/40">
                Рамка масштабируется колесом мыши. Shift — точный шаг. Перемещение доступно перетаскиванием.
              </p>
            </>
          ) : null}

          {isAdjustmentsTab ? (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/80 mb-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-white/40">ЦВЕТОКОРРЕКЦИЯ КАДРА</span>
                <button
                  type="button"
                  onClick={handleResetAdjustments}
                  disabled={isAdjustmentsPristine}
                  className="rounded-lg bg-sky-500/80 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50"
                >
                  Сбросить
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(Object.keys(ADJUSTMENT_LABELS) as AdjustmentKey[]).map((key) => {
                  const limits = ADJUSTMENT_LIMITS[key];
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/40">
                        <span>{ADJUSTMENT_LABELS[key]}</span>
                        <span className="text-white/70">{adjustments[key]}%</span>
                      </div>
                      <input
                        type="range"
                        min={limits.min}
                        max={limits.max}
                        step={limits.step}
                        value={adjustments[key]}
                        onChange={(event) => handleAdjustmentSliderChange(key, Number(event.target.value))}
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-sky-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 disabled:opacity-50"
            disabled={isProcessing}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-sky-500/80 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50"
            disabled={isProcessing}
          >
            {isProcessing ? 'Сохранение…' : 'Сохранить обрезку'}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modalContent, portalTarget);
}
