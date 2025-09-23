import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title?: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}

function Modal({ title, children, onClose, actions }: ModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:bg-slate-700"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="max-h-[65vh] overflow-y-auto px-6 py-4 text-sm text-slate-200">{children}</div>
        {actions && <footer className="border-t border-slate-800 px-6 py-4">{actions}</footer>}
      </div>
    </div>
  );

  // Render modal using portal to document.body to avoid z-index issues
  return createPortal(modalContent, document.body);
}

export default Modal;
