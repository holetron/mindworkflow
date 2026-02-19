type MaybeNumber = number | null | undefined;

export type CropPresetId = 'original' | '16:9' | '4:3' | '1:1' | '9:16' | 'free';

export interface ImageColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
}

export interface ImageCropFrame {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  scale: number;
  centerOffsetX: number;
  centerOffsetY: number;
}

export interface ImageCropSettings {
  preset: CropPresetId;
  ratio: number;
  offsetXPercent: number;
  offsetYPercent: number;
  customWidth?: number;
  customHeight?: number;
  cropWidth?: number;
  cropHeight?: number;
  zoom?: number;
  exposePort?: boolean;
  adjustments?: ImageColorAdjustments;
  frame?: ImageCropFrame;
}

export interface CropViewportBox {
  left: number;
  top: number;
  width: number;
  height: number;
  containerWidth: number;
  containerHeight: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getSafeDimension(value: MaybeNumber, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = src;
  });
}

export async function loadImageWithRetry(
  src: string,
  maxRetries: number = 3,
  timeout: number = 10000
): Promise<HTMLImageElement> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const img = await Promise.race([
        loadImageElement(src),
        new Promise<HTMLImageElement>((_, reject) =>
          setTimeout(() => reject(new Error('Image load timeout')), timeout)
        ),
      ]);
      return img;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        // Exponential backoff: 200ms, 400ms, 800ms
        const delay = 200 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Failed to load image after ${maxRetries} attempts`);
}

function resolveRatio(settings: ImageCropSettings, naturalWidth: number, naturalHeight: number): number {
  if (settings.preset === 'free' && settings.customWidth && settings.customHeight) {
    return settings.customWidth / settings.customHeight;
  }
  if (settings.ratio > 0 && Number.isFinite(settings.ratio)) {
    return settings.ratio;
  }
  const fallbackWidth = naturalWidth > 0 ? naturalWidth : 1;
  const fallbackHeight = naturalHeight > 0 ? naturalHeight : 1;
  return fallbackWidth / fallbackHeight;
}

export function computeCropBox(
  settings: ImageCropSettings,
  naturalWidth: number,
  naturalHeight: number,
): { cropWidth: number; cropHeight: number; offsetX: number; offsetY: number } {
  const ratio = resolveRatio(settings, naturalWidth, naturalHeight);
  let cropWidth = naturalWidth;
  let cropHeight = cropWidth / ratio;

  if (cropHeight > naturalHeight) {
    cropHeight = naturalHeight;
    cropWidth = cropHeight * ratio;
  }

  if (settings.preset === 'free' && settings.customWidth && settings.customHeight) {
    cropWidth = clamp(settings.customWidth, 1, naturalWidth);
    cropHeight = clamp(settings.customHeight, 1, naturalHeight);
  }

  if (
    typeof settings.cropWidth === 'number' &&
    Number.isFinite(settings.cropWidth) &&
    settings.cropWidth > 0 &&
    typeof settings.cropHeight === 'number' &&
    Number.isFinite(settings.cropHeight) &&
    settings.cropHeight > 0
  ) {
    cropWidth = clamp(settings.cropWidth, 1, naturalWidth);
    cropHeight = clamp(settings.cropHeight, 1, naturalHeight);
  } else if (typeof settings.zoom === 'number' && Number.isFinite(settings.zoom) && settings.zoom > 0) {
    const zoomedWidth = clamp(cropWidth / settings.zoom, 1, naturalWidth);
    let zoomedHeight = zoomedWidth / ratio;
    if (zoomedHeight > naturalHeight) {
      zoomedHeight = naturalHeight;
      cropWidth = zoomedHeight * ratio;
    } else {
      cropWidth = zoomedWidth;
    }
    cropHeight = zoomedHeight;
  }

  cropWidth = clamp(cropWidth, 1, naturalWidth);
  cropHeight = clamp(cropHeight, 1, naturalHeight);

  const maxOffsetX = Math.max(0, naturalWidth - cropWidth);
  const maxOffsetY = Math.max(0, naturalHeight - cropHeight);
  const offsetX = clamp(settings.offsetXPercent ?? 0, 0, 100) / 100 * maxOffsetX;
  const offsetY = clamp(settings.offsetYPercent ?? 0, 0, 100) / 100 * maxOffsetY;

  return { cropWidth, cropHeight, offsetX, offsetY };
}

function sanitizeAdjustments(adjustments: ImageCropSettings['adjustments']): ImageColorAdjustments {
  const clampValue = (value: MaybeNumber, fallback: number, min: number, max: number) => {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return clamp(numeric, min, max);
  };
  return {
    brightness: clampValue(adjustments?.brightness, 100, 50, 150),
    contrast: clampValue(adjustments?.contrast, 100, 50, 150),
    saturation: clampValue(adjustments?.saturation, 100, 0, 200),
    sharpness: clampValue(adjustments?.sharpness, 100, 0, 200),
  };
}

function buildCanvasFilter(adjustments: ImageColorAdjustments): string {
  const { brightness, contrast, saturation } = adjustments;
  const brightnessFactor = (brightness / 100).toFixed(3);
  const contrastFactor = (contrast / 100).toFixed(3);
  const saturationFactor = (saturation / 100).toFixed(3);
  return `brightness(${brightnessFactor}) contrast(${contrastFactor}) saturate(${saturationFactor})`;
}

function convolve(context: CanvasRenderingContext2D, kernel: number[]) {
  const { width, height } = context.canvas;
  if (width <= 2 || height <= 2) {
    return;
  }
  const source = context.getImageData(0, 0, width, height);
  const src = source.data;
  const output = new Uint8ClampedArray(src.length);
  const w = source.width;
  const h = source.height;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dstIndex = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        output[dstIndex] = src[dstIndex];
        output[dstIndex + 1] = src[dstIndex + 1];
        output[dstIndex + 2] = src[dstIndex + 2];
        output[dstIndex + 3] = src[dstIndex + 3];
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sx = x + kx;
          const sy = y + ky;
          const srcIndex = (sy * w + sx) * 4;
          const weight = kernel[k];
          r += src[srcIndex] * weight;
          g += src[srcIndex + 1] * weight;
          b += src[srcIndex + 2] * weight;
          a += src[srcIndex + 3] * (k === 4 ? 1 : 0);
          k += 1;
        }
      }
      output[dstIndex] = clamp(Math.round(r), 0, 255);
      output[dstIndex + 1] = clamp(Math.round(g), 0, 255);
      output[dstIndex + 2] = clamp(Math.round(b), 0, 255);
      output[dstIndex + 3] = clamp(Math.round(a || src[dstIndex + 3]), 0, 255);
    }
  }

  const result = new ImageData(output, w, h);
  context.putImageData(result, 0, 0);
}

function applySharpness(context: CanvasRenderingContext2D, amount: number) {
  const normalized = (amount - 100) / 100;
  if (Math.abs(normalized) < 0.01) {
    return;
  }
  if (normalized > 0) {
    const strength = Math.min(normalized, 3);
    const kernel = [
      0, -strength, 0,
      -strength, 1 + 4 * strength, -strength,
      0, -strength, 0,
    ];
    convolve(context, kernel);
    return;
  }

  const blurAmount = Math.min(Math.abs(normalized), 1.5);
  const kernel = [
    1 / 16, 2 / 16, 1 / 16,
    2 / 16, 4 / 16, 2 / 16,
    1 / 16, 2 / 16, 1 / 16,
  ];
  const passes = blurAmount > 0.75 ? 2 : 1;
  for (let i = 0; i < passes; i += 1) {
    convolve(context, kernel);
  }
}

export async function cropImageToDataUrl(params: {
  imageSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  settings: ImageCropSettings;
  mimeType?: string;
  quality?: number;
}): Promise<string> {
  const { imageSrc, settings, mimeType = 'image/png', quality } = params;
  const baseImage = await loadImageElement(imageSrc);
  const naturalWidth = getSafeDimension(params.naturalWidth, baseImage.naturalWidth || baseImage.width);
  const naturalHeight = getSafeDimension(params.naturalHeight, baseImage.naturalHeight || baseImage.height);
  const { cropWidth, cropHeight, offsetX, offsetY } = computeCropBox(settings, naturalWidth, naturalHeight);
  const adjustments = sanitizeAdjustments(settings.adjustments);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth));
  canvas.height = Math.max(1, Math.round(cropHeight));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Не удалось создать контекст для обрезки изображения');
  }

  context.filter = buildCanvasFilter(adjustments);
  context.drawImage(
    baseImage,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  context.filter = 'none';
  if (Math.abs(adjustments.sharpness - 100) > 0.01) {
    applySharpness(context, adjustments.sharpness);
  }

  const normalizedQuality =
    typeof quality === 'number' && Number.isFinite(quality) ? clamp(quality, 0.1, 1) : undefined;

  return canvas.toDataURL(mimeType, normalizedQuality);
}

export async function mergeBaseAndOverlay(params: {
  baseImage?: HTMLImageElement | null;
  baseImageSrc?: string | null;
  overlaySrc: string;
  overlayImage?: HTMLImageElement | null;
  outputWidth: number;
  outputHeight: number;
  mimeType?: string;
}): Promise<string> {
  const {
    baseImage,
    baseImageSrc,
    overlaySrc,
    overlayImage,
    outputWidth,
    outputHeight,
    mimeType = 'image/png',
  } = params;
  const [resolvedBase, resolvedOverlay] = await Promise.all([
    baseImage
      ? Promise.resolve(baseImage)
      : baseImageSrc
        ? loadImageElement(baseImageSrc)
        : Promise.resolve(null),
    overlayImage ? Promise.resolve(overlayImage) : loadImageElement(overlaySrc),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(outputWidth));
  canvas.height = Math.max(1, Math.round(outputHeight));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Не удалось создать холст для объединения изображений');
  }

  if (resolvedBase) {
    context.drawImage(resolvedBase, 0, 0, canvas.width, canvas.height);
  }
  const overlayWidth = resolvedOverlay.naturalWidth || resolvedOverlay.width;
  const overlayHeight = resolvedOverlay.naturalHeight || resolvedOverlay.height;
  context.drawImage(
    resolvedOverlay,
    0,
    0,
    overlayWidth,
    overlayHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL(mimeType);
}

export function computeCropOverlayInViewport(params: {
  settings: ImageCropSettings | null | undefined;
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}): CropViewportBox | null {
  const { settings, containerWidth, containerHeight, naturalWidth, naturalHeight } = params;
  if (
    !settings ||
    !containerWidth ||
    !containerHeight ||
    !naturalWidth ||
    !naturalHeight
  ) {
    return null;
  }

  const { cropWidth, cropHeight, offsetX, offsetY } = computeCropBox(settings, naturalWidth, naturalHeight);
  const imageRatio = naturalWidth / naturalHeight;
  const containerRatio = containerWidth / containerHeight;
  let renderedWidth = containerWidth;
  let renderedHeight = containerWidth / imageRatio;

  if (renderedHeight > containerHeight) {
    renderedHeight = containerHeight;
    renderedWidth = containerHeight * imageRatio;
  }

  const marginX = (containerWidth - renderedWidth) / 2;
  const marginY = (containerHeight - renderedHeight) / 2;
  const scaleX = renderedWidth / naturalWidth;
  const scaleY = renderedHeight / naturalHeight;
  const scale = Math.min(scaleX, scaleY);

  return {
    left: marginX + offsetX * scale,
    top: marginY + offsetY * scale,
    width: cropWidth * scale,
    height: cropHeight * scale,
    containerWidth,
    containerHeight,
  };
}
