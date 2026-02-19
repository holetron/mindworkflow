/**
 * FileNodeContent - File attachments, upload, and notes.
 * Extracted from FlowNodeCard.tsx lines ~6902-7048.
 */
import React from 'react';
import type { FlowNode } from './nodeTypes';
import { FILE_NOTES_MIN_HEIGHT } from './nodeConstants';

interface FileNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  isFileUploading?: boolean;
  setIsFileUploading?: React.Dispatch<React.SetStateAction<boolean>>;
  folderFileNotes: string;
  handleFolderFileNotesChange: (value: string) => void;
  handleFolderFileNotesFocus: () => void;
  handleFolderFileNotesBlur: () => void;
  handleFileDownload?: (fileName: string, fileData: string | ArrayBuffer | null) => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  autoRenameFromSource?: (source: string) => void;
  [key: string]: any;
}

export function FileNodeContent(props: FileNodeContentProps) {
  const {
    node,
    disabled,
    isFileUploading = false,
    setIsFileUploading,
    folderFileNotes,
    handleFolderFileNotesChange,
    handleFolderFileNotesFocus,
    handleFolderFileNotesBlur,
    handleFileDownload,
    onChangeMeta,
    autoRenameFromSource,
  } = props;

  const attachments = (node.meta?.attachments as string[]) || [];
  const fileData = node.meta?.file_data;
  const fileName = node.meta?.file_name as string | undefined;
  const hasFiles = attachments.length > 0 || fileName;

  const handleUploadFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        setIsFileUploading?.(true);
        files.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const data = event.target?.result as string;
            if (index === 0) {
              onChangeMeta(node.node_id, {
                file_name: file.name,
                file_data: data,
                file_size: file.size,
                file_type: file.type,
              });
              autoRenameFromSource?.(file.name);
            } else {
              const currentAttachments = (node.meta?.attachments as string[]) || [];
              onChangeMeta(node.node_id, {
                attachments: [...currentAttachments, file.name],
              });
            }
            if (index === files.length - 1) {
              setIsFileUploading?.(false);
            }
          };
          reader.onerror = () => {
            console.error('Error reading file:', file.name);
            setIsFileUploading?.(false);
          };
          reader.readAsDataURL(file);
        });
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 space-y-3">
        {hasFiles ? (
          <div className="space-y-2">
            <div className="text-xs text-white/70 mb-2">Attached files:</div>
            {attachments.map((file: string, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/10"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{'\u{1F4CE}'}</span>
                  <span className="text-sm text-white/80 truncate max-w-48">{file}</span>
                </div>
                <button
                  onClick={() => {
                    const newAttachments = attachments.filter((_, i) => i !== index);
                    onChangeMeta(node.node_id, { attachments: newAttachments });
                  }}
                  className="text-red-400 hover:text-red-300 text-xs ml-2"
                >
                  {'\u2715'}
                </button>
              </div>
            ))}
            {fileName && (
              <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-base">{'\u{1F4C4}'}</span>
                  <span className="text-sm text-white/80 truncate max-w-48">{fileName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {typeof node.meta?.file_size === 'number' && (
                    <span className="text-xs text-white/50">
                      {((node.meta.file_size as number) / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  {fileData && handleFileDownload && (
                    <button
                      onClick={() => handleFileDownload(fileName, fileData as string | ArrayBuffer)}
                      className="text-blue-400 hover:text-blue-300 text-xs ml-1"
                      title="Download file"
                    >
                      {'\u2B07\uFE0F'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-center py-6 text-white/50 text-sm border border-dashed border-white/20 rounded">
              {'\u{1F4C1}'} No attached files
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUploadFiles}
                className="px-3 py-2 text-sm rounded bg-green-600/30 text-green-200 hover:bg-green-600/50 transition flex-1"
                disabled={isFileUploading || disabled}
              >
                {'\u{1F4C1}'} {isFileUploading ? 'Uploading...' : 'Upload files'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* File notes */}
      <div className="flex-1 flex flex-col" style={{ minHeight: FILE_NOTES_MIN_HEIGHT }}>
        <textarea
          value={folderFileNotes}
          onChange={(e) => handleFolderFileNotesChange(e.target.value)}
          onFocus={handleFolderFileNotesFocus}
          onBlur={handleFolderFileNotesBlur}
          placeholder="Write what's important to remember when working with these files..."
          disabled={disabled}
          className="flex-1 w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 nodrag"
          style={{ minHeight: FILE_NOTES_MIN_HEIGHT }}
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
