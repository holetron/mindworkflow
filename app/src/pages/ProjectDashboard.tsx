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
  type ProjectSummary,
  type SharePayload,
  type ShareResponse,
} from '../state/api';
import { useProjectStore } from '../state/store';
import { useAuth } from '../contexts/AuthContext';
import VersionBadge from '../components/VersionBadge';
import { UserMenu } from '../components/UserMenu';
import {
  GoogleDriveModal,
  MobileIntegrationsModal,
  NewProjectCard,
  ProjectCard,
  ShareModal,
} from './dashboard';

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

  // Check Google Drive status on load
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
      window.alert('Project synced with Google Drive');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSyncError(errorMsg);
      window.alert(`Sync failed: ${errorMsg}`);
    } finally {
      setSyncingProject(null);
    }
  };

  const handleDelete = async (project: ProjectSummary) => {
    const confirmed = window.confirm(
      `Delete project "${project.title}"? All related data will be deleted permanently.`,
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

      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      window.open(authUrl, 'google_drive_auth', `width=${width},height=${height},left=${left},top=${top}`);

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
              window.alert('Google Drive connected successfully!');
            }
          }
        } catch (err) {
          console.error('Error checking Google Drive status:', err);
        }

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
      window.alert('Google Drive disconnected');
    } catch (err) {
      window.alert(`Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleShareSubmit = async () => {
    if (!shareProject) return;
    if (!shareForm.email && !shareForm.user_id) {
      setShareError('Enter email or user_id');
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
            {loading && <span className="text-xs uppercase tracking-wide text-slate-500">Loading...</span>}
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
          <NewProjectCard />
          {projects.map((project) => (
            <ProjectCard
              key={project.project_id}
              project={project}
              onOpen={handleOpen}
              onRename={handleRename}
              onClone={handleClone}
              onSyncDrive={handleSyncDrive}
              onShare={openShareModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </main>
      <aside className="hidden w-60 flex-shrink-0 border-l border-slate-900/80 bg-slate-950/70 p-4 lg:block">
        <ErrorBoundary fallback={IntegrationErrorFallback}>
          <ProviderPanel />
        </ErrorBoundary>
      </aside>

      {showMobileIntegrations && (
        <MobileIntegrationsModal onClose={() => setShowMobileIntegrations(false)} />
      )}

      {shareProject && (
        <ShareModal
          project={shareProject}
          shareInfo={shareInfo}
          shareLoading={shareLoading}
          shareError={shareError}
          shareForm={shareForm}
          setShareForm={setShareForm}
          onSubmit={handleShareSubmit}
          onRemove={handleShareRemove}
          onClose={closeShareModal}
        />
      )}

      {showGoogleDriveModal && (
        <GoogleDriveModal
          isConnected={googleDriveConnected}
          checkLoading={googleDriveCheckLoading}
          onConnect={handleConnectGoogleDrive}
          onDisconnect={handleDisconnectGoogleDrive}
          onClose={() => setShowGoogleDriveModal(false)}
        />
      )}

      <VersionBadge className="absolute bottom-3 right-4" />
    </div>
  );
}

export default ProjectDashboard;
