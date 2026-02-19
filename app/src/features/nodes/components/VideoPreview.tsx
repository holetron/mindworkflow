import { useEffect, useMemo, useRef, useState } from 'react';
// Using react-player lazy variant to support YouTube/Vimeo/HLS playback without shipping heavy players in the main bundle.
import ReactPlayer from 'react-player/lazy';

type VideoSource =
  | {
      kind: 'data';
      src: string;
      name?: string | null;
    }
  | {
      kind: 'url';
      src: string;
      name?: string | null;
    };

export interface VideoPreviewProps {
  source?: VideoSource | null;
  controls?: boolean;
  scale?: number;
  className?: string;
  onRetry?: () => void;
  onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
}

const BASE_HEIGHT = 220;
const MIN_HEIGHT = 140;
const FALLBACK_ASPECT = 16 / 9;

const canReactPlayerHandle = (url: string): boolean => {
  if (!url) {
    return false;
  }
  const maybeCanPlay = (ReactPlayer as unknown as { canPlay?: (value: string) => boolean })?.canPlay;
  return typeof maybeCanPlay === 'function' ? maybeCanPlay(url) : false;
};

export function VideoPreview({
  source,
  controls = true,
  scale = 1,
  className,
  onRetry,
  onDimensionsChange,
}: VideoPreviewProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(source ? 'loading' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (source?.src) {
      setStatus('loading');
      setErrorMessage(null);
      setRenderKey((value) => value + 1);
      lastDimensionsRef.current = null;
    } else {
      setStatus('idle');
      setErrorMessage(null);
      lastDimensionsRef.current = null;
    }
  }, [source?.src]);

  const computedHeight = useMemo(() => {
    const value = Math.max(MIN_HEIGHT, Math.round(BASE_HEIGHT * scale));
    return Number.isFinite(value) ? value : MIN_HEIGHT;
  }, [scale]);

  const showExternalButton = Boolean(source?.src);

  const handleRetry = () => {
    setStatus('loading');
    setErrorMessage(null);
    setRenderKey((value) => value + 1);
    onRetry?.();
  };

  const handleError = (error: unknown) => {
    console.warn('Video preview error', error);
    setStatus('error');
    setErrorMessage(
      error instanceof Error && error.message
        ? error.message
        : 'Не удалось воспроизвести видео. Попробуйте открыть в новой вкладке.',
    );
  };

  const useReactPlayer = useMemo(
    () => (source?.kind === 'url' && source.src ? canReactPlayerHandle(source.src) : false),
    [source],
  );
  const emitDimensions = (width: number, height: number) => {
    if (!onDimensionsChange) {
      return;
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }
    const prev = lastDimensionsRef.current;
    if (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) {
      return;
    }
    lastDimensionsRef.current = { width, height };
    onDimensionsChange({ width, height });
  };

  return (
    <div
      ref={containerRef}
      className={`relative border border-white/10 rounded bg-black/30 overflow-hidden ${className ?? ''}`}
      style={{
        height: `${computedHeight}px`,
        minHeight: `${MIN_HEIGHT}px`,
      }}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 text-white/70 text-xs">
          <span className="animate-pulse">Загрузка видео...</span>
        </div>
      )}

      {source && status !== 'error' ? (
        useReactPlayer ? (
          <ReactPlayer
            key={renderKey}
            url={source.src}
            controls={controls}
            width="100%"
            height="100%"
            onReady={() => {
              setStatus('ready');
              const containerWidth = containerRef.current?.clientWidth;
              if (containerWidth) {
                emitDimensions(containerWidth, containerWidth / FALLBACK_ASPECT);
              }
            }}
            onStart={() => setStatus('ready')}
            onBuffer={() => setStatus('loading')}
            onError={handleError}
            style={{
              backgroundColor: 'rgba(0,0,0,0.4)',
            }}
            config={{
              file: {
                attributes: {
                  controlsList: controls ? undefined : 'nodownload',
                },
              },
            }}
          />
        ) : (
          <video
            key={renderKey}
            src={source.src}
            controls={controls}
            className="h-full w-full object-contain bg-black/40"
            preload="metadata"
            onLoadedData={(event) => {
              setStatus('ready');
              const videoElement = event.currentTarget;
              const intrinsicWidth = videoElement.videoWidth;
              const intrinsicHeight = videoElement.videoHeight;
              if (intrinsicWidth && intrinsicHeight) {
                emitDimensions(intrinsicWidth, intrinsicHeight);
              } else {
                const fallbackWidth = containerRef.current?.clientWidth;
                if (fallbackWidth) {
                  emitDimensions(fallbackWidth, fallbackWidth / FALLBACK_ASPECT);
                }
              }
            }}
            onError={(event) => handleError((event.currentTarget?.error as Error) ?? event)}
          >
            Ваш браузер не поддерживает видео.
          </video>
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/60">
          <span>Добавьте ссылку или загрузите файл, чтобы увидеть предпросмотр.</span>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 px-4 text-center">
          <div className="space-y-1 text-white">
            <p className="text-sm font-medium">Предпросмотр недоступен</p>
            {errorMessage && <p className="text-xs text-white/70">{errorMessage}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleRetry}
              className="rounded border border-white/30 bg-white/10 px-3 py-1 hover:bg-white/20 transition"
            >
              Повторить
            </button>
            {source?.src && (
              <a
                href={source.src}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-white/20 bg-black/40 px-3 py-1 text-white/80 hover:bg-black/30 transition"
              >
                Открыть в новой вкладке
              </a>
            )}
          </div>
        </div>
      )}

      {showExternalButton && status === 'ready' && (
        <div className="absolute top-2 right-2 z-20 flex gap-2 text-xs">
          <a
            href={source?.src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-white/20 bg-black/70 px-2 py-1 text-white/80 hover:bg-black/50 transition"
            title="Открыть видео в новой вкладке"
          >
            ↗ Открыть
          </a>
        </div>
      )}
    </div>
  );
}
