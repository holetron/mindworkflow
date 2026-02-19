import type { FlowNode, AiProviderOption } from './nodeTypes';
import { NodeSettingsModal } from '../../../ui/NodeSettingsModal';
import { AiSettingsModal } from '../../../ui/AiSettingsModal';
import { ProviderFileWarningModal } from '../../../ui/ProviderFileWarningModal';
import type { AgentRoutingConfig } from '../../routing/agentRouting';
import { DEFAULT_ROUTING_CONFIGS } from '../../routing/agentRouting';
import { AgentRoutingEditor } from '../../routing/AgentRoutingEditor';
import { AgentLogsModal } from '../../logs/AgentLogsModal';
import { ImageCropModal } from '../ImageCropModal';
import { VideoCropModal, type VideoCropSettings } from '../VideoCropModal';
import { VideoFrameExtractModal } from '../VideoFrameExtractModal';
import { VideoTrimModal } from '../VideoTrimModal';
import type { ImageCropSettings } from '../imageProcessing';
import { SCREEN_WIDTHS } from './nodeConstants';

interface NodeModalsProps {
  node: FlowNode;
  projectId: string | null;
  disabled: boolean;

  // Settings modal
  showSettingsModal: boolean;
  onCloseSettingsModal: () => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;

  // AI Settings modal
  showAiSettingsModal: boolean;
  onCloseAiSettingsModal: () => void;
  activeAiModalTab: 'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request';
  onAiModalTabChange: (tab: 'ai_config' | 'settings' | 'model_info' | 'context' | 'routing' | 'request') => void;
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  providers: AiProviderOption[];
  dynamicModels: Record<string, string[]>;
  loadingModels: Record<string, boolean>;
  allNodes: FlowNode[];
  sources: Array<{ node_id: string; title: string; type: string }>;
  targets: Array<{ node_id: string; title: string; type: string }>;
  onRemoveInvalidPorts: (nodeId: string, invalidPorts: string[]) => Promise<void>;

  // File warning modal
  showFileWarningModal: boolean;
  pendingProviderId: string | null;
  selectedProvider: AiProviderOption | null;
  onCloseFileWarning: () => void;
  onContinueWithoutFiles: () => void;
  onSwitchToFileProvider: () => void;
  getFileTypes: () => string[];

  // Routing editor
  showRoutingEditor: boolean;
  onCloseRoutingEditor: () => void;

  // Logs modal
  showLogsModal: boolean;
  onCloseLogsModal: () => void;
  dataProjectId: string;

  // URL input modal
  showUrlModal: boolean;
  urlInputValue: string;
  onUrlInputValueChange: (value: string) => void;
  onCloseUrlModal: () => void;
  onApplyUrlModal: () => void;

  // PDF URL input modal
  showPdfUrlModal: boolean;
  pdfUrlInputValue: string;
  onPdfUrlInputValueChange: (value: string) => void;
  onClosePdfUrlModal: () => void;
  onApplyPdfUrlModal: () => void;

  // HTML settings modal
  showHtmlSettingsModal: boolean;
  onCloseHtmlSettingsModal: () => void;
  screenWidth: string;
  onScreenWidthChange: (width: string) => void;
  htmlViewportWidth: number;
  onHtmlViewportWidthChange: (width: number) => void;
  htmlOutputType: 'link' | 'image' | 'code';
  onHtmlOutputTypeChange: (value: 'link' | 'image' | 'code') => void;
  displayHtmlUrl: string;
  htmlScreenshot: string | null;
  capturedAtLabel: string;
  onOpenHtmlUrl: () => void;
  onCopyHtmlUrl: () => void;
  onOpenHtmlScreenshot: () => void;
  onDownloadHtmlScreenshot: () => void;

  // Image crop modal
  isCropModalOpen: boolean;
  cropModalData: { source: string; naturalWidth: number; naturalHeight: number; settings: ImageCropSettings | null } | null;
  onCropModalClose: () => void;
  onCropModalApply: (payload: { dataUrl: string; settings: ImageCropSettings }) => void;

