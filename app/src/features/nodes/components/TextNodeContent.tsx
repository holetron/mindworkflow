/**
 * TextNodeContent - Text/Markdown content with toolbar (edit/preview, text splitter, font size, download).
 * Extracted from FlowNodeCard.tsx lines ~7120-7261.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { MarkdownRenderer } from '../../../ui/MarkdownRenderer';
import type { FlowNode, TextSplitterConfig } from './nodeTypes';
import { TOOLBAR_BUTTON_BASE_CLASSES, TOOLBAR_BUTTON_INACTIVE_CLASSES } from './nodeConstants';

interface TextNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  contentValue: string;
  contentInputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  handleContentChange: (content: string) => void;
  startContentEditing: (source?: any) => void;
  finishContentEditing: () => void;
  contentFontSizeStyle?: string;
  // Text-specific
  textViewMode: 'edit' | 'preview';
  handleSetTextViewMode: (mode: 'edit' | 'preview') => void;
  isTextSplitterOpen: boolean;
  setIsTextSplitterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  textSplitterButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  textSplitterPopoverRef: React.MutableRefObject<HTMLDivElement | null>;
  textSplitterDraft: TextSplitterConfig;
  textSplitterPopoverStyle: React.CSSProperties | null;
  handleTextSplitterChange: (patch: Partial<TextSplitterConfig>) => void;
  handleSplitTextConfirm: () => Promise<void>;
  canSplitTextContent: boolean;
  TEXT_FONT_SIZE_PRESETS: ReadonlyArray<{ label: string; value: string }>;
  textFontSizeSelectValue: string;
  handleTextFontSizeChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  markdownPreviewSettings: Record<string, any>;
  markdownPreviewContainerStyle: React.CSSProperties;
  [key: string]: any;
}

export function TextNodeContent(props: TextNodeContentProps) {
  const {
    node,
    disabled,
    contentValue,
    contentInputRef,
    handleContentChange,
    startContentEditing,
    finishContentEditing,
    contentFontSizeStyle,
    textViewMode,
    handleSetTextViewMode,
    isTextSplitterOpen,
    setIsTextSplitterOpen,
    textSplitterButtonRef,
    textSplitterPopoverRef,
    textSplitterDraft,
    textSplitterPopoverStyle,
    handleTextSplitterChange,
    handleSplitTextConfirm,
    canSplitTextContent,
    TEXT_FONT_SIZE_PRESETS,
    textFontSizeSelectValue,
    handleTextFontSizeChange,
    markdownPreviewSettings,
    markdownPreviewContainerStyle,
  } = props;

  const toolbarButtonBaseClasses = TOOLBAR_BUTTON_BASE_CLASSES;
  const toolbarButtonInactiveClasses = TOOLBAR_BUTTON_INACTIVE_CLASSES;

  const textSplitterPopover =
    isTextSplitterOpen && textSplitterPopoverStyle && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={textSplitterPopoverRef}
            className="space-y-3 rounded-lg border border-white/10 bg-slate-900/95 p-4 text-xs text-white/80 shadow-2xl"
            style={textSplitterPopoverStyle}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="font-medium text-white/90">Split Settings</div>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/50">
              Separator
              <input
                type="text"
                value={textSplitterDraft.separator}
                onChange={(event) => handleTextSplitterChange({ separator: event.target.value })}
                placeholder="---"
                className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/90 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/50">
              Sub-separator
              <input
                type="text"
                value={textSplitterDraft.subSeparator}
                onChange={(event) => handleTextSplitterChange({ subSeparator: event.target.value })}
                placeholder="-"
                className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/90 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/50">
              Naming
              <select
                value={textSplitterDraft.namingMode}
                onChange={(event) =>
                  handleTextSplitterChange({ namingMode: event.target.value === 'manual' ? 'manual' : 'auto' })
                }
                className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/90 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              >
                <option value="auto">Auto by segment</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <p className="text-[11px] leading-relaxed text-white/50">
              Full node tree will appear in the next splitter implementation step.
            </p>
            <button
              type="button"
              className="w-full rounded-md border border-emerald-400/60 bg-emerald-500/25 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleSplitTextConfirm}
              disabled={!canSplitTextContent || disabled}
            >
              Split Text
            </button>
            {!canSplitTextContent && (
              <div className="text-[10px] text-emerald-200/70">
                Add content to the node to activate splitting.
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative flex flex-wrap items-center gap-1" data-nodrag="true">
        <button
          type="button"
          onClick={() => handleSetTextViewMode('edit')}
          onPointerDown={(event) => event.stopPropagation()}
          className={`${toolbarButtonBaseClasses} ${
            textViewMode === 'edit'
              ? 'border-blue-500/50 bg-blue-500/25 text-blue-100 shadow-inner shadow-blue-500/30'
              : toolbarButtonInactiveClasses
          }`}
          aria-label="Edit mode"
          title="Edit mode"
          disabled={disabled}
          aria-pressed={textViewMode === 'edit'}
        >
          {'\u270F\uFE0F'}
        </button>
        <button
          type="button"
          onClick={() => handleSetTextViewMode('preview')}
          onPointerDown={(event) => event.stopPropagation()}
          className={`${toolbarButtonBaseClasses} ${
            textViewMode === 'preview'
              ? 'border-sky-500/50 bg-sky-500/25 text-sky-100 shadow-inner shadow-sky-500/30'
              : toolbarButtonInactiveClasses
          }`}
          aria-label="Preview mode"
          title="Preview mode"
          disabled={disabled}
          aria-pressed={textViewMode === 'preview'}
        >
          {'\u{1F441}\uFE0F'}
        </button>
        <div className="relative">
          <button
            ref={textSplitterButtonRef}
            type="button"
            onClick={() => setIsTextSplitterOpen((prev) => !prev)}
            onPointerDown={(event) => event.stopPropagation()}
            className={`${toolbarButtonBaseClasses} border-emerald-500/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30`}
            aria-expanded={isTextSplitterOpen}
            aria-label="Split into nodes"
            title="Split into nodes"
            disabled={disabled}
          >
            /
          </button>
        </div>
        <select
          value={textFontSizeSelectValue}
          onChange={handleTextFontSizeChange}
          onPointerDown={(event) => event.stopPropagation()}
          className="h-6 rounded border border-white/15 bg-black/30 px-1 text-[10px] text-white/80 focus:border-emerald-400 focus:outline-none"
          title="Font size"
          disabled={disabled}
        >
          {TEXT_FONT_SIZE_PRESETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            const markdownContent = contentValue;
            const blob = new Blob([markdownContent], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `document-${Date.now()}.md`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className={`${toolbarButtonBaseClasses} bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30`}
          onPointerDown={(event) => event.stopPropagation()}
          title="Download Markdown"
          disabled={disabled}
        >
          {'\u{1F4BE}'}
        </button>
      </div>

      {textViewMode === 'preview' ? (
        <div
          className="flex flex-1 flex-col min-h-0 rounded-lg border p-4 text-sm text-white/90 shadow-inner"
          style={{
            ...markdownPreviewContainerStyle,
            boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.35)',
          }}
        >
          <div
            className="flex-1 overflow-auto"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              fontSize: contentFontSizeStyle ?? '13px',
            }}
          >
            <MarkdownRenderer content={contentValue} settings={markdownPreviewSettings} />
          </div>
        </div>
      ) : (
        <textarea
          ref={contentInputRef}
          value={contentValue}
          onChange={(event) => handleContentChange(event.target.value)}
          onFocus={(event) => {
            event.stopPropagation();
            startContentEditing(event.currentTarget);
          }}
          onBlur={(event) => {
            event.stopPropagation();
            finishContentEditing();
          }}
          placeholder="Enter content..."
          disabled={disabled}
          className="flex-1 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/90 shadow-inner shadow-black/30 resize-none nodrag font-mono tracking-wide"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          draggable={false}
          data-nodrag="true"
          style={{
            minHeight: '180px',
            lineHeight: '1.45',
            fontSize: contentFontSizeStyle ?? '13px',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        />
      )}
      {textSplitterPopover}
    </div>
  );
}
