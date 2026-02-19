import type { ProjectFlow } from '../../state/api';
import type { WorkspaceState } from './hooks/useWorkspaceState';
import type { WorkspaceActions } from './hooks/useWorkspaceActions';
import { MoreVertical } from 'lucide-react';
import { LanguageSwitcher } from '../LanguageSwitcher';

interface WorkspaceHeaderProps {
  ws: WorkspaceState;
  actions: WorkspaceActions;
}

export function WorkspaceHeader({ ws, actions }: WorkspaceHeaderProps) {
  const {
    project,
    isMobile,
    canEditProject,
    showChatPanel,
    isEditingTitle,
    editTitle,
    setEditTitle,
    isEditingDescription,
    editDescription,
    setEditDescription,
    menuOpen,
    setMenuOpen,
    menuRef,
    isSaving,
    projectTitleSubmitRef,
    projectDescriptionSubmitRef,
  } = ws;

  const {
    handleStartEditTitle,
    handleSaveTitle,
    handleCancelEditTitle,
    handleStartEditDescription,
    handleSaveDescription,
    handleCancelEditDescription,
    handleSaveWorkspace,
    handleOpenShareModal,
    handleDeleteWorkspace,
    handleExportWorkspace,
    handleImportWorkspace,
    handleLogoutClick,
  } = actions;

  return (
    <header
      className={`absolute top-0 left-0 border-b border-slate-700/60 bg-slate-900/90 shadow-lg backdrop-blur-sm z-50 transition-all duration-300 ${
        isMobile ? 'gap-2 px-3 py-2' : 'gap-6 px-6 py-4'
      }`}
      style={{
        right: showChatPanel ? '600px' : '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div className={`flex min-w-0 flex-1 items-center ${isMobile ? 'gap-2' : 'gap-4'}`}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-lg border border-slate-600/60 bg-slate-800/60 font-medium text-slate-200 transition hover:bg-slate-700/70 hover:text-white focus-visible:outline-none focus-visible:ring-0 ${
            isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
          }`}
          onClick={() => ws.navigate('/')}
        >
          {'\u2190'} {isMobile ? '' : 'Projects'}
        </button>
        <div className={`flex min-w-0 flex-wrap items-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
          {isEditingTitle ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') handleCancelEditTitle();
              }}
              onBlur={() => {
                if (projectTitleSubmitRef.current) {
                  projectTitleSubmitRef.current = false;
                  return;
                }
                handleCancelEditTitle();
              }}
              className="h-9 w-full min-w-[220px] max-w-sm flex-1 rounded border border-slate-600 bg-slate-800 px-3 text-base font-semibold text-white focus:border-amber-400 focus:outline-none"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartEditTitle}
                className="group flex min-w-0 items-center rounded px-2 py-1 text-left text-lg font-semibold text-white transition hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-0 md:text-xl"
                title={'\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435'}
                aria-label={'\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435'}
                style={{ backgroundColor: 'transparent' }}
              >
                <span className="truncate group-hover:text-primary">
                  {project?.title ?? '\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F'}
                </span>
              </button>
            </div>
          )}

          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400 sm:text-sm">
            <span className="font-mono text-slate-500">ID: {project?.project_id ?? '\u2014'}</span>
            <span className="hidden sm:inline">{'\u2022'}</span>
            {isEditingDescription ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveDescription();
                    if (e.key === 'Escape') handleCancelEditDescription();
                  }}
                  onBlur={() => {
                    if (projectDescriptionSubmitRef.current) {
                      projectDescriptionSubmitRef.current = false;
                      return;
                    }
                    handleCancelEditDescription();
                  }}
                  className="h-8 min-w-[200px] max-w-[320px] flex-1 rounded border border-slate-600 bg-slate-800 px-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                  placeholder={'\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435...'}
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {canEditProject ? (
                  <button
                    type="button"
                    onClick={handleStartEditDescription}
                    className="group flex min-w-0 items-center rounded px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-0"
                    title={'\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435'}
                    aria-label={'\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435'}
                    style={{ backgroundColor: 'transparent' }}
                  >
                    <span className="truncate max-w-[30ch] text-slate-300 transition group-hover:text-white">
                      {project?.description || '\u041D\u0435\u0442 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044F'}
                    </span>
                  </button>
                ) : (
                  <span className="truncate max-w-[30ch] text-slate-300">
                    {project?.description || '\u041D\u0435\u0442 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044F'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex px-3 py-2 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={'\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F'}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <WorkspaceMenuDropdown
              project={project}
              isSaving={isSaving}
              onSave={() => {
                setMenuOpen(false);
                handleSaveWorkspace();
              }}
              onShare={() => {
                setMenuOpen(false);
                actions.handleOpenShareModal();
              }}
              onAgents={() => {
                setMenuOpen(false);
                window.location.href = '/agents';
              }}
              onDelete={() => {
                setMenuOpen(false);
                handleDeleteWorkspace();
              }}
              onExport={handleExportWorkspace}
              onImport={handleImportWorkspace}
              onLogout={handleLogoutClick}
            />
          )}
        </div>
      </div>
    </header>
  );
}

