import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AlertDialogOptions = {
  title?: string;
  message: ReactNode;
  okLabel?: string;
};

export function AlertDialog({
  open,
  options,
  onOk,
  onClose,
}: {
  open: boolean;
  options: AlertDialogOptions;
  onOk: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const { title = "Notice", message, okLabel = "OK" } = options;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[90vw] max-w-[520px] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-heading)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="px-4 py-4 text-sm text-[var(--color-text)]">{message}</div>

        <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end">
          <button
            type="button"
            onClick={onOk}
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90"
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useAlertDialog() {
  const resolverRef = useRef<((value: void) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AlertDialogOptions>({
    message: "",
  });

  const showAlert = useCallback((opts: AlertDialogOptions) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
      setOpen(true);
    });
  }, []);

  const onOk = useCallback(() => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.();
  }, []);

  const onClose = useCallback(() => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.();
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.();
      resolverRef.current = null;
    };
  }, []);

  const dialog = useMemo(
    () => <AlertDialog open={open} options={options} onOk={onOk} onClose={onClose} />,
    [open, options, onOk, onClose],
  );

  return { showAlert, AlertDialog: dialog };
}

