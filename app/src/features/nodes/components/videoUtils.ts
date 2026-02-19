/* Shared types and utilities for VideoTrimModal and VideoFrameExtractModal */

export interface VideoColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_ADJUSTMENTS: VideoColorAdjustments = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0,
};

export const ADJUSTMENT_LIMITS: Record<keyof VideoColorAdjustments, { min: number; max: number; step: number }> = {
  brightness: { min: 50, max: 150, step: 1 },
  contrast: { min: 50, max: 150, step: 1 },
  saturation: { min: 0, max: 200, step: 1 },
  hue: { min: -180, max: 180, step: 1 },
};

export const ADJUSTMENT_LABELS: Record<keyof VideoColorAdjustments, string> = {
  brightness: 'Brightness', contrast: 'Contrast', saturation: 'Saturation', hue: 'Hue',
};

export const clampValue = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const clampCropPosition = (
  x: number, y: number, cropWidth: number, cropHeight: number,
  videoWidth: number, videoHeight: number,
): { x: number; y: number } => ({
  x: clampValue(x, 0, Math.max(0, videoWidth - cropWidth)),
  y: clampValue(y, 0, Math.max(0, videoHeight - cropHeight)),
});

export const getDisplayedVideoDimensions = (
  videoElement: HTMLVideoElement | null, containerWidth: number, containerHeight: number,
): { width: number; height: number; offsetX: number; offsetY: number } => {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
    return { width: containerWidth, height: containerHeight, offsetX: 0, offsetY: 0 };
  }
  const vRatio = videoElement.videoWidth / videoElement.videoHeight;
  const cRatio = containerWidth / containerHeight;
  if (vRatio > cRatio) {
    const h = containerWidth / vRatio;
    return { width: containerWidth, height: h, offsetX: 0, offsetY: (containerHeight - h) / 2 };
  }
  const w = containerHeight * vRatio;
  return { width: w, height: containerHeight, offsetX: (containerWidth - w) / 2, offsetY: 0 };
};

export const buildVideoFilter = (adjustments: VideoColorAdjustments): string => {
  const b = (adjustments.brightness / 100).toFixed(2);
  const c = (adjustments.contrast / 100).toFixed(2);
  const s = (adjustments.saturation / 100).toFixed(2);
  return `brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${adjustments.hue}deg)`;
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const computeCropFrameStyle = (
  containerEl: HTMLDivElement | null, videoEl: HTMLVideoElement | null,
  cropX: number, cropY: number, cropWidth: number, cropHeight: number,
  videoNaturalWidth: number, videoNaturalHeight: number,
): React.CSSProperties => {
  if (!containerEl) return { left: '0%', top: '0%', width: '100%', height: '100%' };
  const rect = containerEl.getBoundingClientRect();
  const { width: dw, height: dh, offsetX, offsetY } = getDisplayedVideoDimensions(videoEl, rect.width, rect.height);
  const sx = dw / videoNaturalWidth, sy = dh / videoNaturalHeight;
  return {
    left: `${offsetX + cropX * sx}px`, top: `${offsetY + cropY * sy}px`,
    width: `${cropWidth * sx}px`, height: `${cropHeight * sy}px`,
    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.5)', borderRadius: '2px',
    background: 'radial-gradient(rgba(56, 189, 248, 0.12), rgba(8, 47, 73, 0.18))',
  };
};
