import { useToast } from '@/hooks/use-toast';

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg border p-4 shadow-lg transition-all ${
            toast.variant === 'destructive'
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : 'border-border bg-background text-foreground'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {toast.title && <div className="font-semibold">{toast.title}</div>}
              {toast.description && (
                <div className="mt-1 text-sm opacity-90">{toast.description}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-foreground/50 hover:text-foreground"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
