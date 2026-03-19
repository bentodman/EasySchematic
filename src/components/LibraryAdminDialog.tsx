import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminToken,
  setAdminToken,
  isAdminTokenFromEnv,
  fetchSignals,
  fetchConnectors,
  fetchConnectorCompatibility,
  fetchCategories,
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
import { useSchematicStore } from "../store";
import {
  fetchTemplatesAdmin,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type TemplatePayload,
} from "../libraryApi";
import { clearTemplateCache } from "../templateApi";
import type { DeviceTemplate, Port, DeviceData, DeviceNode } from "../types";
import AdminTabBar from "./libraryAdmin/components/AdminTabBar";
import AdminErrorBanner from "./libraryAdmin/components/AdminErrorBanner";
import type { LibraryAdminTabId } from "./libraryAdmin/libraryAdminTypes";
import SignalsAdminTab from "./libraryAdmin/tabs/SignalsAdminTab";
import ConnectorsAdminTab from "./libraryAdmin/tabs/ConnectorsAdminTab";
import CompatibilityAdminTab from "./libraryAdmin/tabs/CompatibilityAdminTab";
import CategoriesAdminTab from "./libraryAdmin/tabs/CategoriesAdminTab";
import DevicesAdminTabComponent from "./libraryAdmin/tabs/DevicesAdminTab";
import { useConfirmDialog } from "./ConfirmDialog";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unnamed";
}

export default function LibraryAdminDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<LibraryAdminTabId>("signals");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshRegistry = useLibraryRegistryStore((s) => s.refresh);

  const token = getAdminToken();
  const handleClose = useCallback(() => {
    clearTemplateCache();
    window.dispatchEvent(new CustomEvent("easyschematic:templates:refresh"));
    onClose();
  }, [onClose]);
  const setToken = useCallback((t: string | null) => {
    setAdminToken(t);
    setTokenInput("");
    setError(null);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 p-4 flex items-stretch justify-center"
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-full h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-base font-semibold text-[var(--color-text-heading)]">
            Library manager
          </span>
          <button
            type="button"
            onClick={handleClose}
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

        <AdminTabBar tab={tab} setTab={setTab} />

        {error && <AdminErrorBanner error={error} onDismiss={() => setError(null)} />}

        <div className="flex-1 min-h-[360px] overflow-auto p-4">
          {tab === "signals" && <SignalsAdminTab token={token} busy={busy} setBusy={setBusy} setError={setError} onSuccess={refreshRegistry} />}
          {tab === "connectors" && <ConnectorsAdminTab token={token} busy={busy} setBusy={setBusy} setError={setError} onSuccess={refreshRegistry} />}
          {tab === "compat" && <CompatibilityAdminTab token={token} busy={busy} setBusy={setBusy} setError={setError} onSuccess={refreshRegistry} />}
          {tab === "categories" && <CategoriesAdminTab token={token} busy={busy} setBusy={setBusy} setError={setError} onSuccess={refreshRegistry} />}
          {tab === "devices" && <DevicesAdminTabComponent token={token} busy={busy} setBusy={setBusy} setError={setError} onSuccess={refreshRegistry} />}
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
  const { requestConfirm, ConfirmDialog: ConfirmDialogEl } = useConfirmDialog();

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
  const { requestConfirm, ConfirmDialog: ConfirmDialogEl } = useConfirmDialog();

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
  const [form, setForm] = useState({ label: "", parentId: "" as string | "", sortOrder: 0 });
  const { requestConfirm, ConfirmDialog: ConfirmDialogEl } = useConfirmDialog();

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
      <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 bg-white hover:bg-[var(--color-surface-hover)]" style={{ paddingLeft: 12 + depth * 12 }}>
        <span className="font-medium">{c.label}</span>
        <span className="flex gap-2 shrink-0">
          <button type="button" onClick={() => setEditingId(c.id)} className="text-sm text-[var(--color-primary)] hover:underline">Edit</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); remove(c); }} className="text-sm text-red-600 hover:underline">Delete</button>
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
                <option key={c.id} value={c.id}>{c.label}</option>
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
            renderTree(roots, 0)
          )}
        </ul>
      </section>
    </div>
  );
}

