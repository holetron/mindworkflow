import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowNode, NodeUI, CreateNodePayload } from '../../../state/api';
import { createEdge, createNode } from '../../../state/api';
import type { VideoCropSettings } from '../VideoCropModal';
import {
  NODE_DEFAULT_COLOR,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
} from '../../../constants/nodeDefaults';
import { normalizeNodeWidth } from '../../../constants/nodeDefaults';
import {
  MIN_CONTENT_WIDTH,
  MAX_CONTENT_WIDTH,
  MIN_CONTENT_HEIGHT,
  MAX_CONTENT_HEIGHT,
  calculateNodeHeight,
} from '../../../constants/nodeSizes';
import {
  VIDEO_SCALE_OPTIONS,
  VIDEO_NOTES_MIN_HEIGHT,
  VIDEO_NOTES_VERTICAL_EXTRA,
  VIDEO_EXTRA_MIN_HEIGHT,
  DEFAULT_VIDEO_ASPECT,
} from '../components/nodeConstants';
import { NODE_MIN_HEIGHT } from '../../../constants/nodeDefaults';
import { useProjectStore } from '../../../state/store';
import { useReactFlow } from 'reactflow';

interface UseNodeVideoOptions {
  node: FlowNode;
  disabled: boolean;
  projectId: string | null;
  nodeWidth: number;
  nodeHeight: number;
  reactFlowWidth: number | string | undefined;
  reactFlowHeight: number | string | undefined;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onChangeUi?: (nodeId: string, patch: Partial<NodeUI>) => void;
  autoRenameFromSource: (source: string | undefined | null) => void;
}

