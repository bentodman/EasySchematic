import { useCallback, useEffect, useState } from "react";
import {
  fetchSignals,
  createSignal,
  updateSignal,
  deleteSignal,
  type SignalDefinition,
} from "../../../libraryApi";
import { slugify } from "../slugify";
import { useConfirmDialog } from "../../ConfirmDialog";

export default function SignalsAdminTab({
  token,
  busy,
  setBusy,
  setError,
  onSuccess,
}: {
  token: string | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  onSuccess: () => Promise<void>;
}) {
  const { requestConfirm, ConfirmDialog: ConfirmDialogEl } = useConfirmDialog();
  const [list, setList] = useState<SignalDefinition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    defaultColor: "#3b82f6",
    cableLabel: "",
    defaultConnectorId: "",
    isNetwork: false,
    isVideo: false,
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchSignals();
      setList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editingId) {
      setForm({
        label: "",
        defaultColor: "#3b82f6",
        cableLabel: "",
        defaultConnectorId: "",
        isNetwork: false,
        isVideo: false,
      });
      return;
    }
    const s = list.find((x) => x.id === editingId);
    if (s) {
      setForm({
        label: s.label,
        defaultColor: s.defaultColor,
        cableLabel: s.cableLabel,
        defaultConnectorId: s.defaultConnectorId ?? "",
        isNetwork: s.isNetwork,
        isVideo: s.isVideo,
      });
    }
  }, [editingId, list]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("Set admin token first");
    if (!form.label.trim()) return setError("Name is required");
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateSignal(editingId, {
          label: form.label.trim(),
          defaultColor: form.defaultColor,
          cableLabel: form.cableLabel.trim(),
          defaultConnectorId: form.defaultConnectorId || null,
          isNetwork: form.isNetwork,
          isVideo: form.isVideo,
        });
      } else {
        await createSignal({
          id: slugify(form.label),
          label: form.label.trim(),
          defaultColor: form.defaultColor,
          cableLabel: form.cableLabel.trim(),
          defaultConnectorId: form.defaultConnectorId || null,
          isNetwork: form.isNetwork,
          isVideo: form.isVideo,
        });
      }
      await load();
      await onSuccess();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: SignalDefinition) => {
    if (!token) {
      setError("Set admin token first");
      return;
    }
    const ok = await requestConfirm({
      title: "Delete signal type",
      message: `Delete "${s.label}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSignal(s.id);
      setList((prev) => prev.filter((x) => x.id !== s.id));
      await onSuccess();
      if (editingId === s.id) setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const editingLabel = editingId ? list.find((x) => x.id === editingId)?.label : null;

  return (
    <div className="space-y-6">
      {ConfirmDialogEl}
      <p className="text-sm text-[var(--color-text-muted)]">
        <strong className="text-[var(--color-text)]">Signal types</strong> are what flows through the connection (e.g. SDI, HDMI, Dante). Each connection on the diagram has a signal type; it sets the line color and appears in the pack list. Some names (like HDMI) also appear as a connector type — that’s normal when the format and the plug share the same name.
      </p>
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-3">
          {editingId ? `Edit "${editingLabel ?? ""}"` : "Add new signal type"}
        </h3>
        <form onSubmit={submit} className="grid gap-3 text-sm max-w-md">
          <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
            <label className="text-[var(--color-text-muted)]">Name</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. HDMI, SDI, Dante"
              className="px-2 py-1.5 border border-[var(--color-border)] rounded"
            />
            <label className="text-[var(--color-text-muted)]">Line color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.defaultColor}
                onChange={(e) => setForm((f) => ({ ...f, defaultColor: e.target.value }))}
                className="w-9 h-9 p-0.5 border border-[var(--color-border)] rounded cursor-pointer"
              />
              <span className="text-[var(--color-text-muted)] text-xs">Connection line on the diagram</span>
            </div>
            <label className="text-[var(--color-text-muted)]">Cable label</label>
            <div>
              <input
                value={form.cableLabel}
                onChange={(e) => setForm((f) => ({ ...f, cableLabel: e.target.value }))}
                placeholder="e.g. HDMI cable"
                className="px-2 py-1.5 border border-[var(--color-border)] rounded w-full"
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Pack list / cable schedule. Used when the connector doesn’t have a cable label (fallback).</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isNetwork}
                onChange={(e) => setForm((f) => ({ ...f, isNetwork: e.target.checked }))}
                className="rounded"
              />
              <span>Network signal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isVideo}
                onChange={(e) => setForm((f) => ({ ...f, isVideo: e.target.checked }))}
                className="rounded"
              />
              <span>Video signal</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50">
              {editingId ? "Save changes" : "Add signal type"}
            </button>
            {editingId && (
              <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 border border-[var(--color-border)] rounded text-sm hover:bg-[var(--color-surface-hover)]">
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">Existing signal types</h3>
        <ul className="border border-[var(--color-border)] rounded overflow-hidden max-h-52 overflow-y-auto">
          {list.length === 0 ? (
            <li className="px-3 py-4 text-sm text-[var(--color-text-muted)]">None yet. Add one above.</li>
          ) : (
            list.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 bg-white hover:bg-[var(--color-surface-hover)]">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.defaultColor }} />
                  <span className="font-medium">{s.label}</span>
                </span>
                <span className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => setEditingId(s.id)} className="text-sm text-[var(--color-primary)] hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); remove(s); }} className="text-sm text-red-600 hover:underline">
                    Delete
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

