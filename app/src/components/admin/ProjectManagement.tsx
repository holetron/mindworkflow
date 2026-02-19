import Modal from '../../ui/Modal';
import type { AdminProjectSummary, AdminUserSummary } from '../../state/api';
import { formatDateTime } from './constants';

interface ProjectManagementProps {
  projects: AdminProjectSummary[];
  filteredProjects: AdminProjectSummary[];
  projectsError: string | null;
  projectsLoading: boolean;
  projectSearch: string;
  selectedProject: AdminProjectSummary | null;
  setSelectedProject: (project: AdminProjectSummary | null) => void;
  selectedOwnerUserId: string;
  setSelectedOwnerUserId: (id: string) => void;
  changeOwnerSubmitting: boolean;
  users: AdminUserSummary[];
  onCloseChangeOwner: () => void;
  onChangeOwner: (newOwnerId: string) => Promise<void>;
}

export function ProjectManagement({
  projects,
  filteredProjects,
  projectsError,
  projectsLoading,
  projectSearch,
  selectedProject,
  setSelectedProject,
  selectedOwnerUserId,
  setSelectedOwnerUserId,
  changeOwnerSubmitting,
  users,
  onCloseChangeOwner,
  onChangeOwner,
}: ProjectManagementProps) {
  return (
    <>
      <section className="space-y-4">
        {projectsError && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            Failed to load projects: {projectsError}
          </div>
        )}
        {projectsLoading && !projects.length ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
            Loading projects list...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
            {projectSearch.trim()
              ? `No projects matching query \u00AB${projectSearch.trim()}\u00BB.`
              : 'No projects found.'}
          </div>
        ) : (
          filteredProjects.map((project) => (
            <article
              key={project.project_id}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm transition hover:border-primary/60 hover:shadow-primary/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {project.title || 'Untitled'}
                  </h2>
                  {project.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-400">{project.description}</p>
                  )}
                  <div className="mt-2 text-xs text-slate-500">ID: {project.project_id}</div>
                </div>
                <div className="text-right text-sm text-slate-400">
                  <div>
                    Owner:{' '}
                    {project.owner_email
                      ? project.owner_email
                      : project.owner_id
                      ? project.owner_id
                      : '\u2014'}
                  </div>
                  <button
                    onClick={() => setSelectedProject(project)}
                    className="mt-2 rounded bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600"
                  >
                    Change owner
                  </button>
                  <div className="mt-1 text-xs text-slate-500">
                    Updated: {formatDateTime(project.updated_at)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>
                  Editors: {project.editors.length} · Viewers: {project.viewers.length}
                </span>
                <span>Total access: {project.collaborator_count}</span>
                {!project.owner_id && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-200">
                    No owner
                  </span>
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Editors
                  </h3>
                  {project.editors.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No editors</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {project.editors.map((editor) => (
                        <li key={editor.user_id} className="flex flex-col rounded bg-slate-800/40 px-2 py-1">
                          <span>{editor.email ?? editor.name ?? editor.user_id}</span>
                          <span className="text-[11px] text-slate-500">
                            ID: {editor.user_id}
                            {editor.added_at ? ` · ${formatDateTime(editor.added_at)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Viewers
                  </h3>
                  {project.viewers.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No viewers</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {project.viewers.map((viewer) => (
                        <li key={viewer.user_id} className="flex flex-col rounded bg-slate-800/40 px-2 py-1">
                          <span>{viewer.email ?? viewer.name ?? viewer.user_id}</span>
                          <span className="text-[11px] text-slate-500">
                            ID: {viewer.user_id}
                            {viewer.added_at ? ` · ${formatDateTime(viewer.added_at)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {/* Change owner modal */}
      {selectedProject && (
        <Modal
          title={`Change project owner "${selectedProject.title || 'Untitled'}"`}
          onClose={onCloseChangeOwner}
          actions={
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCloseChangeOwner}
                className="rounded-full border border-slate-700 px-4 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                disabled={changeOwnerSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onChangeOwner(selectedOwnerUserId)}
                disabled={!selectedOwnerUserId || changeOwnerSubmitting}
                className="rounded-full bg-blue-600 px-4 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {changeOwnerSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">New owner</label>
              <select
                value={selectedOwnerUserId}
                onChange={(event) => setSelectedOwnerUserId(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                disabled={changeOwnerSubmitting}
              >
                <option value="">Select user...</option>
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.email} {user.name ? `(${user.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-500">
              Current owner: {selectedProject.owner_email || selectedProject.owner_id || 'No'}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
