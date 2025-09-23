import { AgentLogs } from './AgentLogs';
import Modal from '../../ui/Modal';

interface AgentLogsModalProps {
  nodeId: string;
  projectId: string;
  onClose: () => void;
}

export function AgentLogsModal({ nodeId, projectId, onClose }: AgentLogsModalProps) {
  return (
    <Modal
      title="Логи выполнения ноды"
      onClose={onClose}
      actions={
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
          onClick={onClose}
        >
          Закрыть
        </button>
      }
    >
      <div className="max-h-[70vh] overflow-y-auto">
        <AgentLogs 
          nodeId={nodeId} 
          projectId={projectId} 
          compact={false}
        />
      </div>
    </Modal>
  );
}