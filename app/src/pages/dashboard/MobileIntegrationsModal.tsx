import ProviderPanel from '../../features/integrations/ProviderPanel';
import ErrorBoundary, { IntegrationErrorFallback } from '../../ui/ErrorBoundary';

interface MobileIntegrationsModalProps {
  onClose: () => void;
}

export function MobileIntegrationsModal({ onClose }: MobileIntegrationsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 lg:hidden">
      <div className="w-full max-w-md mx-4 max-h-[80vh] overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Global Integrations</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white transition rounded"
          >
            X
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <ErrorBoundary fallback={IntegrationErrorFallback}>
            <ProviderPanel />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
