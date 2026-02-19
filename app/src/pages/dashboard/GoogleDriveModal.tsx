interface GoogleDriveModalProps {
  isConnected: boolean;
  checkLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export function GoogleDriveModal({ isConnected, checkLoading, onConnect, onDisconnect, onClose }: GoogleDriveModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-800 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Google Drive Sync</h2>
            <p className="text-xs text-slate-400">Store your projects in Google Drive</p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:bg-slate-700">✕</button>
        </div>
        <div className="p-6">
          {isConnected ? (
            <div className="space-y-4">
              <div className="rounded border border-emerald-600/50 bg-emerald-500/10 p-3">
                <div className="flex items-center gap-2 text-emerald-300">
                  <span>{'✓'}</span><span className="text-sm font-medium">Google Drive Connected</span>
                </div>
              </div>
              <p className="text-sm text-slate-400">Your projects will be automatically synced to your Google Drive in a "MindWorkflow Projects" folder.</p>
              <button onClick={onDisconnect} className="w-full rounded border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-rose-600/50 hover:text-rose-300">Disconnect</button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">Connect your Google Drive account to sync your MindWorkflow projects to the cloud. Your data will be stored in a secure "MindWorkflow Projects" folder.</p>
              <div className="rounded border border-amber-600/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-200">Files will be saved in your Google Drive</p>
              </div>
              <button onClick={onConnect} disabled={checkLoading}
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-700">
                {checkLoading ? 'Checking...' : 'Connect Google Drive'}
              </button>
            </div>
          )}
        </div>
        <div className="border-t border-slate-800 px-4 py-3">
          <button onClick={onClose} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700">Close</button>
        </div>
      </div>
    </div>
  );
}
