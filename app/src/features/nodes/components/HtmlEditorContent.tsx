/**
 * HtmlEditorContent - Rich text email editor node content.
 * Extracted from FlowNodeCard.tsx lines ~6105-6259.
 */
import React from 'react';
import { RichTextEditor } from '../../../ui/RichTextEditor';
import type { FlowNode } from './nodeTypes';

interface HtmlEditorContentProps {
  node: FlowNode;
  disabled: boolean;
  contentValue: string;
  contentInputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  handleContentChange: (content: string) => void;
  startContentEditing: (source?: any) => void;
  finishContentEditing: () => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
}

export function HtmlEditorContent({
  node,
  disabled,
  contentValue,
  contentInputRef,
  handleContentChange,
  startContentEditing,
  finishContentEditing,
  onChangeMeta,
}: HtmlEditorContentProps) {
  const editorMode = (node.meta?.editor_mode as string) || 'preview';

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Mode Toggle and Quick Actions */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-white/70">Mode:</span>
          {(['rich', 'code', 'preview'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChangeMeta(node.node_id, { editor_mode: mode })}
              className={`px-2 py-1 rounded transition-colors ${
                editorMode === mode
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-black/20 text-white/60 border border-white/10 hover:bg-white/5'
              }`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {mode === 'rich' ? '\u2709\uFE0F' : mode === 'code' ? '\u{1F4BB}' : '\u{1F441}\uFE0F'}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => {
              const template = `<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Email Template</title>\n  <style>\n    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f5f5f5; }\n    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }\n    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }\n    .content { padding: 20px; line-height: 1.6; }\n    .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }\n  </style>\n</head>\n<body>\n  <div class="container">\n    <div class="header"><h1>Email Header</h1></div>\n    <div class="content">\n      <p>Hello!</p>\n      <p>This is an HTML email template.</p>\n    </div>\n    <div class="footer">You received this email because you subscribed.</div>\n  </div>\n</body>\n</html>`;
              handleContentChange(template);
            }}
            className="px-2 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors"
            onPointerDown={(e) => e.stopPropagation()}
            title="Upload template"
          >
            {'\u{1F4DD}'}
          </button>
          <button
            onClick={() => {
              const blob = new Blob([contentValue], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `email-${Date.now()}.html`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2 py-1 bg-green-500/20 text-green-300 border border-green-500/30 rounded hover:bg-green-500/30 transition-colors"
            onPointerDown={(e) => e.stopPropagation()}
            title="Download HTML"
          >
            {'\u{1F4BE}'}
          </button>
        </div>
      </div>

      {/* Editor Content */}
      {editorMode === 'rich' ? (
        <div
          className="flex-1 min-h-0"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          data-nodrag="true"
        >
          <RichTextEditor
            value={contentValue}
            onChange={handleContentChange}
            onFocus={startContentEditing}
            onBlur={finishContentEditing}
            placeholder="Create a beautiful HTML email..."
            disabled={disabled}
            height={300}
            mode="full"
          />
        </div>
      ) : editorMode === 'code' ? (
        <textarea
          ref={contentInputRef}
          value={contentValue}
          onChange={(e) => handleContentChange(e.target.value)}
          onFocus={(event) => { event.stopPropagation(); startContentEditing(event.currentTarget); }}
          onBlur={(event) => { event.stopPropagation(); finishContentEditing(); }}
          placeholder={'<!DOCTYPE html>\n<html>\n<body>\n  <!-- Your email content -->\n</body>\n</html>'}
          disabled={disabled}
          className="flex-1 p-3 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag font-mono"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          draggable={false}
          data-nodrag="true"
          style={{ height: '300px', fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace', lineHeight: '1.5', tabSize: 2 }}
        />
      ) : (
        <div className="flex-1 p-3 bg-black/20 border border-white/10 rounded text-sm overflow-auto" style={{ height: '300px' }}>
          <div className="bg-white text-black p-4 rounded" dangerouslySetInnerHTML={{ __html: contentValue }} />
        </div>
      )}
    </div>
  );
}
