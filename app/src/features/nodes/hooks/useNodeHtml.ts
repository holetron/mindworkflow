import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureHtmlScreenshot, fetchHtmlMetadata } from '../../../state/api';
import type { FlowNode } from '../../../state/api';

const SCREEN_WIDTHS = [
  { id: 'mobile', name: 'Mobile', width: '375px' },
  { id: 'tablet', name: 'Tablet', width: '768px' },
  { id: 'laptop', name: 'Laptop', width: '1024px' },
  { id: 'desktop', name: 'Desktop', width: '1440px' },
  { id: 'wide', name: 'Wide', width: '1920px' },
];

interface UseNodeHtmlOptions {
  node: FlowNode;
  disabled: boolean;
  nodeWidth: number;
  nodeHeight: number;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  autoRenameFromTitle: (title: string | undefined | null) => void;
}

export function useNodeHtml({
  node,
  disabled,
  nodeWidth,
  nodeHeight,
  onChangeMeta,
  autoRenameFromTitle,
}: UseNodeHtmlOptions) {
  const initialHtmlUrl = typeof node.meta?.htmlUrl === 'string' ? node.meta.htmlUrl : '';
  const initialScreenshot = typeof node.meta?.htmlScreenshot === 'string' ? node.meta.htmlScreenshot : null;

  const [htmlUrl, setHtmlUrl] = useState<string>(initialHtmlUrl);
  const [htmlUrlInput, setHtmlUrlInput] = useState<string>(initialHtmlUrl);
  const [htmlScreenshot, setHtmlScreenshot] = useState<string | null>(initialScreenshot);
  const [showLivePreview, setShowLivePreview] = useState<boolean>(() => !initialScreenshot);
  const [isHtmlLoading, setIsHtmlLoading] = useState(false);
  const [isScreenshotCapturing, setIsScreenshotCapturing] = useState(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);
  const [screenWidth, setScreenWidth] = useState<string>((node.meta?.screenWidth as string) || 'desktop');
  const [htmlViewportWidth, setHtmlViewportWidth] = useState<number>((node.meta?.htmlViewportWidth as number) || 1024);
  const [htmlOutputType, setHtmlOutputType] = useState<'link' | 'image' | 'code'>(
    (node.meta?.htmlOutputType as 'link' | 'image' | 'code') || 'link',
  );
  const [showHtmlSettingsModal, setShowHtmlSettingsModal] = useState(false);

  const htmlPreviewRef = useRef<HTMLDivElement | null>(null);
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Sync effects
  useEffect(() => {
    const metaUrl = typeof node.meta?.htmlUrl === 'string' ? node.meta.htmlUrl : '';
    setHtmlUrl((prev) => (prev === metaUrl ? prev : metaUrl));
    setHtmlUrlInput((prev) => (prev === metaUrl ? prev : metaUrl));
  }, [node.meta?.htmlUrl]);

  useEffect(() => {
    const metaScreenshot = typeof node.meta?.htmlScreenshot === 'string' ? node.meta.htmlScreenshot : null;
    setHtmlScreenshot((prev) => {
      if (prev === metaScreenshot) return prev;
      if (metaScreenshot) setShowLivePreview(false);
      else setShowLivePreview(true);
      return metaScreenshot;
    });
  }, [node.meta?.htmlScreenshot]);

  useEffect(() => {
    const metaOutput = node.meta?.htmlOutputType;
    if (metaOutput === 'link' || metaOutput === 'image' || metaOutput === 'code') {
      setHtmlOutputType((prev) => (prev === metaOutput ? prev : metaOutput));
    } else {
      setHtmlOutputType((prev) => (prev === 'link' ? prev : 'link'));
    }
  }, [node.meta?.htmlOutputType]);

  const handleHtmlUrlChange = useCallback((url: string) => {
    if (disabled) return;
    setHtmlUrlInput(url);
  }, [disabled]);

  const commitHtmlUrl = useCallback(
    async (candidate?: string) => {
      if (disabled) return;
      const raw = typeof candidate === 'string' ? candidate : htmlUrlInput;
      const nextUrl = raw.trim();
      if (!nextUrl) { setHtmlError('Enter page URL'); return; }
      setHtmlError(null);
      setHtmlUrlInput(nextUrl);
      setHtmlUrl((prev) => (prev === nextUrl ? prev : nextUrl));
      setShowLivePreview(true);
      onChangeMeta(node.node_id, { htmlUrl: nextUrl });
      setIsHtmlLoading(true);
      try {
        const metadata = await fetchHtmlMetadata(nextUrl);
        if (metadata?.finalUrl && metadata.finalUrl !== nextUrl) {
          setHtmlUrl(metadata.finalUrl);
          setHtmlUrlInput(metadata.finalUrl);
          onChangeMeta(node.node_id, { htmlUrl: metadata.finalUrl });
        }
        if (metadata?.title) autoRenameFromTitle(metadata.title);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setHtmlError(message || 'Failed to load page');
      } finally {
        setIsHtmlLoading(false);
      }
    },
    [autoRenameFromTitle, disabled, htmlUrlInput, node.node_id, onChangeMeta],
  );

  const handleScreenWidthChange = useCallback(
    (width: string) => {
      if (disabled) return;
      setScreenWidth(width);
      const updates: Record<string, unknown> = { screenWidth: width };
      const preset = SCREEN_WIDTHS.find((item) => item.id === width);
      if (preset) {
        const numericWidth = Number.parseInt(preset.width, 10);
        if (!Number.isNaN(numericWidth)) {
          setHtmlViewportWidth(numericWidth);
          updates.htmlViewportWidth = numericWidth;
        }
      }
      onChangeMeta(node.node_id, updates);
    },
    [disabled, node.node_id, onChangeMeta],
  );

  const handleHtmlViewportWidthChange = useCallback(
    (width: number) => {
      if (disabled) return;
      const safeWidth = Number.isFinite(width) ? Math.max(320, Math.min(Math.round(width), 3840)) : 1024;
      setHtmlViewportWidth(safeWidth);
      onChangeMeta(node.node_id, { htmlViewportWidth: safeWidth });
    },
    [disabled, node.node_id, onChangeMeta],
  );

  const handleHtmlOutputTypeChange = useCallback(
    (value: 'link' | 'image' | 'code') => {
      if (disabled) return;
      setHtmlOutputType(value);
      onChangeMeta(node.node_id, { htmlOutputType: value });
    },
    [disabled, node.node_id, onChangeMeta],
  );

  const handleHtmlRefresh = useCallback(() => {
    if (disabled) return;
    void commitHtmlUrl(htmlUrlInput);
  }, [commitHtmlUrl, disabled, htmlUrlInput]);

  const handleTogglePreviewMode = useCallback(() => {
    if (!htmlScreenshot) { setShowLivePreview(true); return; }
    setShowLivePreview((prev) => !prev);
  }, [htmlScreenshot]);

  const handleCaptureScreenshot = useCallback(async () => {
    if (disabled || isScreenshotCapturing) return;
    let targetUrl = htmlUrl.trim();
    const candidate = htmlUrlInput.trim();
    if (!targetUrl && candidate) { await commitHtmlUrl(candidate); targetUrl = candidate; }
    else if (candidate && candidate !== targetUrl) { await commitHtmlUrl(candidate); targetUrl = candidate; }
    if (!targetUrl) { setHtmlError('Enter page URL first'); return; }
    setHtmlError(null);
    setIsScreenshotCapturing(true);
    try {
      const rect = htmlPreviewRef.current?.getBoundingClientRect();
      const baseWidth = rect?.width ?? htmlViewportWidth ?? nodeWidth ?? 1024;
      const baseHeight = rect?.height ?? nodeHeight ?? 600;
      const viewportWidth = Math.max(320, Math.min(Math.round(baseWidth), 3840));
      const viewportHeight = Math.max(240, Math.min(Math.round(baseHeight), 2160));
      const response = await captureHtmlScreenshot({ url: targetUrl, viewportWidth, viewportHeight, clipHeight: viewportHeight });
      if (response?.finalUrl && response.finalUrl !== targetUrl) {
        setHtmlUrl(response.finalUrl);
        setHtmlUrlInput(response.finalUrl);
        onChangeMeta(node.node_id, { htmlUrl: response.finalUrl });
      }
      if (response?.title) autoRenameFromTitle(response.title);
      if (response?.screenshot) {
        setHtmlScreenshot(response.screenshot);
        onChangeMeta(node.node_id, { htmlScreenshot: response.screenshot, htmlScreenshotCapturedAt: new Date().toISOString() });
        setShowLivePreview(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHtmlError(message || 'Failed to capture screenshot');
    } finally {
      setIsScreenshotCapturing(false);
    }
  }, [autoRenameFromTitle, commitHtmlUrl, disabled, htmlUrl, htmlUrlInput, htmlViewportWidth, isScreenshotCapturing, node.node_id, nodeHeight, nodeWidth, onChangeMeta]);

  const handleOpenHtmlUrl = useCallback(() => {
    const target = htmlUrl.trim() || htmlUrlInput.trim();
    if (!target) return;
    try { window.open(target, '_blank', 'noopener'); } catch { /* ignore */ }
  }, [htmlUrl, htmlUrlInput]);

  const handleCopyHtmlUrl = useCallback(async () => {
    const target = htmlUrl.trim() || htmlUrlInput.trim();
    if (!target || !navigator?.clipboard) return;
    try { await navigator.clipboard.writeText(target); } catch { /* ignore */ }
  }, [htmlUrl, htmlUrlInput]);

  const handleOpenHtmlScreenshot = useCallback(() => {
    if (!htmlScreenshot) return;
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`<img src="${htmlScreenshot}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`);
      newWindow.document.title = node.title || 'HTML screenshot';
    }
  }, [htmlScreenshot, node.title]);

  const handleDownloadHtmlScreenshot = useCallback(() => {
    if (!htmlScreenshot) return;
    const link = document.createElement('a');
    link.href = htmlScreenshot;
    const baseTitle = (node.title || htmlUrl || 'html-page').replace(/\s+/g, '_');
    link.download = `${baseTitle}-screenshot.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [htmlScreenshot, htmlUrl, node.title]);

  const screenshotCapturedAt = useMemo(
    () => (typeof node.meta?.htmlScreenshotCapturedAt === 'string' ? node.meta.htmlScreenshotCapturedAt : null),
    [node.meta?.htmlScreenshotCapturedAt],
  );

  const capturedAtLabel = useMemo(
    () => (screenshotCapturedAt ? new Date(screenshotCapturedAt).toLocaleString('en-US') : '\u2014'),
    [screenshotCapturedAt],
  );

  const displayHtmlUrl = useMemo(() => {
    const trimmedInput = htmlUrlInput.trim();
    const trimmedSaved = htmlUrl.trim();
    return trimmedInput || trimmedSaved || 'URL not specified';
  }, [htmlUrl, htmlUrlInput]);

  const handleIframeLoad = useCallback(() => {
    setIsHtmlLoading(false);
    try {
      const title = htmlIframeRef.current?.contentDocument?.title;
      if (title) autoRenameFromTitle(title);
    } catch { /* Ignore cross-origin */ }
  }, [autoRenameFromTitle]);

  return {
    htmlUrl,
    htmlUrlInput,
    htmlScreenshot,
    showLivePreview,
    setShowLivePreview,
    isHtmlLoading,
    isScreenshotCapturing,
    htmlError,
    screenWidth,
    htmlViewportWidth,
    htmlOutputType,
    showHtmlSettingsModal,
    setShowHtmlSettingsModal,
    htmlPreviewRef,
    htmlIframeRef,
    handleHtmlUrlChange,
    commitHtmlUrl,
    handleScreenWidthChange,
    handleHtmlViewportWidthChange,
    handleHtmlOutputTypeChange,
    handleHtmlRefresh,
    handleTogglePreviewMode,
    handleCaptureScreenshot,
    handleOpenHtmlUrl,
    handleCopyHtmlUrl,
    handleOpenHtmlScreenshot,
    handleDownloadHtmlScreenshot,
    capturedAtLabel,
    displayHtmlUrl,
    handleIframeLoad,
  };
}
