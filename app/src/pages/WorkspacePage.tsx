import { MessageCircle, MessageSquare } from 'lucide-react';
import { FeedbackModal } from '../ui/FeedbackModal';
import { ChatPanel } from '../features/chat/ChatPanel';
import {
  WorkspaceHeader,
  WorkspaceCanvas,
  WorkspaceSidebar,
  NodeModal,
  AiSettingsModalWrapper,
  ShareModal,
  useWorkspaceState,
  useWorkspaceActions,
  useWorkspaceEffects,
} from '../components/workspace';

function WorkspacePage() {
  const ws = useWorkspaceState();
  const actions = useWorkspaceActions(ws);
  useWorkspaceEffects(ws);

  // ---- Early returns for missing/error states ----

  if (!ws.projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-200">
        <div className="text-center">
          <p className="text-lg">Project ID is missing.</p>
          <button
            type="button"
            className="mt-4 rounded bg-primary px-4 py-2 text-sm text-white"
            onClick={() => ws.navigate('/')}
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  if (ws.localError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900 text-slate-200">
        <div className="max-w-lg text-center">
          <h1 className="text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{ws.localError}</p>
        </div>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm text-white"
          onClick={() => ws.navigate('/')}
        >
          Back to project list
        </button>
      </div>
    );
  }

  // ---- Main workspace layout ----

  return (
    <div className="relative" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Canvas (full-screen background) */}
      <WorkspaceCanvas ws={ws} actions={actions} />

      {/* Feedback button */}
      <div className="absolute bottom-5 left-5 z-50">
        <button
          onClick={() => ws.setShowFeedbackModal(true)}
          className="rounded-full bg-slate-800/90 backdrop-blur-sm border border-slate-600/50 p-3 text-slate-300 hover:bg-slate-700/90 hover:text-white hover:border-slate-500 transition-all duration-200 shadow-lg hover:shadow-xl"
          title={'\u0421\u043E\u043E\u0431\u0449\u0438\u0442\u044C \u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0435 \u0438\u043B\u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u0443\u043B\u0443\u0447\u0448\u0435\u043D\u0438\u0435'}
        >
          <MessageCircle size={20} />
        </button>
      </div>

      {/* Chat button */}
      <div className="absolute bottom-5 right-5 z-50">
        <button
          onClick={() => ws.setShowChatPanel(true)}
          className="rounded-full bg-blue-600/90 backdrop-blur-sm border border-blue-500/50 p-3 text-white hover:bg-blue-500/90 hover:border-blue-400 transition-all duration-200 shadow-lg hover:shadow-xl"
          title={'\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0447\u0430\u0442 \u0441 AI \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442\u043E\u043C'}
        >
          <MessageSquare size={20} />
        </button>
      </div>

      {/* Sidebar + palette */}
      <WorkspaceSidebar ws={ws} actions={actions} />

      {/* Header */}
      <WorkspaceHeader ws={ws} actions={actions} />

      {/* Error / validation banners */}
      {ws.error && (
        <div className="absolute top-20 left-6 right-6 rounded bg-red-500/20 p-3 text-sm text-red-200 z-40">
          {ws.error}
        </div>
      )}
      {ws.validation.status !== 'idle' && (
        <div
          className={`absolute top-28 left-6 right-6 rounded p-2 text-sm z-40 ${
            ws.validation.status === 'success'
              ? 'bg-emerald-500/20 text-emerald-200'
              : ws.validation.status === 'warning'
                ? 'bg-amber-500/20 text-amber-100'
                : 'bg-red-500/20 text-red-200'
          }`}
        >
          {ws.validation.message}
        </div>
      )}

      {/* Modals */}
      <NodeModal ws={ws} actions={actions} />
      <AiSettingsModalWrapper ws={ws} actions={actions} />
      <ShareModal ws={ws} actions={actions} />

      {/* Feedback modal */}
      {ws.showFeedbackModal && (
        <FeedbackModal onClose={() => ws.setShowFeedbackModal(false)} />
      )}

      {/* Chat panel */}
      <ChatPanel
        isOpen={ws.showChatPanel}
        onClose={() => ws.setShowChatPanel(false)}
        providers={ws.providerOptions}
        projectId={ws.project?.project_id || null}
        onAddToWorkflow={actions.handleAddChatToWorkflow}
      />
    </div>
  );
}

export default WorkspacePage;
