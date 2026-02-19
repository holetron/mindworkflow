import { Controls, ControlButton, MiniMap } from 'reactflow';
import type { FlowNodeCardData } from '../../nodes/FlowNodeCard';

interface GraphCanvasControlsProps {
  reactFlow: { fitView: (opts: any) => void; zoomIn: (opts: any) => void; zoomOut: (opts: any) => void };
  isLocked: boolean;
  locked: boolean;
  readOnly: boolean;
  showMiniMap: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  onToggleLock: () => void;
  onToggleMiniMap: () => void;
}

const btnCls = '!backdrop-blur-sm !text-xs !h-6 !w-6 !min-h-6 !min-w-6 !transition-all !duration-200 !shadow-md hover:!shadow-lg !rounded-md';
const defaultBtnCls = `!bg-slate-800/90 !border !border-slate-600/50 !text-slate-200 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500 ${btnCls}`;

export function GraphCanvasControls({
  reactFlow, isLocked, locked, readOnly, showMiniMap,
  sidebarCollapsed, sidebarWidth, onToggleLock, onToggleMiniMap,
}: GraphCanvasControlsProps) {
  return (
    <>
      <Controls showFitView={false} showZoom={false} showInteractive={false} position="bottom-left" className="!gap-1"
        style={{ left: sidebarCollapsed ? '96px' : `${sidebarWidth + 120}px`, bottom: '14px', display: 'flex', flexDirection: 'row', gap: '3px' }}>
        <ControlButton onClick={() => reactFlow.fitView({ padding: 0.2, duration: 220 })} title="Fit all nodes to visible area" className={defaultBtnCls}>
          {'📐'}
        </ControlButton>
        <ControlButton onClick={() => reactFlow.zoomIn({ duration: 200 })} title="Zoom in" className={defaultBtnCls}>
          {'➕'}
        </ControlButton>
        <ControlButton onClick={() => reactFlow.zoomOut({ duration: 200 })} title="Zoom out" className={defaultBtnCls}>
          {'➖'}
        </ControlButton>
        <ControlButton onClick={onToggleLock} title={locked ? 'Unlock nodes' : 'Lock nodes'}
          className={`${locked ? '!bg-orange-500/20 !border-orange-400/50 !text-orange-200 hover:!bg-orange-500/30' : '!bg-slate-800/90 !border-slate-600/50 !text-slate-200 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500'} ${btnCls} !border ${readOnly ? '!opacity-50 cursor-not-allowed' : ''}`}
          style={readOnly ? { pointerEvents: 'none' } : undefined}>
          {locked ? '🔒' : '🔓'}
        </ControlButton>
        <ControlButton onClick={onToggleMiniMap} title={showMiniMap ? 'Hide overview' : 'Show workflow overview'}
          className={`${showMiniMap ? '!bg-emerald-500/20 !border-emerald-400/50 !text-emerald-200 hover:!bg-emerald-500/30' : '!bg-slate-800/90 !border-slate-600/50 !text-slate-200 hover:!bg-slate-700/90 hover:!text-white hover:!border-slate-500'} ${btnCls} !border`}>
          {'🗺️'}
        </ControlButton>
      </Controls>
      {showMiniMap && (
        <MiniMap position="bottom-left"
          className="!w-48 !h-32 !bg-slate-900/90 !backdrop-blur-sm !border !border-slate-600/50 !rounded-md !shadow-lg"
          style={{ left: sidebarCollapsed ? '340px' : `${sidebarWidth + 360}px`, bottom: '20px' }}
          nodeColor={(node) => {
            const d = node.data as FlowNodeCardData;
            switch (d.node.type) {
              case 'input': return '#10b981';
              case 'output': return '#f59e0b';
              case 'ai': return '#8b5cf6';
              default: return '#64748b';
            }
          }}
          maskColor="rgba(15, 23, 42, 0.8)" />
      )}
    </>
  );
}
