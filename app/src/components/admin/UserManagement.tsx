import { Shield, ShieldOff, Trash2, UserPen } from 'lucide-react';
import Modal from '../../ui/Modal';
import type { AdminUserSummary } from '../../state/api';
import type { UserEditFormState } from './types';
import { formatDate, formatDateTime } from './constants';

interface UserManagementProps {
  users: AdminUserSummary[];
  filteredUsers: AdminUserSummary[];
  usersError: string | null;
  usersLoading: boolean;
  userSearch: string;
  processingUserId: string | null;
  selectedUser: AdminUserSummary | null;
  editForm: UserEditFormState;
  editSubmitting: boolean;
  onToggleAdmin: (user: AdminUserSummary) => Promise<void>;
  onOpenEdit: (user: AdminUserSummary) => void;
  onCloseEdit: () => void;
  onEditFieldChange: (field: 'email' | 'name' | 'is_admin' | 'password', value: string | boolean) => void;
  onSaveEdit: () => Promise<void>;
  onDeleteUser: (user: AdminUserSummary) => Promise<void>;
}

export function UserManagement({
  users,
  filteredUsers,
  usersError,
  usersLoading,
  userSearch,
  processingUserId,
  selectedUser,
  editForm,
  editSubmitting,
  onToggleAdmin,
  onOpenEdit,
  onCloseEdit,
  onEditFieldChange,
  onSaveEdit,
  onDeleteUser,
}: UserManagementProps) {
  return (
    <>
      <section className="space-y-4">
        {usersError && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            Failed to load users: {usersError}
          </div>
        )}
        {usersLoading && !users.length ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
            Loading users list...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
            {userSearch.trim()
              ? `No users matching query \u00AB${userSearch.trim()}\u00BB.`
              : 'No users found.'}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isProcessing = processingUserId === user.user_id;
            return (
              <article
                key={user.user_id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm transition hover:border-primary/60 hover:shadow-primary/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-white">{user.email}</h2>
                      {user.is_admin && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                          Administrator
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-300">
                      {user.name ? `Name: ${user.name}` : 'Name not specified'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      ID: {user.user_id} · Created: {formatDate(user.created_at)}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">Projects: {user.projects.length}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAdmin(user)}
                      disabled={isProcessing}
                      className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 transition hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    >
                      {user.is_admin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      {user.is_admin ? 'Revoke rights' : 'Make admin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenEdit(user)}
                      className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 transition hover:border-primary hover:text-primary"
                    >
                      <UserPen className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteUser(user)}
                      disabled={isProcessing}
                      className="flex items-center gap-2 rounded-full border border-rose-700/60 px-3 py-1 text-sm text-rose-200 transition hover:border-rose-500 hover:text-rose-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
                {user.projects.length > 0 && (
                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      User projects
                    </div>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                      {user.projects.map((project) => (
                        <li
                          key={project.project_id}
                          className="rounded-lg border border-slate-800/70 bg-slate-900/60 p-3"
                        >
                          <div className="text-sm font-medium text-slate-200">
                            {project.title || 'Untitled'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">ID: {project.project_id}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Created: {formatDate(project.created_at)} · Updated: {formatDateTime(project.updated_at)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* Edit user modal */}
      {selectedUser && (
        <Modal
          title={`Editing ${selectedUser.email}`}
          onClose={onCloseEdit}
          actions={
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCloseEdit}
                className="rounded-full border border-slate-700 px-4 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                disabled={editSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                className="rounded-full bg-primary px-4 py-1 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700"
                disabled={editSubmitting}
              >
                {editSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(event) => onEditFieldChange('email', event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                disabled={editSubmitting}
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(event) => onEditFieldChange('name', event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                disabled={editSubmitting}
                placeholder="Username"
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={editForm.is_admin}
                onChange={(event) => onEditFieldChange('is_admin', event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                disabled={editSubmitting}
              />
              Make administrator
            </label>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                New Password
              </label>
              <input
                type="password"
                value={editForm.password}
                onChange={(event) => onEditFieldChange('password', event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                placeholder="Leave empty to keep current password"
                disabled={editSubmitting}
              />
              <p className="mt-1 text-xs text-slate-500">
                Minimum 6 characters. Current password will remain unchanged if field is empty.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Owner projects
              </div>
              {selectedUser.projects.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No projects found.</p>
              ) : (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {selectedUser.projects.map((project) => (
                    <li
                      key={project.project_id}
                      className="rounded border border-slate-800/70 bg-slate-900/60 p-2 text-xs text-slate-300"
                    >
                      <div className="font-medium text-slate-200">
                        {project.title || 'Untitled'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{project.project_id}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Updated: {formatDate(project.updated_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
