import { useEffect, useState } from "react";
import {
  clearAdminToken,
  createCategory,
  deleteCategory,
  fetchCategories,
  getAdminToken,
  updateCategory,
  fetchCategory,
} from "../api";
import AuthGate from "../components/AuthGate";

type CategoryForm = {
  id: string;
  label: string;
  deviceTypesCsv: string;
};

function blankForm(): CategoryForm {
  return { id: "", label: "", deviceTypesCsv: "" };
}

function CategoriesEditor() {
  const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(blankForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = getAdminToken();

  async function reload() {
    setError(null);
    try {
      const list = await fetchCategories();
      setCategories(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const cat = await fetchCategory(editingId);
      setForm({
        id: cat.id,
        label: cat.label,
        deviceTypesCsv: (cat.deviceTypes ?? []).join(", "),
      });
    })();
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNew = () => {
    setEditingId(null);
    setForm(blankForm());
  };

  const parseDeviceTypes = (): string[] =>
    form.deviceTypesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("Not authenticated");
    if (!form.label.trim()) return setError("label is required");
    const deviceTypes = parseDeviceTypes();
    if (deviceTypes.length === 0) return setError("deviceTypes must be non-empty");

    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateCategory(
          editingId,
          {
            label: form.label,
            deviceTypes,
          },
          token,
        );
      } else {
        if (!form.id.trim()) return setError("id is required");
        await createCategory(
          {
            id: form.id,
            label: form.label,
            deviceTypes,
          },
          token,
        );
      }
      await reload();
      handleNew();
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") clearAdminToken();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || !token) return;
    if (!window.confirm(`Delete category "${editingId}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCategory(editingId, token);
      await reload();
      handleNew();
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") clearAdminToken();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Categories</h1>
          <p className="text-sm text-slate-600">Group device types in the main app sidebar.</p>
        </div>
        <button onClick={handleNew} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors" disabled={busy}>
          New category
        </button>
      </div>

      {error && <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? `Edit: ${editingId}` : "Create new"}</h2>

            <label className="block text-xs text-slate-600">
              <span className="block mb-1">id</span>
              <input
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                className="w-full px-2 py-1 rounded border border-slate-200 text-sm"
                disabled={!!editingId}
              />
            </label>

            <label className="block text-xs text-slate-600">
              <span className="block mb-1">label</span>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="w-full px-2 py-1 rounded border border-slate-200 text-sm" />
            </label>

            <label className="block text-xs text-slate-600">
              <span className="block mb-1">deviceTypes (comma separated)</span>
              <textarea
                value={form.deviceTypesCsv}
                onChange={(e) => setForm((f) => ({ ...f, deviceTypesCsv: e.target.value }))}
                className="w-full px-2 py-1 rounded border border-slate-200 text-sm min-h-[90px]"
              />
            </label>

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={busy} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors">
                {busy ? "Working..." : editingId ? "Save" : "Create"}
              </button>
              {editingId && (
                <button type="button" onClick={() => void handleDelete()} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors">
                  Delete
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="md:col-span-3">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Existing categories</h2>
              <span className="text-sm text-slate-500">{categories.length}</span>
            </div>
            <div className="divide-y divide-slate-200">
              {categories.map((c) => (
                <div key={c.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.label}</div>
                    <div className="text-xs text-slate-500 truncate font-mono">{c.id}</div>
                  </div>
                  <button
                    onClick={() => setEditingId(c.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 transition-colors"
                    disabled={busy}
                  >
                    Edit
                  </button>
                </div>
              ))}
              {categories.length === 0 && <div className="p-4 text-sm text-slate-500">No categories yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <AuthGate>
      <CategoriesEditor />
    </AuthGate>
  );
}

