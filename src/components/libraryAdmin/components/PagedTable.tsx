import type { ReactNode } from "react";

export default function PagedTable<T>({
  allRows,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  renderPageRows,
}: {
  allRows: T[];
  page: number; // 1-indexed
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  pageSizeOptions?: number[];
  renderPageRows: (pageRows: T[]) => ReactNode;
}) {
  const total = allRows.length;
  const pageCount = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

  const safePage = pageCount === 0 ? 1 : Math.min(Math.max(1, page), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = total === 0 ? 0 : Math.min(start + pageSize, total);

  const pageRows = total === 0 ? [] : allRows.slice(start, end);

  const showing =
    total === 0 ? "Showing 0–0 of 0" : `Showing ${start + 1}–${end} of ${total}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--color-text-muted)]">{showing}</div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            className="px-2 py-1.5 border border-[var(--color-border)] rounded text-sm"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}/page
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <div className="text-xs text-[var(--color-text-muted)]">
            {pageCount === 0 ? "—" : `${safePage}/${pageCount}`}
          </div>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
            className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
      {renderPageRows(pageRows)}
    </div>
  );
}

