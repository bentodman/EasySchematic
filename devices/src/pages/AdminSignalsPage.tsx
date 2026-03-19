import { useEffect, useMemo, useState } from "react";
import {
  clearAdminToken,
  deleteConnector,
  deleteSignal,
  fetchConnectors,
  fetchSignals,
  getAdminToken,
  createSignal,
  updateSignal,
} from "../api";
import AuthGate from "../components/AuthGate";

type SignalForm = {
  id: string;
  label: string;
  defaultColor: string;
  cableLabel: string;
  defaultConnectorId: string | null;
  isNetwork: boolean;
  isVideo: boolean;
};

const blankForm = (): SignalForm => ({
  id: "",
  label: "",
  defaultColor: "#3b82f6",
  cableLabel: "",
  defaultConnectorId: null,
  isNetwork: false,
  isVideo: false,
});

function SignalsEditor() {
  const [signals, setSignals] = useState<Array<{ id: string; label: string }>>([]);
  const [connectors, setConnectors] = useState<Array<{ id: string; label: string }>>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SignalForm>(blankForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = getAdminToken();

  const connectorOptions = useMemo(() => {
    const opts = connectors.map((c) => ({ value: c.id, label: c.label }));
    return [{ value: "", label: "None" }, ...opts];
  }, [connectors]);

  async function reload() {
    setError(null);
    try {
      const [s, c] = await Promise.all([fetchSignals(), fetchConnectors()]);
      setSignals(s.map((x) => ({ id: x.id, label: x.label })));
      setConnectors(c.map((x) => ({ id: x.id, label: x.label })));
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
    const existing = signals.find((s) => s.id === editingId);
    if (!existing) {
      // If we're editing but list is stale, reload.
      void reload();
      return;
    }
    // We don't have all fields in the list row, so refetch signals.
    (async () => {
      const all = await fetchSignals();
      const sig = all.find((x) => x.id === editingId);
      if (!sig) return;
      setForm({
        id: sig.id,
        label: sig.label,
        defaultColor: sig.defaultColor,
        cableLabel: sig.cableLabel,
        defaultConnectorId: sig.defaultConnectorId ?? null,
        isNetwork: sig.isNetwork,
        isVideo: sig.isVideo,
      });
    })();
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNew = () => {
    setEditingId(null);
    setForm(blankForm());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Not authenticated");
      return;
    }
    if (!form.id.trim()) return setError("id is required");
    if (!form.label.trim()) return setError("label is required");
    if (!form.cableLabel.trim()) return setError("cableLabel is required");

    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateSignal(
          editingId,
          {
            label: form.label,
            defaultColor: form.defaultColor,
            cableLabel: form.cableLabel,
            defaultConnectorId: form.defaultConnectorId,
            isNetwork: form.isNetwork,
            isVideo: form.isVideo,
          },
          token,
        );
      } else {
        await createSignal(
          {
            id: form.id,
            label: form.label,
            defaultColor: form.defaultColor,
            cableLabel: form.cableLabel,
            defaultConnectorId: form.defaultConnectorId,
            isNetwork: form.isNetwork,
            isVideo: form.isVideo,
          },
          token,
        );
      }

      await reload();
      handleNew();
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        clearAdminToken();
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    if (!window.confirm(`Delete signal "${id}"? This may break templates referencing it.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSignal(id, token);
      await reload();
      if (editingId === id) handleNew();
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        clearAdminToken();
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Signals</h1>
          <p className="text-sm text-slate-600">Define logical signal IDs used by device templates.</p>
        </div>
        <button onClick={handleNew} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors" disabled={busy}>
          New signal
        </button>
      </div>

      {error && (
        <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? `Edit: ${editingId}` : "Create new"}
            </h2>

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

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-600">
                <span className="block mb-1">defaultColor</span>
                <input type="text" value={form.defaultColor} onChange={(e) => setForm((f) => ({ ...f, defaultColor: e.target.value }))} className="w-full px-2 py-1 rounded border border-slate-200 text-sm" />
              </label>
              <label className="block text-xs text-slate-600">
                <span className="block mb-1">cableLabel</span>
                <input value={form.cableLabel} onChange={(e) => setForm((f) => ({ ...f, cableLabel: e.target.value }))} className="w-full px-2 py-1 rounded border border-slate-200 text-sm" />
              </label>
            </div>

            <label className="block text-xs text-slate-600">
              <span className="block mb-1">defaultConnectorId</span>
              <select
                value={form.defaultConnectorId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, defaultConnectorId: e.target.value ? e.target.value : null }))}
                className="w-full px-2 py-1 rounded border border-slate-200 text-sm"
              >
                {connectorOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isNetwork} onChange={(e) => setForm((f) => ({ ...f, isNetwork: e.target.checked }))} />
                isNetwork
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isVideo} onChange={(e) => setForm((f) => ({ ...f, isVideo: e.target.checked }))} />
                isVideo
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={busy} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors">
                {busy ? "Working..." : editingId ? "Save" : "Create"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => void handleDelete(editingId)}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="md:col-span-3">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Existing signals</h2>
              <span className="text-sm text-slate-500">{signals.length}</span>
            </div>
            <div className="divide-y divide-slate-200">
              {signals.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{s.label}</div>
                    <div className="text-xs text-slate-500 truncate font-mono">{s.id}</div>
                  </div>
                  <button
                    onClick={() => setEditingId(s.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 transition-colors"
                    disabled={busy}
                  >
                    Edit
                  </button>
                </div>
              ))}
              {signals.length === 0 && (
                <div className="p-4 text-sm text-slate-500">No signals yet. Create one to start building templates.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSignalsPage() {
  return (
    <AuthGate>
      <SignalsEditor />
    </AuthGate>
  );
}

