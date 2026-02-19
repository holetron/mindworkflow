import { useTranslation } from 'react-i18next';
import type { ChatMode } from './types';

interface ChatModeSelectorProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function ChatModeSelector({ mode, onModeChange }: ChatModeSelectorProps) {
  const { t } = useTranslation();

  const modes: Array<{ id: ChatMode; label: string; description: string }> = [
    {
      id: 'agent',
      label: t('chat.mode_agent'),
      description: 'Full CRUD access to nodes',
    },
    {
      id: 'edit',
      label: t('chat.mode_edit'),
      description: 'Edit only within nodes',
    },
    {
      id: 'ask',
      label: t('chat.mode_ask'),
      description: 'Read-only access',
    },
  ];

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-300">Mode:</label>
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as ChatMode)}
        className="w-full px-2 py-1.5 text-sm border border-slate-700 bg-slate-800 text-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {modes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400">{modes.find((m) => m.id === mode)?.description}</p>
    </div>
  );
}
