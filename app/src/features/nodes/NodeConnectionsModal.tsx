import Modal from '../../ui/Modal';
import JsonViewer from '../../ui/JsonViewer';
import type { FlowNode } from '../../state/api';

interface NodeConnectionsModalProps {
  node: FlowNode;
  previousNodes: FlowNode[];
  nextNodes: FlowNode[];
  onClose: () => void;
}

function NodeConnectionsModal({ node, previousNodes, nextNodes, onClose }: NodeConnectionsModalProps) {
  return (
    <Modal
      title={`Connections: ${node.title}`}
      onClose={onClose}
      actions={
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600"
          onClick={onClose}
        >
          Close
        </button>
      }
    >
      <div className="space-y-6 max-h-96 overflow-y-auto">
        {/* Previous Nodes Section */}
        <section>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400 border-b border-slate-700 pb-2">
            Input Nodes ({previousNodes.length})
          </h3>
          {previousNodes.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No input connections</p>
          ) : (
            <div className="space-y-3">
              {previousNodes.map((prevNode) => (
                <article key={prevNode.node_id} className="rounded border border-slate-700 bg-slate-900/40 p-3">
                  <header className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{getNodeIcon(prevNode.type)}</span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">{prevNode.title}</h4>
                      <p className="text-xs text-slate-400">{prevNode.node_id}</p>
                    </div>
                  </header>
                  {prevNode.content ? (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 mb-1">Content:</p>
                      <JsonViewer value={prevNode.content} collapsible />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No content</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Next Nodes Section */}
        <section>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400 border-b border-slate-700 pb-2">
            Output Nodes ({nextNodes.length})
          </h3>
          {nextNodes.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No output connections</p>
          ) : (
            <div className="space-y-3">
              {nextNodes.map((nextNode) => (
                <article key={nextNode.node_id} className="rounded border border-slate-700 bg-slate-900/40 p-3">
                  <header className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{getNodeIcon(nextNode.type)}</span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">{nextNode.title}</h4>
                      <p className="text-xs text-slate-400">{nextNode.node_id}</p>
                    </div>
                  </header>
                  <div className="mt-2">
                    <p className="text-xs text-slate-500 mb-1">Description:</p>
                    <p className="text-xs text-slate-300">
                      {(nextNode.meta?.short_description as string | undefined) ??
                        (nextNode.content ? nextNode.content.slice(0, 200) : 'No description')}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Current Node Context */}
        <section>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400 border-b border-slate-700 pb-2">
            Current Node Context
          </h3>
          <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-500">Type:</p>
                <p className="text-slate-300 font-medium">{node.type}</p>
              </div>
              <div>
                <p className="text-slate-500">ID:</p>
                <p className="text-slate-300 font-mono">{node.node_id}</p>
              </div>
              <div>
                <p className="text-slate-500">Content Type:</p>
                <p className="text-slate-300">{node.content_type || 'text/plain'}</p>
              </div>
              <div>
                <p className="text-slate-500">Connections:</p>
                <p className="text-slate-300">{previousNodes.length} in, {nextNodes.length} out</p>
              </div>
            </div>
            {node.meta && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-xs text-slate-500 mb-2">Metadata:</p>
                <JsonViewer value={JSON.stringify(node.meta, null, 2)} collapsible />
              </div>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function getNodeIcon(type: string): string {
  const icons: Record<string, string> = {
    text: '📝',
    ai: '🤖',
    parser: '🧩',
    python: '🐍',
    file: '📁',
    image_gen: '🖼️',
    audio_gen: '🔊',
    video_gen: '🎬',
    html: '🌐',
  };
  return icons[type] || '⚙️';
}

export default NodeConnectionsModal;