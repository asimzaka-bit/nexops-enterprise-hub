import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastMessage } from '../types/nexops';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 bottom-3 left-3 z-50 flex flex-col gap-2.5 sm:left-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-sm"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => {
        const iconMap = {
          success: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
          error: <XCircle className="h-4 w-4 text-rose-600 shrink-0" />,
          warning: <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />,
          info: <Info className="h-4 w-4 text-indigo-600 shrink-0" />,
        };

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-lg transition-all duration-200"
          >
            <div className="mt-0.5">{iconMap[toast.variant]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
