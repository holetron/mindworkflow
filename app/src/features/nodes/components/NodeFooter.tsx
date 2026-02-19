import {
  NODE_FOOTER_HEIGHT_NORMAL,
  NODE_FOOTER_HEIGHT_ANNOTATION,
} from '../../../constants/nodeSizes';
import { getModelType } from './nodeUtils';
import type { FlowNode } from './nodeTypes';

// Emoji constants to avoid JSX unicode-escape issues
const EMOJI_FOLDER = '\u{1F4C2}';
const EMOJI_FILE = '\u{1F4C4}';
const EMOJI_LINK = '\u{1F517}';
const EMOJI_CLIPBOARD = '\u{1F4CB}';
const EMOJI_CLAPPER = '\u{1F3AC}';
const BULLET = '\u2022';
const EM_DASH = '\u2014';

interface NodeFooterProps {
  node: FlowNode;
  baseColor: string;
  collapsed: boolean;
  isAiNode: boolean;
  imageViewMode: string;
  aiCharacterCount: number;
  currentProviderLabel: string;
  folderChildNodes: FlowNode[];
  folderContextLimit: number;
  videoFooterInfo: { primaryIcon: string; primaryLabel: string; fileName: string; sizeLabel: string | null } | null;
  videoFooterSecondaryNode: React.ReactNode;
  formattedVideoFileSize: string | null;
}

