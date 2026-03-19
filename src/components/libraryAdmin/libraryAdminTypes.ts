export type LibraryAdminTabId = "signals" | "connectors" | "compat" | "categories" | "devices";

export const LIBRARY_ADMIN_TABS: Array<{ id: LibraryAdminTabId; label: string }> = [
  { id: "signals", label: "Signal types" },
  { id: "connectors", label: "Connector types" },
  { id: "compat", label: "Compatibility" },
  { id: "categories", label: "Categories" },
  { id: "devices", label: "Devices" },
];

