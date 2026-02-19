import type { ProjectRole, ProjectSummary } from '../../state/api';
import { useAuth } from '../../contexts/AuthContext';

interface ProjectCardProps {
  project: ProjectSummary;
  onOpen: (projectId: string) => void;
  onRename: (project: ProjectSummary) => void;
  onClone: (project: ProjectSummary) => void;
  onSyncDrive: (project: ProjectSummary) => void;
  onShare: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
}

export function ProjectCard({
  project,
  onOpen,
  onRename,
  onClone,
  onSyncDrive,
  onShare,
  onDelete,
}: ProjectCardProps) {
  const { user } = useAuth();

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
          <span>Editors: {editors}</span>
          <span>Viewers: {viewers}</span>
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
          onClick={() => onOpen(project.project_id)}
        >
          Open
        </button>
        <button
          className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          onClick={() => onRename(project)}
          disabled={!canEdit}
        >
          Rename
        </button>
        <button
          className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          onClick={() => onClone(project)}
          disabled={!canManage}
        >
          Duplicate
        </button>
        <button
          className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          onClick={() => onSyncDrive(project)}
          disabled={!canManage}
        >
          Sync Drive
        </button>
        {canManage && (
          <button
            className="rounded border border-emerald-600 px-3 py-1 text-emerald-200 hover:bg-emerald-500/10"
            onClick={() => onShare(project)}
          >
            Share
          </button>
        )}
        {canManage && (
          <button
            className="rounded border border-rose-600 px-3 py-1 text-rose-200 hover:bg-rose-500/10"
            onClick={() => onDelete(project)}
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
