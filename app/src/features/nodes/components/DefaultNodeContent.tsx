import React from 'react';

interface DefaultNodeContentProps {
  contentValue: string;
  contentInputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  handleContentChange: (content: string) => void;
  startContentEditing: (source?: any) => void;
  finishContentEditing: () => void;
  disabled: boolean;
  contentFontSizeStyle?: string;
}

export function DefaultNodeContent({
  contentValue,
  contentInputRef,
  handleContentChange,
  startContentEditing,
  finishContentEditing,
  disabled,
  contentFontSizeStyle,
}: DefaultNodeContentProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <textarea
        ref={contentInputRef}
        value={contentValue}
        onChange={(e) => handleContentChange(e.target.value)}
        onFocus={(event) => {
          event.stopPropagation();
          startContentEditing(event.currentTarget);
        }}
        onBlur={(event) => {
          event.stopPropagation();
          finishContentEditing();
        }}
        placeholder="Enter text..."
        disabled={disabled}
        className="flex-1 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/90 shadow-inner shadow-black/30 resize-none nodrag"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        draggable={false}
        data-nodrag="true"
        style={{
          minHeight: '120px',
          lineHeight: '1.45',
          fontSize: contentFontSizeStyle ?? '13px',
        }}
      />
    </div>
  );
}
