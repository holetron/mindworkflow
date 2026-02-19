import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/auth/update-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка обновления профиля');
      }

      setSuccess('✅ Профиль обновлён');
      
      // Обновляем данные пользователя в контексте
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обновления');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError('Новые пароли не совпадают');
      return;
    }

    if (newPassword.length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentPassword, 
          newPassword 
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка смены пароля');
      }

      setSuccess('✅ Пароль изменён');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка смены пароля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-slate-400 hover:text-white transition-colors"
              title="Назад к проектам"
            >
              ← Назад
            </button>
            <h1 className="text-2xl font-bold">⚙️ Настройки аккаунта</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-6 py-8 max-w-2xl">
        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-300">
            {success}
          </div>
        )}

        {/* Profile Section */}
        <section className="mb-8 bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h2 className="text-xl font-semibold mb-4">Профиль</h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-400 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-slate-500">Email нельзя изменить</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Имя
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-600/50"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || name === user?.name}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {loading ? 'Сохранение...' : 'Сохранить профиль'}
            </button>
          </form>
        </section>

        {/* Password Section */}
        <section className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h2 className="text-xl font-semibold mb-4">Изменить пароль</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Текущий пароль
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-600/50"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Новый пароль
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-600/50"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Подтвердите новый пароль
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-600/50"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {loading ? 'Изменение...' : 'Изменить пароль'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
