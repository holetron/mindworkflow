import type {
  CropPresetId,
  ImageColorAdjustments,
  ImageCropSettings,
} from '../imageProcessing';

export interface CropPreset {
  id: CropPresetId;
  label: string;
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropTab = 'crop' | 'adjustments';
export type AdjustmentKey = keyof ImageColorAdjustments;
export type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startRect: CropRect;
};

export const STATIC_PRESETS: CropPreset[] = [
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: '3:2', label: '3:2', width: 3, height: 2 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
  { id: '4:5', label: '4:5', width: 4, height: 5 },
  { id: '5:4', label: '5:4', width: 5, height: 4 },
  { id: '2:3', label: '2:3', width: 2, height: 3 },
  { id: '9:16', label: '9:16', width: 9, height: 16 },
];

export const BASE_FRAME_WIDTH = 400;
export const BASE_FRAME_HEIGHT = 300;
export const MIN_IMAGE_DIMENSION = 40;
export const MIN_CROP_DIMENSION = 48;
export const MIN_ZOOM_PERCENT = 10;
export const MAX_ZOOM_PERCENT = 100;

export const DEFAULT_COLOR_ADJUSTMENTS: ImageColorAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 100,
};

export const PRESET_SEQUENCE: CropPresetId[] = ['original', '16:9', '4:3', '1:1', '9:16', 'free'];

export const TAB_SEQUENCE: Array<{ id: CropTab; label: string }> = [
  { id: 'crop', label: 'Framing' },
  { id: 'adjustments', label: 'Color Correction' },
];

export const ADJUSTMENT_LIMITS: Record<AdjustmentKey, { min: number; max: number; step: number }> = {
  brightness: { min: 50, max: 150, step: 1 },
  contrast: { min: 50, max: 150, step: 1 },
  saturation: { min: 0, max: 200, step: 1 },
  sharpness: { min: 0, max: 200, step: 1 },
};

export const ADJUSTMENT_LABELS: Record<AdjustmentKey, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  sharpness: 'Sharpness',
};

export const clampValue = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const ensurePositive = (value: number | null | undefined, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return fallback;
};

export const isClose = (a: number, b: number, epsilon = 0.5): boolean => Math.abs(a - b) <= epsilon;

export const toPercent = (value: number, max: number): number => {
  if (max <= 0) return 0;
  return clampValue((value / max) * 100, 0, 100);
};

export const formatRatioValue = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '1';
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString().replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

export const clampCropDimension = (value: number, naturalLimit: number): number => {
  const max = Math.max(MIN_CROP_DIMENSION, naturalLimit);
  return clampValue(value, MIN_CROP_DIMENSION, max);
};

export const isPresetId = (candidate: unknown): candidate is CropPresetId =>
  typeof candidate === 'string' && PRESET_SEQUENCE.includes(candidate as CropPresetId);

export const normalizePreset = (candidate: unknown): CropPresetId =>
  isPresetId(candidate) ? candidate : 'original';

export const getPresetRatio = (
  preset: CropPresetId,
  naturalWidth: number,
  naturalHeight: number,
  customWidth: number,
  customHeight: number,
): number => {
  if (preset === 'free') {
    return ensurePositive(customWidth, naturalWidth) / ensurePositive(customHeight, naturalHeight);
  }
  if (preset === 'original') return naturalWidth / Math.max(1, naturalHeight);
  const match = STATIC_PRESETS.find((c) => c.id === preset);
  return match ? match.width / match.height : naturalWidth / Math.max(1, naturalHeight);
};

export const buildBaseCrop = (
  ratio: number,
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } => {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : naturalWidth / Math.max(1, naturalHeight);
  let width = naturalWidth;
  let height = width / safeRatio;
  if (height > naturalHeight) {
    height = naturalHeight;
    width = height * safeRatio;
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
};

export const computeMinDimensions = (
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
    (Math.min(naturalWidth, naturalHeight) * 0.05) / Math.max(safeRatio, 0.0001),
  );
  const minByZoomHeight = baseHeight * (MIN_ZOOM_PERCENT / 100);
  const minHeight = clampValue(
    Math.max(derivedHeight, minByImageHeight, MIN_CROP_DIMENSION, minByZoomHeight),
    MIN_CROP_DIMENSION,
    baseHeight,
  );
  return { minWidth, minHeight };
};

export const clampOffset = (
  x: number, y: number,
  cropWidth: number, cropHeight: number,
  naturalWidth: number, naturalHeight: number,
): { x: number; y: number } => ({
  x: clampValue(x, 0, Math.max(0, naturalWidth - cropWidth)),
  y: clampValue(y, 0, Math.max(0, naturalHeight - cropHeight)),
});

export const computeFrameDimensions = (): { width: number; height: number } => ({
  width: BASE_FRAME_WIDTH,
  height: BASE_FRAME_HEIGHT,
});

export const sanitizeAdjustments = (candidate: ImageColorAdjustments | null | undefined): ImageColorAdjustments => {
  const result: ImageColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  (Object.keys(result) as AdjustmentKey[]).forEach((key) => {
    const limits = ADJUSTMENT_LIMITS[key];
    const raw = candidate?.[key];
    const numeric = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_COLOR_ADJUSTMENTS[key];
    result[key] = clampValue(numeric, limits.min, limits.max);
  });
  return result;
};

export const buildPreviewFilter = (adjustments: ImageColorAdjustments): string => {
  const brightness = (adjustments.brightness / 100).toFixed(3);
  const contrast = (adjustments.contrast / 100).toFixed(3);
  const saturation = (adjustments.saturation / 100).toFixed(3);
  const sharpnessBoost = adjustments.sharpness > 100 ? Math.min((adjustments.sharpness - 100) / 200 + 1, 1.2) : 1;
  return `brightness(${brightness}) contrast(${(Number(contrast) * sharpnessBoost).toFixed(3)}) saturate(${saturation})`;
};

export const computeInitialCropWidth = (
  baseWidth: number,
  baseHeight: number,
  ratio: number,
  settings: ImageCropSettings | null | undefined,
  minWidth: number,
): number => {
  const fallbackWidth = clampValue(baseWidth, minWidth, baseWidth);
  if (!settings) return fallbackWidth;
  if (typeof settings.zoom === 'number' && Number.isFinite(settings.zoom) && settings.zoom > 0) {
    return clampValue(baseWidth / settings.zoom, minWidth, baseWidth);
  }
  const widthCandidate = ensurePositive(settings.cropWidth ?? settings.customWidth, fallbackWidth);
  const heightCandidate = ensurePositive(settings.cropHeight ?? settings.customHeight, baseHeight);
  const inferredWidth = heightCandidate * ratio;
  const resolved = Number.isFinite(inferredWidth) && inferredWidth > 0
    ? Math.min(widthCandidate, inferredWidth) : widthCandidate;
  return clampValue(resolved, minWidth, baseWidth);
};

export const computeInitialOffset = (
  settings: ImageCropSettings | null | undefined,
  naturalWidth: number, naturalHeight: number,
  cropWidth: number, cropHeight: number,
): { x: number; y: number } => {
  const percentX = clampValue(settings?.offsetXPercent ?? 0, 0, 100);
  const percentY = clampValue(settings?.offsetYPercent ?? 0, 0, 100);
  return {
    x: (percentX / 100) * Math.max(0, naturalWidth - cropWidth),
    y: (percentY / 100) * Math.max(0, naturalHeight - cropHeight),
  };
};
