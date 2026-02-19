import { Loader2, RefreshCw } from 'lucide-react';
import type { AdminFeedbackStatus } from '../../state/api';
import type { AdminTab } from './types';
import { ADMIN_TABS, formatDateTime } from './constants';

interface AdminHeaderProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  refreshing: boolean;
  usersLoading: boolean;
  projectsLoading: boolean;
  feedbackLoading: boolean;
  emailLoading: boolean;
  onRefresh: () => void;

  // Stats
  totalUsers: number;
  totalAdmins: number;
  totalProjects: number;
  orphanProjects: number;
  totalCollaborators: number;
  avgCollaboratorsPerProject: string;
  avgProjectsPerOwner: string;
  totalFeedback: number;
  totalProblems: number;
  totalSuggestions: number;
  feedbackStatusCounts: Record<AdminFeedbackStatus, number>;

  // Search
  userSearch: string;
  setUserSearch: (value: string) => void;
  projectSearch: string;
  setProjectSearch: (value: string) => void;
  feedbackSearch: string;
  setFeedbackSearch: (value: string) => void;
  promptSearch: string;
  setPromptSearch: (value: string) => void;
}

export function AdminHeader({
  activeTab,
  setActiveTab,
  refreshing,
  usersLoading,
  projectsLoading,
  feedbackLoading,
  emailLoading,
  onRefresh,
  totalUsers,
  totalAdmins,
  totalProjects,
  orphanProjects,
  totalCollaborators,
  avgCollaboratorsPerProject,
  avgProjectsPerOwner,
  totalFeedback,
  totalProblems,
  totalSuggestions,
  feedbackStatusCounts,
  userSearch,
  setUserSearch,
  projectSearch,
  setProjectSearch,
  feedbackSearch,
  setFeedbackSearch,
  promptSearch,
  setPromptSearch,
}: AdminHeaderProps) {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Админ-панель</h1>
          <p className="text-sm text-slate-400">
            Управление пользователями, правами и проектами платформы.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-primary text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || usersLoading || projectsLoading || emailLoading}
            className="flex items-center gap-2 rounded-full border border-slate-700 px-4 py-1 text-sm text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
      </header>

      {/* Stats cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Пользователи</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalUsers}</div>
          <div className="mt-1 text-xs text-slate-400">Администраторов: {totalAdmins}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Проекты</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalProjects}</div>
          <div className="mt-1 text-xs text-slate-400">Без владельца: {orphanProjects}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Коллабораторы</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalCollaborators}</div>
          <div className="mt-1 text-xs text-slate-400">Среднее на проект: {avgCollaboratorsPerProject}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Проектов на владельца</div>
          <div className="mt-2 text-2xl font-semibold text-white">{avgProjectsPerOwner}</div>
          <div className="mt-1 text-xs text-slate-400">Среднее по всем пользователям</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Обратная связь</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalFeedback}</div>
          <div className="mt-1 text-xs text-slate-400">Проблем: {totalProblems} · Идей: {totalSuggestions}</div>
          <div className="mt-1 text-xs text-slate-500">
            Новых: {feedbackStatusCounts.new} · В работе: {feedbackStatusCounts.in_progress} · Решено: {feedbackStatusCounts.resolved} · Архив: {feedbackStatusCounts.archived}
          </div>
        </div>
      </section>

      {/* Status bar + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {usersLoading || projectsLoading || feedbackLoading || emailLoading ? (
            <span className="flex items-center gap-1 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Обновление данных...
            </span>
          ) : (
            <span>Данные актуальны на {formatDateTime(new Date().toISOString())}</span>
          )}
        </div>
        {activeTab !== 'settings' && activeTab !== 'integrations' && (
          <div className="relative w-full max-w-md">
            <input
              value={
                activeTab === 'users'
                  ? userSearch
                  : activeTab === 'projects'
                  ? projectSearch
                  : activeTab === 'feedback'
                  ? feedbackSearch
                  : promptSearch
              }
              onChange={(event) => {
                const value = event.target.value;
                if (activeTab === 'users') {
                  setUserSearch(value);
                } else if (activeTab === 'projects') {
                  setProjectSearch(value);
                } else if (activeTab === 'feedback') {
                  setFeedbackSearch(value);
                } else {
                  setPromptSearch(value);
                }
              }}
              placeholder={
                activeTab === 'users'
                  ? 'Поиск по email, имени или user_id'
                  : activeTab === 'projects'
                  ? 'Поиск по названию, владельцу или ID проекта'
                  : activeTab === 'feedback'
                  ? 'Поиск по заголовку, контакту или описанию'
                  : 'Поиск по названию, тегам или содержимому промпта'
              }
              className="w-full rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
            />
          </div>
        )}
      </div>
    </>
  );
}
