import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowNode, NodeUI, CreateNodePayload } from '../../../state/api';
import { createEdge, createNode } from '../../../state/api';
import { loadImageElement, loadImageWithRetry, type ImageCropSettings } from '../imageProcessing';
import type { ImageAnnotationEditorHandle } from '../ImageAnnotationEditor';
import {
  NODE_DEFAULT_COLOR,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
} from '../../../constants/nodeDefaults';
import {
  MIN_CONTENT_WIDTH,
  MAX_CONTENT_WIDTH,
  MIN_CONTENT_HEIGHT,
  MAX_CONTENT_HEIGHT,
  calculateNodeHeight,
  scaleImageToFit,
} from '../../../constants/nodeSizes';
import { IMAGE_VIEWPORT_MIN_HEIGHT, IMAGE_NOTES_MIN_HEIGHT } from '../components/nodeConstants';
import { useProjectStore } from '../../../state/store';
import { useReactFlow } from 'reactflow';

interface UseNodeImageOptions {
  node: FlowNode;
  disabled: boolean;
  projectId: string | null;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onChangeUi?: (nodeId: string, patch: Partial<NodeUI>) => void;
  autoRenameFromSource: (source: string | undefined | null) => void;
}

export function useNodeImage({
  node,
  disabled,
  projectId,
  onChangeMeta,
  onChangeUi,
  autoRenameFromSource,
}: UseNodeImageOptions) {
  const reactFlow = useReactFlow();
  const addNodeFromServer = useProjectStore((state) => state.addNodeFromServer);
  const setEdges = useProjectStore((state) => state.setEdges);

  const [isImageUploading, setIsImageUploading] = useState(false);
  const [imageEditorSession, setImageEditorSession] = useState(0);
  const imageEditorRef = useRef<ImageAnnotationEditorHandle | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);
  const [cropModalData, setCropModalData] = useState<{
    source: string;
    naturalWidth: number;
    naturalHeight: number;
    settings: ImageCropSettings | null;
  } | null>(null);
  const [lastCropSettings, setLastCropSettings] = useState<ImageCropSettings | null>(
    () => (node.meta?.image_crop_settings as ImageCropSettings | null) ?? null,
  );
  const [imageToolbarError, setImageToolbarError] = useState<string | null>(null);
  const [isSavingCropNode, setIsSavingCropNode] = useState(false);
  const pendingImageModeRef = useRef(false);

  const [imageOutputMode, setImageOutputMode] = useState<'annotated' | 'original'>(() => {
    const rawMode = normalizeImageValue(node.meta?.image_output_mode);
    if (rawMode === 'original' || rawMode === 'annotated') return rawMode;
    return 'annotated';
  });

  const imageViewMode = (node.meta?.view_mode as 'annotated' | 'original' | 'edit') || 'annotated';

  const [imageNotes, setImageNotes] = useState<string>(
    () => (typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : ''),
  );
  const [isEditingImageNotes, setIsEditingImageNotes] = useState(false);

  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const [imageViewportSize, setImageViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  function normalizeImageValue(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  const imageNaturalSize = useMemo(() => {
    const fallbackWidth =
      typeof node.meta?.display_width === 'number' && Number.isFinite(node.meta.display_width as number)
        ? (node.meta.display_width as number)
        : 1024;
    const fallbackHeight =
      typeof node.meta?.display_height === 'number' && Number.isFinite(node.meta.display_height as number)
        ? (node.meta.display_height as number)
        : 768;
    const width =
      typeof node.meta?.natural_width === 'number' && Number.isFinite(node.meta.natural_width as number)
        ? (node.meta.natural_width as number)
        : fallbackWidth;
    const height =
      typeof node.meta?.natural_height === 'number' && Number.isFinite(node.meta.natural_height as number)
        ? (node.meta.natural_height as number)
        : fallbackHeight;
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }, [node.meta?.display_height, node.meta?.display_width, node.meta?.natural_height, node.meta?.natural_width]);

  const originalImage = useMemo(() => {
    const meta = node.meta ?? {};
    return (
      normalizeImageValue(meta.image_original) ||
      normalizeImageValue(meta.original_image) ||
      normalizeImageValue(meta.image_url) ||
      normalizeImageValue(meta.edited_image) ||
      null
    );
  }, [node.meta]);

  const editedImage = useMemo(() => {
    const meta = node.meta ?? {};
    return (
      normalizeImageValue(meta.image_edited) ||
      normalizeImageValue(meta.edited_image) ||
      normalizeImageValue(meta.annotated_image) ||
      normalizeImageValue(meta.image_original) ||
      normalizeImageValue(meta.original_image) ||
      null
    );
  }, [node.meta]);

  const hasOriginalImage = Boolean(originalImage);
  const canCropImage = Boolean(originalImage || editedImage);
  const hasEditedVersion = useMemo(() => {
    if (!originalImage) return Boolean(editedImage);
    return Boolean(editedImage && editedImage !== originalImage);
  }, [editedImage, originalImage]);

  const effectiveImageOutput = useMemo(() => {
    if (imageOutputMode === 'annotated' && editedImage && hasEditedVersion) return 'annotated';
    return 'original';
  }, [editedImage, hasEditedVersion, imageOutputMode]);

  // Sync effects
  useEffect(() => {
    setLastCropSettings((node.meta?.image_crop_settings as ImageCropSettings | null) ?? null);
  }, [node.meta?.image_crop_settings]);

  useEffect(() => {
    const nextValue = typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : '';
    setImageNotes(nextValue);
  }, [node.meta?.short_description]);

  useEffect(() => {
    const rawMode = normalizeImageValue(node.meta?.image_output_mode);
    if (rawMode === 'original' || rawMode === 'annotated') {
      setImageOutputMode(rawMode);
      if (rawMode === 'original') pendingImageModeRef.current = false;
    } else {
      setImageOutputMode('annotated');
    }
  }, [node.meta?.image_output_mode]);

  useEffect(() => {
    if (hasEditedVersion) pendingImageModeRef.current = false;
  }, [hasEditedVersion]);

  useEffect(() => {
    if (node.type !== 'image') return;
    if (pendingImageModeRef.current) return;
    if (!hasEditedVersion && imageOutputMode !== 'original') {
      pendingImageModeRef.current = false;
      setImageOutputMode('original');
      onChangeMeta(node.node_id, { image_output_mode: 'original' });
    }
  }, [hasEditedVersion, imageOutputMode, node.node_id, node.type, onChangeMeta]);

  // Viewport resize observer
  useEffect(() => {
    const target = imageViewportRef.current;
    if (!target) return;
    const updateSize = () => {
      setImageViewportSize({ width: target.clientWidth, height: target.clientHeight });
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(target);
    return () => observer.disconnect();
  }, [imageViewMode]);

  // Legacy meta normalization
  useEffect(() => {
    if (node.type !== 'image') return;
    const meta = node.meta ?? {};
    const normalize = (value: unknown): string | null =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    const patch: Record<string, unknown> = {};
    const legacyOriginal = normalize(meta.original_image);
    if (!normalize(meta.image_original) && legacyOriginal) patch.image_original = legacyOriginal;
    const legacyEdited = normalize(meta.image_edited) || normalize(meta.edited_image) || normalize(meta.annotated_image);
    if (!normalize(meta.image_edited) && legacyEdited) patch.image_edited = legacyEdited;
    if (typeof meta.image_crop_expose_port !== 'boolean' && typeof meta.image_crop_settings === 'object' && meta.image_crop_settings) {
      const exposePort = (meta.image_crop_settings as Record<string, unknown>).exposePort;
      if (typeof exposePort === 'boolean') patch.image_crop_expose_port = exposePort;
    }
    if (Object.keys(patch).length > 0) onChangeMeta(node.node_id, patch);
  }, [node.meta, node.node_id, node.type, onChangeMeta]);

  // Handlers
  const handleImageNotesChange = useCallback((value: string) => setImageNotes(value), []);
  const handleImageNotesFocus = useCallback(() => setIsEditingImageNotes(true), []);
  const handleImageNotesBlur = useCallback(() => {
    setIsEditingImageNotes(false);
    if (imageNotes !== node.meta?.short_description) {
      onChangeMeta(node.node_id, { short_description: imageNotes });
    }
  }, [node.node_id, imageNotes, node.meta?.short_description, onChangeMeta]);

  const handleImageViewModeChange = useCallback(
    (mode: 'annotated' | 'original' | 'edit') => {
      onChangeMeta(node.node_id, { view_mode: mode });
      if (mode === 'edit') setImageEditorSession((prev) => prev + 1);
    },
    [node.node_id, onChangeMeta],
  );

  const handleImageOutputChange = useCallback(
    (mode: 'annotated' | 'original') => {
      pendingImageModeRef.current = mode !== 'original';
      setImageOutputMode(mode);
      onChangeMeta(node.node_id, { image_output_mode: mode });
    },
    [node.node_id, onChangeMeta],
  );

  const handleImageUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setIsImageUploading(true);
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const imageData = loadEvent.target?.result as string | undefined;
        if (!imageData) { setIsImageUploading(false); return; }
        pendingImageModeRef.current = true;
        onChangeMeta(node.node_id, {
          image_original: imageData, original_image: imageData,
          image_edited: imageData, edited_image: imageData, annotated_image: imageData,
          image_file: file.name, file_size: file.size, file_type: file.type,
          image_output_mode: 'annotated', view_mode: 'annotated', image_url: null,
        });
        setImageOutputMode('annotated');
        autoRenameFromSource(file.name);
        setIsImageUploading(false);
        setImageEditorSession((prev) => prev + 1);
      };
      reader.onerror = () => { pendingImageModeRef.current = false; setIsImageUploading(false); };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [autoRenameFromSource, node.node_id, onChangeMeta]);

  const handleImageUrlInput = useCallback(() => {
    const url = window.prompt('Enter image URL:');
    if (!url) return;
    pendingImageModeRef.current = true;
    onChangeMeta(node.node_id, {
      image_original: url, original_image: url, image_edited: url,
      edited_image: url, annotated_image: url, image_url: url,
      image_output_mode: 'annotated', view_mode: 'annotated', image_file: null,
    });
    setImageOutputMode('annotated');
    autoRenameFromSource(url);
    setImageEditorSession((prev) => prev + 1);
  }, [autoRenameFromSource, node.node_id, onChangeMeta]);

  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const { naturalWidth, naturalHeight } = img;
    const savedNW = node.meta?.natural_width as number | undefined;
    const savedNH = node.meta?.natural_height as number | undefined;
    if (savedNW === naturalWidth && savedNH === naturalHeight) return;
    const aspectRatio = naturalWidth / naturalHeight;
    let contentHeight = Math.min(scaleImageToFit(naturalWidth, naturalHeight).height, MAX_CONTENT_HEIGHT);
    let contentWidth = contentHeight * aspectRatio;
    if (contentWidth > MAX_CONTENT_WIDTH) { contentWidth = MAX_CONTENT_WIDTH; contentHeight = contentWidth / aspectRatio; }
    if (contentWidth < MIN_CONTENT_WIDTH) { contentWidth = MIN_CONTENT_WIDTH; contentHeight = contentWidth / aspectRatio; }
    if (contentHeight < MIN_CONTENT_HEIGHT) { contentHeight = MIN_CONTENT_HEIGHT; contentWidth = contentHeight * aspectRatio; }
    onChangeMeta(node.node_id, {
      natural_width: naturalWidth, natural_height: naturalHeight,
      display_width: contentWidth, display_height: contentHeight,
      display_scale: contentHeight / naturalHeight,
    });
    const isAnnotationMode = imageViewMode === 'edit';
    const totalHeight = calculateNodeHeight(contentHeight, isAnnotationMode);
    if (onChangeUi && node.ui?.bbox) {
      const currentX = node.ui.bbox.x1;
      const currentY = node.ui.bbox.y1;
      onChangeUi(node.node_id, { bbox: { x1: currentX, y1: currentY, x2: currentX + contentWidth, y2: currentY + totalHeight } });
    }
    reactFlow.setNodes((nodes) =>
      nodes.map((n) => n.id === node.node_id ? { ...n, style: { ...n.style, width: contentWidth, height: totalHeight } } : n),
    );
  }, [node.node_id, node.meta?.natural_width, node.meta?.natural_height, node.ui?.bbox, imageViewMode, onChangeMeta, onChangeUi, reactFlow]);

  const handleImageDownload = useCallback(() => {
    const target = imageOutputMode === 'annotated' && editedImage ? editedImage : originalImage;
    if (!target) return;
    if (/^https?:\/\//i.test(target)) { window.open(target, '_blank', 'noopener'); return; }
    const filenameBase = (node.title || 'image').trim() || 'image';
    const downloadLink = document.createElement('a');
    downloadLink.href = target;
    downloadLink.download = `${filenameBase.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  }, [editedImage, imageOutputMode, node.title, originalImage]);

  const handleResetToContentSize = useCallback(() => {
    const naturalWidth = node.meta?.natural_width as number | undefined;
    const naturalHeight = node.meta?.natural_height as number | undefined;
    if (!naturalWidth || !naturalHeight) return;
    const aspectRatio = naturalWidth / naturalHeight;
    let contentHeight = Math.min(scaleImageToFit(naturalWidth, naturalHeight).height, MAX_CONTENT_HEIGHT);
    let contentWidth = contentHeight * aspectRatio;
    if (contentWidth > MAX_CONTENT_WIDTH) { contentWidth = MAX_CONTENT_WIDTH; contentHeight = contentWidth / aspectRatio; }
    if (contentWidth < MIN_CONTENT_WIDTH) { contentWidth = MIN_CONTENT_WIDTH; contentHeight = contentWidth / aspectRatio; }
    if (contentHeight < MIN_CONTENT_HEIGHT) { contentHeight = MIN_CONTENT_HEIGHT; contentWidth = contentHeight * aspectRatio; }
    onChangeMeta(node.node_id, { display_width: contentWidth, display_height: contentHeight, display_scale: contentHeight / naturalHeight });
    const isAnnotationMode = imageViewMode === 'edit';
    const totalHeight = calculateNodeHeight(contentHeight, isAnnotationMode);
    if (onChangeUi && node.ui?.bbox) {
      onChangeUi(node.node_id, { bbox: { x1: node.ui.bbox.x1, y1: node.ui.bbox.y1, x2: node.ui.bbox.x1 + contentWidth, y2: node.ui.bbox.y1 + totalHeight } });
    }
    reactFlow.setNodes((nodes) =>
      nodes.map((n) => n.id === node.node_id ? { ...n, style: { ...n.style, width: contentWidth, height: totalHeight } } : n),
    );
  }, [node.node_id, node.meta, node.ui?.bbox, imageViewMode, onChangeMeta, onChangeUi, reactFlow]);

  const handleOpenCropModal = useCallback(async () => {
    if (disabled || isPreparingCrop || isSavingCropNode) return;
    setImageToolbarError(null);
    setIsPreparingCrop(true);
    try {
      let source: string | null = null;
      if (imageViewMode === 'edit' && imageEditorRef.current) {
        source = await imageEditorRef.current.exportAnnotated();
      }
      if (!source) source = editedImage ?? originalImage;
      if (!source) { setImageToolbarError('No image to crop'); return; }
      const img = await loadImageWithRetry(source);
      const nw = Math.max(1, img.naturalWidth || img.width || 0);
      const nh = Math.max(1, img.naturalHeight || img.height || 0);
      setCropModalData({ source, naturalWidth: nw, naturalHeight: nh, settings: lastCropSettings });
      setIsCropModalOpen(true);
    } catch (error) {
      console.error('[useNodeImage] Failed to prepare crop modal', error);
      setImageToolbarError('Failed to prepare image for cropping.');
    } finally {
      setIsPreparingCrop(false);
    }
  }, [disabled, editedImage, imageViewMode, isPreparingCrop, isSavingCropNode, lastCropSettings, originalImage]);

  const handleCropModalClose = useCallback(() => {
    setIsCropModalOpen(false);
    setCropModalData(null);
    setImageToolbarError(null);
  }, []);

  const handleCropModalApply = useCallback(
    async ({ dataUrl, settings }: { dataUrl: string; settings: ImageCropSettings }) => {
      setIsCropModalOpen(false);
      setCropModalData(null);
      setLastCropSettings(settings);
      setImageToolbarError(null);
      onChangeMeta(node.node_id, { image_crop_settings: settings, image_crop_expose_port: false });
      if (!projectId) { setImageToolbarError('Failed to create node: project unavailable.'); return; }
      try {
        setIsSavingCropNode(true);
        const croppedImage = await loadImageElement(dataUrl);
        const nw = Math.max(1, croppedImage.naturalWidth || croppedImage.width || 0);
        const nh = Math.max(1, croppedImage.naturalHeight || croppedImage.height || 0);
        const { width: displayWidth, height: displayHeight } = scaleImageToFit(nw, nh);
        const displayScale = nh > 0 ? displayHeight / nh : 1;
        const baseTitle = (node.title || 'Image').trim() || 'Image';
        const templateMeta: Record<string, unknown> = {
          image_original: dataUrl, original_image: dataUrl, image_edited: dataUrl,
          edited_image: dataUrl, annotated_image: dataUrl, view_mode: 'annotated',
          image_output_mode: 'annotated', natural_width: nw, natural_height: nh,
          display_width: displayWidth, display_height: displayHeight, display_scale: displayScale,
          image_crop_parent: node.node_id, image_crop_settings: settings,
          image_crop_expose_port: false, annotation_layers: [],
        };
        const targetPos = node.ui?.bbox
          ? { x: Math.round(node.ui.bbox.x2 + 60), y: Math.round(node.ui.bbox.y1) }
          : { x: 60, y: 60 };
        const payload: CreateNodePayload = {
          slug: 'image-crop', type: 'image', title: `${baseTitle} (crop)`,
          content_type: 'image', content: '', meta: templateMeta,
          position: targetPos,
          ui: { color: node.ui?.color ?? NODE_DEFAULT_COLOR, bbox: { x1: targetPos.x, y1: targetPos.y, x2: targetPos.x + NODE_DEFAULT_WIDTH, y2: targetPos.y + NODE_DEFAULT_HEIGHT } },
          ai_visible: true, connections: { incoming: [], outgoing: [] },
        };
        const response = await createNode(projectId, payload);
        addNodeFromServer(response.node, response.project_updated_at);
        try {
          const edgeResponse = await createEdge(projectId, { from: node.node_id, to: response.node.node_id, label: 'image-crop' });
          setEdges(edgeResponse.edges, edgeResponse.updated_at);
        } catch (edgeError) {
          console.warn('[useNodeImage] Failed to auto-connect crop node', edgeError);
        }
      } catch (error) {
        console.error('[useNodeImage] Failed to create crop node', error);
        setImageToolbarError('Failed to create node with crop.');
      } finally {
        setIsSavingCropNode(false);
      }
    },
    [addNodeFromServer, node.node_id, node.title, node.ui?.bbox, node.ui?.color, onChangeMeta, projectId, setEdges],
  );

  const handleEnterImageAnnotationMode = useCallback(() => handleImageViewModeChange('edit'), [handleImageViewModeChange]);
  const handleSelectOriginalImageView = useCallback(() => {
    handleImageViewModeChange('original');
    handleImageOutputChange('original');
  }, [handleImageOutputChange, handleImageViewModeChange]);
  const handleSelectEditedImageView = useCallback(() => {
    if (!hasEditedVersion) return;
    handleImageViewModeChange('annotated');
    handleImageOutputChange('annotated');
  }, [handleImageOutputChange, handleImageViewModeChange, hasEditedVersion]);

  return {
    isImageUploading,
    imageEditorSession,
    imageEditorRef,
    isCropModalOpen,
    isPreparingCrop,
    cropModalData,
    imageToolbarError,
    isSavingCropNode,
    imageOutputMode,
    imageViewMode,
    imageNotes,
    isEditingImageNotes,
    imageViewportRef,
    imageViewportSize,
    imageNaturalSize,
    originalImage,
    editedImage,
    hasOriginalImage,
    canCropImage,
    hasEditedVersion,
    effectiveImageOutput,
    pendingImageModeRef,
    setImageEditorSession,
    setImageOutputMode,
    handleImageNotesChange,
    handleImageNotesFocus,
    handleImageNotesBlur,
    handleImageViewModeChange,
    handleImageOutputChange,
    handleImageUpload,
    handleImageUrlInput,
    handleImageLoad,
    handleImageDownload,
    handleResetToContentSize,
    handleOpenCropModal,
    handleCropModalClose,
    handleCropModalApply,
    handleEnterImageAnnotationMode,
    handleSelectOriginalImageView,
    handleSelectEditedImageView,
  };
}
