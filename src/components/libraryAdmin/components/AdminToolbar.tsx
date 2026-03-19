export default function AdminToolbar({
  query,
  onQueryChange,
  categories,
  categoryId,
  onCategoryIdChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  categories: Array<{ id: string; label: string }>;
  categoryId: string;
  onCategoryIdChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 mb-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-text-muted)]">Search</label>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="label, device type, manufacturer…"
            className="px-2 py-1.5 border border-[var(--color-border)] rounded text-sm min-w-[220px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-text-muted)]">Category</label>
          <select
            value={categoryId}
            onChange={(e) => onCategoryIdChange(e.target.value)}
            className="px-2 py-1.5 border border-[var(--color-border)] rounded text-sm min-w-[180px]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

      </div>
    </div>
  );
}

