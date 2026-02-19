import { useState } from 'react';

interface ShareAgentModalProps {
  agent: {
    preset_id: string;
    title: string;
    description?: string;
    icon: string;
    node_template: any;
    tags?: string[];
  };
  onClose: () => void;
}

export function ShareAgentModal({ agent, onClose }: ShareAgentModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const handleShare = async () => {
    if (!email.trim()) {
      setMessage('Введите email получателя');
      return;
    }

    setSending(true);
    setMessage('');

    try {
      const response = await fetch('/api/agent-presets/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_id: agent.preset_id,
          recipient_email: email.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to share agent');
      }

      setMessage('✅ Агент успешно отправлен!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Share error:', error);
      setMessage('❌ Не удалось отправить агента');
    } finally {
      setSending(false);
    }
  };

  const handleExport = () => {
    const exportData = {
      title: agent.title,
      description: agent.description || '',
      icon: agent.icon,
      node_template: agent.node_template,
      tags: agent.tags || [],
      exported_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent_${agent.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setMessage('✅ Агент экспортирован!');
    setTimeout(() => {
      setMessage('');
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow-2xl border border-slate-700/50 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{agent.icon}</span>
            <div>
              <h2 className="text-lg font-semibold text-white">Поделиться агентом</h2>
              <p className="text-sm text-slate-400">{agent.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 rounded-lg hover:bg-slate-700/50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Email получателя
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              disabled={sending}
            />
          </div>

          {/* Message */}
          {message && (
            <div
              className={`text-sm p-3 rounded-lg ${
                message.startsWith('✅')
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleShare}
              disabled={sending || !email.trim()}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Отправка...' : '📧 Отправить'}
            </button>
            <button
              onClick={handleExport}
              disabled={sending}
              className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition disabled:opacity-50"
            >
              💾 Экспорт JSON
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
