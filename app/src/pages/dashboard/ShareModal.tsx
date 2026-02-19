import type { ProjectSummary, SharePayload, ShareResponse } from '../../state/api';

interface ShareModalProps {
  project: ProjectSummary;
  shareInfo: ShareResponse | null;
  shareLoading: boolean;
  shareError: string | null;
  shareForm: SharePayload;
  setShareForm: React.Dispatch<React.SetStateAction<SharePayload>>;
  onSubmit: () => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
}

export function ShareModal({
  project, shareInfo, shareLoading, shareError,
  shareForm, setShareForm, onSubmit, onRemove, onClose,
}: ShareModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-800 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Share "{project.title}"</h2>
            <p className="text-xs text-slate-400">Assign editors and viewers. Only the owner can manage access.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:bg-slate-700">✕</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {shareError && <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-sm text-rose-200">{shareError}</div>}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Add collaborator</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <input type="email" placeholder="Email" value={shareForm.email ?? ''}
                onChange={(e) => setShareForm((prev) => ({ ...prev, email: e.target.value, user_id: undefined }))}
                className="sm:col-span-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none" />
              <select value={shareForm.role}
                onChange={(e) => setShareForm((prev) => ({ ...prev, role: e.target.value as SharePayload['role'] }))}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <button type="button" onClick={onSubmit} disabled={shareLoading}
              className="rounded bg-primary px-3 py-1 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700">
              {shareLoading ? 'Saving...' : 'Add access'}
            </button>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Collaborators</h3>
            {shareLoading && !shareInfo && <p className="text-xs text-slate-500">Loading...</p>}
            {!shareLoading && shareInfo && shareInfo.collaborators.length === 0 && <p className="text-xs text-slate-500">No assigned users yet.</p>}
            {shareInfo && shareInfo.collaborators.length > 0 && (
              <ul className="space-y-2 text-sm">
                {shareInfo.collaborators.map((c) => (
                  <li key={c.user_id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2">
                    <div>
                      <div className="font-medium text-slate-200">{c.email ?? c.user_id}</div>
                      <div className="text-xs text-slate-500">Role: {c.role}</div>
                    </div>
                    <button type="button" onClick={() => onRemove(c.user_id)}
                      className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-rose-600/30 hover:text-rose-200">Remove</button>
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
