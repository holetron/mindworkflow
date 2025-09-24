import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProviderPanel from '../features/integrations/ProviderPanel';
import ErrorBoundary, { IntegrationErrorFallback } from '../ui/ErrorBoundary';
import {
  cloneProject,
  fetchProjectList,
  renameProject,
  syncProjectDrive,
  type ProjectSummary,
} from '../state/api';
import { useProjectStore } from '../state/store';

function ProjectDashboard() {
  const navigate = useNavigate();
  const { clearProject, setError } = useProjectStore((state) => ({
    clearProject: state.clearProject,
    setError: state.setError,
  }));
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setLocalError] = useState<string | null>(null);

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
    try {
      await syncProjectDrive(project.project_id);
      window.alert('Google Drive folder refreshed');
    } catch (err) {
      window.alert(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <main className="flex-1 overflow-auto border-r border-slate-900/80 p-6">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="text-sm text-slate-400">Manage creative flows, duplicate variants, or pick up where you left off.</p>
          </div>
          {loading && <span className="text-xs uppercase tracking-wide text-slate-500">Loading…</span>}
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
          {projects.map((project) => (
            <article
              key={project.project_id}
              className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow transition hover:border-primary/60 hover:shadow-primary/10"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-100 group-hover:text-primary">{project.title}</h2>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                    {new Date(project.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-slate-400">{project.description || 'No description'}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <button className="rounded bg-primary/80 px-3 py-1 text-white hover:bg-primary" onClick={() => handleOpen(project.project_id)}>
                  Open
                </button>
                <button
                  className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary"
                  onClick={() => handleRename(project)}
                >
                  Rename
                </button>
                <button
                  className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary"
                  onClick={() => handleClone(project)}
                >
                  Duplicate
                </button>
                <button
                  className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary"
                  onClick={() => handleSyncDrive(project)}
                >
                  Sync Drive
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
      <aside className="hidden w-72 flex-shrink-0 border-l border-slate-900/80 bg-slate-950/70 p-6 lg:block">
        <ErrorBoundary fallback={IntegrationErrorFallback}>
          <ProviderPanel />
        </ErrorBoundary>
      </aside>
    </div>
  );
}

export default ProjectDashboard;