// --------------- Menu Dropdown (co-located, small) ---------------

interface MenuDropdownProps {
  project: ProjectFlow | null;
  isSaving: boolean;
  onSave: () => void;
  onShare: () => void;
  onAgents: () => void;
  onDelete: () => void;
  onExport: () => void;
  onImport: () => void;
  onLogout: () => void;
}

function WorkspaceMenuDropdown({
  project,
  isSaving,
  onSave,
  onShare,
  onAgents,
  onDelete,
  onExport,
  onImport,
  onLogout,
}: MenuDropdownProps) {
  return (
    <div className="fixed right-6 top-16 z-[1000] mt-2 w-44 rounded-md border border-slate-700 bg-slate-900/95 p-1 text-sm text-slate-200 shadow-lg">
      <div
        onClick={() => {
          if (!project || isSaving) return;
          onSave();
        }}
        className={`flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-emerald-600/20 hover:text-emerald-200 cursor-pointer ${
          !project || isSaving ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {'\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'}
        <span>{'\u{1F4BE}'}</span>
      </div>
      <div
        onClick={onShare}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-blue-600/20 hover:text-blue-200 cursor-pointer"
      >
        {'\u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F'}
        <span>{'\u{1F465}'}</span>
      </div>
      <div
        onClick={onAgents}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-purple-600/20 hover:text-purple-200 cursor-pointer"
      >
        {'\u041C\u043E\u0438 \u0430\u0433\u0435\u043D\u0442\u044B'}
        <span>{'\u{1F916}'}</span>
      </div>
      <div
        onClick={onDelete}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-rose-600/20 hover:text-rose-200 cursor-pointer"
      >
        {'\u0423\u0434\u0430\u043B\u0438\u0442\u044C'}
        <span>{'\u232B'}</span>
      </div>
      <div
        onClick={onExport}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-emerald-600/20 hover:text-emerald-200 cursor-pointer"
      >
        {'\u042D\u043A\u0441\u043F\u043E\u0440\u0442'}
        <span>{'\u21E9'}</span>
      </div>
      <div
        onClick={onImport}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-amber-500/20 hover:text-amber-200 cursor-pointer"
      >
        {'\u0418\u043C\u043F\u043E\u0440\u0442'}
        <span>{'\u21E7'}</span>
      </div>
      <div
        onClick={onLogout}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-slate-700/60 cursor-pointer"
      >
        {'\u0412\u044B\u0445\u043E\u0434'}
        <span>{'\u21A9'}</span>
      </div>
      <div className="px-3 py-2 border-t border-slate-700 mt-1 pt-2">
        <LanguageSwitcher />
      </div>
    </div>
  );
}
