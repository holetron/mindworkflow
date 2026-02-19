import React, { useState, useEffect } from 'react';
import {
  Star,
  Edit2,
  Trash2,
  Copy,
  Settings,
  MoreVertical,
  Share2,
} from 'lucide-react';
import type { AgentItemProps } from './types';
import { getModelType } from './types';

/** Agent row for the list view, with resizable prompt panels. */
export function AgentListItem({
  preset,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleFavorite,
  onQuickEdit,
  onShare,
  onChatWith,
  activeMenu,
  setActiveMenu,
}: AgentItemProps) {
  const [promptWidth, setPromptWidth] = useState(50); // Percentage for system prompt
  const [isDragging, setIsDragging] = useState(false);
  const isMenuOpen = activeMenu === preset.preset_id;
  const modelType = getModelType(preset.node_template?.ai?.model || '');
  const agentColor = preset.node_template?.ui?.color || '#8b5cf6';

  const handleMouseDown = () => setIsDragging(true);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const container = document.getElementById(`prompts-${preset.preset_id}`);
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setPromptWidth(Math.max(20, Math.min(80, newWidth)));
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, preset.preset_id]);

  return (
    <div
      className="group grid grid-cols-[300px_1fr_auto] gap-4 rounded-lg border bg-slate-800/50 p-4 transition hover:shadow-lg"
      style={{
        borderColor: `${agentColor}40`,
        boxShadow: `0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06), 0 0 0 1px ${agentColor}20`,
      }}
    >
      {/* Left Column: Icon, Title, Description, Tags */}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-2xl"
            style={{
              background: `linear-gradient(135deg, ${agentColor}30, ${agentColor}10)`,
              boxShadow: `0 0 20px ${agentColor}20`,
            }}
          >
            {preset.icon || '\u{1F916}'}
          </div>

          {/* Model Type Badge under icon */}
          <div className={`flex items-center gap-1 ${modelType.color} font-bold uppercase text-[9px] px-1.5 py-0.5 rounded mt-2`}>
            <span>{modelType.emoji}</span>
            <span>{modelType.type}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white line-clamp-1 mb-1">
            {preset.title || 'Unnamed Agent'}
          </h3>
          <p className="text-sm text-slate-400 line-clamp-2 mb-2">
            {preset.description || '\u0411\u0435\u0437 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044F'}
          </p>

          {preset.tags && preset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {preset.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Model info */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Settings size={12} />
            <span className="truncate">{preset.node_template?.ai?.model || 'gpt-4'}</span>
          </div>
        </div>
      </div>

      {/* Center Column: Resizable Prompts */}
      <div
        id={`prompts-${preset.preset_id}`}
        className="relative flex h-32 gap-0 overflow-hidden rounded-lg border border-slate-700/50"
      >
        {/* System Prompt */}
        {preset.node_template?.ai?.system_prompt && (
          <div
            className="flex flex-col bg-slate-900/50 p-3 overflow-hidden"
            style={{ width: `${promptWidth}%` }}
          >
            <span className="text-[10px] font-medium text-slate-500 uppercase mb-1 flex-shrink-0">
              System Prompt
            </span>
            <div className="text-xs text-slate-300 overflow-y-auto flex-1 custom-scrollbar">
              {preset.node_template.ai.system_prompt}
            </div>
          </div>
        )}

        {/* Resizer */}
        {preset.node_template?.ai?.system_prompt && preset.node_template?.content && (
          <div
            onMouseDown={handleMouseDown}
            className="w-1 bg-slate-700/50 hover:bg-blue-500/50 cursor-col-resize transition-colors flex-shrink-0"
            style={{ cursor: 'col-resize' }}
          />
        )}

        {/* Main Prompt */}
        {preset.node_template?.content && (
          <div
            className="flex flex-col bg-slate-900/70 p-3 overflow-hidden"
            style={{
              width: preset.node_template?.ai?.system_prompt
                ? `${100 - promptWidth}%`
                : '100%',
            }}
          >
            <span className="text-[10px] font-medium text-slate-500 uppercase mb-1 flex-shrink-0">
              Main Prompt
            </span>
            <div className="text-xs text-slate-300 overflow-y-auto flex-1 custom-scrollbar">
              {preset.node_template.content}
            </div>
          </div>
        )}

        {/* Fallback if no prompts */}
        {!preset.node_template?.ai?.system_prompt && !preset.node_template?.content && (
          <div className="flex items-center justify-center w-full text-slate-500 text-sm">
            {'\u041F\u0440\u043E\u043C\u043F\u0442\u044B \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B'}
          </div>
        )}
      </div>

      {/* Right Column: Action Buttons (Vertical) */}
      <div className="flex flex-col items-center gap-2">
        <div
          onClick={() => onToggleFavorite(preset.preset_id)}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700/50 hover:text-yellow-400 cursor-pointer"
          title={'\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435'}
        >
          <Star
            size={18}
            className={preset.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}
          />
        </div>

        <div
          onClick={() => onChatWith(preset)}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700/50 hover:text-blue-400 cursor-pointer"
          title="Chat with Agent"
        >
          {'\u{1F4AC}'}
        </div>

        <div className="relative">
          <div
            onClick={() => setActiveMenu(isMenuOpen ? null : preset.preset_id)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700/50 hover:text-white cursor-pointer"
            title={'\u041C\u0435\u043D\u044E'}
          >
            <MoreVertical size={18} />
          </div>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setActiveMenu(null)}
              />
              <div className="absolute right-0 top-full z-[110] mt-1 w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl">
                <div
                  onClick={() => onQuickEdit(preset)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
                >
                  <Edit2 size={14} />
                  {'\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C'}
                </div>
                <div
                  onClick={() => {
                    onShare(preset);
                    setActiveMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
                >
                  <Share2 size={14} />
                  {'\u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F'}
                </div>
                <div
                  onClick={() => onDuplicate(preset)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
                >
                  <Copy size={14} />
                  {'\u0414\u0443\u0431\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C'}
                </div>
                <div
                  onClick={() => onDelete(preset.preset_id, preset.title || '\u0430\u0433\u0435\u043D\u0442\u0430')}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                >
                  <Trash2 size={14} />
                  {'\u0423\u0434\u0430\u043B\u0438\u0442\u044C'}
                </div>
              </div>
            </>
          )}
        </div>

        <div
          onClick={() => onEdit(preset)}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700/50 hover:text-white cursor-pointer"
          title={'\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 AI'}
        >
          <Settings size={18} />
        </div>
      </div>
    </div>
  );
}
