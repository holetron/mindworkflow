import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface VideoFrameExtractModalProps {
  videoUrl: string;
  videoNodeId: string;
  projectId: string;
  onClose: () => void;
  onExtract: (
    timeSeconds: number,
    cropParams?: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  ) => Promise<void>;
}

type VideoFrameTab = 'extract' | 'crop' | 'adjustments';

interface VideoColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

const DEFAULT_ADJUSTMENTS: VideoColorAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
};

const ADJUSTMENT_LIMITS = {
  brightness: { min: 50, max: 150, step: 1 },
  contrast: { min: 50, max: 150, step: 1 },
  saturation: { min: 0, max: 200, step: 1 },
  hue: { min: -180, max: 180, step: 1 },
};

const ADJUSTMENT_LABELS: Record<keyof VideoColorAdjustments, string> = {
  brightness: 'Яркость',
  contrast: 'Контрастность',
  saturation: 'Насыщенность',
  hue: 'Оттенок',
};

// Utility functions for crop frame clamping
const clampValue = (value: number, min: number, max: number): number => 
  Math.min(Math.max(value, min), max);

const clampCropPosition = (
  x: number,
  y: number,
  cropWidth: number,
  cropHeight: number,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number } => {
  const maxX = Math.max(0, videoWidth - cropWidth);
  const maxY = Math.max(0, videoHeight - cropHeight);
  return {
    x: clampValue(x, 0, maxX),
    y: clampValue(y, 0, maxY),
  };
};

// Calculate actual displayed video dimensions with object-contain
const getDisplayedVideoDimensions = (
  videoElement: HTMLVideoElement | null,
  containerWidth: number,
  containerHeight: number,
): { width: number; height: number; offsetX: number; offsetY: number } => {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
    return { width: containerWidth, height: containerHeight, offsetX: 0, offsetY: 0 };
  }

  const videoAspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  const containerAspectRatio = containerWidth / containerHeight;

  let displayedWidth: number;
  let displayedHeight: number;
  let offsetX = 0;
  let offsetY = 0;

  if (videoAspectRatio > containerAspectRatio) {
    // Video is wider than container - fit to width
    displayedWidth = containerWidth;
    displayedHeight = containerWidth / videoAspectRatio;
    offsetY = (containerHeight - displayedHeight) / 2;
  } else {
    // Video is taller than container - fit to height
    displayedHeight = containerHeight;
    displayedWidth = containerHeight * videoAspectRatio;
    offsetX = (containerWidth - displayedWidth) / 2;
  }

  return { width: displayedWidth, height: displayedHeight, offsetX, offsetY };
};

