import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  isDestructive = false,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xs shadow-2xl p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase font-mono">
            {title}
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed font-sans">{message}</p>

        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xs transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`px-4 py-1.5 text-xs font-medium tracking-wide border rounded-xs transition-colors flex items-center gap-2 ${
              isDestructive
                ? 'bg-red-950/80 hover:bg-red-900 text-red-200 border-red-700/80'
                : 'bg-cyan-700 hover:bg-cyan-600 text-white border-cyan-500'
            }`}
          >
            {isLoading && (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
