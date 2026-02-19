import { useCallback, useState } from 'react';
import { AlertTriangleIcon } from './icons/AlertIcons';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  neutralText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onNeutral?: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  neutralText,
  onConfirm,
  onCancel,
  onNeutral,
  type = 'danger'
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: 'text-red-400',
      confirmButton: 'bg-red-600 hover:bg-red-500 focus:ring-red-500',
      border: 'border-red-500/20',
      iconBg: 'bg-red-500/10'
    },
    warning: {
      icon: 'text-yellow-400',
      confirmButton: 'bg-yellow-600 hover:bg-yellow-500 focus:ring-yellow-500',
      border: 'border-yellow-500/20',
      iconBg: 'bg-yellow-500/10'
    },
    info: {
      icon: 'text-blue-400',
      confirmButton: 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500',
      border: 'border-blue-500/20',
      iconBg: 'bg-blue-500/10'
    }
  };

  const styles = typeStyles[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Dialog */}
      <div className={`relative bg-slate-900 border ${styles.border} rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-zoom-in-95`}>
        {/* Header with icon */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center`}>
              <AlertTriangleIcon className={`w-6 h-6 ${styles.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white mb-2">
                {title}
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-800/50 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            {cancelText}
          </button>
          {neutralText && onNeutral && (
            <button
              onClick={onNeutral}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              {neutralText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 ${styles.confirmButton}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for convenient use
export function useConfirmDialog() {
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    neutralText?: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm?: () => void;
    onCancel?: () => void;
    onNeutral?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const showConfirm = useCallback((options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    neutralText?: string;
    type?: 'danger' | 'warning' | 'info';
  }) => {
    return new Promise<'confirm' | 'cancel' | 'neutral'>((resolve) => {
      setDialog({
        ...options,
        isOpen: true,
        onConfirm: () => {
          setDialog(prev => ({ ...prev, isOpen: false }));
          resolve('confirm');
        },
        onCancel: () => {
          setDialog(prev => ({ ...prev, isOpen: false }));
          resolve('cancel');
        },
        onNeutral: () => {
          setDialog(prev => ({ ...prev, isOpen: false }));
          resolve('neutral');
        }
      });
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  const ConfirmDialogComponent = useCallback(() => (
    <ConfirmDialog
      isOpen={dialog.isOpen}
      title={dialog.title}
      message={dialog.message}
      confirmText={dialog.confirmText}
      cancelText={dialog.cancelText}
      neutralText={dialog.neutralText}
      type={dialog.type}
      onConfirm={dialog.onConfirm || (() => {})}
      onCancel={dialog.onCancel || hideConfirm}
      onNeutral={dialog.onNeutral}
    />
  ), [dialog, hideConfirm]);

  return {
    showConfirm,
    ConfirmDialog: ConfirmDialogComponent
  };
}
