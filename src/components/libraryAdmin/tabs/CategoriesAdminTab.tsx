import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { fetchCategories, createCategory, updateCategory, deleteCategory, type CategoryDefinition } from "../../../libraryApi";
import { useConfirmDialog } from "../../ConfirmDialog";

export default function CategoriesAdminTab({
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
  const [list, setList] = useState<CategoryDefinition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", parentId: "" as string | "", sortOrder: 0 });

  const load = useCallback(async () => {
    setError(null);
    try {
      const categories = await fetchCategories();
      setList(categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editingId) {
      setForm({ label: "", parentId: "", sortOrder: 0 });
      return;
    }
    const c = list.find((x) => x.id === editingId);
    if (c) setForm({ label: c.label, parentId: c.parentId ?? "", sortOrder: c.sortOrder ?? 0 });
  }, [editingId, list]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("Set admin token first");
    if (!form.label.trim()) return setError("Name is required");
    setBusy(true);
    setError(null);
    try {
      const parentId = form.parentId.trim() || null;
      if (editingId) {
        await updateCategory(editingId, {
          label: form.label.trim(),
          parentId,
          sortOrder: form.sortOrder,
        });
      } else {
        await createCategory({
          label: form.label.trim(),
          parentId,
          sortOrder: form.sortOrder,
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

  const remove = async (c: CategoryDefinition) => {
    if (!token) {
      setError("Set admin token first");
      return;
    }
    const ok = await requestConfirm({
      title: "Delete category",
      message: `Delete "${c.label}"? Devices in this category will become uncategorized.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCategory(c.id);
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

  const roots = list.filter((c) => !c.parentId).toSorted((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  const childrenOf = (id: string) =>
    list.filter((c) => c.parentId === id).toSorted((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

  const renderTree = (cats: CategoryDefinition[], depth: number): ReactNode[] =>
    cats.flatMap((c) => [
      <li
        key={c.id}
        className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 bg-white hover:bg-[var(--color-surface-hover)]"
        style={{ paddingLeft: 12 + depth * 12 }}
      >
        <span className="font-medium">{c.label}</span>
        <span className="flex gap-2 shrink-0">
          <button type="button" onClick={() => setEditingId(c.id)} className="text-sm text-[var(--color-primary)] hover:underline">
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(c);
            }}
            className="text-sm text-red-600 hover:underline"
          >
            Delete
          </button>
        </span>
      </li>,
      ...renderTree(childrenOf(c.id), depth + 1),
    ]);

  return (
    <div className="space-y-6">
      {ConfirmDialogEl}
      <p className="text-sm text-[var(--color-text-muted)]">
        <strong className="text-[var(--color-text)]">Categories</strong> and subcategories organize devices in the sidebar. Each device template is assigned to one category (or left uncategorized).
      </p>
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-3">
          {editingId ? `Edit "${editingLabel ?? ""}"` : "Add new category"}
        </h3>
        <form onSubmit={submit} className="grid gap-3 text-sm max-w-md">
          <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
            <label className="text-[var(--color-text-muted)]">Name</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Sources, Audio"
              className="px-2 py-1.5 border border-[var(--color-border)] rounded"
            />
            <label className="text-[var(--color-text-muted)]">Parent</label>
            <select
              value={form.parentId}
              onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
              className="px-2 py-1.5 border border-[var(--color-border)] rounded"
            >
              <option value="">— Top level —</option>
              {list.filter((c) => c.id !== editingId).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="text-[var(--color-text-muted)]">Sort order</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 0 }))}
              className="px-2 py-1.5 border border-[var(--color-border)] rounded w-24"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50">
              {editingId ? "Save changes" : "Add category"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-4 py-2 border border-[var(--color-border)] rounded text-sm hover:bg-[var(--color-surface-hover)]"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">Existing categories</h3>
        <ul className="border border-[var(--color-border)] rounded overflow-hidden max-h-52 overflow-y-auto">
          {list.length === 0 ? (
            <li className="px-3 py-4 text-sm text-[var(--color-text-muted)]">None yet. Add one above.</li>
          ) : (
            renderTree(roots, 0)
          )}
        </ul>
      </section>
    </div>
  );
}

