import { useCallback, useEffect, useState } from "react";
import {
  fetchConnectorCompatibility,
  fetchConnectors,
  putConnectorCompatibility,
  type ConnectorCompatibilityPair,
  type ConnectorDefinition,
} from "../../../libraryApi";

export default function CompatibilityAdminTab({
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
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
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
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
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
              <li
                key={i}
                className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 bg-white hover:bg-[var(--color-surface-hover)]"
              >
                <span>
                  {connectors.find((c) => c.id === p.connectorA)?.label ?? p.connectorA} ↔{" "}
                  {connectors.find((c) => c.id === p.connectorB)?.label ?? p.connectorB}
                </span>
                {token && (
                  <button type="button" onClick={() => removePair(i)} className="text-sm text-red-600 hover:underline">
                    Remove
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