function DevicesTab({
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
  onSuccess: () => void;
}) {
  const signalsById = useLibraryRegistryStore((s) => s.signalsById);
  const connectorsById = useLibraryRegistryStore((s) => s.connectorsById);
  const [templates, setTemplates] = useState<DeviceTemplate[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    deviceType: "",
    categoryId: "" as string | null,
    manufacturer: "",
    modelNumber: "",
    ports: [{ id: "p0", label: "Port 1", signalType: "sdi", direction: "input", connectorType: "" }],
  });
  const [message, setMessage] = useState<string | null>(null);
  const [createCategoryId, setCreateCategoryId] = useState<string>("");
  const [routerCreateForm, setRouterCreateForm] = useState({
    label: "Router",
    inputs: 8,
    outputs: 8,
    signalType: "sdi",
    categoryId: "",
  });
  const { requestConfirm, ConfirmDialog: ConfirmDialogEl } = useConfirmDialog();

  const signalTypes = useMemo(() => {
    const keys = Object.keys(signalsById);
    return keys.length > 0 ? keys.toSorted((a, b) => a.localeCompare(b)) : ["sdi", "hdmi", "sdi-12g", "ndi", "custom"];
  }, [signalsById]);
  const connectorTypes = useMemo(() => Object.keys(connectorsById).toSorted((a, b) => a.localeCompare(b)), [connectorsById]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, c] = await Promise.all([fetchTemplatesAdmin(), fetchCategories()]);
      setTemplates(t);
      setCategories(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.label;
    return m;
  }, [categories]);

  const categoryOptions = useMemo(() => {
    const roots = categories.filter((c) => !c.parentId).toSorted((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    const options: { value: string; label: string }[] = [{ value: "", label: "— Uncategorized —" }];
    const add = (cats: CategoryDefinition[], indent = "") => {
      for (const c of cats) {
        options.push({ value: c.id, label: indent + c.label });
        const children = categories.filter((x) => x.parentId === c.id).toSorted((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
        add(children, indent + "  ");
      }
    };
    add(roots);
    return options;
  }, [categories]);

  const openEdit = (t: DeviceTemplate) => {
    if (!t.id) return;
    setForm({
      label: t.label,
      deviceType: t.deviceType,
      categoryId: t.categoryId ?? "",
      manufacturer: t.manufacturer ?? "",
      modelNumber: t.modelNumber ?? "",
      ports: t.ports.length
        ? t.ports.map((p) => ({
            id: p.id,
            label: p.label,
            signalType: p.signalType,
            direction: p.direction,
            connectorType: p.connectorType ?? "",
          }))
        : [{ id: "p0", label: "Port 1", signalType: "sdi", direction: "input", connectorType: "" }],
    });
    setFormMode("edit");
    setEditingId(t.id);
    setError(null);
  };

  const cancelForm = () => {
    setFormMode("none");
    setEditingId(null);
  };

  const addPort = () => {
    const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setForm((f) => ({
      ...f,
      ports: [...f.ports, { id, label: `Port ${f.ports.length + 1}`, signalType: "sdi", direction: "input", connectorType: "" }],
    }));
  };

  const removePort = (index: number) => {
    if (form.ports.length <= 1) return;
    setForm((f) => ({ ...f, ports: f.ports.filter((_, i) => i !== index) }));
  };

  const updatePort = (index: number, field: "label" | "signalType" | "direction" | "connectorType", value: string) => {
    setForm((f) => ({
      ...f,
      ports: f.ports.map((p, i) => (i !== index ? p : { ...p, [field]: value })),
    }));
  };

  const openCreateDeviceProperties = () => {
    if (!token) {
      setError("Set admin token first");
      return;
    }
    setError(null);
    setMessage(null);
    setEditingId(null);
    setForm({
      label: "New Device",
      deviceType: `custom-${Date.now()}`,
      categoryId: createCategoryId || null,
      manufacturer: "",
      modelNumber: "",
      ports: [{ id: "p0", label: "Port 1", signalType: "sdi", direction: "input", connectorType: "" }],
    });
    setFormMode("create");
  };

  const createNewRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Set admin token first");
      return;
    }
    setError(null);
    setMessage(null);
    setEditingId(null);
    const { label, inputs, outputs, signalType, categoryId } = routerCreateForm;
    const inCount = Math.max(1, Math.min(64, Math.floor(inputs) || 8));
    const outCount = Math.max(1, Math.min(64, Math.floor(outputs) || 8));

    const ports = [];
    for (let i = 0; i < inCount; i++) {
      ports.push({ id: `p-in-${i}`, label: `Input ${i + 1}`, signalType, direction: "input", connectorType: "" });
    }
    for (let i = 0; i < outCount; i++) {
      ports.push({ id: `p-out-${i}`, label: `Output ${i + 1}`, signalType, direction: "output", connectorType: "" });
    }

    setForm({
      label: label.trim() || "Router",
      deviceType: `custom-router-${Date.now()}`,
      categoryId: categoryId || null,
      manufacturer: "",
      modelNumber: "",
      ports,
    });
    setFormMode("create");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Set admin token first");
      return;
    }
    if (form.ports.length === 0) {
      setError("At least one port is required");
      return;
    }
    const payload: TemplatePayload = {
      label: form.label.trim() || "Device",
      deviceType: form.deviceType.trim() || `custom-${Date.now()}`,
      categoryId: form.categoryId || null,
      manufacturer: form.manufacturer.trim() || undefined,
      modelNumber: form.modelNumber.trim() || undefined,
      ports: form.ports.map((p): Port => ({
        id: p.id,
        label: p.label.trim() || "Port",
        signalType: p.signalType,
        direction: p.direction as Port["direction"],
        connectorType: ("connectorType" in p && p.connectorType) ? (p.connectorType as Port["connectorType"]) : undefined,
      })),
    };
    setBusy(true);
    setError(null);
    try {
      if (formMode === "edit") {
        if (!editingId) throw new Error("Internal error: no template selected");
        await updateTemplate(editingId, payload);
      } else if (formMode === "create") {
        await createTemplate(payload);
      } else {
        throw new Error("Internal error: no form mode");
      }
      clearTemplateCache();
      await load();
      await onSuccess();
      cancelForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: DeviceTemplate) => {
    if (!t.id) return;
    if (!token) {
      setError("Set admin token first");
      return;
    }
    const ok = await requestConfirm({
      title: "Delete device template",
      message: `Delete template "${t.label}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTemplate(t.id);
      clearTemplateCache();
      await load();
      await onSuccess();
      if (editingId === t.id) cancelForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-[var(--color-text-muted)]">Loading devices…</div>
    );
  }

  return (
    <div className="space-y-6">
      {ConfirmDialogEl}
      <p className="text-sm text-[var(--color-text-muted)]">
        <strong className="text-[var(--color-text)]">Device templates</strong> appear in the device library sidebar. Create, edit, and delete templates here. No editing or deleting from the main UI.
      </p>

      {message && (
        <div className="p-3 rounded border border-green-200 bg-green-50 text-green-800 text-sm">
          {message}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">New device template</h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-2">
            Creates a minimal device template (one input port). You can fully edit ports later.
          </p>
          <div className="grid gap-3 text-sm max-w-sm">
            <label className="text-[var(--color-text-muted)]">Category</label>
            <select
              value={createCategoryId}
              onChange={(e) => setCreateCategoryId(e.target.value)}
              className="px-2 py-1.5 border border-[var(--color-border)] rounded"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value || "uncat"} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={openCreateDeviceProperties}
              disabled={!token || busy}
              className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50"
            >
              Create new device
            </button>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">New router / switcher template</h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            Creates a template with a block of inputs and outputs (same signal type).
          </p>
          <form onSubmit={createNewRouter} className="grid gap-3 text-sm">
            <div className="grid gap-2">
              <label className="text-[var(--color-text-muted)]">Label</label>
              <input
                value={routerCreateForm.label}
                onChange={(e) => setRouterCreateForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Router"
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-[var(--color-text-muted)]">Signal type</label>
              <select
                value={routerCreateForm.signalType}
                onChange={(e) => setRouterCreateForm((f) => ({ ...f, signalType: e.target.value }))}
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
              >
                {signalTypes.map((t) => (
                  <option key={t} value={t}>{signalsById[t]?.label ?? t}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <label className="text-[var(--color-text-muted)]">Inputs</label>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={routerCreateForm.inputs}
                  onChange={(e) => setRouterCreateForm((f) => ({ ...f, inputs: parseInt(e.target.value, 10) || 8 }))}
                  className="px-2 py-1.5 border border-[var(--color-border)] rounded w-full"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-[var(--color-text-muted)]">Outputs</label>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={routerCreateForm.outputs}
                  onChange={(e) => setRouterCreateForm((f) => ({ ...f, outputs: parseInt(e.target.value, 10) || 8 }))}
                  className="px-2 py-1.5 border border-[var(--color-border)] rounded w-full"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-[var(--color-text-muted)]">Category</label>
              <select
                value={routerCreateForm.categoryId}
                onChange={(e) => setRouterCreateForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
              >
                {categoryOptions.map((opt) => (
                  <option key={opt.value || "uncat"} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={!token || busy} className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50">
              Create router template
            </button>
          </form>
        </section>
      </div>

      {formMode !== "none" && (
        <section className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)]">
          <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-3">
            {formMode === "edit" ? "Device properties" : "Device properties (new)"}
          </h3>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-2 items-center max-w-lg">
              <label className="text-[var(--color-text-muted)]">Label</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. SDI to HDMI"
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
              />
              <label className="text-[var(--color-text-muted)]">Device type (ID)</label>
              <input
                value={form.deviceType}
                onChange={(e) => setForm((f) => ({ ...f, deviceType: e.target.value }))}
                placeholder="e.g. bmd-sdi-hdmi"
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
                readOnly={formMode === "edit"}
              />
              <label className="text-[var(--color-text-muted)]">Category</label>
              <select
                value={form.categoryId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value || null }))}
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
              >
                {categoryOptions.map((opt) => (
                  <option key={opt.value || "uncat"} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <label className="text-[var(--color-text-muted)]">Manufacturer</label>
              <input
                value={form.manufacturer}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                placeholder="Optional"
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
              />
              <label className="text-[var(--color-text-muted)]">Model number</label>
              <input
                value={form.modelNumber}
                onChange={(e) => setForm((f) => ({ ...f, modelNumber: e.target.value }))}
                placeholder="Optional"
                className="px-2 py-1.5 border border-[var(--color-border)] rounded"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[var(--color-text-muted)]">Ports (at least one)</span>
                <button type="button" onClick={addPort} className="text-sm text-[var(--color-primary)] hover:underline">
                  Add port
                </button>
              </div>
              <div className="space-y-2 border border-[var(--color-border)] rounded p-2 max-w-3xl">
                {form.ports.map((p, i) => (
                  <div key={p.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                    <input
                      value={p.label}
                      onChange={(e) => updatePort(i, "label", e.target.value)}
                      placeholder="Label"
                      className="px-2 py-1 border border-[var(--color-border)] rounded text-xs"
                    />
                    <select
                      value={p.signalType}
                      onChange={(e) => updatePort(i, "signalType", e.target.value)}
                      className="px-2 py-1 border border-[var(--color-border)] rounded text-xs"
                    >
                      {signalTypes.map((t) => (
                        <option key={t} value={t}>{signalsById[t]?.label ?? t}</option>
                      ))}
                    </select>
                    <select
                      value={p.direction}
                      onChange={(e) => updatePort(i, "direction", e.target.value)}
                      className="px-2 py-1 border border-[var(--color-border)] rounded text-xs"
                    >
                      <option value="input">Input</option>
                      <option value="output">Output</option>
                      <option value="bidirectional">Bidirectional</option>
                    </select>
                    <select
                      value={"connectorType" in p ? (p.connectorType ?? "") : ""}
                      onChange={(e) => updatePort(i, "connectorType", e.target.value)}
                      className="px-2 py-1 border border-[var(--color-border)] rounded text-xs"
                    >
                      <option value="">—</option>
                      {connectorTypes.map((ct) => (
                        <option key={ct} value={ct}>{connectorsById[ct]?.label ?? ct}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removePort(i)}
                      disabled={form.ports.length <= 1}
                      className="text-red-600 text-xs hover:underline disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded hover:opacity-90 disabled:opacity-50">
                Apply
              </button>
              <button type="button" onClick={cancelForm} className="px-4 py-2 border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]">
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">All device templates</h3>
        <div className="border border-[var(--color-border)] rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                <th className="text-left p-2 font-medium">Label</th>
                <th className="text-left p-2 font-medium">Category</th>
                <th className="text-right p-2 font-medium"># Ports</th>
                <th className="text-left p-2 font-medium">Manufacturer</th>
                <th className="text-right p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-[var(--color-text-muted)]">
                    No templates yet. Create one above (admin token required).
                  </td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id ?? t.deviceType} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)]">
                    <td className="p-2">{t.label}</td>
                    <td className="p-2">{t.categoryId ? categoryLabelById[t.categoryId] ?? t.categoryId : "—"}</td>
                    <td className="p-2 text-right">{t.ports?.length ?? 0}</td>
                    <td className="p-2">{t.manufacturer ?? "—"}</td>
                    <td className="p-2 text-right">
                      {t.id ? (
                        <span className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => openEdit(t)}
                            disabled={!token || busy}
                            className="text-[var(--color-primary)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(t)}
                            disabled={!token || busy}
                            className="text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// Legacy component (kept during transition).
// Reference to avoid TS noUnusedLocals warnings.
void DevicesTab;

function DevicesAdminTab({
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
  onSuccess: () => void;
}) {
  const [templates, setTemplates] = useState<DeviceTemplate[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const { requestConfirm, ConfirmDialog: ConfirmDialogEl } = useConfirmDialog();

  const nodes = useSchematicStore((s) => s.nodes);
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const addDevice = useSchematicStore((s) => s.addDevice);
  const updateDevice = useSchematicStore((s) => s.updateDevice);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const removeNodeById = useSchematicStore((s) => s.removeNodeById);

  type DraftMode = "create" | "edit";
  type DraftContext = {
    nodeId: string;
    mode: DraftMode;
    templateId?: string;
    initialData: DeviceData & { templateAdminDraft?: boolean };
  };
  const draftRef = useRef<DraftContext | null>(null);
  const prevEditingNodeIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, c] = await Promise.all([fetchTemplatesAdmin(), fetchCategories()]);
      setTemplates(t);
      setCategories(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.label;
    return m;
  }, [categories]);

  const draft = draftRef.current;
  const editorActive = !!draft && editingNodeId === draft.nodeId;

  const openDraft = useCallback(
    (mode: DraftMode, template?: DeviceTemplate) => {
      if (!token) {
        setError("Set admin token first");
        return;
      }
      if (draftRef.current) return;

      setError(null);
      setMessage(null);

      const deviceType = mode === "edit" ? template?.deviceType : `custom-${Date.now()}`;
      if (!deviceType) {
        setError("Missing device type");
        return;
      }

      const baseLabel = mode === "edit" ? (template?.label ?? "Device") : "New Device";
      const initialPorts =
        mode === "edit" && template
          ? template.ports
          : ([
              { id: "p0", label: "Port 1", signalType: "sdi", direction: "input" },
            ] satisfies Port[]);

      const draftTemplate: DeviceTemplate = {
        ...(mode === "edit" && template?.id ? { id: template.id, version: template.version } : {}),
        deviceType,
        label: baseLabel,
        ports: initialPorts,
        ...(mode === "edit" && template
          ? {
              manufacturer: template.manufacturer ?? undefined,
              modelNumber: template.modelNumber ?? undefined,
              referenceUrl: template.referenceUrl ?? undefined,
              imageUrl: template.imageUrl ?? undefined,
              searchTerms: template.searchTerms,
              color: template.color,
              categoryId: template.categoryId ?? null,
            }
          : { categoryId: null }),
      };

      // Add a temporary device node off-screen; DeviceEditor will open and edit it.
      const nodeId = addDevice(draftTemplate, { x: -1000000, y: -1000000 });

      // Mark the node so DeviceEditor shows a "Save" button.
      const node = useSchematicStore.getState().nodes.find((n) => n.id === nodeId && n.type === "device") as
        | import("../types").DeviceNode
        | undefined;
      if (!node) {
        setError("Failed to initialize device editor");
        removeNodeById(nodeId);
        return;
      }

      const initialData: DeviceData & { templateAdminDraft: true } = {
        ...(node.data as DeviceData),
        templateAdminDraft: true,
        // match store semantics: updateDevice always clears baseLabel
        baseLabel: undefined,
      };

      updateDevice(nodeId, initialData);
      draftRef.current = {
        nodeId,
        mode,
        templateId: mode === "edit" ? template?.id : undefined,
        initialData,
      };
      setEditingNodeId(nodeId);
    },
    [token, setError, setMessage, addDevice, updateDevice, setEditingNodeId, removeNodeById],
  );

  useEffect(() => {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;

    const prev = prevEditingNodeIdRef.current;
    if (prev === currentDraft.nodeId && editingNodeId === null && !savingRef.current) {
      const draftToProcess = currentDraft;
      savingRef.current = true;

      const run = async () => {
        // IMPORTANT: read the latest store state at save time.
        // `nodes` in this effect closure can be stale if `editingNodeId` flips to null
        // before the node update render lands.
        const latestNodes = useSchematicStore.getState().nodes;
        const node = latestNodes.find((n) => n.id === draftToProcess.nodeId && n.type === "device") as
          | DeviceNode
          | undefined;

        const currentData = node?.data as DeviceData | undefined;
        const changed = currentData
          ? JSON.stringify(currentData) !== JSON.stringify(currentDraft.initialData)
          : true;

        try {
          if (changed) {
            if (!token) throw new Error("Set admin token first");
            const ports = currentData?.ports ?? [];
            if (ports.length === 0) throw new Error("At least one port is required");

            const payload: TemplatePayload = {
              label: currentData?.label.trim() ? currentData!.label.trim() : "Untitled",
              deviceType: currentData!.deviceType,
              ports,
              categoryId: currentData?.categoryId ?? null,
              ...(typeof currentData?.manufacturer === "string" && currentData.manufacturer.trim()
                ? { manufacturer: currentData.manufacturer.trim() }
                : {}),
              ...(typeof currentData?.modelNumber === "string" && currentData.modelNumber.trim()
                ? { modelNumber: currentData.modelNumber.trim() }
                : {}),
              ...(typeof currentData?.referenceUrl === "string" && currentData.referenceUrl.trim()
                ? { referenceUrl: currentData.referenceUrl.trim() }
                : {}),
              ...(typeof currentData?.imageUrl === "string" && currentData.imageUrl.trim()
                ? { imageUrl: currentData.imageUrl.trim() }
                : {}),
              ...(typeof currentData?.color === "string" && currentData.color.trim() ? { color: currentData.color.trim() } : {}),
              ...(Array.isArray(currentData?.searchTerms) && currentData.searchTerms.length > 0
                ? { searchTerms: currentData.searchTerms }
                : {}),
            };

            setBusy(true);
            setError(null);

            if (draftToProcess.mode === "create") {
              await createTemplate(payload);
            } else {
              if (!draftToProcess.templateId) throw new Error("Missing template ID");
              await updateTemplate(draftToProcess.templateId, payload);
            }

            clearTemplateCache();
            await load();
            onSuccess();
            window.dispatchEvent(new CustomEvent("easyschematic:templates:refresh"));
            setMessage(`Saved "${payload.label}".`);
          } else {
            // Nothing changed — still reload table so UI is consistent.
            clearTemplateCache();
            await load();
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
          removeNodeById(draftToProcess.nodeId);
          draftRef.current = null;
          savingRef.current = false;
        }
      };

      void run();
    }

    prevEditingNodeIdRef.current = editingNodeId;
  }, [editingNodeId, nodes, onSuccess, removeNodeById, setBusy, setError, load, token]);

  if (loading) {
    return <div className="text-sm text-[var(--color-text-muted)]">Loading devices…</div>;
  }

  return (
    <div className="space-y-6">
      {ConfirmDialogEl}
      <p className="text-sm text-[var(--color-text-muted)]">
        <strong className="text-[var(--color-text)]">Device templates</strong> appear in the device library sidebar. Use this table to create, edit, and delete templates. When editing, the device properties editor will open and you can click <strong>Save</strong>.
      </p>

      {message && (
        <div className="p-3 rounded border border-green-200 bg-green-50 text-green-800 text-sm">
          {message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!token || busy || editorActive}
          onClick={() => openDraft("create")}
          className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create device
        </button>
      </div>

      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-heading)] mb-2">All device templates</h3>
        <div className="border border-[var(--color-border)] rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                <th className="text-left p-2 font-medium">Label</th>
                <th className="text-left p-2 font-medium">Category</th>
                <th className="text-right p-2 font-medium"># Ports</th>
                <th className="text-left p-2 font-medium">Manufacturer</th>
                <th className="text-right p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-[var(--color-text-muted)]">
                    No templates yet. Create one.
                  </td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id ?? t.deviceType} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)]">
                    <td className="p-2">{t.label}</td>
                    <td className="p-2">
                      {t.categoryId ? categoryLabelById[t.categoryId] ?? t.categoryId : "—"}
                    </td>
                    <td className="p-2 text-right">{t.ports?.length ?? 0}</td>
                    <td className="p-2">{t.manufacturer ?? "—"}</td>
                    <td className="p-2 text-right">
                      {t.id ? (
                        <span className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => openDraft("edit", t)}
                            disabled={!token || busy || editorActive}
                            className="text-[var(--color-primary)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!token) {
                                setError("Set admin token first");
                                return;
                              }
                              const ok = await requestConfirm({
                                title: "Delete device template",
                                message: `Delete template "${t.label}"? This cannot be undone.`,
                                confirmLabel: "Delete",
                                danger: true,
                              });
                              if (!ok) return;
                              setBusy(true);
                              setError(null);
                              try {
                                await deleteTemplate(t.id!);
                                clearTemplateCache();
                                await load();
                                onSuccess();
                                window.dispatchEvent(new CustomEvent("easyschematic:templates:refresh"));
                                setMessage(`Deleted "${t.label}".`);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setBusy(false);
                              }
                            }}
                            disabled={!token || busy || editorActive}
                            className="text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// These tab implementations live in this legacy file while we transition to
// the extracted `src/components/libraryAdmin/tabs/*` versions.
// They are intentionally kept to avoid a huge deletion diff, but we must
// mark them as used because `noUnusedLocals` is enabled.
void SignalsTab;
void ConnectorsTab;
void CompatTab;
void CategoriesTab;
void DevicesAdminTab;
void DevicesTab;