  // Video crop modal
  isVideoCropModalOpen: boolean;
  videoCropModalData: { videoPath: string; source?: string; videoWidth: number; videoHeight: number; settings: VideoCropSettings | null } | null;
  onVideoCropModalClose: () => void;
  onVideoCropModalApply: (payload: { dataUrl: string; settings: VideoCropSettings }) => void;

  // Video frame extract modal
  showVideoFrameExtractModal: boolean;
  onCloseVideoFrameExtractModal: () => void;
  videoSource: { kind: string; src: string; name: string | null } | null;
  onExtractFrame: (timeSeconds: number, cropParams?: { x: number; y: number; width: number; height: number }) => Promise<void>;

  // Video trim modal
  showVideoTrimModal: boolean;
  onCloseVideoTrimModal: () => void;
  onTrimVideo: (startTime: number, endTime: number, cropParams?: { x: number; y: number; width: number; height: number }) => Promise<void>;
}

export function NodeModals(props: NodeModalsProps) {
  return (
    <>
      {props.showSettingsModal && (
        <NodeSettingsModal node={props.node} onClose={props.onCloseSettingsModal} onUpdateNodeMeta={props.onChangeMeta} loading={props.disabled} />
      )}

      {props.showAiSettingsModal && (
        <AiSettingsModal
          key={`ai-settings-${props.node.node_id}`}
          node={props.node}
          onClose={props.onCloseAiSettingsModal}
          activeTab={props.activeAiModalTab}
          onTabChange={props.onAiModalTabChange}
          onChangeAi={props.onChangeAi}
          onUpdateNodeMeta={props.onChangeMeta}
          providers={props.providers}
          loading={props.disabled}
          dynamicModels={props.dynamicModels}
          loadingModels={props.loadingModels}
          allNodes={props.allNodes}
          sources={props.sources}
          targets={props.targets}
          onRemoveInvalidPorts={props.onRemoveInvalidPorts}
        />
      )}

      {props.showFileWarningModal && props.pendingProviderId && (
        <ProviderFileWarningModal
          isOpen={props.showFileWarningModal}
          onClose={props.onCloseFileWarning}
          onContinue={props.onContinueWithoutFiles}
          onSwitchProvider={props.onSwitchToFileProvider}
          currentProvider={props.selectedProvider?.id || ''}
          suggestedProvider={props.providers.find(p => p.supportsFiles)?.id || 'google_workspace'}
          fileCount={props.getFileTypes().length}
          fileTypes={props.getFileTypes()}
        />
      )}

      {props.showRoutingEditor && props.node.type === 'ai' && (
        <AgentRoutingEditor
          config={(props.node.ai?.routing as AgentRoutingConfig) || DEFAULT_ROUTING_CONFIGS.universal}
          onChange={(newConfig) => { props.onChangeAi?.(props.node.node_id, { ...props.node.ai, routing: newConfig }); }}
          onClose={props.onCloseRoutingEditor}
        />
      )}

      {props.showLogsModal && props.node.type === 'ai' && (
        <AgentLogsModal nodeId={props.node.node_id} projectId={props.dataProjectId || ''} onClose={props.onCloseLogsModal} />
      )}

      {props.showUrlModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) props.onCloseUrlModal(); }}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-medium text-white mb-4">Insert Image URL</h3>
            <input type="url" value={props.urlInputValue} onChange={(e) => props.onUrlInputValueChange(e.target.value)} placeholder="https://example.com/image.jpg" className="w-full p-3 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') props.onApplyUrlModal(); else if (e.key === 'Escape') props.onCloseUrlModal(); }} />
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={props.onApplyUrlModal} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition text-sm font-medium">Apply</button>
              <button type="button" onClick={props.onCloseUrlModal} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {props.showHtmlSettingsModal && !props.disabled && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(event) => { if (event.target === event.currentTarget) props.onCloseHtmlSettingsModal(); }}>
          <div className="w-96 max-w-[90vw] rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">HTML Node Settings</h3>
              <button type="button" className="text-white/70 hover:text-white" onClick={props.onCloseHtmlSettingsModal}>\u2715</button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs text-white/70 block mb-1">Screen Width</label>
                <select value={props.screenWidth} onChange={(e) => props.onScreenWidthChange(e.target.value)} className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:outline-none" disabled={props.disabled}>
                  {SCREEN_WIDTHS.map((sw) => <option key={sw.id} value={sw.id}>{sw.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/70 block mb-1">Width in Pixels</label>
                <input type="number" min={320} max={3840} value={props.htmlViewportWidth} onChange={(e) => props.onHtmlViewportWidthChange(Number(e.target.value))} className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:outline-none" disabled={props.disabled} />
              </div>
              <div>
                <label className="text-xs text-white/70 block mb-1">Output Type</label>
                <select value={props.htmlOutputType} onChange={(e) => props.onHtmlOutputTypeChange(e.target.value as 'link' | 'image' | 'code')} className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 focus:border-blue-500 focus:outline-none" disabled={props.disabled}>
                  <option value="link">Link</option>
                  <option value="image" disabled={!props.htmlScreenshot}>Image (screenshot)</option>
                  <option value="code">HTML Code</option>
                </select>
              </div>
            </div>
            <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
              <div>
                <div className="text-xs text-white/70 uppercase tracking-wide">Page</div>
                <div className="mt-2 text-sm text-white/80 break-all">{props.displayHtmlUrl}</div>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20" onClick={props.onOpenHtmlUrl}>Open</button>
                  <button type="button" className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20" onClick={props.onCopyHtmlUrl}>Copy</button>
                </div>
              </div>
              <div>
                <div className="text-xs text-white/70 uppercase tracking-wide">Screenshot</div>
                <div className="mt-2 text-sm text-white/80">{props.htmlScreenshot ? `Saved: ${props.capturedAtLabel}` : 'Screenshot not yet captured'}</div>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20 disabled:opacity-40" onClick={props.onOpenHtmlScreenshot} disabled={!props.htmlScreenshot}>Open</button>
                  <button type="button" className="flex-1 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20 disabled:opacity-40" onClick={props.onDownloadHtmlScreenshot} disabled={!props.htmlScreenshot}>Download</button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:text-white" onClick={props.onCloseHtmlSettingsModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      {props.showPdfUrlModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) props.onClosePdfUrlModal(); }}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-medium text-white mb-4">Insert PDF Link</h3>
            <input type="url" value={props.pdfUrlInputValue} onChange={(e) => props.onPdfUrlInputValueChange(e.target.value)} placeholder="https://example.com/document.pdf" className="w-full p-3 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') props.onApplyPdfUrlModal(); else if (e.key === 'Escape') props.onClosePdfUrlModal(); }} />
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={props.onApplyPdfUrlModal} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition text-sm font-medium">Apply</button>
              <button type="button" onClick={props.onClosePdfUrlModal} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {props.isCropModalOpen && props.cropModalData ? (
        <ImageCropModal source={props.cropModalData.source} naturalWidth={props.cropModalData.naturalWidth} naturalHeight={props.cropModalData.naturalHeight} initialSettings={props.cropModalData.settings} onCancel={props.onCropModalClose} onApply={(payload) => { props.onCropModalApply(payload); }} />
      ) : null}

      {props.isVideoCropModalOpen && props.videoCropModalData ? (
        <VideoCropModal source={props.videoCropModalData.source ?? props.videoCropModalData.videoPath} naturalWidth={props.videoCropModalData.videoWidth} naturalHeight={props.videoCropModalData.videoHeight} initialSettings={props.videoCropModalData.settings} onCancel={props.onVideoCropModalClose} onApply={(payload) => { props.onVideoCropModalApply(payload as any); }} />
      ) : null}

      {props.showVideoFrameExtractModal && props.videoSource && (
        <VideoFrameExtractModal videoUrl={props.videoSource.src} videoNodeId={props.node.node_id} projectId={props.projectId} onClose={props.onCloseVideoFrameExtractModal} onExtract={props.onExtractFrame} />
      )}

      {props.showVideoTrimModal && props.videoSource && (
        <VideoTrimModal videoUrl={props.videoSource.src} videoNodeId={props.node.node_id} projectId={props.projectId} onClose={props.onCloseVideoTrimModal} onTrim={props.onTrimVideo} />
      )}
    </>
  );
}
