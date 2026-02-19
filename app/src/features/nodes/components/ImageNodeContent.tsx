/**
 * ImageNodeContent - Image node toolbar, annotation editor/viewer, and notes.
 * Extracted from FlowNodeCard.tsx lines ~6263-6500.
 */
import React from 'react';
import { ImageAnnotationEditor } from '../ImageAnnotationEditor';
import type { ImageAnnotationEditorHandle } from '../ImageAnnotationEditor';
import type { FlowNode } from './nodeTypes';
import {
  NODE_TOOLBAR_HEIGHT,
  IMAGE_VIEWPORT_MIN_HEIGHT,
  IMAGE_NOTES_MIN_HEIGHT,
  TOOLBAR_BUTTON_BASE_CLASSES,
  TOOLBAR_BUTTON_INACTIVE_CLASSES,
} from './nodeConstants';

interface ImageNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  // Image state
  imageViewMode: 'annotated' | 'original' | 'edit';
  imageOutputMode: 'annotated' | 'original';
  effectiveImageOutput: 'annotated' | 'original';
  originalImage: string | null;
  editedImage: string | null;
  hasOriginalImage: boolean;
  hasEditedVersion: boolean;
  canCropImage: boolean;
  imageEditorSession: number;
  imageEditorRef: React.MutableRefObject<ImageAnnotationEditorHandle | null>;
  imageViewportRef: React.MutableRefObject<HTMLDivElement | null>;
  imageNotes: string;
  imageToolbarError: string | null;
  isPreparingCrop: boolean;
  isSavingCropNode: boolean;
  pendingImageModeRef: React.MutableRefObject<boolean>;
  // Handlers
  handleImageUpload: () => void;
  handleImageUrlInput: () => void;
  handleImageDownload: () => void;
  handleResetToContentSize: () => void;
  handleOpenCropModal: () => Promise<void>;
  handleEnterImageAnnotationMode: () => void;
  handleSelectOriginalImageView: () => void;
  handleSelectEditedImageView: () => void;
  handleImageLoad: (img: HTMLImageElement) => void;
  handleImageNotesChange: (value: string) => void;
  handleImageNotesFocus: () => void;
  handleImageNotesBlur: () => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  setImageOutputMode: React.Dispatch<React.SetStateAction<'annotated' | 'original'>>;
  setImageEditorSession: React.Dispatch<React.SetStateAction<number>>;
  [key: string]: any;
}