export function NodeFooter({
  node,
  baseColor,
  collapsed,
  isAiNode,
  imageViewMode,
  aiCharacterCount,
  currentProviderLabel,
  folderChildNodes,
  folderContextLimit,
  videoFooterInfo,
  videoFooterSecondaryNode,
  formattedVideoFileSize,
}: NodeFooterProps) {

  const footerHeight = node.type === 'image' && imageViewMode === 'edit'
    ? `${NODE_FOOTER_HEIGHT_ANNOTATION}px`
    : `${NODE_FOOTER_HEIGHT_NORMAL}px`;

  const renderCollapsedContent = () => {
    if (node.type === 'folder') {
      return (
        <>
          <div className="text-xs text-white/70 flex items-center gap-1"><span>{EMOJI_FOLDER}</span><span>Folder</span></div>
          <div className="text-xs text-white/50">{folderChildNodes.length} items {BULLET} Context {folderContextLimit}</div>
        </>
      );
    }
    return (
      <>
        <div className="text-xs text-white/70 flex items-center gap-2 truncate">
          {node.type === 'video' ? (
            <><span>{videoFooterInfo?.primaryIcon ?? EMOJI_CLAPPER}</span><span className="truncate">{videoFooterInfo?.primaryLabel ?? 'Video'}</span></>
          ) : (
            <span>{node.type.toUpperCase()}</span>
          )}
        </div>
        <div className="text-xs text-white/50 flex items-center gap-2 truncate">
          {renderCollapsedSecondary()}
        </div>
      </>
    );
  };

  const renderCollapsedSecondary = () => {
    if (node.type === 'image') {
      const imageFile = node.meta?.image_file;
      const imageUrl = node.meta?.image_url;
      if (imageFile && typeof imageFile === 'string') return <span className="truncate" title={imageFile}>{EMOJI_FILE} {imageFile}</span>;
      if (imageUrl && typeof imageUrl === 'string') return <span>{EMOJI_LINK} URL</span>;
      return <span>Not loaded</span>;
    }
    if (node.type === 'video') return videoFooterSecondaryNode ?? <span>Video not loaded</span>;
    if (node.type === 'file') return <span>File</span>;
    if (node.type === 'pdf') {
      const pdfUrl = node.meta?.pdf_url;
      const pdfFile = node.meta?.pdf_file;
      if (pdfUrl || pdfFile) return <span>{EMOJI_FILE} PDF</span>;
      return <span>PDF not loaded</span>;
    }
    if (node.type === 'markdown') {
      const viewMode = node.meta?.view_mode || 'preview';
      return <span>{EMOJI_CLIPBOARD} {viewMode === 'edit' ? 'Editor' : viewMode === 'preview' ? 'Preview' : 'Split'}</span>;
    }
    const chars = isAiNode ? aiCharacterCount : (node.content || '').length;
    return <span>Chars {chars.toLocaleString()}</span>;
  };

  const renderExpandedPrimary = () => {
    if (node.type === 'image') {
      const imageFile = node.meta?.image_file;
      const imageUrl = node.meta?.image_url;
      if (imageFile && typeof imageFile === 'string') return <span className="truncate" title={imageFile}>{EMOJI_FILE} {imageFile}</span>;
      if (imageUrl && typeof imageUrl === 'string') {
        try { return <span title={imageUrl}>{EMOJI_LINK} {new URL(imageUrl).hostname}</span>; } catch { return <span title={imageUrl}>{EMOJI_LINK} URL</span>; }
      }
      return <span>Image not loaded</span>;
    }
    if (node.type === 'video') {
      return <span className="flex items-center gap-2"><span>{videoFooterInfo?.primaryIcon ?? EMOJI_CLAPPER}</span><span className="text-white/60 whitespace-nowrap">{formattedVideoFileSize ?? EM_DASH}</span></span>;
    }
    if (node.type === 'file') return <span>Size: {EM_DASH}</span>;
    if (node.type === 'pdf') {
      const pdfUrl = node.meta?.pdf_url as string | undefined;
      const pdfFile = node.meta?.pdf_file;
      const currentPage = node.meta?.current_page || 1;
      const totalPages = node.meta?.total_pages || 0;
      if (pdfUrl) { try { return <span>{EMOJI_FILE} {new URL(pdfUrl).hostname} {BULLET} Page {currentPage}{totalPages ? `/${totalPages}` : ''}</span>; } catch { return <span>{EMOJI_FILE} PDF {BULLET} Page {currentPage}{totalPages ? `/${totalPages}` : ''}</span>; } }
      if (pdfFile) return <span>{EMOJI_FILE} File {BULLET} Page {currentPage}{totalPages ? `/${totalPages}` : ''}</span>;
      return <span>{EMOJI_FILE} PDF not loaded</span>;
    }
    if (node.type === 'markdown') {
      const viewMode = node.meta?.view_mode || 'preview';
      const lines = (node.content || '').split('\n').length;
      return <span>{EMOJI_CLIPBOARD} {viewMode === 'edit' ? 'Editor' : viewMode === 'preview' ? 'Preview' : 'Split'} {BULLET} {lines} lines</span>;
    }
    return (
      <span>
        {isAiNode && node.ai?.model ? (
          <>{getModelType(node.ai.model as string).emoji} {getModelType(node.ai.model as string).type}</>
        ) : (
          <>Chars {(isAiNode ? aiCharacterCount : (node.content || '').length).toLocaleString()}</>
        )}
      </span>
    );
  };

  const renderExpandedSecondary = () => {
    if (node.type === 'video') return <span className="flex items-center gap-2 truncate pl-[30px]">{videoFooterSecondaryNode ?? <span>Source not set</span>}</span>;
    if (node.type === 'image') {
      const imageUrl = node.meta?.image_url;
      if (imageUrl && typeof imageUrl === 'string') { try { return <span className="truncate" title={imageUrl}>{new URL(imageUrl).hostname}</span>; } catch { return <span className="truncate" title={imageUrl}>{imageUrl}</span>; } }
      const imageFile = node.meta?.image_file;
      if (imageFile && typeof imageFile === 'string') return <span className="truncate" title={imageFile}>{imageFile}</span>;
      return <span>Source not set</span>;
    }
    if (node.type === 'markdown') { const chars = (node.content || '').length; return <span>Chars {chars.toLocaleString()}</span>; }
    if (node.type === 'pdf') return <span>Click to open PDF settings</span>;
    if (node.type === 'file') { const fileName = node.meta?.file_name; return fileName ? <span className="truncate">{fileName as string}</span> : <span>No file selected</span>; }
    const chars = isAiNode ? aiCharacterCount : (node.content || '').length;
    return <span>Chars {chars.toLocaleString()}</span>;
  };

  const renderExpandedContent = () => {
    if (node.type === 'folder') {
      return (
        <>
          <div className="text-xs text-white/70 flex items-center gap-1"><span>{EMOJI_FOLDER}</span><span>Folder</span></div>
          <div className="text-xs text-white/50">{folderChildNodes.length} items {BULLET} Context {folderContextLimit}</div>
        </>
      );
    }
    return (
      <>
        <div className="text-xs text-white/70 flex items-center gap-2 truncate">
          <span className="flex items-center gap-2 truncate">{renderExpandedPrimary()}</span>
          {isAiNode && currentProviderLabel && (
            <span className="text-white/60 flex items-center gap-1"><span className="text-white/70">{currentProviderLabel}</span></span>
          )}
        </div>
        <div className="text-xs text-white/50 flex items-center gap-2 truncate">{renderExpandedSecondary()}</div>
      </>
    );
  };

  return (
    <div
      className="flow-node__footer"
      style={{
        backgroundColor: `${String(baseColor)}20`,
        borderTop: `1px solid ${String(baseColor)}30`,
        flexShrink: 0,
        height: footerHeight,
        transition: 'height 0.2s ease',
      } as React.CSSProperties}
    >
      <div className="flex justify-between items-center w-full px-3 py-2 gap-3">
        {collapsed ? renderCollapsedContent() : renderExpandedContent()}
      </div>
    </div>
  );
}
