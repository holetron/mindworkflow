import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProviderPanel from '../features/integrations/ProviderPanel';
import ErrorBoundary, { IntegrationErrorFallback } from '../ui/ErrorBoundary';
import {
  cloneProject,
  deleteProject,
  fetchProjectList,
  fetchProjectShare,
  removeProjectShare,
  renameProject,
  syncProjectDrive,
  upsertProjectShare,
  type ProjectRole,
  type ProjectSummary,
  type SharePayload,
  type ShareResponse,
} from '../state/api';
import { useProjectStore } from '../state/store';
import { useAuth } from '../contexts/AuthContext';
import VersionBadge from '../components/VersionBadge';
import { UserMenu } from '../components/UserMenu';

function ProjectDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { clearProject, setError } = useProjectStore((state) => ({
    clearProject: state.clearProject,
    setError: state.setError,
  }));
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setLocalError] = useState<string | null>(null);
  const [showMobileIntegrations, setShowMobileIntegrations] = useState(false);
  const [shareProject, setShareProject] = useState<ProjectSummary | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareResponse | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareForm, setShareForm] = useState<SharePayload>({ role: 'viewer' });
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [syncingProject, setSyncingProject] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false);
  const [googleDriveCheckLoading, setGoogleDriveCheckLoading] = useState(false);

  useEffect(() => {
    clearProject();
    setError(null);
  }, [clearProject, setError]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLocalError(null);
        const list = await fetchProjectList();
        setProjects(list);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    load().catch((err) => setLocalError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!shareProject) {
      setShareInfo(null);
      setShareError(null);
      return;
    }

    const loadShare = async () => {
      try {
        setShareLoading(true);
        setShareError(null);
        const info = await fetchProjectShare(shareProject.project_id);
        setShareInfo(info);
      } catch (err) {
        setShareError(err instanceof Error ? err.message : String(err));
      } finally {
        setShareLoading(false);
      }
    };

    loadShare().catch((err) => setShareError(err instanceof Error ? err.message : String(err)));
  }, [shareProject]);

  // Проверяем Google Drive статус при загрузке
  useEffect(() => {
    const checkGoogleDrive = async () => {
      try {
        setGoogleDriveCheckLoading(true);
        const response = await fetch('/api/auth/google/connection-status', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          setGoogleDriveConnected(data.isConnected);
        }
      } catch (err) {
        console.error('Failed to check Google Drive status:', err);
      } finally {
        setGoogleDriveCheckLoading(false);
      }
    };

    checkGoogleDrive();
  }, []);

  const refresh = async () => {
    try {
      setLoading(true);
      const list = await fetchProjectList();
      setProjects(list);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleRename = async (project: ProjectSummary) => {
    const nextTitle = window.prompt('Rename project', project.title);
    if (!nextTitle || nextTitle.trim() === '' || nextTitle.trim() === project.title) {
      return;
    }
    try {
      await renameProject(project.project_id, { title: nextTitle.trim() });
      await refresh();
    } catch (err) {
      window.alert(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleClone = async (project: ProjectSummary) => {
    try {
      const clone = await cloneProject(project.project_id, {
        title: `Copy of ${project.title}`,
      });
      await refresh();
      navigate(`/projects/${clone.project_id}`);
    } catch (err) {
      window.alert(`Clone failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSyncDrive = async (project: ProjectSummary) => {
    if (!googleDriveConnected) {
      setShowGoogleDriveModal(true);
      return;
    }

    try {
      setSyncingProject(project.project_id);
      setSyncError(null);
      await syncProjectDrive(project.project_id);
      window.alert('✅ Project synced with Google Drive');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSyncError(errorMsg);
      window.alert(`❌ Sync failed: ${errorMsg}`);
    } finally {
      setSyncingProject(null);
    }
  };

  const handleDelete = async (project: ProjectSummary) => {
    const confirmed = window.confirm(
      `Удалить проект "${project.title}"? Все связанные данные будут удалены без возможности восстановления.`,
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteProject(project.project_id);
      await refresh();
    } catch (err) {
      window.alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const openShareModal = (project: ProjectSummary) => {
    setShareProject(project);
    setShareForm({ role: 'viewer' });
  };

  const closeShareModal = () => {
    setShareProject(null);
    setShareInfo(null);
    setShareError(null);
  };

  const handleConnectGoogleDrive = async () => {
    try {
      // Получаем token из localStorage
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('Not authenticated. Please login first.');
      }
      
      const response = await fetch('/api/auth/google/drive', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }
      const { authUrl } = await response.json();
      
      // Открываем окно авторизации Google
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(authUrl, 'google_drive_auth', `width=${width},height=${height},left=${left},top=${top}`);
      
      // Проверяем статус через 2 секунды и потом каждые 2 секунды
      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const statusResponse = await fetch('/api/auth/google/connection-status', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.isConnected) {
              setGoogleDriveConnected(true);
              setShowGoogleDriveModal(false);
              clearInterval(checkInterval);
              window.alert('✅ Google Drive connected successfully!');
            }
          }
        } catch (err) {
          console.error('Error checking Google Drive status:', err);
        }

        // Прекращаем проверку после 60 секунд
        if (attempts > 30) {
          clearInterval(checkInterval);
        }
      }, 2000);
    } catch (err) {
      window.alert(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    const confirmed = window.confirm('Disconnect Google Drive? Your projects will no longer sync to Google Drive.');
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }
      setGoogleDriveConnected(false);
      window.alert('✅ Google Drive disconnected');
    } catch (err) {
      window.alert(`Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const closeGoogleDriveModal = () => {
    setShowGoogleDriveModal(false);
  };

  const handleShareSubmit = async () => {
    if (!shareProject) return;
    if (!shareForm.email && !shareForm.user_id) {
      setShareError('Укажите email или user_id');
      return;
    }
    try {
      setShareLoading(true);
      setShareError(null);
      const nextRole = shareForm.role;
      await upsertProjectShare(shareProject.project_id, shareForm);
      const info = await fetchProjectShare(shareProject.project_id);
      setShareInfo(info);
      setShareForm({ role: nextRole });
      await refresh();
    } catch (err) {
      setShareError(err instanceof Error ? err.message : String(err));
    } finally {
      setShareLoading(false);
    }
  };

  const handleShareRemove = async (userId: string) => {
    if (!shareProject) return;
    try {
      await removeProjectShare(shareProject.project_id, userId);
      const info = await fetchProjectShare(shareProject.project_id);
      setShareInfo(info);
      await refresh();
    } catch (err) {
      setShareError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="relative flex h-screen bg-slate-950 text-slate-100">
      <main className="flex-1 overflow-auto border-r border-slate-900/80 p-6">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="text-sm text-slate-400">Manage creative flows, duplicate variants, or pick up where you left off.</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowMobileIntegrations(true)}
              className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-600 lg:hidden"
            >
              Integrations
            </button>
            <UserMenu />
            {loading && <span className="text-xs uppercase tracking-wide text-slate-500">Loading…</span>}
          </div>
        </header>
        {error && (
          <div className="mb-4 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        {!loading && projects.length === 0 && !error && (
          <div className="rounded border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
            No projects yet. Import an existing flow or clone the demo to get started.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article
            className="flex flex-col justify-between rounded-xl border border-dashed border-primary/60 bg-slate-900/40 p-4 text-sm text-primary shadow hover:border-primary hover:bg-slate-900/60"
          >
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">New Project</h2>
              <p className="text-sm text-primary/70">
                Start from scratch or import a .lcfz archive. Google Drive will receive a mirrored folder automatically.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded bg-primary px-3 py-1 text-white"
                onClick={() => navigate('/projects/new')}
              >
                Create Blank
              </button>
              <button
                className="rounded border border-primary/60 bg-amber-200/10 px-3 py-1 text-primary hover:bg-primary/10 hover:text-white"
                onClick={() => navigate('/projects/import')}
              >
                Import Archive
              </button>
            </div>
          </article>
          {projects.map((project) => {
            const explicitRole = project.role as ProjectRole | undefined;
            const isOwner = project.user_id && user?.user_id && project.user_id === user.user_id;
            const isAdmin = Boolean(user?.is_admin);
            const roleForPermissions: ProjectRole | undefined = explicitRole ?? (isOwner ? 'owner' : undefined);
            const mode = project.mode ?? (roleForPermissions === 'owner' || roleForPermissions === 'editor' ? 'editing' : 'viewing');
            const roleLabel =
              explicitRole ??
              (isOwner ? 'owner' : isAdmin ? 'admin' : mode === 'viewing' ? 'viewer' : 'viewer');
            const canEdit = isAdmin || mode === 'editing';
            const canManage = isAdmin || roleForPermissions === 'owner';
            const editors = project.editor_count ?? 0;
            const viewers = project.viewer_count ?? 0;
            const updatedAt = new Date(project.updated_at);

            return (
              <article
                key={project.project_id}
                className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow transition hover:border-primary/60 hover:shadow-primary/10"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-100 group-hover:text-primary">{project.title}</h2>
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-slate-800/70 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                        Role: {roleLabel}
                      </span>
                    </div>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                      {updatedAt.toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-400">{project.description || 'No description'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Редакторы: {editors}</span>
                    <span>Наблюдатели: {viewers}</span>
                    {project.is_public && (
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                        Public
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <button
                    className="rounded bg-primary/80 px-3 py-1 text-white hover:bg-primary"
                    onClick={() => handleOpen(project.project_id)}
                  >
                    Open
                  </button>
                  <button
                    className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    onClick={() => handleRename(project)}
                    disabled={!canEdit}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    onClick={() => handleClone(project)}
                    disabled={!canManage}
                  >
                    Duplicate
                  </button>
                  <button
                    className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    onClick={() => handleSyncDrive(project)}
                    disabled={!canManage}
                  >
                    Sync Drive
                  </button>
                  {canManage && (
                    <button
                      className="rounded border border-emerald-600 px-3 py-1 text-emerald-200 hover:bg-emerald-500/10"
                      onClick={() => openShareModal(project)}
                    >
                      Share
                    </button>
                  )}
                  {canManage && (
                    <button
                      className="rounded border border-rose-600 px-3 py-1 text-rose-200 hover:bg-rose-500/10"
                      onClick={() => handleDelete(project)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
      <aside className="hidden w-60 flex-shrink-0 border-l border-slate-900/80 bg-slate-950/70 p-4 lg:block">
        <ErrorBoundary fallback={IntegrationErrorFallback}>
          <ProviderPanel />
        </ErrorBoundary>
      </aside>

      {showMobileIntegrations && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 lg:hidden">
          <div className="w-full max-w-md mx-4 max-h-[80vh] overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Global Integrations</h2>
              <button
                type="button"
                onClick={() => setShowMobileIntegrations(false)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white transition rounded"
              >
                ✕
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <ErrorBoundary fallback={IntegrationErrorFallback}>
                <ProviderPanel />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {shareProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-800 p-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Share "{shareProject.title}"</h2>
                <p className="text-xs text-slate-400">Назначьте редакторов и зрителей. Только владелец может управлять доступом.</p>
              </div>
              <button
                type="button"
                onClick={closeShareModal}
                className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
              {shareError && (
                <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-sm text-rose-200">
                  {shareError}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-200">Add collaborator</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    type="email"
                    placeholder="Email"
                    value={shareForm.email ?? ''}
                    onChange={(event) => setShareForm((prev) => ({ ...prev, email: event.target.value, user_id: undefined }))}
                    className="sm:col-span-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  />
                  <select
                    value={shareForm.role}
                    onChange={(event) => setShareForm((prev) => ({ ...prev, role: event.target.value as SharePayload['role'] }))}
                    className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="rounded bg-primary px-3 py-1 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700"
                  onClick={handleShareSubmit}
                  disabled={shareLoading}
                >
                  {shareLoading ? 'Saving…' : 'Add access'}
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-200">Collaborators</h3>
                {shareLoading && !shareInfo && <p className="text-xs text-slate-500">Loading…</p>}
                {!shareLoading && shareInfo && shareInfo.collaborators.length === 0 && (
                  <p className="text-xs text-slate-500">Пока нет назначенных пользователей.</p>
                )}
                {shareInfo && shareInfo.collaborators.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {shareInfo.collaborators.map((collaborator) => (
                      <li
                        key={collaborator.user_id}
                        className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2"
                      >
                        <div>
                          <div className="font-medium text-slate-200">{collaborator.email ?? collaborator.user_id}</div>
                          <div className="text-xs text-slate-500">Role: {collaborator.role}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleShareRemove(collaborator.user_id)}
                          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-rose-600/30 hover:text-rose-200"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGoogleDriveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-800 p-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Google Drive Sync</h2>
                <p className="text-xs text-slate-400">Store your projects in Google Drive</p>
              </div>
              <button
                type="button"
                onClick={closeGoogleDriveModal}
                className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:bg-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {googleDriveConnected ? (
                <div className="space-y-4">
                  <div className="rounded border border-emerald-600/50 bg-emerald-500/10 p-3">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <span>✓</span>
                      <span className="text-sm font-medium">Google Drive Connected</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">
                    Your projects will be automatically synced to your Google Drive in a "MindWorkflow Projects" folder.
                  </p>
                  <button
                    onClick={handleDisconnectGoogleDrive}
                    className="w-full rounded border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-rose-600/50 hover:text-rose-300"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Connect your Google Drive account to sync your MindWorkflow projects to the cloud. Your data will be stored in a secure "MindWorkflow Projects" folder.
                  </p>
                  <div className="rounded border border-amber-600/30 bg-amber-500/5 p-3">
                    <p className="text-xs text-amber-200">
                      📁 Files will be saved in your Google Drive
                    </p>
                  </div>
                  <button
                    onClick={handleConnectGoogleDrive}
                    disabled={googleDriveCheckLoading}
                    className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-700"
                  >
                    {googleDriveCheckLoading ? 'Checking...' : 'Connect Google Drive'}
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 px-4 py-3">
              <button
                onClick={closeGoogleDriveModal}
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <VersionBadge className="absolute bottom-3 right-4" />
    </div>
  );
}

export default ProjectDashboard;