export function ImageNodeContent(props: ImageNodeContentProps) {
  const {
    node, disabled, imageViewMode, effectiveImageOutput,
    originalImage, editedImage, hasOriginalImage, hasEditedVersion, canCropImage,
    imageEditorSession, imageEditorRef, imageViewportRef, imageNotes,
    imageToolbarError, isPreparingCrop, isSavingCropNode, pendingImageModeRef,
    handleImageUpload, handleImageUrlInput, handleImageDownload,
    handleResetToContentSize, handleOpenCropModal, handleEnterImageAnnotationMode,
    handleSelectOriginalImageView, handleSelectEditedImageView,
    handleImageLoad, handleImageNotesChange, handleImageNotesFocus, handleImageNotesBlur,
    onChangeMeta, setImageOutputMode, setImageEditorSession,
  } = props;

  const toolbarButtonBaseClasses = TOOLBAR_BUTTON_BASE_CLASSES;
  const toolbarButtonInactiveClasses = TOOLBAR_BUTTON_INACTIVE_CLASSES;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-2 overflow-x-hidden flex-nowrap flex-shrink-0"
        style={{ height: `${NODE_TOOLBAR_HEIGHT}px` }}
        data-nodrag="true"
      >
        <button type="button" onClick={handleImageUpload} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} border-emerald-400/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40`} title="Upload file" disabled={disabled} data-nodrag="true">{'\u2B06\uFE0F'}</button>
        <button type="button" onClick={handleImageUrlInput} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} border-blue-400/50 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 disabled:opacity-40`} title="Upload from URL" disabled={disabled} data-nodrag="true">{'\u{1F517}'}</button>
        <button type="button" onClick={handleImageDownload} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} ${toolbarButtonInactiveClasses}`} title="Download" disabled={disabled || (!editedImage && !originalImage)} data-nodrag="true">{'\u2B07\uFE0F'}</button>
        <button type="button" onClick={handleResetToContentSize} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} border-purple-400/60 bg-purple-500/20 text-purple-100 hover:bg-purple-500/30 disabled:opacity-40`} title="Fit size to content" disabled={disabled || !node.meta?.natural_width || !node.meta?.natural_height} data-nodrag="true">{'\u27F2'}</button>
        <button type="button" onClick={() => { void handleOpenCropModal(); }} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} border-amber-400/70 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 disabled:opacity-40`} title="Extract frame" disabled={disabled || !canCropImage || isPreparingCrop || isSavingCropNode} data-nodrag="true">{'\u{1F39E}\uFE0F'}</button>
        <div className="flex-1" />
        <button type="button" onClick={handleEnterImageAnnotationMode} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} ${imageViewMode === 'edit' ? 'border-amber-400/70 bg-amber-500/25 text-amber-50 shadow-inner shadow-amber-500/30' : toolbarButtonInactiveClasses}`} title="Annotation mode" disabled={disabled || !hasOriginalImage} data-nodrag="true" aria-pressed={imageViewMode === 'edit'}>{'\u270F\uFE0F'}</button>
        <div className="h-6 w-px flex-shrink-0 rounded-full bg-white/10" />
        <button type="button" onClick={handleSelectOriginalImageView} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} ${effectiveImageOutput === 'original' ? 'border-sky-400/70 bg-sky-500/25 text-sky-100 shadow-inner shadow-sky-500/30' : toolbarButtonInactiveClasses}`} title="View original" disabled={disabled || !hasOriginalImage} data-nodrag="true" aria-pressed={effectiveImageOutput === 'original'}>{'\u{1F441}\uFE0F'}</button>
        <button type="button" onClick={handleSelectEditedImageView} onPointerDown={(e) => e.stopPropagation()} className={`${toolbarButtonBaseClasses} ${effectiveImageOutput === 'annotated' ? 'border-purple-400/70 bg-purple-500/25 text-purple-50 shadow-inner shadow-purple-500/30' : toolbarButtonInactiveClasses}`} title="View edited" disabled={disabled || !hasEditedVersion} data-nodrag="true" aria-pressed={effectiveImageOutput === 'annotated'}>{'\u2728'}</button>
      </div>

      {imageToolbarError ? <div className="px-2 pt-1 text-[11px] text-rose-300">{imageToolbarError}</div> : null}

      {/* Content area */}
      <div className="flex-1 min-h-0 flex flex-col" style={{ overflow: 'hidden', position: 'relative' }}>
        <div className="flex-shrink-0">
          {imageViewMode === 'edit' ? (
            <ImageAnnotationEditor
              ref={imageEditorRef}
              key={`${node.node_id}-${imageEditorSession}`}
              originalImage={originalImage}
              annotatedImage={editedImage}
              viewMode={imageViewMode}
              sessionKey={imageEditorSession}
              viewportMinHeight={IMAGE_VIEWPORT_MIN_HEIGHT}
              hasEditedImage={hasEditedVersion}
              onExport={(dataUrl) => {
                pendingImageModeRef.current = true;
                onChangeMeta(node.node_id, { image_edited: dataUrl, edited_image: dataUrl, annotated_image: dataUrl, view_mode: 'annotated', image_output_mode: 'annotated' });
                setImageOutputMode('annotated');
                setImageEditorSession((prev) => prev + 1);
              }}
              onReset={() => {
                if (originalImage) {
                  pendingImageModeRef.current = false;
                  onChangeMeta(node.node_id, { image_edited: originalImage, edited_image: originalImage, annotated_image: originalImage });
                  setImageEditorSession((prev) => prev + 1);
                }
              }}
              disabled={disabled}
            />
          ) : (
            <div ref={imageViewportRef} style={{ overflow: 'hidden', position: 'relative' }}>
              {(() => {
                const previewSource = imageViewMode === 'original' ? originalImage : editedImage || originalImage;
                if (!previewSource) {
                  return <div className="px-4 py-8 text-center text-sm text-white/60">Upload an image to see preview</div>;
                }
                return (
                  <img
                    src={previewSource}
                    alt={imageViewMode === 'annotated' ? 'Edited image' : 'Original image'}
                    style={{ width: '100%', height: 'auto', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) handleImageLoad(img);
                    }}
                  />
                );
              })()}
            </div>
          )}
        </div>
        {/* Notes */}
        <div className="flex-1 min-h-0 px-2 pb-2 pt-2 flex flex-col">
          <textarea
            value={imageNotes}
            onChange={(event) => handleImageNotesChange(event.target.value)}
            onFocus={handleImageNotesFocus}
            onBlur={handleImageNotesBlur}
            placeholder="Write what's important to remember when working with this image..."
            className="w-full flex-1 resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
            style={{ minHeight: `${IMAGE_NOTES_MIN_HEIGHT}px` }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            disabled={disabled}
            data-nodrag="true"
          />
        </div>
      </div>
    </div>
  );
}
