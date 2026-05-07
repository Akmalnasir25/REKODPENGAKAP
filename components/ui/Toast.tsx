import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback to alert if no provider
    return {
      addToast: (_t: ToastType, title: string, msg?: string) => alert(msg ? `${title}\n${msg}` : title),
      success: (title: string, msg?: string) => alert(msg ? `${title}\n${msg}` : title),
      error: (title: string, msg?: string) => alert(msg ? `${title}\n${msg}` : title),
      warning: (title: string, msg?: string) => alert(msg ? `${title}\n${msg}` : title),
      info: (title: string, msg?: string) => alert(msg ? `${title}\n${msg}` : title),
    };
  }
  return ctx;
};

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
};

const bgColors: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-amber-50 border-amber-200',
  info: 'bg-blue-50 border-blue-200',
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const dur = toast.duration || 4000;
    const exitTimer = setTimeout(() => setIsExiting(true), dur - 300);
    const removeTimer = setTimeout(() => onRemove(toast.id), dur);
    return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
  }, [toast, onRemove]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm max-w-sm w-full transition-all duration-300 ${bgColors[toast.type]} ${
        isExiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'
      }`}
      style={{ animation: isExiting ? 'none' : 'slideInRight 0.35s cubic-bezier(0.16,1,0.3,1)' }}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
        {toast.message && <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{toast.message}</p>}
      </div>
      <button
        onClick={() => { setIsExiting(true); setTimeout(() => onRemove(toast.id), 300); }}
        className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 p-0.5 rounded hover:bg-black/5"
        aria-label="Tutup"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, title: string, message?: string, duration?: number) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev.slice(-4), { id, type, title, message, duration }]);
  }, []);

  const ctx: ToastContextType = {
    addToast,
    success: (t, m) => addToast('success', t, m),
    error: (t, m) => addToast('error', t, m),
    warning: (t, m) => addToast('warning', t, m),
    info: (t, m) => addToast('info', t, m),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none print:hidden">
        <style>{`
          @keyframes slideInRight {
            from { opacity: 0; transform: translateX(100%) scale(0.9); }
            to { opacity: 1; transform: translateX(0) scale(1); }
          }
        `}</style>
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