export function useNodeVideo({
  node,
  disabled,
  projectId,
  nodeWidth,
  nodeHeight,
  reactFlowWidth,
  reactFlowHeight,
  onChangeMeta,
  onChangeUi,
  autoRenameFromSource,
}: UseNodeVideoOptions) {
  const reactFlow = useReactFlow();
  const addNodeFromServer = useProjectStore((state) => state.addNodeFromServer);
  const setEdges = useProjectStore((state) => state.setEdges);

  const nodeMeta = (node.meta ?? {}) as Record<string, unknown>;

  // Video source
  const videoUrlValue = typeof nodeMeta.video_url === 'string' ? nodeMeta.video_url : '';
  const rawVideoUrl = videoUrlValue.trim();
  const rawVideoData = typeof nodeMeta.video_data === 'string' ? nodeMeta.video_data : '';
  const videoFileName = typeof nodeMeta.video_file === 'string' ? nodeMeta.video_file : null;
  const videoFileType = typeof nodeMeta.file_type === 'string' ? nodeMeta.file_type : null;

  const videoScale = useMemo(() => {
    const numeric = Number(nodeMeta.video_scale);
    if (!Number.isFinite(numeric) || numeric <= 0) return 1;
    const matched = VIDEO_SCALE_OPTIONS.find((v) => Math.abs(v - numeric) < 0.001) ?? null;
    return matched ?? 1;
  }, [nodeMeta.video_scale]);

  const videoControlsEnabled = nodeMeta.controls !== false;
  const videoDisplayMode: 'url' | 'upload' = nodeMeta.display_mode === 'upload' ? 'upload' : 'url';

  const videoSource = useMemo(() => {
    if (rawVideoData) return { kind: 'data' as const, src: rawVideoData, name: videoFileName };
    if (rawVideoUrl) return { kind: 'url' as const, src: rawVideoUrl, name: videoFileName };
    return null;
  }, [rawVideoData, rawVideoUrl, videoFileName]);

  // Notes
  const [videoNotes, setVideoNotes] = useState<string>(
    () => (typeof nodeMeta.short_description === 'string' ? String(nodeMeta.short_description) : ''),
  );
  useEffect(() => {
    const nextValue = typeof nodeMeta.short_description === 'string' ? String(nodeMeta.short_description) : '';
    setVideoNotes(nextValue);
  }, [nodeMeta.short_description]);

  const handleVideoNotesChange = useCallback(
    (value: string) => {
      setVideoNotes(value);
      onChangeMeta(node.node_id, { short_description: value });
    },
    [node.node_id, onChangeMeta],
  );

  // File info
  const videoFileSize = typeof nodeMeta.file_size === 'number' ? Number(nodeMeta.file_size) : null;
  const formattedVideoFileSize = useMemo(
    () => (videoFileSize !== null ? `${(videoFileSize / 1024 / 1024).toFixed(1)} MB` : null),
    [videoFileSize],
  );
  const videoSourceName = useMemo(() => {
    if (videoFileName) return videoFileName;
    if (rawVideoUrl) {
      try {
        const parsed = new URL(rawVideoUrl, typeof window !== 'undefined' ? window.location.origin : 'http://local');
        const segment = parsed.pathname.split('/').filter(Boolean).pop();
        return segment ? decodeURIComponent(segment) : parsed.hostname;
      } catch {
        const fallback = rawVideoUrl.split('/').filter(Boolean).pop();
        return decodeURIComponent(fallback ?? rawVideoUrl);
      }
    }
    return '';
  }, [videoFileName, rawVideoUrl]);

  // Display dimensions
  const videoDisplayWidthMeta = typeof nodeMeta.video_display_width === 'number' ? Number(nodeMeta.video_display_width) : null;
  const videoDisplayHeightMeta = typeof nodeMeta.video_display_height === 'number' ? Number(nodeMeta.video_display_height) : null;

  // Crop/Trim state
  const [isVideoCropModalOpen, setIsVideoCropModalOpen] = useState(false);
  const [isPreparingVideoCrop, setIsPreparingVideoCrop] = useState(false);
  const [showVideoFrameExtractModal, setShowVideoFrameExtractModal] = useState(false);
  const [showVideoTrimModal, setShowVideoTrimModal] = useState(false);
  const [videoCropModalData, setVideoCropModalData] = useState<{
    videoPath: string;
    source?: string;
    videoWidth: number;
    videoHeight: number;
    settings: VideoCropSettings | null;
  } | null>(null);
  const [lastVideoCropSettings, setLastVideoCropSettings] = useState<VideoCropSettings | null>(
    () => (node.meta?.video_crop_settings as VideoCropSettings | null) ?? null,
  );
  const [videoPreviewReloadToken, setVideoPreviewReloadToken] = useState(0);
  const handleVideoRetry = useCallback(() => setVideoPreviewReloadToken((v) => v + 1), []);

  // Dimension handler
  const handleVideoDimensions = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      if (node.type !== 'video') return;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      const aspectRatio = width / height || DEFAULT_VIDEO_ASPECT;
      let contentWidth = MIN_CONTENT_WIDTH;
      let contentHeight = contentWidth / aspectRatio;
      if (contentHeight > MAX_CONTENT_HEIGHT) { contentHeight = MAX_CONTENT_HEIGHT; contentWidth = Math.max(MIN_CONTENT_WIDTH, Math.min(MAX_CONTENT_WIDTH, contentHeight * aspectRatio)); }
      if (contentWidth > MAX_CONTENT_WIDTH) { contentWidth = MAX_CONTENT_WIDTH; contentHeight = contentWidth / aspectRatio; }
      if (contentHeight < MIN_CONTENT_HEIGHT) { contentHeight = MIN_CONTENT_HEIGHT; contentWidth = Math.max(MIN_CONTENT_WIDTH, Math.min(MAX_CONTENT_WIDTH, contentHeight * aspectRatio)); }
      const contentAreaHeight = contentHeight + VIDEO_NOTES_MIN_HEIGHT + VIDEO_NOTES_VERTICAL_EXTRA;
      const baseTotalHeight = calculateNodeHeight(contentAreaHeight, false);
      const totalHeight = Math.max(baseTotalHeight + VIDEO_EXTRA_MIN_HEIGHT, NODE_MIN_HEIGHT + VIDEO_EXTRA_MIN_HEIGHT);
      const totalWidth = normalizeNodeWidth(contentWidth);
      const hasWidthChange = typeof reactFlowWidth !== 'number' || Math.abs(reactFlowWidth - totalWidth) > 1;
      const hasHeightChange = typeof reactFlowHeight !== 'number' || Math.abs(reactFlowHeight - totalHeight) > 1;
      const widthDiff = videoDisplayWidthMeta === null ? Infinity : Math.abs(videoDisplayWidthMeta - contentWidth);
      const heightDiff = videoDisplayHeightMeta === null ? Infinity : Math.abs(videoDisplayHeightMeta - contentHeight);
      if (widthDiff > 1 || heightDiff > 1) {
        onChangeMeta(node.node_id, { video_display_width: contentWidth, video_display_height: contentHeight, video_aspect_ratio: aspectRatio });
      }
      if (!hasWidthChange && !hasHeightChange) return;
      reactFlow.setNodes((nodes) => nodes.map((n) => n.id === node.node_id ? { ...n, style: { ...n.style, width: totalWidth, height: totalHeight } } : n));
      if (onChangeUi) {
        const currentBbox = node.ui?.bbox;
        const x1 = currentBbox?.x1 ?? 0;
        const y1 = currentBbox?.y1 ?? 0;
        onChangeUi(node.node_id, { bbox: { x1, y1, x2: x1 + totalWidth, y2: y1 + totalHeight } });
      }
    },
    [node, onChangeMeta, onChangeUi, reactFlow, reactFlowWidth, reactFlowHeight, videoDisplayWidthMeta, videoDisplayHeightMeta],
  );

  // Upload/URL handlers
  const handleVideoUpload = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const effectiveProjectId = projectId ?? (typeof node.project_id === 'string' && node.project_id.trim().length > 0 ? node.project_id : null);
        if (!effectiveProjectId) { alert('Could not determine project for video upload'); return; }
        const response = await fetch(`/api/videos/${node.node_id}/upload`, { method: 'POST', headers: { 'x-project-id': effectiveProjectId }, body: formData });
        if (!response.ok) { alert('Video upload error'); return; }
        const payload = await response.json();
        const assetRelativePath = typeof payload.assetRelativePath === 'string' ? payload.assetRelativePath : typeof payload.asset_relative_path === 'string' ? payload.asset_relative_path : undefined;
        const publicUrl = typeof payload.publicUrl === 'string' ? payload.publicUrl : typeof payload.url === 'string' ? payload.url : '';
        const relativeUrl = typeof payload.relativeUrl === 'string' ? payload.relativeUrl : undefined;
        const storedFilename = typeof payload.filename === 'string' && payload.filename.trim().length > 0 ? payload.filename : file.name;
        const metaPatch: Record<string, unknown> = {
          video_file: storedFilename, video_url: publicUrl || undefined, asset_public_url: publicUrl || undefined,
          file_size: typeof payload.size === 'number' ? payload.size : file.size,
          file_type: typeof payload.mimeType === 'string' && payload.mimeType.length > 0 ? payload.mimeType : file.type,
          display_mode: 'upload', video_data: null, asset_origin: 'manual_upload',
          source_url: publicUrl || undefined, source_download_url: publicUrl || undefined, original_filename: file.name,
        };
        if (assetRelativePath) {
          metaPatch.video_path = assetRelativePath;
          metaPatch.asset_relative_path = assetRelativePath;
          metaPatch.local_url = relativeUrl || `/uploads/${effectiveProjectId}/${assetRelativePath}`;
        }
        metaPatch.project_id = typeof payload.projectId === 'string' && payload.projectId.trim().length > 0 ? payload.projectId : effectiveProjectId;
        if (typeof payload.assetMimeType === 'string' && payload.assetMimeType.length > 0) metaPatch.asset_mime_type = payload.assetMimeType;
        else if (!metaPatch.asset_mime_type) metaPatch.asset_mime_type = metaPatch.file_type;
        onChangeMeta(node.node_id, metaPatch);
        autoRenameFromSource(file.name);
        setVideoPreviewReloadToken((v) => v + 1);
      } catch (error) { console.error('Video upload error:', error); alert('Error uploading video'); }
    };
    input.click();
  }, [autoRenameFromSource, node.project_id, node.node_id, onChangeMeta, projectId]);

  const handleVideoUrlInput = useCallback(() => {
    const url = window.prompt('Enter video URL:')?.trim();
    if (!url) return;
    onChangeMeta(node.node_id, { video_url: url, video_data: null, video_file: null, display_mode: 'url' });
    autoRenameFromSource(url);
    setVideoPreviewReloadToken((v) => v + 1);
  }, [autoRenameFromSource, node.node_id, onChangeMeta]);

  const handleVideoDownload = useCallback(() => {
    if (!videoSource?.src) return;
    const sourceValue = videoSource.src;
    if (videoSource.kind === 'url' && /^https?:\/\//i.test(sourceValue)) { window.open(sourceValue, '_blank', 'noopener'); return; }
    const link = document.createElement('a');
    link.href = sourceValue;
    const providedName = (videoFileName && videoFileName.trim()) || (node.title && node.title.trim()) || 'video';
    const sanitizedName = providedName.replace(/\s+/g, '_');
    const extFromFile = videoFileName?.includes('.') ? videoFileName.slice(videoFileName.lastIndexOf('.') + 1) : null;
    const extFromType = videoFileType?.includes('/') ? videoFileType.split('/')[1] : null;
    const ext = extFromFile || extFromType || 'mp4';
    link.download = `${sanitizedName}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [node.title, videoFileName, videoFileType, videoSource]);

  const handleVideoResetScale = useCallback(() => onChangeMeta(node.node_id, { video_scale: 1 }), [node.node_id, onChangeMeta]);

  // Extract frame
  const handleExtractFrame = useCallback(
    async (timeSeconds: number, cropParams?: { x: number; y: number; width: number; height: number }) => {
      if (!projectId) throw new Error('Project unavailable');
      const requestBody: any = { timestamp: timeSeconds };
      if (cropParams) requestBody.crop = cropParams;
      const resp = await fetch(`/api/videos/${node.node_id}/extract-frame`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-project-id': projectId }, body: JSON.stringify(requestBody) });
      const text = await resp.text();
      const body = text ? JSON.parse(text) : {};
      if (!resp.ok) throw new Error(body?.message || body?.error || `Request failed: ${resp.status}`);
      const frameUrl = body.frame?.frameUrl || body.frameUrl || body.framePath || '';
      if (!frameUrl) throw new Error('Failed to get frame from server');
      const baseTitle = (node.title || 'Video').trim() || 'Video';
      const targetPos = node.ui?.bbox ? { x: Math.round(node.ui.bbox.x2 + 60), y: Math.round(node.ui.bbox.y1) } : { x: 60, y: 60 };
      const payload = { slug: 'image-frame', type: 'image', title: `${baseTitle} (frame)`, content_type: 'image', content: '', meta: { image_original: frameUrl, original_image: frameUrl, image_edited: frameUrl, edited_image: frameUrl, annotated_image: frameUrl, edited_from_video: node.node_id }, position: targetPos, ui: { color: node.ui?.color ?? NODE_DEFAULT_COLOR, bbox: { x1: targetPos.x, y1: targetPos.y, x2: targetPos.x + NODE_DEFAULT_WIDTH, y2: targetPos.y + NODE_DEFAULT_HEIGHT } }, ai_visible: true, connections: { incoming: [], outgoing: [] } } as any;
      const response = await createNode(projectId, payload);
      addNodeFromServer(response.node, response.project_updated_at);
      try { const edgeResp = await createEdge(projectId, { from: node.node_id, to: response.node.node_id, label: 'frame' }); setEdges(edgeResp.edges, edgeResp.updated_at); } catch {}
    },
    [projectId, node.node_id, node.title, node.ui, addNodeFromServer, setEdges],
  );

  // Trim video
  const handleTrimVideo = useCallback(
    async (startTime: number, endTime: number, cropParams?: { x: number; y: number; width: number; height: number }) => {
      if (!projectId) throw new Error('Project unavailable');
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 5 * 60 * 1000);
      try {
        const requestBody: any = { startTime, endTime };
        if (cropParams) requestBody.crop = cropParams;
        const resp = await fetch(`/api/videos/${node.node_id}/trim`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-project-id': projectId }, body: JSON.stringify(requestBody), signal: abortController.signal });
        clearTimeout(timeoutId);
        const text = await resp.text();
        const body = text ? JSON.parse(text) : {};
        if (!resp.ok) throw new Error(body?.message || body?.error || `Trim failed: ${resp.status}`);
        if (!body.trimmedVideo?.trimmedVideoUrl) throw new Error('Failed to get cropped video from server');
        const baseTitle = (node.title || 'Video').trim() || 'Video';
        const targetPos = node.ui?.bbox ? { x: Math.round(node.ui.bbox.x2 + 60), y: Math.round(node.ui.bbox.y1) } : { x: 60, y: 60 };
        const payload = { slug: 'video-trimmed', type: 'video', title: `${baseTitle} (trimmed)`, content_type: 'video', content: body.trimmedVideo.trimmedVideoUrl, meta: { video_url: body.trimmedVideo.trimmedVideoUrl, video_path: body.trimmedVideo.trimmedVideoPath, duration: body.trimmedVideo.duration, trimmedFrom: node.node_id, trimSettings: { startTime, endTime, crop: cropParams } }, position: targetPos, ui: { color: node.ui?.color ?? NODE_DEFAULT_COLOR, bbox: { x1: targetPos.x, y1: targetPos.y, x2: targetPos.x + NODE_DEFAULT_WIDTH, y2: targetPos.y + NODE_DEFAULT_HEIGHT } }, ai_visible: true, connections: { incoming: [], outgoing: [] } } as any;
        const response = await createNode(projectId, payload);
        addNodeFromServer(response.node, response.project_updated_at);
        try { const edgeResp = await createEdge(projectId, { from: node.node_id, to: response.node.node_id, label: 'trimmed' }); setEdges(edgeResp.edges, edgeResp.updated_at); } catch {}
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw new Error('Operation timed out. Please try again.');
        throw err;
      }
    },
    [projectId, node.node_id, node.title, node.ui, addNodeFromServer, setEdges],
  );

  // Video crop handlers
  const handleOpenVideoCropModal = useCallback(async () => {
    if (!node.meta) return;
    try {
      setIsPreparingVideoCrop(true);
      const videoSourceStr = typeof node.meta.video_url === 'string' ? node.meta.video_url : '';
      const videoPath = typeof node.meta.video_path === 'string' ? node.meta.video_path : videoSourceStr;
      if (!videoPath) { alert('No video to crop'); return; }
      const videoWidth = typeof node.meta.video_display_width === 'number' ? node.meta.video_display_width : 0;
      const videoHeight = typeof node.meta.video_display_height === 'number' ? node.meta.video_display_height : 0;
      if (!videoWidth || !videoHeight) { alert('Could not determine video dimensions'); return; }
      let firstFrameDataUrl: string | undefined;
      try {
        firstFrameDataUrl = await new Promise<string>((resolve, reject) => {
          const video = document.createElement('video');
          video.src = videoPath;
          video.crossOrigin = 'anonymous';
          video.muted = true;
          video.addEventListener('loadeddata', () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth || videoWidth;
              canvas.height = video.videoHeight || videoHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) return reject(new Error('no-canvas-context'));
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg'));
            } catch (err) { reject(err); }
          }, { once: true });
          video.addEventListener('error', () => reject(new Error('failed-to-load-video')), { once: true });
        });
      } catch (err) { console.warn('[useNodeVideo] Failed to extract first frame', err); }
      setVideoCropModalData({ videoPath, source: firstFrameDataUrl, videoWidth, videoHeight, settings: lastVideoCropSettings });
      setIsVideoCropModalOpen(true);
    } catch (error) {
      console.error('[useNodeVideo] Failed to prepare video crop modal', error);
      alert('Failed to prepare video for cropping.');
    } finally { setIsPreparingVideoCrop(false); }
  }, [node.meta, lastVideoCropSettings]);

  const handleVideoCropModalClose = useCallback(() => { setIsVideoCropModalOpen(false); setVideoCropModalData(null); }, []);

  const handleVideoCropModalApply = useCallback(
    async (payload: { dataUrl: string; settings: VideoCropSettings }) => {
      setIsVideoCropModalOpen(false);
      setVideoCropModalData(null);
      setLastVideoCropSettings(payload.settings);
      onChangeMeta(node.node_id, { video_crop_settings: payload.settings });
      if (payload.dataUrl) onChangeMeta(node.node_id, { video_crop_preview: payload.dataUrl });
      if (!projectId) return;
      try {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 5 * 60 * 1000);
        const resp = await fetch(`/api/videos/${node.node_id}/crop`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-project-id': projectId }, body: JSON.stringify({ cropSettings: payload.settings }), signal: abortController.signal });
        clearTimeout(timeoutId);
        const text = await resp.text();
        const body = text ? JSON.parse(text) : {};
        if (!resp.ok) throw new Error(body?.message || body?.error || `Crop failed: ${resp.status}`);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('[useNodeVideo] Video crop error:', err);
      }
    },
    [node.node_id, onChangeMeta, projectId],
  );

  return {
    videoSource, videoScale, videoControlsEnabled, videoDisplayMode,
    videoFileName, videoFileType, videoFileSize, formattedVideoFileSize,
    videoSourceName, videoDisplayWidthMeta, videoDisplayHeightMeta,
    videoNotes, videoPreviewReloadToken,
    isVideoCropModalOpen, isPreparingVideoCrop, videoCropModalData,
    showVideoFrameExtractModal, showVideoTrimModal,
    handleVideoNotesChange, handleVideoDimensions,
    handleVideoUpload, handleVideoUrlInput, handleVideoDownload,
    handleVideoResetScale, handleVideoRetry,
    handleExtractFrame, handleTrimVideo,
    handleOpenVideoCropModal, handleVideoCropModalClose, handleVideoCropModalApply,
    setShowVideoFrameExtractModal, setShowVideoTrimModal,
  };
}
