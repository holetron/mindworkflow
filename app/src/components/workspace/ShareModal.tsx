import type { SharePayload } from '../../state/api';
import type { WorkspaceState } from './hooks/useWorkspaceState';
import type { WorkspaceActions } from './hooks/useWorkspaceActions';

interface ShareModalProps {
  ws: WorkspaceState;
  actions: WorkspaceActions;
}

export function ShareModal({ ws, actions }: ShareModalProps) {
  const {
    showShareModal,
    project,
    canEditProject,
    editIsPublic,
    setEditIsPublic,
    shareForm,
    setShareForm,
    shareInfo,
    shareFetching,
    shareSaving,
    shareError,
  } = ws;

  if (!showShareModal || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-800 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {'\u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F'} &quot;{project.title}&quot;
            </h2>
            <p className="text-xs text-slate-400">
              {'\u041D\u0430\u0437\u043D\u0430\u0447\u044C\u0442\u0435 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u043E\u0432 \u0438 \u0437\u0440\u0438\u0442\u0435\u043B\u0435\u0439. \u0422\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446 \u043C\u043E\u0436\u0435\u0442 \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F\u043E\u043C.'}
            </p>
          </div>
          <button
            type="button"
            onClick={actions.handleCloseShareModal}
            className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:bg-slate-700"
          >
            {'\u2715'}
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {shareError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-sm text-rose-200">
              {shareError}
            </div>
          )}

          {/* Public access */}
          {canEditProject && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-200">
                {'\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F'}
              </h3>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsPublic}
                  onChange={(e) => {
                    const nextValue = e.target.checked;
                    const previousValue = editIsPublic;
                    setEditIsPublic(nextValue);
                    actions.handleSaveIsPublic(nextValue, previousValue);
                  }}
                  className="rounded border-slate-600 bg-slate-800 text-amber-400 focus:ring-amber-400 focus:ring-offset-slate-900"
                />
                <span>{'\u041E\u0442\u043A\u0440\u044B\u0442\u0430\u044F \u0434\u043E\u0441\u043A\u0430'}</span>
              </label>
              <p className="text-xs text-slate-500">
                {'\u0412\u0441\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438 \u0441\u043C\u043E\u0433\u0443\u0442 \u043F\u0440\u043E\u0441\u043C\u0430\u0442\u0440\u0438\u0432\u0430\u0442\u044C \u044D\u0442\u0443 \u0434\u043E\u0441\u043A\u0443'}
              </p>
            </div>
          )}

          {/* Add collaborator */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">
              {'\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430'}
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="email"
                placeholder="Email"
                value={shareForm.email ?? ''}
                onChange={(event) =>
                  setShareForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                    user_id: undefined,
                  }))
                }
                className="sm:col-span-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
              />
              <select
                value={shareForm.role}
                onChange={(event) =>
                  setShareForm((prev) => ({
                    ...prev,
                    role: event.target.value as SharePayload['role'],
                  }))
                }
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <button
              type="button"
              className="rounded bg-primary px-3 py-1 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700"
              onClick={actions.handleShareSubmit}
              disabled={shareSaving || shareFetching}
            >
              {shareSaving
                ? '\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u2026'
                : shareFetching
                  ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026'
                  : '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F'}
            </button>
          </div>

          {/* Collaborators list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">
              {'\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438'}
            </h3>
            {shareFetching && !shareInfo && (
              <p className="text-xs text-slate-500">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026'}</p>
            )}
            {!shareFetching && shareInfo && shareInfo.collaborators.length === 0 && (
              <p className="text-xs text-slate-500">
                {'\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0445 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439.'}
              </p>
            )}
            {shareInfo && shareInfo.collaborators.length > 0 && (
              <ul className="space-y-2 text-sm">
                {shareInfo.collaborators.map((collaborator) => (
                  <li
                    key={collaborator.user_id}
                    className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-slate-200">
                        {collaborator.email ?? collaborator.user_id}
                      </div>
                      <div className="text-xs text-slate-500">
                        {'\u0420\u043E\u043B\u044C'}: {collaborator.role === 'viewer' ? 'Viewer' : 'Editor'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => actions.handleShareRemove(collaborator.user_id)}
                      className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-rose-600/30 hover:text-rose-200 disabled:opacity-60"
                      disabled={shareSaving}
                    >
                      {'\u0423\u0434\u0430\u043B\u0438\u0442\u044C'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
