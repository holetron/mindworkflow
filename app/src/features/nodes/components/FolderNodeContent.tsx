/**
 * FolderNodeContent - Folder node with drop zone, children list/grid, and notes.
 * Extracted from FlowNodeCard.tsx lines ~6636-6901.
 */
import React from 'react';
import type { FlowNode } from './nodeTypes';
import { TYPE_ICONS, FOLDER_NOTES_MIN_HEIGHT } from './nodeConstants';

interface FolderNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  folderChildNodes: FlowNode[];
  folderContextLimit: number;
  folderDisplayMode: 'list' | 'grid';
  isFolderDropActive: boolean;
  folderImportMessage: string;
  folderFileNotes: string;
  handleFolderContextLimitChange: (value: number) => void;
  handleFolderDisplayChange: (mode: 'list' | 'grid') => void;
  handleFolderDropZoneDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFolderDropZoneDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFolderDropZoneDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFolderDropZoneDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFolderFileNotesChange: (value: string) => void;
  handleFolderFileNotesFocus: () => void;
  handleFolderFileNotesBlur: () => void;
  getChildImagePreview: (child: FlowNode) => string | null;
  getChildPreviewText: (child: FlowNode) => string;
  onRemoveNodeFromFolder?: (nodeId: string, folderId?: string, position?: { x: number; y: number }) => void | Promise<void>;
  [key: string]: any;
}

