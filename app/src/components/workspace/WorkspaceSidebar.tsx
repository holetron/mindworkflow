import NodeSidebar from '../../features/workspace/NodeSidebar';
import NodePalette from '../../features/workspace/NodePalette';
import { ResizeHandle, clamp } from './ResizeHandle';
import { SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from './constants';
import type { WorkspaceState } from './hooks/useWorkspaceState';
import type { WorkspaceActions } from './hooks/useWorkspaceActions';

interface WorkspaceSidebarProps {
  ws: WorkspaceState;
  actions: WorkspaceActions;
}

export function WorkspaceSidebar({ ws, actions }: WorkspaceSidebarProps) {
  return (
    <>
      {/* Left sidebar */}
      <aside
        className={`absolute z-20 flex flex-col overflow-hidden ${ws.isMobile ? 'left-0' : 'left-5'}`}
        style={{
          top: '80px',
          width: ws.sidebarCollapsed ? 48 : ws.sidebarWidth,
          height: 'calc(100vh - 200px)',
        }}
      >
        <div className="flex-1 overflow-auto">
          <NodeSidebar
            project={ws.project}
            selectedNodeId={ws.selectedNodeId}
            onSelectNode={ws.selectNode}
            onCopyNode={ws.canEditProject ? actions.handleNodeCopy : undefined}
            onOpenNodeModal={ws.setShowNodeModal}
            collapsed={ws.sidebarCollapsed}
            onToggleCollapse={() => ws.setSidebarCollapsed(!ws.sidebarCollapsed)}
          />
        </div>
      </aside>

      {/* Resize handle */}
      {!ws.sidebarCollapsed && (
        <div
          className="absolute z-20"
          style={{
            left: ws.sidebarWidth + 20,
            top: '80px',
            height: 'calc(100vh - 200px)',
          }}
        >
          <ResizeHandle
            orientation="vertical"
            ariaLabel={'\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0448\u0438\u0440\u0438\u043D\u0443 \u043C\u0435\u043D\u044E \u043D\u043E\u0434'}
            onResize={(delta: number) =>
              ws.setSidebarWidth((prev: number) => clamp(prev + delta, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH))
            }
          />
        </div>
      )}

      {/* Right palette */}
      {ws.canEditProject && (
        <aside
          className={`absolute z-20 flex flex-col transition-all duration-300 ${ws.isMobile ? 'right-0' : ''}`}
          style={{
            top: '80px',
            right: ws.isMobile ? 0 : ws.showChatPanel ? 'calc(20px + 600px)' : '20px',
            width: ws.paletteCollapsed ? 48 : 320,
            height: 'calc(100vh - 200px)',
          }}
        >
          <div className="flex-1 overflow-auto">
            <NodePalette
              onCreateNode={actions.handlePaletteCreate}
              disabled={ws.loading || !ws.project || !ws.canEditProject}
              collapsed={ws.paletteCollapsed}
              onToggleCollapse={() => ws.setPaletteCollapsed(!ws.paletteCollapsed)}
            />
          </div>
        </aside>
      )}
    </>
  );
}
