import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type VideoColorAdjustments, DEFAULT_ADJUSTMENTS,
  clampCropPosition, getDisplayedVideoDimensions,
  buildVideoFilter, formatTime, computeCropFrameStyle,
} from './components/videoUtils';
import { VideoCropControls } from './components/VideoCropControls';
import { VideoAdjustments } from './components/VideoAdjustments';

interface VideoFrameExtractModalProps {
  videoUrl: string;
  videoNodeId: string;
  projectId: string;
  onClose: () => void;
  onExtract: (timeSeconds: number, cropParams?: { x: number; y: number; width: number; height: number }) => Promise<void>;
}

type VideoFrameTab = 'extract' | 'crop' | 'adjustments';

export function VideoFrameExtractModal({ videoUrl, videoNodeId, projectId, onClose, onExtract }: VideoFrameExtractModalProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<VideoFrameTab>('extract');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [adjustments, setAdjustments] = useState<VideoColorAdjustments>(DEFAULT_ADJUSTMENTS);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(400);
  const [cropHeight, setCropHeight] = useState(300);
  const [videoNaturalWidth, setVideoNaturalWidth] = useState(1920);
  const [videoNaturalHeight, setVideoNaturalHeight] = useState(1080);
  const [cropWidthInput, setCropWidthInput] = useState('400');
  const [cropHeightInput, setCropHeightInput] = useState('300');
  const [cropPreset, setCropPreset] = useState('free');

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const cropDragStateRef = useRef<{ startX: number; startY: number; startCropX: number; startCropY: number } | null>(null);

  const cropFrameStyle = useMemo(() => computeCropFrameStyle(
    videoContainerRef.current, videoRef.current, cropX, cropY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight,
  ), [cropX, cropY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => {
      setDuration(video.duration); setCurrentTime(0); video.currentTime = 0;
      const vw = video.videoWidth || 1920, vh = video.videoHeight || 1080;
      setVideoNaturalWidth(vw); setVideoNaturalHeight(vh);
      const iw = Math.min(400, vw * 0.8), ih = Math.min(300, vh * 0.8);
      setCropX(0); setCropY(0); setCropWidth(iw); setCropHeight(ih);
      setCropWidthInput(iw.toString()); setCropHeightInput(ih.toString());
    };
    const onTime = () => setCurrentTime(video.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener('loadedmetadata', onMeta); video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay); video.addEventListener('pause', onPause); video.addEventListener('ended', onPause);
    return () => { video.removeEventListener('loadedmetadata', onMeta); video.removeEventListener('timeupdate', onTime); video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause); video.removeEventListener('ended', onPause); };
  }, []);

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    isPlaying ? v.pause() : v.play();
  }, [isPlaying]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const time = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    setCurrentTime(time); if (videoRef.current) videoRef.current.currentTime = time;
  }, [duration]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const time = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
      setCurrentTime(time); if (videoRef.current) videoRef.current.currentTime = time;
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [dragging, duration]);

  const handleAdjustmentChange = useCallback((key: keyof VideoColorAdjustments, value: number) => { setAdjustments((p) => ({ ...p, [key]: value })); }, []);
  const handleCropWidthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setCropWidthInput(e.target.value), []);
  const handleCropHeightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setCropHeightInput(e.target.value), []);
  const handleCropWidthBlur = useCallback(() => {
    const nv = Math.max(50, Math.min(parseInt(cropWidthInput) || cropWidth, videoNaturalWidth));
    setCropWidth(nv); setCropWidthInput(nv.toString()); setCropX((px) => Math.max(0, Math.min(px, videoNaturalWidth - nv)));
  }, [cropWidthInput, cropWidth, videoNaturalWidth]);
  const handleCropHeightBlur = useCallback(() => {
    const nv = Math.max(50, Math.min(parseInt(cropHeightInput) || cropHeight, videoNaturalHeight));
    setCropHeight(nv); setCropHeightInput(nv.toString()); setCropY((py) => Math.max(0, Math.min(py, videoNaturalHeight - nv)));
  }, [cropHeightInput, cropHeight, videoNaturalHeight]);

  const handleCropPresetChange = useCallback((preset: string) => {
    setCropPreset(preset);
    if (preset === 'original') { setCropWidth(videoNaturalWidth); setCropHeight(videoNaturalHeight); setCropX(0); setCropY(0); setCropWidthInput(videoNaturalWidth.toString()); setCropHeightInput(videoNaturalHeight.toString()); }
    else if (preset !== 'free') {
      const [w, h] = preset.split(':').map(Number); if (!w || !h) return;
      const ratio = w / h; let nw = videoNaturalWidth, nh = nw / ratio;
      if (nh > videoNaturalHeight) { nh = videoNaturalHeight; nw = nh * ratio; }
      nw = Math.round(nw); nh = Math.round(nh);
      setCropWidth(nw); setCropHeight(nh); setCropX(Math.round((videoNaturalWidth - nw) / 2)); setCropY(Math.round((videoNaturalHeight - nh) / 2));
      setCropWidthInput(nw.toString()); setCropHeightInput(nh.toString());
    }
  }, [videoNaturalWidth, videoNaturalHeight]);

  const handleCropPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); e.preventDefault();
    cropDragStateRef.current = { startX: e.clientX, startY: e.clientY, startCropX: cropX, startCropY: cropY };
  }, [cropX, cropY]);

  const handleCropPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropDragStateRef.current || !videoContainerRef.current) return;
    e.stopPropagation(); e.preventDefault();
    const { startX, startY, startCropX, startCropY } = cropDragStateRef.current;
    const rect = videoContainerRef.current.getBoundingClientRect();
    const { width: dw, height: dh } = getDisplayedVideoDimensions(videoRef.current, rect.width, rect.height);
    const dx = (e.clientX - startX) * (videoNaturalWidth / dw), dy = (e.clientY - startY) * (videoNaturalHeight / dh);
    const clamped = clampCropPosition(startCropX + dx, startCropY + dy, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight);
    setCropX(clamped.x); setCropY(clamped.y);
  }, [cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight]);

  const handleCropPointerUp = useCallback(() => { cropDragStateRef.current = null; }, []);

  const handleCropWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (activeTab !== 'crop') return; e.stopPropagation();
    const ratio = cropWidth / cropHeight, delta = e.deltaY > 0 ? -20 : 20;
    let nw = Math.max(50, Math.min(cropWidth + delta, videoNaturalWidth)), nh = nw / ratio;
    if (nh > videoNaturalHeight) { nh = videoNaturalHeight; nw = nh * ratio; }
    if (nh < 50) { nh = 50; nw = nh * ratio; }
    const nx = Math.max(0, Math.min(cropX - (nw - cropWidth) / 2, videoNaturalWidth - nw));
    const ny = Math.max(0, Math.min(cropY - (nh - cropHeight) / 2, videoNaturalHeight - nh));
    setCropX(nx); setCropY(ny); setCropWidth(nw); setCropHeight(nh);
    setCropWidthInput(Math.round(nw).toString()); setCropHeightInput(Math.round(nh).toString());
  }, [activeTab, cropX, cropY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight]);

  const handleExtract = useCallback(async () => {
    try {
      setIsExtracting(true); setError(null);
      const isCropped = cropX !== 0 || cropY !== 0 || cropWidth !== videoNaturalWidth || cropHeight !== videoNaturalHeight;
      const cropParams = isCropped ? { x: Math.round(cropX), y: Math.round(cropY), width: Math.round(cropWidth), height: Math.round(cropHeight) } : undefined;
      await onExtract(currentTime, cropParams); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to extract frame'); }
    finally { setIsExtracting(false); }
  }, [currentTime, cropX, cropY, cropWidth, cropHeight, videoNaturalWidth, videoNaturalHeight, onExtract, onClose]);

  const timePercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const tabCls = (active: boolean) => `rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? 'border-sky-400 bg-sky-500/20 text-sky-100 shadow-sm shadow-sky-500/25' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'}`;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-slate-900/95 to-slate-950/95 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8">
          <h2 className="text-lg font-semibold text-white">Extract Frame from video</h2>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/70 transition hover:bg-white/10" aria-label="Close">✕</button>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          <div className="mx-auto w-full" style={{ maxWidth: '800px' }}>
            <div ref={videoContainerRef} className="relative mx-auto overflow-hidden rounded-3xl border border-white/15 bg-slate-950/70 shadow-lg shadow-slate-950/40" style={{ height: '450px' }}>
              <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" muted playsInline preload="metadata" style={{ filter: buildVideoFilter(adjustments) }} />
              {activeTab === 'crop' && (
                <div role="presentation" className="absolute border-2 border-sky-400/80 cursor-move" style={cropFrameStyle}
                  onPointerDown={handleCropPointerDown} onPointerMove={handleCropPointerMove} onPointerUp={handleCropPointerUp} onPointerLeave={handleCropPointerUp} onWheel={handleCropWheel} />
              )}
              <button type="button" onClick={togglePlayPause} className="absolute bottom-4 left-4 w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors z-10">
                <span className="text-white text-2xl">{isPlaying ? '\u23F8' : '\u25B6'}</span>
              </button>
            </div>
          </div>
          <div className="w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/80">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="flex flex-col gap-1"><span className="text-white/40">Current time</span><span className="text-white/70 font-mono">{formatTime(currentTime)}</span></div>
              <div className="flex flex-col gap-1"><span className="text-white/40">Video duration</span><span className="text-white/70 font-mono">{formatTime(duration)}</span></div>
              <div className="flex flex-col gap-1"><span className="text-white/40">Resolution</span><span className="text-white/70 font-mono">{videoNaturalWidth}x{videoNaturalHeight}</span></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setActiveTab('extract')} className={tabCls(activeTab === 'extract')}>Select moment</button>
            <button type="button" onClick={() => setActiveTab('crop')} className={tabCls(activeTab === 'crop')}>Framing</button>
            <button type="button" onClick={() => setActiveTab('adjustments')} className={tabCls(activeTab === 'adjustments')}>Color Correction</button>
          </div>
          {activeTab === 'extract' && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-white/40">Select a moment to extract a frame</span>
                <span className="text-xs text-white/60 font-mono">{formatTime(duration)}</span>
              </div>
              <div ref={timelineRef} className="relative h-10 bg-slate-700 rounded-full cursor-pointer" onClick={handleTimelineClick}>
                <div className="absolute top-0 bottom-0 left-0 bg-sky-400/40 rounded-l-full" style={{ width: `${timePercent}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-sky-400 rounded border-2 border-white cursor-ew-resize hover:bg-sky-300 transition-colors shadow-lg"
                  style={{ left: `calc(${timePercent}% - 8px)` }} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs">{'\u2016'}</div>
                </div>
              </div>
              <div className="mt-2 flex justify-between text-xs text-white/40"><span>0:00</span><span>{formatTime(duration)}</span></div>
            </div>
          )}
          {activeTab === 'crop' && (
            <VideoCropControls cropWidthInput={cropWidthInput} cropHeightInput={cropHeightInput} cropPreset={cropPreset}
              videoNaturalWidth={videoNaturalWidth} videoNaturalHeight={videoNaturalHeight}
              onCropWidthChange={handleCropWidthChange} onCropHeightChange={handleCropHeightChange}
              onCropWidthBlur={handleCropWidthBlur} onCropHeightBlur={handleCropHeightBlur} onCropPresetChange={handleCropPresetChange} />
          )}
          {activeTab === 'adjustments' && <VideoAdjustments adjustments={adjustments} onAdjustmentChange={handleAdjustmentChange} />}
          {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
          <button type="button" onClick={onClose} disabled={isExtracting} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleExtract} disabled={isExtracting || !duration} className="rounded-lg bg-sky-500/80 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50">{isExtracting ? 'Extracting...' : 'Extract Frame'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
