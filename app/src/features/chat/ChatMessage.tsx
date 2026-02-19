import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, MoreVertical, Trash2, Copy, FileText } from 'lucide-react';
import Modal from '../../ui/Modal';
import { fetchProjectList } from '../../state/api';
import type { ChatMessage as ChatMessageType, ChatAttachment } from './types';

interface ChatMessageProps {
  message: ChatMessageType;
  chatId: string;
  projectId: string | null;
  onAddToWorkflow?: (nodeId: string) => void;
}

export function ChatMessage({ message, chatId, projectId, onAddToWorkflow }: ChatMessageProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || '');
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAssistant = message.role === 'assistant';

  // Normalize URL to include full domain for relative paths
  const normalizeUrl = (url: string): string => {
    if (!url) return url;
    // If path starts with /uploads/ and is not already a full URL, prepend production domain
    if (url.startsWith('/uploads/') && !url.startsWith('http')) {
      return `https://mindworkflow.com${url}`;
    }
    return url;
  };

  // Extract logs from HTML comments and clean content
  const { cleanContent, extractedLogs } = useMemo(() => {
    const logsMatch = message.content.match(/<!--\s*LOGS:\s*([\s\S]*?)\s*-->/);
    const logs = logsMatch ? logsMatch[1].split('\n').filter(line => line.trim()) : [];
    const cleaned = message.content.replace(/<!--\s*LOGS:[\s\S]*?-->/g, '').trim();
    return { cleanContent: cleaned, extractedLogs: logs };
  }, [message.content]);

  // Use logs from message or extracted from content
  const logs = message.logs || extractedLogs;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  // Load projects when workflow modal opens
  useEffect(() => {
    if (showWorkflowModal) {
      fetchProjectList()
        .then(data => setProjects(data))
        .catch(err => console.error('Failed to load projects:', err));
    }
  }, [showWorkflowModal]);

  // Parse attachments from JSON or use direct attachments array
  const attachments = useMemo<ChatAttachment[]>(() => {
    // If message has attachments array (from fresh response)
    if ((message as any).attachments && Array.isArray((message as any).attachments)) {
      return (message as any).attachments;
    }
    // Otherwise parse from JSON string (from database)
    if (!message.attachments_json) return [];
    try {
      return JSON.parse(message.attachments_json);
    } catch {
      return [];
    }
  }, [message]);

  const handleAddToWorkflow = useCallback(async () => {
    // Open modal to select workflow instead of using current projectId
    setShowMenu(false);
    setShowWorkflowModal(true);
  }, []);

  const handleConfirmAddToWorkflow = useCallback(async () => {
    if (!selectedProjectId) {
      alert('Please select a workflow');
      return;
    }

    setAdding(true);
    setShowWorkflowModal(false);
    try {
      const response = await fetch(`/api/chats/${chatId}/messages/${message.id}/to-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (onAddToWorkflow) {
          onAddToWorkflow(data.node_id);
        }
      } else {
        throw new Error('Failed to create node');
      }
    } catch (error) {
      console.error('Failed to add to workflow:', error);
      alert('Failed to add to workflow. Please try again.');
    } finally {
      setAdding(false);
    }
  }, [chatId, message.id, selectedProjectId, onAddToWorkflow]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setShowMenu(false);
  }, [message.content]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this message?')) {
      return;
    }

    setDeleting(true);
    setShowMenu(false);
    try {
      const response = await fetch(`/api/chats/${chatId}/messages/${message.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Reload page to update chat
        window.location.reload();
      } else {
        throw new Error('Failed to delete message');
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [chatId, message.id]);

  return (
    <>
      <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'} mb-3`}>
        <div
          className={`max-w-[80%] px-3 py-2 rounded-lg relative ${
            isAssistant
              ? 'bg-slate-700 text-slate-100'
              : 'bg-blue-600 text-white'
          }`}
        >
          {/* Menu button */}
          <div className="absolute top-2 right-2" ref={menuRef}>
            <div
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-slate-600/50 rounded transition-colors cursor-pointer"
              title="Actions"
            >
              <MoreVertical size={16} />
            </div>

            {/* Dropdown menu */}
            {showMenu && (
              <div className="absolute top-full right-0 mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg min-w-[160px] z-10">
                <div
                  onClick={handleCopy}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700 text-sm text-left transition-colors cursor-pointer"
                >
                  <Copy size={14} />
                  <span>Copy</span>
                </div>

                {isAssistant && (
                  <div
                    onClick={handleAddToWorkflow}
                    className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700 text-sm text-left transition-colors cursor-pointer ${adding ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <FileText size={14} />
                    <span>{adding ? 'Creating...' : '→ Workflow'}</span>
                  </div>
                )}

                {logs && logs.length > 0 && (
                  <div
                    onClick={() => {
                      setShowLogsModal(true);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700 text-sm text-left transition-colors cursor-pointer"
                  >
                    <FileText size={14} />
                    <span>Logs</span>
                  </div>
                )}

                <div
                  onClick={handleDelete}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-red-600 text-sm text-left transition-colors cursor-pointer border-t border-slate-600 ${deleting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Trash2 size={14} />
                  <span>{deleting ? 'Deleting...' : 'Delete'}</span>
                </div>
              </div>
            )}
          </div>

          <p className="text-sm whitespace-pre-wrap break-words pr-8">{cleanContent}</p>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {attachments.map((attachment, idx) => {
              const isImage = (attachment.type === 'image') || (attachment.mimetype?.startsWith('image/'));
              const fileName = attachment.filename || attachment.originalName || 'file';
              const fileSize = attachment.size || 0;
              
              if (isImage) {
                // Image preview
                const imageUrl = normalizeUrl(attachment.url);
                return (
                  <div key={attachment.id || idx} className="mt-2">
                    <img 
                      src={imageUrl} 
                      alt={fileName}
                      className="max-w-full max-h-64 rounded border border-slate-600 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(imageUrl, '_blank')}
                    />
                    {fileSize > 0 && (
                      <div className="mt-1 text-xs opacity-70">
                        {fileName} ({(fileSize / 1024).toFixed(1)} KB)
                      </div>
                    )}
                  </div>
                );
              } else {
                // File download link
                const fileUrl = normalizeUrl(attachment.url);
                return (
                  <a
                    key={attachment.id || idx}
                    href={fileUrl}
                    download={fileName}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-600/50 hover:bg-slate-600 rounded border border-slate-500 transition-colors text-xs"
                  >
                    <Download size={14} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{fileName}</div>
                      {fileSize > 0 && (
                        <div className="opacity-70">
                          {(fileSize / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                  </a>
                );
              }
            })}
          </div>
        )}

        </div>
      </div>

      {/* Logs Modal */}
      {showLogsModal && logs && logs.length > 0 && (
        <Modal
          title="Request execution logs"
          onClose={() => setShowLogsModal(false)}
          actions={
            <button
              type="button"
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              onClick={() => setShowLogsModal(false)}
            >
              Close
            </button>
          }
        >
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-3">
              {(() => {
                // Separate logs into REQUEST and RESPONSE groups
                const requestLogs: string[] = [];
                const responseLogs: string[] = [];
                const otherLogs: string[] = [];

                logs.forEach(log => {
                  if (log.includes('REQUEST:')) {
                    // Extract all lines after REQUEST:
                    const lines = log.split('\n');
                    lines.forEach(line => {
                      if (line.trim() && !line.includes('REQUEST:')) {
                        requestLogs.push(line.trim());
                      }
                    });
                  } else if (log.includes('RESPONSE:')) {
                    const responseMatch = log.match(/RESPONSE:\s*(.+)/s);
                    if (responseMatch) {
                      responseLogs.push(responseMatch[1].trim());
                    }
                  } else if (log.trim()) {
                    otherLogs.push(log.trim());
                  }
                });

                return (
                  <>
                    {/* REQUEST Block */}
                    {requestLogs.length > 0 && (
                      <div className="border border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-900 p-3 border-b border-slate-700">
                          <p className="font-semibold text-slate-200 text-sm flex items-center gap-2">
                            📤 REQUEST
                          </p>
                        </div>
                        <div className="bg-slate-900 p-3">
                          <pre className="whitespace-pre-wrap break-words bg-slate-800/40 border border-slate-700/40 rounded p-2 text-xs text-slate-300">
                            {requestLogs.join('\n')}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* RESPONSE Block */}
                    {responseLogs.length > 0 && (
                      <div className="border border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-900 p-3 border-b border-slate-700">
                          <p className="font-semibold text-slate-200 text-sm flex items-center gap-2">
                            📥 RESPONSE
                          </p>
                        </div>
                        <div className="bg-slate-900 p-3">
                          <pre className="whitespace-pre-wrap break-words bg-slate-800/40 border border-slate-700/40 rounded p-2 text-xs text-slate-300">
                            {responseLogs.join('\n')}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Other logs if any */}
                    {otherLogs.length > 0 && (
                      <div className="border border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-900 p-3">
                          <pre className="whitespace-pre-wrap break-words bg-slate-800/40 border border-slate-700/40 rounded p-2 text-xs text-slate-300">
                            {otherLogs.join('\n')}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}

      {/* Workflow Selection Modal */}
      {showWorkflowModal && (
        <Modal
          isOpen={showWorkflowModal}
          onClose={() => setShowWorkflowModal(false)}
          title="Add to Workflow"
        >
          <div className="p-4 space-y-4">
            <p className="text-sm text-slate-300">
              Select a workflow to add this message as a text node:
            </p>
            
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select Workflow...</option>
              {projects.map(proj => (
                <option key={proj.project_id} value={proj.project_id}>
                  {proj.title}
                </option>
              ))}
            </select>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowWorkflowModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAddToWorkflow}
                disabled={!selectedProjectId || adding}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? 'Adding...' : 'Add to Workflow'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
