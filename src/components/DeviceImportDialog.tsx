import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export interface DeviceImportDialogStats {
  imported: number;
  skipped: number;
  invalidTemplates: number;
  rejectedDuplicatePortIds: number;
  coercedSignalTypes: number;
  coercedConnectorTypes: number;
}

export interface DeviceImportDialogResult {
  kind: "success" | "error";
  title: string;
  bannerText?: string;
  stats?: DeviceImportDialogStats;
  hints?: string[];
  nextSteps?: string[];
  examplesTitle?: string;
  examples?: string[];
}

function Icon({ kind }: { kind: "success" | "error" }) {
  if (kind === "success") {
    return (
      <svg viewBox="0 0 20 20" className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M7 10l2 2 4-5" />
        <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 text-red-700" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
      <path d="M10 6v5" />
      <path d="M10 14h.01" />
    </svg>
  );
}

function Badge({ kind }: { kind: "success" | "error" }) {
  const cls = kind === "success"
    ? "bg-green-50 border border-green-200 text-green-800"
    : "bg-red-50 border border-red-200 text-red-800";
  return (
    <span className={`text-[10px] px-2 py-px rounded ${cls}`}>
      {kind === "success" ? "OK" : "Error"}
    </span>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="text-sm font-semibold text-[var(--color-text-heading)] leading-none mt-1">{value}</div>
    </div>
  );
}

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{title}</div>
        {right}
      </div>
      <div className="text-xs text-[var(--color-text)] leading-relaxed">{children}</div>
    </div>
  );
}

function ExamplesList({ examples, maxShown }: { examples: string[]; maxShown: number }) {
  const shown = examples.slice(0, maxShown);
  const truncated = examples.length > shown.length;

  return (
    <>
      <div className="max-h-72 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
        <ul className="space-y-1">
          {shown.map((l, i) => (
            <li key={i} className="text-[11px] text-[var(--color-text)]">
              <span className="font-mono text-[10px] text-[var(--color-text-muted)] mr-2">{i + 1}.</span>
              {l}
            </li>
          ))}
        </ul>
      </div>
      {truncated && (
        <div className="text-[10px] text-[var(--color-text-muted)] mt-2">
          Showing first {maxShown} examples of {examples.length}.
        </div>
      )}
    </>
  );
}

export default function DeviceImportDialog({
  result,
  onClose,
}: {
  result: DeviceImportDialogResult;
  onClose: () => void;
}) {
  const maxExamplesShown = 12;
  const [copied, setCopied] = useState(false);

  const stats = result.stats;
  const hintText = useMemo(() => {
    if (!result.hints?.length) return null;
    return result.hints.join(" ");
  }, [result.hints]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const copySummary = async () => {
    const lines: string[] = [];
    lines.push(result.title);
    if (result.bannerText) lines.push(result.bannerText);
    if (stats) {
      lines.push("");
      lines.push(`Imported: ${stats.imported}`);
      lines.push(`Skipped: ${stats.skipped}`);
      lines.push(`Invalid templates: ${stats.invalidTemplates}`);
      lines.push(`Duplicate port ids: ${stats.rejectedDuplicatePortIds}`);
      lines.push(`Coerced signalType: ${stats.coercedSignalTypes}`);
      lines.push(`Coerced connectorType: ${stats.coercedConnectorTypes}`);
    }
    if (result.examples?.length) {
      lines.push("");
      lines.push(`Examples (${Math.min(5, result.examples.length)} shown):`);
      for (const ex of result.examples.slice(0, 5)) lines.push(`- ${ex}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore copy failures (clipboard may be blocked)
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[720px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Icon kind={result.kind} />
            <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">{result.title}</h2>
            <Badge kind={result.kind} />
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {result.bannerText ? (
            <div
              className={`rounded border px-3 py-2 text-xs ${
                result.kind === "success"
                  ? "bg-green-50 border-green-200 text-green-900"
                  : "bg-red-50 border-red-200 text-red-900"
              }`}
            >
              <div className="whitespace-pre-line">{result.bannerText}</div>
            </div>
          ) : null}

          {stats ? (
            (() => {
              const tiles = [
                { label: "Imported", value: stats.imported },
                { label: "Skipped (same deviceType)", value: stats.skipped },
                { label: "Invalid templates", value: stats.invalidTemplates },
                { label: "Duplicate port ids", value: stats.rejectedDuplicatePortIds },
                { label: "Coerced signalType → Custom", value: stats.coercedSignalTypes },
                { label: "Coerced connectorType → Other", value: stats.coercedConnectorTypes },
              ];

              // Hide noisy "0" tiles; always keep "Imported" for context.
              const visible = tiles.filter((t) => t.value !== 0 || t.label === "Imported");

              return (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {visible.map((t, i) => (
                    <Tile key={`${t.label}-${i}`} label={t.label} value={t.value} />
                  ))}
                </div>
              );
            })()
          ) : null}

          {result.hints?.length && hintText ? (
            <Panel title="Accepted Format">
              <div className="text-[11px] text-[var(--color-text-muted)]">{hintText}</div>
            </Panel>
          ) : null}

          {result.nextSteps?.length ? (
            <Panel title="Next Steps">
              <ul className="list-disc pl-5 space-y-1">
                {result.nextSteps.map((l, i) => (
                  <li key={i} className="text-[11px] text-[var(--color-text)]">
                    {l}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {result.examples?.length ? (
            <Panel
              title={result.examplesTitle ?? "Examples of problems"}
              right={<span className="text-[10px] text-[var(--color-text-muted)]">{result.examples.length} total</span>}
            >
              <ExamplesList examples={result.examples} maxShown={maxExamplesShown} />
            </Panel>
          ) : null}
        </div>

        <div className="px-5 py-3 border-t border-[var(--color-border)] flex justify-end gap-2 shrink-0">
          <button
            onClick={copySummary}
            className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
          >
            {copied ? "Copied!" : "Copy Summary"}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

