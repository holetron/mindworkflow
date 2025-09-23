import { useState, useEffect, useCallback } from 'react';
import type { RunLog } from '../../state/api';
import { fetchNodeLogs } from '../../state/api';

interface AgentLogsProps {
  nodeId: string;
  projectId: string;
  compact?: boolean;
}

export function AgentLogs({ nodeId, projectId, compact = false }: AgentLogsProps) {
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedLogs = await fetchNodeLogs(projectId, nodeId);
      setLogs(fetchedLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  }, [projectId, nodeId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const toggleLog = (logId: string) => {
    setExpandedLogId(prev => prev === logId ? null : logId);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'failed': return '❌';
      case 'running': return '⏳';
      default: return '⚪';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'running': return 'text-yellow-400';
      default: return 'text-slate-400';
    }
  };

  if (compact && logs.length === 0) {
    return (
      <div className="text-xs text-slate-500 text-center py-2">
        Нет логов выполнения
      </div>
    );
  }

  if (compact) {
    const latestLog = logs[0];
    return (
      <div className="bg-slate-800/50 rounded p-2 text-xs">
        <div className="flex items-center gap-2 mb-1">
          <span>{getStatusIcon(latestLog?.status || '')}</span>
          <span className="font-medium text-slate-300">Последний запуск</span>
          <span className="text-slate-500 ml-auto">
            {latestLog ? formatTimestamp(latestLog.timestamp) : 'Нет данных'}
          </span>
        </div>
        {latestLog && (
          <div className={`${getStatusColor(latestLog.status)} truncate`}>
            {latestLog.status === 'success' ? 'Выполнено успешно' : 
             latestLog.status === 'failed' ? 'Ошибка выполнения' : 
             latestLog.status === 'running' ? 'Выполняется...' : 'Неизвестный статус'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          📊 История выполнений
          {logs.length > 0 && (
            <span className="bg-slate-700 text-xs px-2 py-0.5 rounded">
              {logs.length}
            </span>
          )}
        </h4>
        <button
          onClick={loadLogs}
          disabled={loading}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          {loading ? '⏳' : '🔄'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded p-2 mb-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="text-center text-slate-500 py-4 text-sm">
          Загрузка логов...
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center text-slate-500 py-4 text-sm">
          Нет записей о выполнении
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
          {logs.map((log) => (
            <div
              key={log.run_id}
              className="border border-slate-700 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleLog(log.run_id)}
                className="w-full p-3 text-left hover:bg-slate-700/30 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-lg">{getStatusIcon(log.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium ${getStatusColor(log.status)}`}>
                        {log.status === 'success' ? 'Успешно' : 
                         log.status === 'failed' ? 'Ошибка' : 
                         log.status === 'running' ? 'Выполняется' : 'Неизвестно'}
                      </span>
                      <span className="text-xs text-slate-500">
                        ID: {log.run_id.slice(0, 8)}...
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatTimestamp(log.timestamp)}
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 text-sm ml-2">
                  {expandedLogId === log.run_id ? '▲' : '▼'}
                </span>
              </button>

              {expandedLogId === log.run_id && (
                <div className="bg-slate-900 p-3 border-t border-slate-700">
                  <div className="space-y-3">
                    {/* Request details */}
                    {log.input && (
                      <div>
                        <div className="text-xs font-medium text-slate-400 mb-1">
                          📤 Входные данные:
                        </div>
                        <pre className="bg-slate-800 p-2 rounded text-xs text-slate-300 overflow-x-auto">
                          {typeof log.input === 'string' ? log.input : JSON.stringify(log.input, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Response details */}
                    {log.output && (
                      <div>
                        <div className="text-xs font-medium text-slate-400 mb-1">
                          📥 Результат:
                        </div>
                        <pre className="bg-slate-800 p-2 rounded text-xs text-slate-300 overflow-x-auto">
                          {typeof log.output === 'string' ? log.output : JSON.stringify(log.output, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Logs */}
                    {log.logs && log.logs.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-slate-400 mb-1">
                          📝 Логи выполнения:
                        </div>
                        <div className="bg-slate-800 p-2 rounded text-xs space-y-1">
                          {log.logs.map((logLine, index) => (
                            <div key={index} className="text-slate-300 font-mono">
                              {logLine}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error details */}
                    {log.status === 'failed' && log.error && (
                      <div>
                        <div className="text-xs font-medium text-red-400 mb-1">
                          ❌ Ошибка:
                        </div>
                        <div className="bg-red-900/20 border border-red-700/50 p-2 rounded text-xs text-red-300">
                          {log.error}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div>
                      <div className="text-xs font-medium text-slate-400 mb-1">
                        ⚙️ Метаданные:
                      </div>
                      <div className="bg-slate-800 p-2 rounded text-xs text-slate-400 space-y-1">
                        <div>Run ID: <span className="text-slate-300 font-mono">{log.run_id}</span></div>
                        <div>Node ID: <span className="text-slate-300 font-mono">{log.node_id}</span></div>
                        <div>Время: <span className="text-slate-300">{formatTimestamp(log.timestamp)}</span></div>
                        {log.duration_ms && (
                          <div>Длительность: <span className="text-slate-300">{log.duration_ms}ms</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}