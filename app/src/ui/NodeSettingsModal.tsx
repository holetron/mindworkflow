import { useState } from 'react';
import Modal from './Modal';
import type { Node } from '../types';

interface NodeSettingsModalProps {
  node: Node;
  onClose: () => void;
  onSave: (updatedNode: Node) => void;
}

export function NodeSettingsModal({ node, onClose, onSave }: NodeSettingsModalProps) {
  const [localNode, setLocalNode] = useState<Node>(node);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = () => {
    onSave(localNode);
    setHasChanges(false);
  };

  const handleClose = () => {
    if (hasChanges) {
      // TODO: Показать диалог подтверждения
      if (confirm('У вас есть несохраненные изменения. Хотите сохранить их?')) {
        handleSave();
      }
    }
    onClose();
  };

  return (
    <Modal
      title="Настройки ноды"
      onClose={handleClose}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            onClick={handleClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Сохранить
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-6">
        {/* TODO: Перенести сюда существующие настройки из нижней панели */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">Системный промпт</label>
            <textarea
              className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows={4}
              value={localNode.systemPrompt || ''}
              onChange={(e) => {
                setLocalNode(prev => ({ ...prev, systemPrompt: e.target.value }));
                setHasChanges(true);
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Промпт</label>
            <textarea
              className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows={4}
              value={localNode.prompt || ''}
              onChange={(e) => {
                setLocalNode(prev => ({ ...prev, prompt: e.target.value }));
                setHasChanges(true);
              }}
            />
          </div>

          {/* Настройки генерации */}
          <div>
            <h3 className="mb-2 font-medium text-slate-300">Настройки генерации</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-400">Temperature</label>
                <input
                  type="number"
                  className="w-24 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-right text-slate-300"
                  min={0}
                  max={2}
                  step={0.1}
                  value={localNode.temperature || 0.7}
                  onChange={(e) => {
                    setLocalNode(prev => ({ ...prev, temperature: parseFloat(e.target.value) }));
                    setHasChanges(true);
                  }}
                />
              </div>
              {/* Добавить другие настройки по мере необходимости */}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}