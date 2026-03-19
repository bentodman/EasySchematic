import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { exportImage } from "../exportUtils";
import { exportDxf } from "../dxfExport";
import { exportPdf } from "../pdfExport";
import { PAPER_SIZES } from "../printConfig";
import type { DeviceTemplate, SchematicFile } from "../types";
import ReportsDialog, { type ReportsTab } from "./ReportsDialog";
import TitleBlockDialog from "./TitleBlockDialog";
import AboutDialog from "./AboutDialog";
import LibraryAdminDialog from "./LibraryAdminDialog";
import AlignmentMenu from "./AlignmentMenu";
import DeviceImportDialog, { type DeviceImportDialogResult } from "./DeviceImportDialog";
import { useAlertDialog } from "./AlertDialog";

// ─── Menu data types ─────────────────────────────────────────────

interface MenuItemDef {
  type: "item";
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface MenuSeparatorDef {
  type: "separator";
}

type MenuEntry = MenuItemDef | MenuSeparatorDef;

// ─── Sub-components ──────────────────────────────────────────────

function MenuSeparator() {
  return <div className="h-px bg-[var(--color-border)] my-1" />;
}

function MenuItem({
  label,
  shortcut,
  checked,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-left gap-2"
    >
      <span className="w-4 text-center shrink-0 text-[10px]">
        {checked != null ? (checked ? "✓" : "") : ""}
      </span>
      <span className="flex-1 text-[var(--color-text)]">{label}</span>
      {shortcut && (
        <span className="text-[var(--color-text-muted)] text-[10px] ml-4 whitespace-nowrap">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuDropdown({ items, onClose }: { items: MenuEntry[]; onClose: () => void }) {
  return (
    <div className="absolute top-full left-0 mt-0.5 min-w-[220px] bg-white border border-[var(--color-border)] rounded-lg shadow-lg p-1 z-50">
      {items.map((entry, i) => {
        if (entry.type === "separator") return <MenuSeparator key={i} />;
        return (
          <MenuItem
            key={i}
            label={entry.label}
            shortcut={entry.shortcut}
            checked={entry.checked}
            disabled={entry.disabled}
            onClick={() => {
              entry.onClick();
              onClose();
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Main MenuBar ────────────────────────────────────────────────

export default function MenuBar() {
  const {
    schematicName,
    setSchematicName,
    exportToJSON,
    importFromJSON,
    newSchematic,
    undo,
    redo,
    addCustomTemplates,
  } = useSchematicStore();

  const printView = useSchematicStore((s) => s.printView);
  const undoSize = useSchematicStore((s) => s.undoSize);
  const redoSize = useSchematicStore((s) => s.redoSize);

  const reactFlowInstance = useReactFlow();
  const { showAlert, AlertDialog: AlertDialogEl } = useAlertDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deviceInputRef = useRef<HTMLInputElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(schematicName);
  const [reportsTab, setReportsTab] = useState<ReportsTab | null>(null);
  const [showTitleBlockDialog, setShowTitleBlockDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showLibraryAdminDialog, setShowLibraryAdminDialog] = useState(false);
  const [deviceImportDialogResult, setDeviceImportDialogResult] = useState<DeviceImportDialogResult | null>(null);

  // Keep nameValue in sync when schematicName changes externally
  useEffect(() => {
    if (!editingName) setNameValue(schematicName);
  }, [schematicName, editingName]);

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  // ─── File actions ──────────────────────────────────────

  const handleSave = useCallback(() => {
    const data = exportToJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportToJSON]);

  const handleOpen = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportDevices = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        setDeviceImportDialogResult({
          kind: "error",
          title: "Import Devices",
          bannerText: "File is too large (max 10 MB). Please use a smaller JSON file.",
          hints: ["Max file size: 10 MB"],
        });
        input.value = "";
        return;
      }

      // Runtime-configurable signal/connector IDs: be permissive during import.
      const allowedSignals: Set<string> | null = null;
      const allowedConnectors: Set<string> | null = null;
      const allowedDirections = new Set(["input", "output", "bidirectional"]);

      function coerceTemplates(raw: unknown): unknown[] {
        if (Array.isArray(raw)) return raw;
        if (!raw || typeof raw !== "object") return [];
        const obj = raw as Record<string, unknown>;

        const arr = (v: unknown) => (Array.isArray(v) ? v : null);
        const templates =
          arr(obj.templates) ??
          arr(obj.devices) ??
          arr(obj.items) ??
          arr(obj.deviceTemplates);

        if (templates) return templates;

        // Heuristic: keyed object like { [deviceType]: templateObject }
        const values = Object.values(obj).filter((v) => !!v && typeof v === "object");
        if (
          values.length > 0 &&
          values.every((v) => {
            const m = v as Record<string, unknown>;
            return typeof m.deviceType === "string" && typeof m.label === "string" && Array.isArray(m.ports);
          })
        ) {
          return values;
        }

        // If we couldn't identify a wrapper, treat it as a single template object.
        return [raw];
      }

      function normalizePort(x: unknown): { port: unknown | null; signalCoerced: boolean; connectorCoerced: boolean } {
        if (!x || typeof x !== "object") return { port: null, signalCoerced: false, connectorCoerced: false };
        const p = x as Record<string, unknown>;

        const id = p.id;
        const label = p.label;
        let signalType = p.signalType;
        const direction = p.direction;

        if (typeof id !== "string" || id.trim() === "") return { port: null, signalCoerced: false, connectorCoerced: false };
        if (typeof label !== "string" || label.trim() === "") return { port: null, signalCoerced: false, connectorCoerced: false };
        if (typeof signalType !== "string" || signalType.trim() === "") return { port: null, signalCoerced: false, connectorCoerced: false };
        if (typeof direction !== "string" || !allowedDirections.has(direction)) {
          return { port: null, signalCoerced: false, connectorCoerced: false };
        }

        let signalCoerced = false;
        if (allowedSignals && !allowedSignals.has(signalType)) {
          signalType = "custom";
          signalCoerced = true;
        }

        let connectorCoerced = false;
        const connectorType = p.connectorType;
        if (connectorType != null) {
          if (typeof connectorType !== "string") return { port: null, signalCoerced: false, connectorCoerced: false };
          if (allowedConnectors && !allowedConnectors.has(connectorType)) {
            p.connectorType = "other";
            connectorCoerced = true;
          }
        }

        // Mutate with normalized/coerced values.
        p.signalType = signalType;
        return { port: p, signalCoerced, connectorCoerced };
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(reader.result as string) as unknown;
          const maybeTemplates = coerceTemplates(raw);
          if (maybeTemplates.length === 0) {
            setDeviceImportDialogResult({
              kind: "error",
              title: "Import Devices",
              bannerText: "No devices/templates were found in the JSON file.",
              hints: ["Expected an array of templates, or a wrapper like `{ templates: [...] }`."],
            });
            return;
          }

          const validTemplates: DeviceTemplate[] = [];
          const errorSamples: string[] = [];
          let invalidCount = 0;
          let signalCoercedCount = 0;
          let connectorCoercedCount = 0;
          let rejectedPortDuplicateCount = 0;
          for (let idx = 0; idx < maybeTemplates.length; idx++) {
            const item = maybeTemplates[idx];
            if (!item || typeof item !== "object") {
              invalidCount++;
              continue;
            }
            const t = item as Record<string, unknown>;
            const deviceType = t.deviceType;
            const label = t.label;
            const ports = t.ports;

            if (typeof deviceType !== "string" || deviceType.trim() === "") {
              invalidCount++;
              if (errorSamples.length < 8) errorSamples.push(`Template #${idx + 1}: missing/invalid deviceType`);
              continue;
            }
            if (typeof label !== "string" || label.trim() === "") {
              invalidCount++;
              if (errorSamples.length < 8) errorSamples.push(`Template #${idx + 1} (${deviceType}): missing/invalid label`);
              continue;
            }
            if (!Array.isArray(ports) || ports.length === 0) {
              invalidCount++;
              if (errorSamples.length < 8) errorSamples.push(`Template #${idx + 1} (${deviceType}): ports must be a non-empty array`);
              continue;
            }
            const normalizedPorts: unknown[] = [];
            let templatePortsValid = true;
            const portIdSet = new Set<string>();
            for (const port of ports) {
              const normalized = normalizePort(port);
              if (!normalized.port) {
                templatePortsValid = false;
                if (errorSamples.length < 8) {
                  errorSamples.push(
                    `Template #${idx + 1} (${deviceType}): one or more ports missing id/label/signalType/direction`,
                  );
                }
                break;
              }
              const portId = (normalized.port as Record<string, unknown>).id;
              if (typeof portId === "string") {
                if (portIdSet.has(portId)) {
                  templatePortsValid = false;
                  rejectedPortDuplicateCount++;
                  if (errorSamples.length < 8) {
                    errorSamples.push(`Template #${idx + 1} (${deviceType}): duplicate port id '${portId}'`);
                  }
                  break;
                }
                portIdSet.add(portId);
              } else {
                // Shouldn't happen because normalizePort requires id, but be defensive.
                templatePortsValid = false;
                if (errorSamples.length < 8) errorSamples.push(`Template #${idx + 1} (${deviceType}): port.id missing/invalid`);
                break;
              }

              if (normalized.signalCoerced) signalCoercedCount++;
              if (normalized.connectorCoerced) connectorCoercedCount++;
              normalizedPorts.push(normalized.port);
            }

            if (!templatePortsValid || normalizedPorts.length === 0) {
              invalidCount++;
              continue;
            }

            (t as Record<string, unknown>).ports = normalizedPorts;
            validTemplates.push(t as unknown as DeviceTemplate);
          }

          if (validTemplates.length === 0) {
            setDeviceImportDialogResult({
              kind: "error",
              title: "Import Devices",
              bannerText: "No valid device templates were imported.",
              hints: [
                "Required: `deviceType` (string), `label` (string), `ports` (array).",
                "Each port requires: `id`, `label`, `signalType`, `direction`.",
              ],
              nextSteps: [
                "Open the JSON file and verify the required fields for each template and each port.",
                "If you use newer signal/connector strings, this importer will coerce unknown values to `custom` / `other` (but required fields must still exist).",
              ],
              examplesTitle: "Examples of problems",
              examples: errorSamples.slice(0, 8),
            });
            return;
          }

          const { added, skipped } = addCustomTemplates(validTemplates);

          const acceptedHints = [
            "Accepted JSON shapes: `[]`, `{ templates: [] }`, `{ devices: [] }`, `{ items: [] }`, or a single template object.",
            "Ports must include unique `port.id` within a template, plus `label`, `signalType`, and `direction`.",
          ];

          const bannerParts: string[] = [];
          if (added === 0 && skipped > 0 && invalidCount === 0 && rejectedPortDuplicateCount === 0) {
            bannerParts.push("No new templates imported (all were already present by `deviceType`).");
          } else {
            bannerParts.push(`Imported ${added} template${added === 1 ? "" : "s"}.`);
          }
          if (skipped > 0) bannerParts.push(`Skipped ${skipped} already imported.`);
          if (invalidCount > 0) bannerParts.push(`Ignored ${invalidCount} invalid template(s).`);
          if (rejectedPortDuplicateCount > 0) bannerParts.push(`Rejected ${rejectedPortDuplicateCount} due to duplicate port ids.`);
          if (signalCoercedCount > 0) bannerParts.push(`Coerced ${signalCoercedCount} unknown signalType(s) to Custom.`);
          if (connectorCoercedCount > 0) bannerParts.push(`Coerced ${connectorCoercedCount} unknown connectorType(s) to Other.`);

          const bannerText = bannerParts.join("\n");

          setDeviceImportDialogResult({
            kind: "success",
            title: "Import Devices",
            bannerText,
            stats: {
              imported: added,
              skipped,
              invalidTemplates: invalidCount,
              rejectedDuplicatePortIds: rejectedPortDuplicateCount,
              coercedSignalTypes: signalCoercedCount,
              coercedConnectorTypes: connectorCoercedCount,
            },
            hints: acceptedHints,
            nextSteps: [
              "Imported templates are stored locally (user-only) and will appear in the Devices panel under their matching categories.",
              ...(signalCoercedCount > 0
                ? ["Unknown `signalType` values were mapped to `custom` so connections can still work."]
                : []),
              ...(connectorCoercedCount > 0
                ? ["Unknown `connectorType` values were mapped to `other` for labeling/mismatch styling."]
                : []),
              ...(added === 0 && skipped > 0
                ? ["No new templates were added because your file contained deviceType duplicates."]
                : []),
            ],
            examplesTitle: errorSamples.length > 0 ? "Examples of problems" : undefined,
            examples: errorSamples.length > 0 ? errorSamples : undefined,
          });
        } catch {
          setDeviceImportDialogResult({
            kind: "error",
            title: "Import Devices",
            bannerText: "Invalid JSON file.",
            hints: ["Ensure the JSON is well-formed and uses the expected template schema."],
          });
        } finally {
          input.value = "";
        }
      };

      reader.readAsText(file);
      input.value = "";
    },
    [addCustomTemplates],
  );

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        void showAlert({
          title: "File too large",
          message: "File is too large (max 10 MB). Please use a smaller schematic file.",
          okLabel: "OK",
        });
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as SchematicFile;
          importFromJSON(data);
        } catch {
          void showAlert({
            title: "Invalid file",
            message: "Invalid schematic file.",
            okLabel: "OK",
          });
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [importFromJSON, showAlert],
  );

  // Listen for keyboard shortcut events from App.tsx
  useEffect(() => {
    const onSave = () => handleSave();
    const onOpen = () => handleOpen();
    window.addEventListener("easyschematic:save", onSave);
    window.addEventListener("easyschematic:open", onOpen);
    return () => {
      window.removeEventListener("easyschematic:save", onSave);
      window.removeEventListener("easyschematic:open", onOpen);
    };
  }, [handleSave, handleOpen]);

  // ─── Export helpers ────────────────────────────────────

  const doExportPng = () => exportImage(reactFlowInstance, { format: "png", pixelRatio: 4 });
  const doExportSvg = () => exportImage(reactFlowInstance, { format: "svg" });
  const doExportDxf = () => exportDxf(reactFlowInstance);
  const doExportPdf = () => {
    const state = useSchematicStore.getState();
    const paper = PAPER_SIZES.find((p) => p.id === state.printPaperId) ?? PAPER_SIZES[2];
    exportPdf(
      reactFlowInstance,
      paper,
      state.printOrientation,
      state.printScale,
      state.titleBlock,
      state.titleBlockLayout,
    );
  };

  // ─── Name editing ──────────────────────────────────────

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed) setSchematicName(trimmed);
    else setNameValue(schematicName);
    setEditingName(false);
  };

  // ─── Menu definitions ─────────────────────────────────

  const closeMenu = () => setOpenMenu(null);

  const menus: Record<string, MenuEntry[]> = {
    File: [
      { type: "item", label: "New", onClick: newSchematic },
      { type: "separator" },
      { type: "item", label: "Save", shortcut: "Ctrl+S", onClick: handleSave },
      { type: "item", label: "Open...", shortcut: "Ctrl+O", onClick: handleOpen },
      { type: "item", label: "Import Devices...", onClick: () => deviceInputRef.current?.click() },
    ],
    Edit: [
      { type: "item", label: "Undo", shortcut: "Ctrl+Z", disabled: undoSize === 0, onClick: undo },
      { type: "item", label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: redoSize === 0, onClick: redo },
      { type: "separator" },
      { type: "item", label: "Copy", shortcut: "Ctrl+C", onClick: () => useSchematicStore.getState().copySelected() },
      { type: "item", label: "Paste", shortcut: "Ctrl+V", onClick: () => useSchematicStore.getState().pasteClipboard() },
      { type: "item", label: "Delete", shortcut: "Del", onClick: () => useSchematicStore.getState().removeSelected() },
      { type: "separator" },
      { type: "item", label: "Select All", shortcut: "Ctrl+A", onClick: () => useSchematicStore.getState().selectAll() },
    ],
    View: [
      {
        type: "item",
        label: "Print View",
        shortcut: "F9",
        checked: printView,
        onClick: () => useSchematicStore.getState().setPrintView(!printView),
      },
      {
        type: "item",
        label: "Hide Unconnected Ports",
        checked: useSchematicStore.getState().hideUnconnectedPorts,
        onClick: () => {
          const s = useSchematicStore.getState();
          s.setHideUnconnectedPorts(!s.hideUnconnectedPorts);
        },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Debug Edges",
        shortcut: "Ctrl+B",
        checked: useSchematicStore.getState().debugEdges,
        onClick: () => useSchematicStore.getState().toggleDebugEdges(),
      },
    ],
    Export: [
      { type: "item", label: "Export as PNG", onClick: doExportPng },
      { type: "item", label: "Export as SVG", onClick: doExportSvg },
      { type: "item", label: "Export as DXF", onClick: doExportDxf },
      { type: "item", label: "Export as PDF", onClick: doExportPdf },
      { type: "separator" },
      { type: "item", label: "Title Block...", onClick: () => setShowTitleBlockDialog(true) },
    ],
    Reports: [
      { type: "item", label: "Network Report...", onClick: () => setReportsTab("network") },
      { type: "item", label: "Device List...", onClick: () => setReportsTab("devices") },
      { type: "item", label: "Pack List...", onClick: () => setReportsTab("packList") },
      { type: "item", label: "Cable Schedule...", onClick: () => setReportsTab("cableSchedule") },
    ],
    Help: [
      {
        type: "item",
        label: "Library admin...",
        onClick: () => setShowLibraryAdminDialog(true),
      },
      { type: "separator" },
      {
        type: "item",
        label: "Documentation \u2197",
        onClick: () => window.open("https://docs.easyschematic.live", "_blank", "noopener,noreferrer"),
      },
      {
        type: "item",
        label: "Device Database \u2197",
        onClick: () => window.open("https://devices.easyschematic.live", "_blank", "noopener,noreferrer"),
      },
      { type: "separator" },
      {
        type: "item",
        label: "About EasySchematic",
        onClick: () => setShowAboutDialog(true),
      },
    ],
  };

  const menuNames = Object.keys(menus);

  return (
    <div
      ref={menuBarRef}
      className="h-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center px-1 shrink-0 select-none"
    >
      {/* Left: logo + brand + menus */}
      <div className="flex items-center">
        <div className="flex items-center gap-2 px-3 shrink-0">
          <img src="/favicon.svg" alt="" className="w-5 h-5" />
          <span className="text-xs font-semibold text-[var(--color-text-heading)] tracking-tight">
            EasySchematic
          </span>
        </div>
        <div className="w-px h-5 bg-[var(--color-border)]" />
        {menuNames.map((name) => (
          <div key={name} className="relative">
            <button
              className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer ${
                openMenu === name
                  ? "bg-[var(--color-surface-hover)] text-[var(--color-text-heading)]"
                  : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-heading)]"
              }`}
              onClick={() => setOpenMenu(openMenu === name ? null : name)}
              onMouseEnter={() => {
                if (openMenu && openMenu !== name) setOpenMenu(name);
              }}
            >
              {name}
            </button>
            {openMenu === name && (
              <MenuDropdown items={menus[name]} onClose={closeMenu} />
            )}
          </div>
        ))}
      </div>

      {/* Center: schematic name */}
      <div className="flex-1 flex justify-center">
        {editingName ? (
          <input
            className="bg-transparent text-[var(--color-text-heading)] text-sm font-semibold outline-none border-b border-blue-500 max-w-[200px] text-center"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditingName(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="text-sm font-semibold text-[var(--color-text-heading)] cursor-pointer hover:text-blue-600 transition-colors"
            onDoubleClick={() => {
              setNameValue(schematicName);
              setEditingName(true);
            }}
            title="Double-click to rename"
          >
            {schematicName}
          </span>
        )}
      </div>

      {/* Right: undo/redo + alignment */}
      <div className="flex items-center gap-1">
        <button
          title="Undo (Ctrl+Z)"
          disabled={undoSize === 0}
          onClick={undo}
          className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-[var(--color-text)]"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h7a3 3 0 0 1 0 6H9" />
            <path d="M6 4 3 7l3 3" />
          </svg>
        </button>
        <button
          title="Redo (Ctrl+Shift+Z)"
          disabled={redoSize === 0}
          onClick={redo}
          className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-[var(--color-text)]"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 7H6a3 3 0 0 0 0 6h1" />
            <path d="M10 4l3 3-3 3" />
          </svg>
        </button>
        <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
        <AlignmentMenu />
      </div>

      {/* Hidden file input for Open */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />

      {/* Hidden file input for importing device templates */}
      <input
        ref={deviceInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportDevices}
      />

      {reportsTab && (
        <ReportsDialog initialTab={reportsTab} onClose={() => setReportsTab(null)} />
      )}
      {showTitleBlockDialog && (
        <TitleBlockDialog onClose={() => setShowTitleBlockDialog(false)} />
      )}
      {showLibraryAdminDialog && (
        <LibraryAdminDialog onClose={() => setShowLibraryAdminDialog(false)} />
      )}
      {showAboutDialog && (
        <AboutDialog onClose={() => setShowAboutDialog(false)} />
      )}

      {AlertDialogEl}

      {deviceImportDialogResult && (
        <DeviceImportDialog
          result={deviceImportDialogResult}
          onClose={() => setDeviceImportDialogResult(null)}
        />
      )}
    </div>
  );
}
