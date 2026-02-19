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
          <h1 className="text-3xl font-semibold">Admin Panel</h1>
          <p className="text-sm text-slate-400">
            Manage users, permissions and platform projects.
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
            Refresh
          </button>
        </div>
      </header>

      {/* Stats cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Users</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalUsers}</div>
          <div className="mt-1 text-xs text-slate-400">Admins: {totalAdmins}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Projects</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalProjects}</div>
          <div className="mt-1 text-xs text-slate-400">Without owner: {orphanProjects}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Collaborators</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalCollaborators}</div>
          <div className="mt-1 text-xs text-slate-400">Average per project: {avgCollaboratorsPerProject}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Projects per owner</div>
          <div className="mt-2 text-2xl font-semibold text-white">{avgProjectsPerOwner}</div>
          <div className="mt-1 text-xs text-slate-400">Average across all users</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Feedback</div>
          <div className="mt-2 text-2xl font-semibold text-white">{totalFeedback}</div>
          <div className="mt-1 text-xs text-slate-400">Problems: {totalProblems} · Ideas: {totalSuggestions}</div>
          <div className="mt-1 text-xs text-slate-500">
            New: {feedbackStatusCounts.new} · In Progress: {feedbackStatusCounts.in_progress} · Resolved: {feedbackStatusCounts.resolved} · Archive: {feedbackStatusCounts.archived}
          </div>
        </div>
      </section>

      {/* Status bar + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {usersLoading || projectsLoading || feedbackLoading || emailLoading ? (
            <span className="flex items-center gap-1 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating data...
            </span>
          ) : (
            <span>Data is current as of {formatDateTime(new Date().toISOString())}</span>
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
                  ? 'Search by email, name or user_id'
                  : activeTab === 'projects'
                  ? 'Search by title, owner or project ID'
                  : activeTab === 'feedback'
                  ? 'Search by title, contact or description'
                  : 'Search by name, tags or prompt content'
              }
              className="w-full rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
            />
          </div>
        )}
      </div>
    </>
  );
}
