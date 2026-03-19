import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ConfirmDialogOptions = {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export function ConfirmDialog({
  open,
  options,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  options: ConfirmDialogOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const {
    title = "Confirm",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger,
    message,
  } = options;

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
            onClick={onCancel}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="px-4 py-4 text-sm text-[var(--color-text)]">{message}</div>

        <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[var(--color-border)] rounded text-sm hover:bg-[var(--color-surface-hover)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded hover:opacity-90 ${
              danger
                ? "bg-red-600 text-white"
                : "bg-[var(--color-primary)] text-white"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmDialog() {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions>({
    message: "",
  });

  const requestConfirm = useCallback((opts: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
      setOpen(true);
    });
  }, []);

  const onConfirm = useCallback(() => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.(true);
  }, []);

  const onCancel = useCallback(() => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.(false);
  }, []);

  // In case the component unmounts while a confirm is pending.
  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const dialog = useMemo(
    () => <ConfirmDialog open={open} options={options} onConfirm={onConfirm} onCancel={onCancel} />,
    [open, options, onConfirm, onCancel],
  );

  return { requestConfirm, ConfirmDialog: dialog };
}

