import React from 'react';
import {
  Star,
  Edit2,
  Trash2,
  Copy,
  Sparkles,
  Settings,
  MoreVertical,
  Share2,
} from 'lucide-react';
import type { AgentItemProps } from './types';
import { getModelType } from './types';

/** Agent card for the grid view. */
export function AgentCard({
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
  const isMenuOpen = activeMenu === preset.preset_id;
  const modelType = getModelType(preset.node_template?.ai?.model || '');
  const agentColor = preset.node_template?.ui?.color || '#8b5cf6';

  return (
    <div
      className="group relative flex flex-col rounded-xl border bg-slate-800/50 p-5 shadow-lg backdrop-blur-sm transition hover:shadow-xl"
      style={{
        borderColor: `${agentColor}40`,
        boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 0 1px ${agentColor}20`,
      }}
    >
      {/* Top right actions: Favorite, Settings, Menu */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {/* Favorite star */}
        <div
          onClick={() => onToggleFavorite(preset.preset_id)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-yellow-400 cursor-pointer"
        >
          <Star
            size={18}
            className={preset.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}
          />
        </div>

        {/* Chat button */}
        <div
          onClick={() => onChatWith(preset)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-blue-400 cursor-pointer"
          title="Chat with Agent"
        >
          {'\u{1F4AC}'}
        </div>

        {/* Settings button */}
        <div
          onClick={() => onEdit(preset)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-white cursor-pointer"
          title={'\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 AI'}
        >
          <Settings size={16} />
        </div>

        {/* Menu button */}
        <div className="relative">
          <div
            onClick={() => setActiveMenu(isMenuOpen ? null : preset.preset_id)}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-white cursor-pointer"
            title={'\u041C\u0435\u043D\u044E'}
          >
            <MoreVertical size={16} />
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
      </div>

      {/* Icon and title */}
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-2xl"
          style={{
            background: `linear-gradient(135deg, ${agentColor}30, ${agentColor}10)`,
            boxShadow: `0 0 20px ${agentColor}20`,
          }}
        >
          {preset.icon || '\u{1F916}'}
        </div>
        <div className="flex-1 min-w-0 pr-20">
          <h3 className="mb-1 font-semibold text-white line-clamp-1">
            {preset.title || 'Unnamed Agent'}
          </h3>
          <p className="text-xs text-slate-400 line-clamp-2">
            {preset.description || '\u0411\u0435\u0437 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044F'}
          </p>
        </div>
      </div>

      {/* Tags */}
      {preset.tags && preset.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {preset.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-300"
            >
              {tag}
            </span>
          ))}
          {preset.tags.length > 3 && (
            <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
              +{preset.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* System Prompt Preview */}
      {preset.node_template?.ai?.system_prompt && (
        <div className="mb-2 rounded-lg bg-slate-900/50 p-2 border border-slate-700/30">
          <div className="flex items-center gap-1 mb-1">
            <Settings size={10} className="text-slate-500" />
            <span className="text-[10px] font-medium text-slate-500 uppercase">System</span>
          </div>
          <p className="text-xs text-slate-400 line-clamp-2">
            {preset.node_template.ai.system_prompt}
          </p>
        </div>
      )}

      {/* User Prompt Preview */}
      {preset.node_template?.content && (
        <div className="mb-3 rounded-lg bg-slate-900/50 p-2 border border-slate-700/30">
          <div className="flex items-center gap-1 mb-1">
            <Sparkles size={10} className="text-slate-500" />
            <span className="text-[10px] font-medium text-slate-500 uppercase">Prompt</span>
          </div>
          <p className="text-xs text-slate-400 line-clamp-2">
            {preset.node_template.content}
          </p>
        </div>
      )}

      {/* Model info with type */}
      <div className="mt-auto flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-500">
          <Settings size={12} />
          <span className="line-clamp-1 flex-1">{preset.node_template?.ai?.model || 'gpt-4'}</span>
        </div>
        <div className={`flex items-center gap-1 ${modelType.color}`}>
          <span>{modelType.emoji}</span>
          <span className="font-medium uppercase text-[10px]">{modelType.type}</span>
        </div>
      </div>
    </div>
  );
}
