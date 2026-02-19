import { useState } from 'react';
import Modal from '../../ui/Modal';
import ProviderPanel from './ProviderPanel';
import { type ProviderConfig } from '../../data/providers';

type IntegrationManagerProps = {
  open: boolean;
  onClose: () => void;
  onSelect?: (provider: ProviderConfig | null) => void;
};

function IntegrationManager({ open, onClose, onSelect }: IntegrationManagerProps) {
  if (!open) return null;

  return (
    <Modal
      title="Manage Integrations"
      onClose={onClose}
      actions={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      }
    >
      <ProviderPanel onSelect={onSelect} />
    </Modal>
  );
}

export default IntegrationManager;
