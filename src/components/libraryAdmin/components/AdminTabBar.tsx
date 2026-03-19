import type { Dispatch, SetStateAction } from "react";
import { LIBRARY_ADMIN_TABS, type LibraryAdminTabId } from "../libraryAdminTypes";

export default function AdminTabBar({
  tab,
  setTab,
}: {
  tab: LibraryAdminTabId;
  setTab: Dispatch<SetStateAction<LibraryAdminTabId>>;
}) {
  return (
    <div className="flex border-b border-[var(--color-border)] px-2" role="tablist">
      {LIBRARY_ADMIN_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === t.id
              ? "text-[var(--color-primary)] border-[var(--color-primary)]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

