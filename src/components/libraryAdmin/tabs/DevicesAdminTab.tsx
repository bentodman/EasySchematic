import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useSchematicStore } from "../../../store";
import {
  fetchTemplatesAdmin,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  fetchCategories,
  type TemplatePayload,
  type CategoryDefinition,
} from "../../../libraryApi";
import { clearTemplateCache } from "../../../templateApi";
import type { DeviceData, DeviceNode, DeviceTemplate, Port } from "../../../types";
import AdminToolbar from "../components/AdminToolbar";
import AdminDataGrid from "../components/AdminDataGrid";
import { useConfirmDialog } from "../../ConfirmDialog";

export default function DevicesAdminTab({
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
  const { requestConfirm, ConfirmDialog: ConfirmDialogEl } = useConfirmDialog();
  const [templates, setTemplates] = useState<DeviceTemplate[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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

  const uncategorizedFilterId = "__uncategorized__";
  const uncategorizedLabel = "— Uncategorized —";

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const categoryFilterOptions = useMemo(() => {
    const roots = categories.toSorted(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    ).filter((c) => !c.parentId);

    const options: Array<{ id: string; label: string }> = [{ id: uncategorizedFilterId, label: uncategorizedLabel }];

    const add = (cats: CategoryDefinition[], indent: string) => {
      for (const c of cats) {
        options.push({ id: c.id, label: indent + c.label });
        const children = categories
          .filter((x) => x.parentId === c.id)
          .toSorted((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
        add(children, indent + "  ");
      }
    };

    add(roots, "");
    return options;
  }, [categories]);

  const filteredRows = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    let rows = templates;

    if (selectedCategoryId) {
      if (selectedCategoryId === uncategorizedFilterId) {
        rows = rows.filter((t) => !t.categoryId);
      } else {
        rows = rows.filter((t) => (t.categoryId ?? "") === selectedCategoryId);
      }
    }

    if (q) {
      rows = rows.filter((t) => {
        const searchTerms = Array.isArray(t.searchTerms) ? t.searchTerms : [];
        const haystack = [
          t.label,
          t.deviceType,
          t.manufacturer ?? "",
          t.modelNumber ?? "",
          ...searchTerms,
        ].join(" ");
        return haystack.toLowerCase().includes(q);
      });
    }

    return rows;
  }, [templates, debouncedQuery, selectedCategoryId]);

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

      const baseLabel = mode === "edit" ? template?.label ?? "Device" : "New Device";
      const initialPorts =
        mode === "edit" && template
          ? template.ports
          : ([{ id: "p0", label: "Port 1", signalType: "sdi", direction: "input" }] satisfies Port[]);

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
        | DeviceNode
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

  const duplicateTemplate = useCallback(
    async (t: DeviceTemplate) => {
      if (!t.id) return;
      if (!token) {
        setError("Set admin token first");
        return;
      }
      const ok = await requestConfirm({
        title: "Duplicate template",
        message: `Duplicate "${t.label}"?`,
        confirmLabel: "Duplicate",
      });
      if (!ok) return;

      const baseLabel = (t.label ?? "Device").trim();
      const copyLabel = `${baseLabel} (Copy)`.slice(0, 140);
      const deviceType = `custom-duplicate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const ports = (t.ports ?? []).map((p) => ({
        ...p,
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }));

      if (ports.length === 0) {
        setError("Cannot duplicate template with zero ports");
        return;
      }

      const payload: TemplatePayload = {
        label: copyLabel,
        deviceType,
        ports,
        categoryId: t.categoryId ?? null,
        manufacturer: t.manufacturer?.trim() ? t.manufacturer.trim() : undefined,
        modelNumber: t.modelNumber?.trim() ? t.modelNumber.trim() : undefined,
        color: t.color?.trim() ? t.color.trim() : undefined,
        imageUrl: t.imageUrl?.trim() ? t.imageUrl.trim() : undefined,
        referenceUrl: t.referenceUrl?.trim() ? t.referenceUrl.trim() : undefined,
        searchTerms: t.searchTerms,
      };

      setBusy(true);
      setError(null);
      try {
        await createTemplate(payload);
        clearTemplateCache();
        await load();
        await onSuccess();
        window.dispatchEvent(new CustomEvent("easyschematic:templates:refresh"));
        setMessage(`Duplicated "${baseLabel}".`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [token, setError, setBusy, load, onSuccess, requestConfirm],
  );

  const uncategorizedCellLabel = "—";
  const columns = useMemo<ColumnDef<DeviceTemplate, unknown>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Label",
        meta: { align: "left" } as const,
        enableSorting: true,
        cell: (info) => info.getValue() as ReactNode | string,
      },
      {
        id: "category",
        header: "Category",
        meta: { align: "left" } as const,
        enableSorting: true,
        accessorFn: (t) =>
          t.categoryId ? (categoryLabelById[t.categoryId] ?? t.categoryId) : uncategorizedCellLabel,
        cell: ({ row }) => {
          const t = row.original;
          return t.categoryId ? categoryLabelById[t.categoryId] ?? t.categoryId : uncategorizedCellLabel;
        },
      },
      {
        id: "ports",
        header: "# Ports",
        meta: { align: "right" } as const,
        enableSorting: true,
        accessorFn: (t) => t.ports?.length ?? 0,
        cell: ({ row }) => (row.original.ports?.length ?? 0).toString(),
      },
      {
        id: "manufacturer",
        header: "Manufacturer",
        meta: { align: "left" } as const,
        enableSorting: true,
        accessorFn: (t) => t.manufacturer ?? "",
        cell: ({ row }) => row.original.manufacturer ?? uncategorizedCellLabel,
      },
      {
        id: "actions",
        header: "Actions",
        meta: { align: "right" } as const,
        enableSorting: false,
        cell: ({ row }) => {
          const t = row.original;
          return t.id ? (
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
                onClick={() => duplicateTemplate(t)}
                disabled={!token || busy || editorActive}
                className="text-[var(--color-primary)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!token) {
                    setError("Set admin token first");
                    return;
                  }
                  const ok = await requestConfirm({
                    title: "Delete template",
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
          );
        },
      },
    ],
    [
      categoryLabelById,
      openDraft,
      duplicateTemplate,
      requestConfirm,
      token,
      busy,
      editorActive,
      setError,
      setBusy,
      load,
      onSuccess,
    ],
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
        <div className="p-3 rounded border border-green-200 bg-green-50 text-green-800 text-sm">{message}</div>
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
        <AdminToolbar
          query={query}
          onQueryChange={setQuery}
          categories={categoryFilterOptions}
          categoryId={selectedCategoryId}
          onCategoryIdChange={setSelectedCategoryId}
        />

        {templates.length === 0 ? (
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
                <tr>
                  <td colSpan={5} className="p-4 text-[var(--color-text-muted)]">
                    No templates yet. Create one.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <AdminDataGrid<DeviceTemplate>
            data={filteredRows}
            columns={columns}
            resetKey={`${debouncedQuery}|${selectedCategoryId}`}
          />
        )}
      </section>
    </div>
  );
}

