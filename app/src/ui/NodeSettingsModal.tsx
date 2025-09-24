

import { useState } from 'react';
import Modal from './Modal';
import { useConfirmDialog } from './ConfirmDialog';
import type { FlowNode } from '../state/api';

interface NodeSettingsModalProps {
  node: FlowNode;
  onClose: () => void;
  onUpdateNodeMeta?: (nodeId: string, patch: Record<string, unknown>) => void;
  loading?: boolean;
}

export function NodeSettingsModal({ node, onClose, onUpdateNodeMeta, loading = false }: NodeSettingsModalProps) {
  const [localMeta, setLocalMeta] = useState<Record<string, unknown>>(node.meta || {});
  const [hasChanges, setHasChanges] = useState(false);

  // Confirm dialog hook
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  const handleSave = () => {
    if (onUpdateNodeMeta && hasChanges) {
      onUpdateNodeMeta(node.node_id, localMeta);
      setHasChanges(false);
    }
  };

  const handleClose = async () => {
    if (hasChanges) {
      const confirmed = await showConfirm({
        title: 'Есть несохраненные изменения',
        message: 'У вас есть несохраненные изменения в настройках ноды. Хотите сохранить их перед закрытием?',
        confirmText: 'Сохранить',
        cancelText: 'Не сохранять',
        type: 'warning'
      });
      
      if (confirmed) {
        handleSave();
      }
    }
    onClose();
  };

  const updateMeta = (key: string, value: unknown) => {
    setLocalMeta(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  return (
    <Modal
      title={`Настройки ноды: ${node.title}`}
      onClose={handleClose}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            onClick={handleClose}
          >
            Закрыть
          </button>
          {hasChanges && (
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
              onClick={handleSave}
              disabled={loading}
            >
              Сохранить изменения
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6 p-6 max-h-[70vh] overflow-y-auto">
        {/* Node Information */}
        <div>
          <h3 className="mb-3 font-medium text-slate-300">Информация об узле</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">ID:</span>
              <span className="font-mono text-slate-300">{node.node_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Тип:</span>
              <span className="text-slate-300">{node.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Символов:</span>
              <span className="text-slate-300">{(node.content || '').length.toLocaleString()}</span>
            </div>
            {node.type === 'ai' && node.ai?.model && (
              <div className="flex justify-between">
                <span className="text-slate-400">Модель:</span>
                <span className="text-slate-300">{String(node.ai.model)}</span>
              </div>
            )}
          </div>
        </div>
        {/* Node Metadata */}
        <div>
          <h3 className="mb-3 font-medium text-slate-300">Метаданные узла</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Краткое описание
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={String(localMeta.short_description || '')}
                onChange={(e) => updateMeta('short_description', e.target.value)}
                placeholder="Краткое описание узла..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Приоритет выполнения
              </label>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={String(localMeta.priority || 'normal')}
                onChange={(e) => updateMeta('priority', e.target.value)}
              >
                <option value="low">Низкий</option>
                <option value="normal">Обычный</option>
                <option value="high">Высокий</option>
                <option value="critical">Критический</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Теги (через запятую)
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={String(localMeta.tags || '')}
                onChange={(e) => updateMeta('tags', e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </div>
        </div>
        {/* Raw metadata view */}
        <div>
          <h3 className="mb-3 font-medium text-slate-300">Все метаданные (JSON)</h3>
          <pre className="text-xs bg-slate-900 p-3 rounded border border-slate-700 overflow-auto max-h-40">
            {JSON.stringify(localMeta, null, 2)}
          </pre>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </Modal>
  );
}
