import { memo } from 'react';

/**
 * Memoized component for editing output_example.
 * Isolated from parent modal re-renders to eliminate typing lag.
 */
interface OutputExampleEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const OutputExampleEditor = memo(({ value, onChange, onBlur, disabled, placeholder }: OutputExampleEditorProps) => {
  return (
    <textarea
      className="w-full h-32 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
      placeholder={placeholder || 'E.g.: {"nodes": [{"type": "text", "title": "...", "content": "..."}]}'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      spellCheck={false}
    />
  );
});
OutputExampleEditor.displayName = 'OutputExampleEditor';

/**
 * Memoized component for editing system_prompt.
 * Same optimization to avoid typing lag.
 */
interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const SystemPromptEditor = memo(({ value, onChange, onBlur, disabled, placeholder }: SystemPromptEditorProps) => {
  return (
    <textarea
      className="w-full h-48 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
      placeholder={placeholder || 'Enter system prompt...'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      spellCheck={false}
    />
  );
});
SystemPromptEditor.displayName = 'SystemPromptEditor';
