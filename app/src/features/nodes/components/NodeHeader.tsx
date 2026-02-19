import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent, KeyboardEvent } from 'react';
import { COLOR_PALETTE } from './nodeConstants';
import type { FlowNode } from './nodeTypes';

// Emoji constants to avoid JSX unicode-escape issues
const EMOJI_PAPERCLIP = '\u{1F4CE}';
const EMOJI_PALETTE = '\u{1F3A8}';
const EMOJI_TRASH = '\u{1F5D1}\uFE0F';

interface NodeHeaderProps {
  node: FlowNode;
  baseColor: string;
  typeIcon: string;
  selected: boolean;
  disabled: boolean;
  isGenerating: boolean;
  collapsed: boolean;
  isAiNode: boolean;
  onCollapse: () => void;
  onColorChange: (color: string) => void;
  onTitleChange: (nodeId: string, title: string) => void;
  onSettingsOpen: () => void;
  onDelete: () => void;
  showCollapseButton: boolean;
}

export function NodeHeader({
  node,
  baseColor,
  typeIcon,
  selected,
  disabled,
  isGenerating,
  collapsed,
  isAiNode,
  onCollapse,
  onColorChange,
  onTitleChange,
  onSettingsOpen,
  onDelete,
  showCollapseButton,
}: NodeHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(node.title);
  const [colorOpen, setColorOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleSubmitRef = useRef(false);

  useEffect(() => {
    setTitleValue(node.title);
  }, [node.title]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const handleTitleEdit = useCallback((e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    setEditingTitle(true);
    setTitleValue(node.title);
  }, [node.title]);

  const handleTitleSubmit = useCallback(() => {
    titleSubmitRef.current = true;
    onTitleChange(node.node_id, titleValue.trim());
    setEditingTitle(false);
    setTimeout(() => { titleSubmitRef.current = false; }, 0);
  }, [onTitleChange, node.node_id, titleValue]);

  const handleTitleCancel = useCallback(() => {
    setTitleValue(node.title);
    setEditingTitle(false);
    titleSubmitRef.current = false;
  }, [node.title]);

  const handleTitleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleTitleSubmit();
    else if (e.key === 'Escape') handleTitleCancel();
  }, [handleTitleSubmit, handleTitleCancel]);

  const handleTitleInputBlur = useCallback(() => {
    if (titleSubmitRef.current) { titleSubmitRef.current = false; return; }
    handleTitleCancel();
  }, [handleTitleCancel]);

  const handleColorButtonClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setColorOpen(!colorOpen);
  }, [colorOpen]);

  const handleColorPickerClick = useCallback((e: MouseEvent<HTMLButtonElement>, color: string) => {
    e.preventDefault();
    e.stopPropagation();
    onColorChange(color);
    setColorOpen(false);
  }, [onColorChange]);

  const toolbarButtonStyle = { width: '28px', height: '28px', display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, fontSize: '14px' };

  return (
    <>
      <div
        className="flow-node__header"
        style={{ backgroundColor: `${baseColor}25`, borderBottom: `1px solid ${baseColor}40`, borderRadius: '8px 8px 0 0' }}
      >
        <div className="flow-node__identity">
          <div className="flow-node__type-icon relative" style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', boxShadow: `0 2px 4px ${baseColor}30` }}>
            {isGenerating ? (
              <div className="relative flex items-center justify-center">
                <span className="absolute opacity-30">{typeIcon}</span>
                <div className="w-5 h-5 relative">
                  <div className="w-full h-full border-2 border-slate-400 border-t-sky-500 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            ) : typeIcon}
          </div>
          <div className="flow-node__identity-text">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="flow-node__title-input"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleInputBlur}
                onKeyDown={handleTitleKeyDown}
                onClick={(e) => e.stopPropagation()}
                maxLength={50}
                style={{ backgroundColor: `${baseColor}20`, border: `1px solid ${baseColor}` }}
                disabled={disabled}
              />
            ) : (
              <button
                type="button"
                className="flow-node__title-button"
                onClick={handleTitleEdit}
                disabled={disabled}
                style={{ backgroundColor: selected ? `${baseColor}30` : `${baseColor}20` }}
              >
                {node.title}
              </button>
            )}
            <div className="flow-node__meta-row">
              <span className="flow-node__meta-pill" style={{ backgroundColor: `${baseColor}30` }}>{node.type}</span>
              <span className="flow-node__meta-id">{node.node_id.slice(-8)}</span>
              {(node.meta?.attachments && Array.isArray(node.meta.attachments)) ? (
                <span className="text-blue-300" title="Has attached files">
                  {EMOJI_PAPERCLIP} {String((node.meta.attachments as string[]).length)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flow-node__toolbar">
          {showCollapseButton && (
            <button type="button" className="flow-node__toolbar-button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCollapse(); }} title={collapsed ? 'Expand' : 'Collapse'} disabled={disabled} style={toolbarButtonStyle}>
              {collapsed ? '\u2795' : '\u2796'}
            </button>
          )}
          <button type="button" className="flow-node__toolbar-button" onClick={handleColorButtonClick} title="Change color" disabled={disabled} style={toolbarButtonStyle}>{EMOJI_PALETTE}</button>
          <button type="button" className="flow-node__toolbar-button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSettingsOpen(); }} title="Node settings" disabled={disabled} style={toolbarButtonStyle}>{'\u2699\uFE0F'}</button>
          <button type="button" className="flow-node__toolbar-button text-red-400 hover:text-red-300" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} title="Delete node" disabled={disabled} style={toolbarButtonStyle}>{EMOJI_TRASH}</button>
        </div>
      </div>

      {/* Color Palette */}
      {colorOpen && (
        <div className="absolute z-20 top-16 right-4 p-3 bg-slate-900 rounded-lg border border-slate-700 shadow-lg">
          <div className="grid grid-cols-4 gap-2">
            {COLOR_PALETTE.map((color) => (
              <button key={color} type="button" className="h-6 w-6 rounded-full border border-white/20 transition hover:scale-110" style={{ backgroundColor: color }} onClick={(e) => handleColorPickerClick(e, color)} title={`Change to ${color}`} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
