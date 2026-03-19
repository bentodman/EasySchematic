import type { Port, SignalType, ConnectorType } from "../../../src/types";
// Signal/connector dropdown options are provided by the parent (PortEditor)
// so this component stays in sync with the runtime library registry.

interface PortRowProps {
  port: Port;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onChange: (updates: Partial<Port>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  signalOptions: Array<{ id: SignalType; label: string }>;
  connectorOptions: Array<{ id: ConnectorType; label: string }>;
  networkSignalIds: Set<SignalType>;
}

export default function PortRow({
  port,
  selected,
  onSelect,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  signalOptions,
  connectorOptions,
  networkSignalIds,
}: PortRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? "bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300"
          : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: `var(--color-${port.signalType})` }}
      />
      <div className="flex items-center gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={port.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Label"
        />
        <select
          value={port.signalType}
          onChange={(e) => onChange({ signalType: e.target.value as SignalType })}
          className="px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {signalOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={port.connectorType ?? "none"}
          onChange={(e) => onChange({ connectorType: e.target.value as ConnectorType })}
          className="px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {connectorOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={port.section ?? ""}
          onChange={(e) => onChange({ section: e.target.value || undefined })}
          className="w-24 px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Section"
        />
        {networkSignalIds.has(port.signalType) && (
          <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap" title="Port has an IP address / network stack">
            <input
              type="checkbox"
              checked={port.addressable !== false}
              onChange={(e) => onChange({ addressable: e.target.checked ? undefined : false })}
              className="cursor-pointer"
            />
            Addr
          </label>
        )}
        <div className="flex flex-col">
          <button onClick={onMoveUp} className="text-slate-400 hover:text-slate-600 text-xs leading-none" title="Move up">&#9650;</button>
          <button onClick={onMoveDown} className="text-slate-400 hover:text-slate-600 text-xs leading-none" title="Move down">&#9660;</button>
        </div>
        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-600 text-lg leading-none px-1 transition-colors"
          title="Remove port"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
