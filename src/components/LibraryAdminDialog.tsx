import { useCallback, useEffect, useState } from "react";
import {
  getAdminToken,
  setAdminToken,
  isAdminTokenFromEnv,
  fetchSignals,
  fetchConnectors,
  fetchConnectorCompatibility,
  fetchCategories,
  fetchCategory,
  createSignal,
  updateSignal,
  deleteSignal,
  createConnector,
  updateConnector,
  deleteConnector,
  putConnectorCompatibility,
  createCategory,
  updateCategory,
  deleteCategory,
  type SignalDefinition,
  type ConnectorDefinition,
  type CategoryDefinition,
  type ConnectorCompatibilityPair,
} from "../libraryApi";
import { useLibraryRegistryStore } from "../libraryRegistry";

type TabId = "signals" | "connectors" | "compat" | "categories";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unnamed";
}

export default function LibraryAdminDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("signals");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshRegistry = useLibraryRegistryStore((s) => s.refresh);

  const token = getAdminToken();
  const setToken = useCallback((t: string | null) => {
    setAdminToken(t);
    setTokenInput("");
    setError(null);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[90vw] max-w-[720px] min-h-[420px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-base font-semibold text-[var(--color-text-heading)]">
            Library manager
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {!isAdminTokenFromEnv() && (
          !token ? (
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-muted)] mb-2">
                Use the same value as <code className="bg-black/5 px-1 rounded">ADMIN_TOKEN</code> in your API <code className="bg-black/5 px-1 rounded">.env</code>. Or set <code className="bg-black/5 px-1 rounded">VITE_ADMIN_TOKEN</code> in this app&apos;s <code className="bg-black/5 px-1 rounded">.env</code> for local dev (no typing here).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  placeholder="Admin token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="flex-1 min-w-[120px] px-2 py-1.5 text-sm border border-[var(--color-border)] rounded"
                />
                <button
                  onClick={() => tokenInput.trim() && setToken(tokenInput.trim())}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded hover:opacity-90"
                >
                  Set token
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)]">Admin token set</span>
              <button
                onClick={() => setToken(null)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Clear
              </button>
            </div>
          )
        )}

        <div className="flex border-b border-[var(--color-border)] px-2" role="tablist">
          {(["signals", "connectors", "compat", "categories"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "text-[var(--color-primary)] border-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {t === "signals" ? "Signal types" : t === "connectors" ? "Connector types" : t === "compat" ? "Compatibility" : "Categories"}
            </button>
          ))}
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex-1 min-h-[360px] overflow-auto p-4">
          {tab === "signals" && (
            <SignalsTab
              token={token}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onSuccess={refreshRegistry}
            />
          )}
          {tab === "connectors" && (
            <ConnectorsTab
              token={token}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onSuccess={refreshRegistry}
            />
          )}
          {tab === "compat" && (
            <CompatTab
              token={token}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onSuccess={refreshRegistry}
            />
          )}
          {tab === "categories" && (
            <CategoriesTab
              token={token}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onSuccess={refreshRegistry}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SignalsTab({
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
    if (!confirm(`Delete "${s.label}"?`)) return;
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
                  <button type="button" onClick={() => setEditingId(s.id)} className="text-sm text-[var(--color-primary)] hover:underline">Edit</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); remove(s); }} className="text-sm text-red-600 hover:underline">Delete</button>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function ConnectorsTab({
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
    if (!confirm(`Delete "${c.label}"?`)) return;
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
                  <button type="button" onClick={() => setEditingId(c.id)} className="text-sm text-[var(--color-primary)] hover:underline">Edit</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); remove(c); }} className="text-sm text-red-600 hover:underline">Delete</button>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function CompatTab({
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
  const [pairs, setPairs] = useState<ConnectorCompatibilityPair[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [addA, setAddA] = useState("");
  const [addB, setAddB] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, c] = await Promise.all([fetchConnectorCompatibility(), fetchConnectors()]);
      setPairs(p);
      setConnectors(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const addPair = async () => {
    if (!token || !addA.trim() || !addB.trim() || addA === addB) return;
    const newPairs = [...pairs, { connectorA: addA.trim(), connectorB: addB.trim() }];
    setBusy(true);
    setError(null);
    try {
      await putConnectorCompatibility(newPairs);
      await load();
      await onSuccess();
      setAddA("");
      setAddB("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removePair = async (idx: number) => {
    if (!token) return;
    const newPairs = pairs.filter((_, i) => i !== idx);
    setBusy(true);
    setError(null);
    try {
      await putConnectorCompatibility(newPairs);
      await load();
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-text-muted)]">
        Two ports on the diagram can only connect if their <strong className="text-[var(--color-text)]">connector types</strong> are listed here as a pair. Add pairs that can physically plug into each other (e.g. BNC ↔ BNC, or XLR ↔ XLR).
      </p>
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-3">Add compatible pair</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">First connector type</label>
            <select
              value={addA}
              onChange={(e) => setAddA(e.target.value)}
              className="px-3 py-2 border border-[var(--color-border)] rounded text-sm min-w-[140px]"
            >
              <option value="">Choose…</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Second connector type</label>
            <select
              value={addB}
              onChange={(e) => setAddB(e.target.value)}
              className="px-3 py-2 border border-[var(--color-border)] rounded text-sm min-w-[140px]"
            >
              <option value="">Choose…</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={addPair}
            disabled={busy || !addA || !addB || addA === addB}
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50"
          >
            Add pair
          </button>
        </div>
      </section>
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">Connector types that can connect</h3>
        <ul className="border border-[var(--color-border)] rounded overflow-hidden max-h-52 overflow-y-auto">
          {pairs.length === 0 ? (
            <li className="px-3 py-4 text-sm text-[var(--color-text-muted)]">No pairs yet. Add one above.</li>
          ) : (
            pairs.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 bg-white hover:bg-[var(--color-surface-hover)]">
                <span>{connectors.find((c) => c.id === p.connectorA)?.label ?? p.connectorA} ↔ {connectors.find((c) => c.id === p.connectorB)?.label ?? p.connectorB}</span>
                {token && (
                  <button type="button" onClick={() => removePair(i)} className="text-sm text-red-600 hover:underline">Remove</button>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function CategoriesTab({
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
  const [list, setList] = useState<CategoryDefinition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", deviceTypesCsv: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const summary = await fetchCategories();
      const full = await Promise.all(
        summary.map((c) => fetchCategory(c.id).catch(() => ({ id: c.id, label: c.label, deviceTypes: [] })))
      );
      setList(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editingId) {
      setForm({ label: "", deviceTypesCsv: "" });
      return;
    }
    const c = list.find((x) => x.id === editingId);
    if (c) setForm({ label: c.label, deviceTypesCsv: (c.deviceTypes ?? []).join(", ") });
  }, [editingId, list]);

  const parseTypes = (csv: string) => csv.split(",").map((s) => s.trim()).filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("Set admin token first");
    if (!form.label.trim()) return setError("Name is required");
    const deviceTypes = parseTypes(form.deviceTypesCsv);
    if (!deviceTypes.length) return setError("At least one device type is required");
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateCategory(editingId, { label: form.label.trim(), deviceTypes });
      } else {
        await createCategory({
          label: form.label.trim(),
          deviceTypes,
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
    if (!confirm(`Delete "${c.label}"?`)) return;
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

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-text-muted)]">
        <strong className="text-[var(--color-text)]">Categories</strong> group device types in the device library sidebar (e.g. Sources, Switching, Audio). List the device types that belong in each category.
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
            <label className="text-[var(--color-text-muted)] align-top pt-1.5">Device types</label>
            <input
              value={form.deviceTypesCsv}
              onChange={(e) => setForm((f) => ({ ...f, deviceTypesCsv: e.target.value }))}
              placeholder="camera, ptz-camera, graphics (comma-separated)"
              className="px-2 py-1.5 border border-[var(--color-border)] rounded"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50">
              {editingId ? "Save changes" : "Add category"}
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
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">Existing categories</h3>
        <ul className="border border-[var(--color-border)] rounded overflow-hidden max-h-52 overflow-y-auto">
          {list.length === 0 ? (
            <li className="px-3 py-4 text-sm text-[var(--color-text-muted)]">None yet. Add one above.</li>
          ) : (
            list.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 bg-white hover:bg-[var(--color-surface-hover)]">
                <span><span className="font-medium">{c.label}</span> <span className="text-[var(--color-text-muted)]">({(c.deviceTypes ?? []).length} device types)</span></span>
                <span className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => setEditingId(c.id)} className="text-sm text-[var(--color-primary)] hover:underline">Edit</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); remove(c); }} className="text-sm text-red-600 hover:underline">Delete</button>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
