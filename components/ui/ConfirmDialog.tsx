import React from 'react';
import { AlertTriangle, Trash2, CheckCircle, Info } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  loading?: boolean;
}

const variantConfig = {
  danger: {
    icon: <Trash2 className="w-6 h-6" />,
    iconBg: 'bg-red-100 text-red-600',
    confirmBtn: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6" />,
    iconBg: 'bg-amber-100 text-amber-600',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  info: {
    icon: <Info className="w-6 h-6" />,
    iconBg: 'bg-blue-100 text-blue-600',
    confirmBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  success: {
    icon: <CheckCircle className="w-6 h-6" />,
    iconBg: 'bg-emerald-100 text-emerald-600',
    confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Sahkan',
  cancelLabel = 'Batal',
  variant = 'warning',
  loading = false,
}) => {
  const config = variantConfig[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="text-center py-2">
        {/* Icon */}
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${config.iconBg} mb-5`}>
          {config.icon}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">{message}</p>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 disabled:opacity-50 ${config.confirmBtn}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Memproses...
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