export function VideoFrameExtractModal({
  videoUrl,
  videoNodeId,
  projectId,
  onClose,
  onExtract,
}: VideoFrameExtractModalProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<VideoFrameTab>('extract');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  
  // Crop state
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(400);
  const [cropHeight, setCropHeight] = useState(300);
  const [videoNaturalWidth, setVideoNaturalWidth] = useState(1920);
  const [videoNaturalHeight, setVideoNaturalHeight] = useState(1080);
  const [cropWidthInput, setCropWidthInput] = useState('400');
  const [cropHeightInput, setCropHeightInput] = useState('300');
  const [cropPreset, setCropPreset] = useState<string>('free');
  
  // Adjustments state
  const [adjustments, setAdjustments] = useState<VideoColorAdjustments>(DEFAULT_ADJUSTMENTS);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const cropCanvasRef = useRef<HTMLDivElement>(null);
  const cropDragStateRef = useRef<{ startX: number; startY: number; startCropX: number; startCropY: number } | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Calculate crop frame style based on actual displayed video dimensions
  const cropFrameStyle = useMemo(() => {
    if (!videoContainerRef.current) {
      return {
        left: '0%',
        top: '0%',
        width: '100%',
        height: '100%',
      };
    }

    const containerRect = videoContainerRef.current.getBoundingClientRect();
    const { width: displayedWidth, height: displayedHeight, offsetX, offsetY } = getDisplayedVideoDimensions(
      videoRef.current,
      containerRect.width,
      containerRect.height
    );

    // Calculate crop frame position/size relative to displayed video
    const scaleX = displayedWidth / videoNaturalWidth;
    const scaleY = displayedHeight / videoNaturalHeight;

    return {
      left: `${offsetX + cropX * scaleX}px`,
      top: `${offsetY + cropY * scaleY}px`,
      width: `${cropWidth * scaleX}px`,
      height: `${cropHeight * scaleY}px`,
      boxShadow: `0 0 0 9999px rgba(15, 23, 42, 0.5)`,
      borderRadius: '2px',
      background: 'radial-gradient(rgba(56, 189, 248, 0.12), rgba(8, 47, 73, 0.18))',
    };
  }, [cropX, cropY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setCurrentTime(0);
      video.currentTime = 0;
      
      // Set crop initial size to original video dimensions
      const videoWidth = video.videoWidth || 1920;
      const videoHeight = video.videoHeight || 1080;
      setVideoNaturalWidth(videoWidth);
      setVideoNaturalHeight(videoHeight);
      
      // Initialize crop frame to full video size
      setCropX(0);
      setCropY(0);
      setCropWidth(videoWidth);
      setCropHeight(videoHeight);
      setCropWidthInput(videoWidth.toString());
      setCropHeightInput(videoHeight.toString());
      setCropWidth(Math.min(400, video.videoWidth * 0.8));
      setCropHeight(Math.min(300, video.videoHeight * 0.8));
      setCropWidthInput(Math.min(400, video.videoWidth * 0.8).toString());
      setCropHeightInput(Math.min(300, video.videoHeight * 0.8).toString());
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [isPlaying]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * duration;
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, [duration]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const time = percent * duration;
      setCurrentTime(time);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, duration]);

  const handleCropWidthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCropWidthInput(e.target.value);
  }, []);

  const handleCropHeightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCropHeightInput(e.target.value);
  }, []);

  const handleCropWidthBlur = useCallback(() => {
    const newValue = Math.max(50, Math.min(parseInt(cropWidthInput) || cropWidth, videoNaturalWidth));
    setCropWidth(newValue);
    setCropWidthInput(newValue.toString());
    // Clamp X position if frame now extends beyond video
    setCropX((prevX) => {
      const constrainedX = Math.max(0, Math.min(prevX, videoNaturalWidth - newValue));
      return constrainedX;
    });
  }, [cropWidthInput, cropWidth, videoNaturalWidth]);

  const handleCropHeightBlur = useCallback(() => {
    const newValue = Math.max(50, Math.min(parseInt(cropHeightInput) || cropHeight, videoNaturalHeight));
    setCropHeight(newValue);
    setCropHeightInput(newValue.toString());
    // Clamp Y position if frame now extends beyond video
    setCropY((prevY) => {
      const constrainedY = Math.max(0, Math.min(prevY, videoNaturalHeight - newValue));
      return constrainedY;
    });
  }, [cropHeightInput, cropHeight, videoNaturalHeight]);

  const handleCropPresetChange = useCallback((preset: string) => {
    setCropPreset(preset);
    if (preset === 'original') {
      // Set to full video dimensions
      setCropWidth(videoNaturalWidth);
      setCropHeight(videoNaturalHeight);
      setCropX(0);
      setCropY(0);
      setCropWidthInput(videoNaturalWidth.toString());
      setCropHeightInput(videoNaturalHeight.toString());
    } else if (preset !== 'free') {
      // Calculate dimensions for aspect ratio presets
      const [w, h] = preset.split(':').map(Number);
      const ratio = w / h;
      
      // Start with full width
      let newWidth = videoNaturalWidth;
      let newHeight = newWidth / ratio;
      
      // If height exceeds video, constrain by height instead
      if (newHeight > videoNaturalHeight) {
        newHeight = videoNaturalHeight;
        newWidth = newHeight * ratio;
      }
      
      // Round dimensions
      newWidth = Math.round(newWidth);
      newHeight = Math.round(newHeight);
      
      // Center the crop frame
      const newX = Math.round((videoNaturalWidth - newWidth) / 2);
      const newY = Math.round((videoNaturalHeight - newHeight) / 2);
      
      setCropWidth(newWidth);
      setCropHeight(newHeight);
      setCropX(newX);
      setCropY(newY);
      setCropWidthInput(newWidth.toString());
      setCropHeightInput(newHeight.toString());
    }
  }, [videoNaturalWidth, videoNaturalHeight]);

  // Crop frame dragging (move only - no resize)
  const handleCropPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    
    cropDragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCropX: cropX,
      startCropY: cropY,
    };
  }, [cropX, cropY]);

  const handleCropPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropDragStateRef.current || !videoContainerRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    
    const { startX, startY, startCropX, startCropY } = cropDragStateRef.current;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // Get actual displayed video dimensions
    const containerRect = videoContainerRef.current.getBoundingClientRect();
    const { width: displayedWidth, height: displayedHeight } = getDisplayedVideoDimensions(
      videoRef.current,
      containerRect.width,
      containerRect.height
    );
    
    // Convert screen delta to video coordinates
    const scaleX = videoNaturalWidth / displayedWidth;
    const scaleY = videoNaturalHeight / displayedHeight;
    const videoDeltaX = deltaX * scaleX;
    const videoDeltaY = deltaY * scaleY;
    
    // Calculate new position from initial drag position
    let newX = startCropX + videoDeltaX;
    let newY = startCropY + videoDeltaY;
    
    // Clamp position to video bounds using utility function
    const clamped = clampCropPosition(newX, newY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight);
    newX = clamped.x;
    newY = clamped.y;
    
    // Update state immediately for visual feedback
    setCropX(newX);
    setCropY(newY);
  }, [cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight]);

  const handleCropPointerUp = useCallback(() => {
    cropDragStateRef.current = null;
  }, []);

  const handleCropWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (activeTab !== 'crop') return;
    e.stopPropagation();
    
    // Calculate current aspect ratio
    const currentRatio = cropWidth / cropHeight;
    
    // Scroll up = increase size, scroll down = decrease size
    const delta = e.deltaY > 0 ? -20 : 20;
    
    // Calculate new width and maintain aspect ratio
    let newWidth = Math.max(50, Math.min(cropWidth + delta, videoNaturalWidth));
    let newHeight = newWidth / currentRatio;
    
    // If new height exceeds video bounds, constrain by height instead
    if (newHeight > videoNaturalHeight) {
      newHeight = videoNaturalHeight;
      newWidth = newHeight * currentRatio;
    }
    
    // Ensure minimum dimensions
    if (newWidth < 50) {
      newWidth = 50;
      newHeight = newWidth / currentRatio;
    }
    if (newHeight < 50) {
      newHeight = 50;
      newWidth = newHeight * currentRatio;
    }
    
    // Calculate width/height change
    const widthDelta = newWidth - cropWidth;
    const heightDelta = newHeight - cropHeight;
    
    // Adjust position to maintain center point
    let newX = cropX - widthDelta / 2;
    let newY = cropY - heightDelta / 2;
    
    // Ensure frame stays within video bounds
    newX = Math.max(0, Math.min(newX, videoNaturalWidth - newWidth));
    newY = Math.max(0, Math.min(newY, videoNaturalHeight - newHeight));
    
    setCropX(newX);
    setCropY(newY);
    setCropWidth(newWidth);
    setCropHeight(newHeight);
    setCropWidthInput(Math.round(newWidth).toString());
    setCropHeightInput(Math.round(newHeight).toString());
  }, [activeTab, cropX, cropY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight]);

  const handleAdjustmentChange = useCallback((key: keyof VideoColorAdjustments, value: number) => {
    setAdjustments((prev) => ({ ...prev, [key]: value }));
  }, []);

  const buildVideoFilter = useCallback((): string => {
    const brightness = (adjustments.brightness / 100).toFixed(2);
    const contrast = (adjustments.contrast / 100).toFixed(2);
    const saturate = (adjustments.saturation / 100).toFixed(2);
    const hueRotate = `${adjustments.hue}deg`;
    return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hueRotate})`;
  }, [adjustments]);

  const handleExtract = useCallback(async () => {
    try {
      setIsExtracting(true);
      setError(null);
      
      // Check if crop is enabled - if crop values are different from full video size, pass crop params
      const isCropped = 
        cropX !== 0 || 
        cropY !== 0 || 
        cropWidth !== videoNaturalWidth || 
        cropHeight !== videoNaturalHeight;
      
      const cropParams = isCropped
        ? {
            x: Math.round(cropX),
            y: Math.round(cropY),
            width: Math.round(cropWidth),
            height: Math.round(cropHeight),
          }
        : undefined;
      
      await onExtract(currentTime, cropParams);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось извлечь кадр');
    } finally {
      setIsExtracting(false);
    }
  }, [currentTime, cropX, cropY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight, onExtract, onClose]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const timePercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-slate-900/95 to-slate-950/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8">
          <h2 className="text-lg font-semibold text-white">Извлечь кадр из видео</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/70 transition hover:bg-white/10"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          {/* Video Preview */}
          <div className="mx-auto w-full" style={{ maxWidth: '800px' }}>
            <div 
              ref={videoContainerRef}
              className="relative mx-auto overflow-hidden rounded-3xl border border-white/15 bg-slate-950/70 shadow-lg shadow-slate-950/40" 
              style={{ height: '450px' }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                muted
                playsInline
                preload="metadata"
                style={{ filter: buildVideoFilter() }}
              />
              
              {/* Crop Frame Overlay - visible only on crop tab */}
              {activeTab === 'crop' && (
                <div
                  ref={cropCanvasRef}
                  role="presentation"
                  className="absolute border-2 border-sky-400/80 cursor-move"
                  style={cropFrameStyle}
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerLeave={handleCropPointerUp}
                  onWheel={handleCropWheel}
                />
              )}
              
              {/* Play/Pause Button in bottom-left corner of video container */}
              <button
                type="button"
                onClick={togglePlayPause}
                className="absolute bottom-4 left-4 w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors z-10"
              >
                <span className="text-white text-2xl">{isPlaying ? '⏸' : '▶'}</span>
              </button>
            </div>
          </div>

          {/* Time Info */}
          <div className="w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/80">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-white/40">Текущее время</span>
                <span className="text-white/70 font-mono">{formatTime(currentTime)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-white/40">Длительность видео</span>
                <span className="text-white/70 font-mono">{formatTime(duration)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-white/40">Разрешение</span>
                <span className="text-white/70 font-mono">{videoNaturalWidth}×{videoNaturalHeight}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('extract')}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'extract'
                  ? 'border-sky-400 bg-sky-500/20 text-sky-100 shadow-sm shadow-sky-500/25'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              Выделение момента
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('crop')}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'crop'
                  ? 'border-sky-400 bg-sky-500/20 text-sky-100 shadow-sm shadow-sky-500/25'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              Кадрирование
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('adjustments')}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'adjustments'
                  ? 'border-sky-400 bg-sky-500/20 text-sky-100 shadow-sm shadow-sky-500/25'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              Цветокоррекция
            </button>
          </div>

          {activeTab === 'extract' && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-white/40">Выберите момент для извлечения кадра</span>
              <span className="text-xs text-white/60 font-mono">{formatTime(duration)}</span>
            </div>
            
            <div
              ref={timelineRef}
              className="relative h-10 bg-slate-700 rounded-full cursor-pointer"
              onClick={handleTimelineClick}
            >
              {/* Progress background */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-sky-400/40 rounded-l-full"
                style={{ width: `${timePercent}%` }}
              />
              
              {/* Handle */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-sky-400 rounded border-2 border-white cursor-ew-resize hover:bg-sky-300 transition-colors shadow-lg"
                style={{ left: `calc(${timePercent}% - 8px)` }}
                onMouseDown={handleDragStart}
              >
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs">
                  ‖
                </div>
              </div>
            </div>
            
            <div className="mt-2 flex justify-between text-xs text-white/40">
              <span>0:00</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          )}

          {activeTab === 'crop' && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <span className="mb-4 block text-xs uppercase tracking-wide text-white/40">КАДРИРОВАНИЕ ВИДЕО</span>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wide text-white/40">Ширина</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    min="50"
                    max={videoNaturalWidth}
                    value={cropWidthInput}
                    onChange={handleCropWidthChange}
                    onBlur={handleCropWidthBlur}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wide text-white/40">Высота</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    min="50"
                    max={videoNaturalHeight}
                    value={cropHeightInput}
                    onChange={handleCropHeightChange}
                    onBlur={handleCropHeightBlur}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wide text-white/40">Пресет</span>
                  <select
                    value={cropPreset}
                    onChange={(e) => handleCropPresetChange(e.target.value)}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40"
                  >
                    <option value="free">free</option>
                    <option value="original">original</option>
                    <option value="16:9">16:9</option>
                    <option value="4:3">4:3</option>
                    <option value="1:1">1:1</option>
                  </select>
                </label>
              </div>
              <p className="sm:col-span-3 mt-3 text-xs leading-relaxed text-white/40">
                Значения ограничены размерами оригинала. Масштаб определяет, сколько изображения попадёт в кадр.
              </p>
            </div>
          )}

          {activeTab === 'adjustments' && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-white/40">ЦВЕТОКОРРЕКЦИЯ КАДРА</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(Object.keys(ADJUSTMENT_LABELS) as Array<keyof VideoColorAdjustments>).map((key) => {
                  const limits = ADJUSTMENT_LIMITS[key];
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/40">
                        <span>{ADJUSTMENT_LABELS[key]}</span>
                        <span className="text-white/70">{adjustments[key]}</span>
                      </div>
                      <input
                        type="range"
                        min={limits.min}
                        max={limits.max}
                        step={limits.step}
                        value={adjustments[key]}
                        onChange={(e) => handleAdjustmentChange(key, parseFloat(e.target.value))}
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-sky-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            disabled={isExtracting}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleExtract}
            disabled={isExtracting || !duration}
            className="rounded-lg bg-sky-500/80 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50"
          >
            {isExtracting ? 'Извлечение…' : 'Извлечь кадр'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
