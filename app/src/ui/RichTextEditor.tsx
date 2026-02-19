import { useCallback, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  height?: number;
  mode?: 'full' | 'compact';
  onFocus?: () => void;
  onBlur?: () => void;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  disabled = false,
  height = 200,
  mode = 'full',
  onFocus,
  onBlur,
}: RichTextEditorProps) {
  
  const modules = useMemo(() => {
    const baseModules = {
      toolbar: mode === 'full' ? [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['clean']
      ] : [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link'],
        ['clean']
      ],
      clipboard: {
        matchVisual: false,
      }
    };
    
    return baseModules;
  }, [mode]);

  const formats = useMemo(() => [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list', 'bullet', 'indent',
    'link', 'image', 'color', 'background',
    'align'
  ], []);

  const handleChange = useCallback((content: string) => {
    onChange(content);
  }, [onChange]);

  const handleFocus = useCallback(
    (_range: unknown, _source: unknown, _editor: unknown) => {
      onFocus?.();
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (_previous: unknown, _source: unknown, _editor: unknown) => {
      onBlur?.();
    },
    [onBlur],
  );

  return (
    <div 
      className="rich-text-editor"
      style={{ 
        height: `${height}px`,
        '--editor-height': `${height - 42}px` // Subtract toolbar height
      } as React.CSSProperties}
    >
      <ReactQuill
        theme="snow"
        value={value}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      />
      
      <style>{`
        .rich-text-editor .ql-container {
          flex: 1;
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
          background: rgba(0, 0, 0, 0.2);
          color: white;
        }
        
        .rich-text-editor .ql-toolbar {
          border-top-left-radius: 4px;
          border-top-right-radius: 4px;
          background: rgba(0, 0, 0, 0.3);
          border-color: rgba(255, 255, 255, 0.1);
        }
        
        .rich-text-editor .ql-editor {
          height: var(--editor-height);
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
          line-height: 1.4;
        }
        
        .rich-text-editor .ql-toolbar {
          padding: 4px 8px;
          font-size: 11px;
        }
        
        .rich-text-editor .ql-toolbar button {
          width: 24px;
          height: 24px;
          padding: 2px;
        }
        
        .rich-text-editor .ql-toolbar .ql-picker-label {
          font-size: 11px;
          padding: 2px 4px;
        }
        
        .rich-text-editor .ql-editor.ql-blank::before {
          color: rgba(255, 255, 255, 0.4);
        }
        
        .rich-text-editor .ql-toolbar .ql-picker-label {
          color: rgba(255, 255, 255, 0.8);
        }
        
        .rich-text-editor .ql-toolbar .ql-stroke {
          stroke: rgba(255, 255, 255, 0.8);
        }
        
        .rich-text-editor .ql-toolbar .ql-fill {
          fill: rgba(255, 255, 255, 0.8);
        }
        
        .rich-text-editor .ql-toolbar button:hover .ql-stroke {
          stroke: #2563eb;
        }
        
        .rich-text-editor .ql-toolbar button:hover .ql-fill {
          fill: #2563eb;
        }
        
        .rich-text-editor .ql-toolbar button.ql-active .ql-stroke {
          stroke: #2563eb;
        }
        
        .rich-text-editor .ql-toolbar button.ql-active .ql-fill {
          fill: #2563eb;
        }
        
        .rich-text-editor .ql-picker-options {
          background: rgba(0, 0, 0, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .rich-text-editor .ql-picker-item {
          color: rgba(255, 255, 255, 0.8);
        }
        
        .rich-text-editor .ql-picker-item:hover {
          background: rgba(37, 99, 235, 0.2);
          color: white;
        }
      `}</style>
    </div>
  );
}
