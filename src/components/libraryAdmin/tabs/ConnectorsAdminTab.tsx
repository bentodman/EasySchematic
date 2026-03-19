import { useCallback, useEffect, useState } from "react";
import {
  fetchConnectors,
  createConnector,
  updateConnector,
  deleteConnector,
  type ConnectorDefinition,
} from "../../../libraryApi";
import { slugify } from "../slugify";
import { useConfirmDialog } from "../../ConfirmDialog";

export default function ConnectorsAdminTab({
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
  const [list, setList] = useState<ConnectorDefinition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", cableLabel: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchConnectors();
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
      setForm({ label: "", cableLabel: "" });
      return;
    }
    const c = list.find((x) => x.id === editingId);
    if (c) setForm({ label: c.label, cableLabel: c.cableLabel });
  }, [editingId, list]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("Set admin token first");
    if (!form.label.trim()) return setError("Name is required");
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateConnector(editingId, { label: form.label.trim(), cableLabel: form.cableLabel.trim() });
      } else {
        await createConnector({ id: slugify(form.label), label: form.label.trim(), cableLabel: form.cableLabel.trim() });
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

  const remove = async (c: ConnectorDefinition) => {
    if (!token) {
      setError("Set admin token first");
      return;
    }
    const ok = await requestConfirm({
      title: "Delete connector type",
      message: `Delete "${c.label}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteConnector(c.id);
      setList((prev) => prev.filter((x) => x.id !== c.id));
      await onSuccess();
      if (editingId === c.id) setEditingId(null);
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
        <strong className="text-[var(--color-text)]">Connector types</strong> are the physical plug on the device (e.g. BNC, XLR, HDMI). Each port has both a signal type and a connector type. Two ports can only connect if their connector types are listed as compatible below. Names like HDMI can appear in both signal types and connector types when the format and the plug are the same.
      </p>
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-3">
          {editingId ? `Edit "${editingLabel ?? ""}"` : "Add new connector type"}
        </h3>
        <form onSubmit={submit} className="grid gap-3 text-sm max-w-md">
          <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
            <label className="text-[var(--color-text-muted)]">Name</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. BNC, XLR, HDMI"
              className="px-2 py-1.5 border border-[var(--color-border)] rounded"
            />
            <label className="text-[var(--color-text-muted)]">Cable label</label>
            <div>
              <input
                value={form.cableLabel}
                onChange={(e) => setForm((f) => ({ ...f, cableLabel: e.target.value }))}
                placeholder="e.g. BNC cable"
                className="px-2 py-1.5 border border-[var(--color-border)] rounded w-full"
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Pack list / cable schedule. This one is used first when both ports have a connector.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50">
              {editingId ? "Save changes" : "Add connector type"}
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
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">Existing connector types</h3>
        <ul className="border border-[var(--color-border)] rounded overflow-hidden max-h-52 overflow-y-auto">
          {list.length === 0 ? (
            <li className="px-3 py-4 text-sm text-[var(--color-text-muted)]">None yet. Add one above.</li>
          ) : (
            list.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 bg-white hover:bg-[var(--color-surface-hover)]">
                <span className="font-medium">{c.label}</span>
                <span className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => setEditingId(c.id)} className="text-sm text-[var(--color-primary)] hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); remove(c); }} className="text-sm text-red-600 hover:underline">
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