export function FolderNodeContent(props: FolderNodeContentProps) {
  const {
    node, disabled, folderChildNodes, folderContextLimit, folderDisplayMode,
    isFolderDropActive, folderImportMessage, folderFileNotes,
    handleFolderContextLimitChange, handleFolderDisplayChange,
    handleFolderDropZoneDragEnter, handleFolderDropZoneDragOver,
    handleFolderDropZoneDragLeave, handleFolderDropZoneDrop,
    handleFolderFileNotesChange, handleFolderFileNotesFocus, handleFolderFileNotesBlur,
    getChildImagePreview, getChildPreviewText, onRemoveNodeFromFolder,
  } = props;

  const renderChildItem = (child: FlowNode, isGrid: boolean) => {
    const icon = TYPE_ICONS[child.type] ?? '\u{1F9E9}';
    const previewImage = getChildImagePreview(child);
    const previewText = getChildPreviewText(child);
    const title = child.title || child.node_id;
    const parentFolderId = node.node_id;

    if (isGrid) {
      return (
        <div
          key={child.node_id}
          className="group relative flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-white/40"
          draggable={!disabled}
          onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('application/mwf-folder-node', JSON.stringify({ node_id: child.node_id, folder_id: node.node_id })); event.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(event) => event.stopPropagation()}
          data-nodrag="true"
        >
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30 aspect-square">
            {previewImage ? (
              <img src={previewImage} alt={title} className="h-full w-full object-cover" draggable={false} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="flex h-full items-center justify-center text-3xl text-white/50">{icon}</div>
            )}
            <button type="button" className="absolute top-2 right-2 rounded-full border border-white/30 bg-black/60 px-2 py-1 text-[11px] text-white/80 opacity-0 transition group-hover:opacity-100" onClick={() => onRemoveNodeFromFolder?.(child.node_id, parentFolderId)} disabled={!onRemoveNodeFromFolder || disabled} title="Return to canvas">{'\u2197'}</button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/80" title={title}><span className="text-base">{icon}</span><span className="truncate">{title}</span></div>
            {previewText && <div className="text-[11px] text-white/60 line-clamp-2">{previewText}</div>}
          </div>
        </div>
      );
    }

    return (
      <div
        key={child.node_id}
        className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-2 hover:border-white/30"
        draggable={!disabled}
        onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('application/mwf-folder-node', JSON.stringify({ node_id: child.node_id, folder_id: node.node_id })); event.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(event) => event.stopPropagation()}
        data-nodrag="true"
      >
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-white/10 bg-black/30">
          {previewImage ? (
            <img src={previewImage} alt={title} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span className="text-xl text-white/50">{icon}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80" title={title}><span className="text-base">{icon}</span><span className="truncate">{title}</span></div>
          {previewText && <div className="truncate text-[11px] text-white/60" title={previewText}>{previewText}</div>}
        </div>
        <button type="button" className="rounded border border-white/20 bg-black/30 px-2 py-1 text-[11px] text-white/70 hover:border-white/40 hover:text-white" onClick={() => onRemoveNodeFromFolder?.(child.node_id, parentFolderId)} disabled={!onRemoveNodeFromFolder || disabled} title="Return to canvas">{'\u2197'}</button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 rounded border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/70">
              Context
              <input type="number" min={1} max={24} value={folderContextLimit} onChange={(event) => handleFolderContextLimitChange(Number(event.target.value))} onClick={(event) => event.stopPropagation()} className="w-12 rounded bg-black/30 px-1 py-0.5 text-center text-white/80 focus:outline-none" disabled={disabled} />
            </label>
            <div className="flex overflow-hidden rounded border border-white/15 bg-black/20 text-[11px]">
              <button type="button" onClick={() => handleFolderDisplayChange('list')} className={`px-2 py-1 transition ${folderDisplayMode === 'list' ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'}`} disabled={disabled}>{'\u2630'}</button>
              <button type="button" onClick={() => handleFolderDisplayChange('grid')} className={`px-2 py-1 transition ${folderDisplayMode === 'grid' ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'}`} disabled={disabled}>{'\u25A6'}</button>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div
          data-folder-drop-zone={node.node_id}
          onDragEnter={handleFolderDropZoneDragEnter}
          onDragOver={handleFolderDropZoneDragOver}
          onDragLeave={handleFolderDropZoneDragLeave}
          onDrop={handleFolderDropZoneDrop}
          className={`rounded-lg border border-dashed transition-colors ${isFolderDropActive ? 'border-emerald-400/70 bg-emerald-500/10 text-white/80 shadow-inner shadow-emerald-500/20' : 'border-white/20 bg-black/10 text-white/60'} ${folderChildNodes.length === 0 ? 'py-8' : 'py-3'} px-3`}
        >
          <div className="flex items-center gap-2 text-xs font-medium"><span>{'\u{1F4E5}'}</span><span>Drag nodes or files to this area</span></div>
          <div className="mt-1 text-[11px] text-white/50">Images and <span className="font-mono text-xs text-white/70">.txt</span> files up to 5000 characters will be added.</div>
          {folderChildNodes.length === 0 && <div className="mt-3 text-[11px] text-white/45">Nested nodes will appear here.</div>}
        </div>

        {folderImportMessage && <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-200 animate-pulse">{folderImportMessage}</div>}

        {/* Children */}
        {folderChildNodes.length > 0 && (
          <div className="flex-shrink-0">
            {folderDisplayMode === 'grid' ? (
              <div className="overflow-y-auto pr-1" style={{ maxHeight: '1200px' }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {folderChildNodes.map((child) => renderChildItem(child, true))}
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto space-y-1 pr-1" style={{ maxHeight: '1200px' }}>
                {folderChildNodes.map((child) => renderChildItem(child, false))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="flex-1 flex flex-col" style={{ minHeight: FOLDER_NOTES_MIN_HEIGHT }}>
        <textarea
          value={folderFileNotes}
          onChange={(e) => handleFolderFileNotesChange(e.target.value)}
          onFocus={handleFolderFileNotesFocus}
          onBlur={handleFolderFileNotesBlur}
          placeholder="Write what's important to remember when working with this folder..."
          disabled={disabled}
          className="flex-1 w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
          style={{ minHeight: FOLDER_NOTES_MIN_HEIGHT }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          draggable={false}
          data-nodrag="true"
        />
      </div>
    </div>
  );
}
