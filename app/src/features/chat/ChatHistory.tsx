import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Chat } from './types';

interface ChatHistoryProps {
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

export function ChatHistory({ currentChatId, onSelectChat, onNewChat }: ChatHistoryProps) {
  const { t } = useTranslation();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadChats = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/chats');
        if (response.ok) {
          const data = await response.json();
          setChats(data);
        }
      } catch (error) {
        console.error('Failed to load chats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-800 border-r border-slate-700">
      {/* New Chat Button */}
      <button
        onClick={onNewChat}
        className="m-2 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
      >
        {t('chat.new_chat')}
      </button>

      {/* Chat List */}
      <div className="flex-grow overflow-y-auto px-2 pb-2 space-y-1">
        {loading ? (
          <div className="text-center text-slate-400 text-xs py-4">{t('common.loading')}</div>
        ) : chats.length === 0 ? (
          <div className="text-center text-slate-400 text-xs py-4">No chats yet</div>
        ) : (
          chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full text-left px-3 py-2 rounded text-xs truncate transition-colors ${
                currentChatId === chat.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
              title={chat.title}
            >
              {chat.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
