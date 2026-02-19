import { ImageCropModal } from './ImageCropModal';
import type { ImageCropSettings } from './imageProcessing';

// Thin wrapper: reuse ImageCropModal UI for video-first-frame cropping.
// Keeps color adjustments and crop UX identical to image modal.
export type VideoCropSettings = ImageCropSettings;
export const VideoCropModal = ImageCropModal;
