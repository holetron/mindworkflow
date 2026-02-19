import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, X, Send } from 'lucide-react';
import { AgentInputFields } from '../AgentInputFields';
import type { AgentInputField } from '../types';

interface ChatInputPanelProps {
  input: string;
  setInput: (value: string) => void;
  sending: boolean;
  attachedFiles: File[];
  uploadedFiles: any[];
  uploading?: boolean;
  inputFields: AgentInputField[];
  inputFieldsData: Record<string, any>;
  setInputFieldsData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  agentPresetId?: string | null;
  onSend: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onShowPreview?: () => void;
  compact?: boolean;
}

export function ChatInputPanel({
  input,
  setInput,
  sending,
  attachedFiles,
  uploadedFiles,
  uploading,
  inputFields,
  inputFieldsData,
  setInputFieldsData,
  agentPresetId,
  onSend,
  onFileSelect,
  onRemoveFile,
  onShowPreview,
  compact = false,
}: ChatInputPanelProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  return (
    <>
      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploading && (
            <div className="px-2 py-1 bg-blue-500/20 border border-blue-500 rounded text-xs text-blue-300">Uploading...</div>
          )}
          {attachedFiles.map((file, index) => {
            const isImage = file.type.startsWith('image/');
            const uploaded = uploadedFiles[index];
            return compact ? (
              <div key={index} className="flex items-center gap-1 px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button onClick={() => onRemoveFile(index)} className="hover:text-red-400"><X size={14} /></button>
              </div>
            ) : (
              <div key={index} className="relative flex items-center gap-2 px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 border border-slate-600">
                {isImage && uploaded ? (
                  <img src={uploaded.url} alt={file.name} className="w-12 h-12 object-cover rounded" />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center bg-slate-600 rounded">doc</div>
                )}
                <div className="flex flex-col">
                  <span className="truncate max-w-[120px] font-medium">{file.name}</span>
                  <span className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
                <button onClick={() => onRemoveFile(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 hover:bg-red-600 rounded-full text-white text-xs">x</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Message input row */}
      <div className="flex gap-2 mb-2">
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="px-2 py-2 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors disabled:opacity-50" title="Attach files">
          <Paperclip size={18} />
        </button>
        <input ref={fileInputRef} type="file" multiple onChange={onFileSelect} className="hidden" />
        <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={t('chat.type_message')} rows={1} disabled={sending}
          className="flex-grow px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm disabled:opacity-50 overflow-y-auto"
          style={{ minHeight: '40px', maxHeight: '96px' }} />
        <button onClick={onSend} disabled={!input.trim() || sending}
          className="w-[52px] px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          title={sending ? 'Sending...' : 'Send message'}>
          {sending ? '...' : <Send size={18} />}
        </button>
      </div>

      {/* Dynamic input fields */}
      {(inputFields.length > 0 || agentPresetId) && (
        <div className="space-y-2">
          {inputFields.length > 0 && (
            <AgentInputFields fields={inputFields} values={inputFieldsData} onChange={setInputFieldsData} />
          )}
          {agentPresetId && onShowPreview && (
            <button onClick={onShowPreview}
              className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5">
              <span>API Request Preview</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
