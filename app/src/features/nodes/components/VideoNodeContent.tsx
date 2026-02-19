/**
 * VideoNodeContent - Video node with toolbar, preview, and notes.
 * Extracted from FlowNodeCard.tsx lines ~6501-6635.
 */
import React from 'react';
import { VideoPreview } from './VideoPreview';
import type { FlowNode } from './nodeTypes';
import { VIDEO_SCALE_OPTIONS, VIDEO_NOTES_MIN_HEIGHT } from './nodeConstants';
import { NODE_TOOLBAR_HEIGHT } from '../../../constants/nodeSizes';

interface VideoNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  videoSource: { kind: string; src: string; name: string | null } | null;
  videoControlsEnabled: boolean;
  videoScale: number;
  videoPreviewReloadToken: number;
  videoNotes: string;
  isPreparingVideoCrop: boolean;
  handleVideoUpload: () => Promise<void>;
  handleVideoUrlInput: () => void;
  handleVideoDownload: () => void;
  handleVideoRetry: () => void;
  handleVideoDimensions: (dims: { width: number; height: number }) => void;
  handleVideoNotesChange: (value: string) => void;
  setShowVideoFrameExtractModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowVideoTrimModal: React.Dispatch<React.SetStateAction<boolean>>;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  [key: string]: any;
}

export function VideoNodeContent(props: VideoNodeContentProps) {
  const {
    node, disabled, videoSource, videoControlsEnabled, videoScale,
    videoPreviewReloadToken, videoNotes, isPreparingVideoCrop,
    handleVideoUpload, handleVideoUrlInput, handleVideoDownload,
    handleVideoRetry, handleVideoDimensions, handleVideoNotesChange,
    setShowVideoFrameExtractModal, setShowVideoTrimModal, onChangeMeta,
  } = props;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 overflow-visible flex-nowrap flex-shrink-0" style={{ height: `${NODE_TOOLBAR_HEIGHT}px` }}>
        <button type="button" onClick={() => { void handleVideoUpload(); }} onPointerDown={(e) => e.stopPropagation()} className="inline-flex h-6 w-6 items-center justify-center rounded border border-green-500/40 bg-green-500/20 text-green-200 transition-colors hover:bg-green-500/30 text-[11px]" title="Upload video file" disabled={disabled} data-nodrag="true">{'\u{1F4C1}'}</button>
        <button type="button" onClick={handleVideoUrlInput} onPointerDown={(e) => e.stopPropagation()} className="inline-flex h-6 w-6 items-center justify-center rounded border border-blue-500/40 bg-blue-500/20 text-blue-200 transition-colors hover:bg-blue-500/30 text-[11px]" title="Upload from URL" disabled={disabled} data-nodrag="true">{'\u{1F517}'}</button>
        <button type="button" onClick={handleVideoDownload} onPointerDown={(e) => e.stopPropagation()} className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/20 text-white/60 transition-colors hover:bg-white/10 text-[11px]" title="Download" disabled={disabled || !videoSource} data-nodrag="true">{'\u2B07\uFE0F'}</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setShowVideoFrameExtractModal(true); }} onPointerDown={(e) => e.stopPropagation()} className="inline-flex h-6 w-6 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 transition-colors hover:bg-emerald-500/30 text-[11px]" title="Extract frame" disabled={disabled || !videoSource || isPreparingVideoCrop} data-nodrag="true">{'\u{1F3AC}'}</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setShowVideoTrimModal(true); }} onPointerDown={(e) => e.stopPropagation()} className="inline-flex h-6 w-6 items-center justify-center rounded border border-sky-500/40 bg-sky-500/20 text-sky-200 transition-colors hover:bg-sky-500/30 text-[11px]" title="Trim video" disabled={disabled || !videoSource || isPreparingVideoCrop} data-nodrag="true">{'\u23F1\uFE0F'}</button>
        <div className="flex-1" />
        <label className="flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">
          Scale
          <select
            value={String(videoScale)}
            onChange={(event) => {
              const nextScale = Number(event.target.value);
              if (Number.isFinite(nextScale) && nextScale > 0) onChangeMeta(node.node_id, { video_scale: nextScale });
            }}
            className="rounded bg-black/40 px-2 py-1 text-[11px] text-white focus:outline-none"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            data-nodrag="true"
            disabled={disabled || !videoSource}
          >
            {VIDEO_SCALE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}x</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">
          <input
            type="checkbox"
            checked={videoControlsEnabled}
            onChange={(event) => onChangeMeta(node.node_id, { controls: event.target.checked })}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className="accent-blue-500"
            disabled={disabled || !videoSource}
            data-nodrag="true"
          />
          Controls
        </label>
      </div>

      {/* Video Preview + Notes */}
      <div className="flex-1 min-h-0 flex flex-col gap-3 pt-2">
        <VideoPreview
          key={`${node.node_id}-${videoPreviewReloadToken}`}
          source={videoSource}
          controls={videoControlsEnabled}
          scale={videoScale}
          onRetry={handleVideoRetry}
          onDimensionsChange={handleVideoDimensions}
          className="flex-shrink-0"
        />
        <div className="flex-1 flex flex-col">
          <textarea
            value={videoNotes}
            onChange={(event) => handleVideoNotesChange(event.target.value)}
            placeholder="Write what's important to remember when working with this video..."
            className="flex-1 w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
            style={{ minHeight: VIDEO_NOTES_MIN_HEIGHT }}
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
