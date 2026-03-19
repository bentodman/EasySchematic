import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export default function AdminDataGrid<T>({
  data,
  columns,
  pageSizeOptions = [25, 50, 100],
  resetKey,
  tableClassName,
  renderCell,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  pageSizeOptions?: number[];
  /**
   * Any time this value changes, the grid resets to the first page.
   * Useful for search/filter changes.
   */
  resetKey?: string;
  tableClassName?: string;
  /**
   * Optional override for cell rendering. When omitted, TanStack default
   * `cell.column.columnDef.cell` rendering is used.
   */
  renderCell?: (args: { cell: any; row: any; value: unknown }) => ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSizeOptions[1] ?? pageSizeOptions[0] ?? 50,
  });

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    // Keep sorting as-is: users expect sort direction to persist while
    // refining search/filter.
  }, [resetKey]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableSortingRemoval: true,
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  const pageCount = table.getPageCount();
  const pageIndex = pagination.pageIndex;
  const pageSize = pagination.pageSize;
  const total = data.length;

  const start = total === 0 ? 0 : pageIndex * pageSize;
  const end = total === 0 ? 0 : Math.min(start + pageSize, total);

  const showing = total === 0 ? "Showing 0–0 of 0" : `Showing ${start + 1}–${end} of ${total}`;

  const canPrev = pageIndex > 0;
  const canNext = pageIndex + 1 < pageCount;

  const dirIndicator = (columnId: string) => {
    const s = sorting.find((x) => x.id === columnId);
    if (!s) return null;
    return s.desc ? "↓" : "↑";
  };

  const pageSizeVal = pagination.pageSize;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--color-text-muted)]">{showing}</div>
        <div className="flex items-center gap-2">
          <select
            value={pageSizeVal}
            onChange={(e) => {
              const newSize = parseInt(e.target.value, 10);
              table.setPageSize(newSize);
            }}
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
            disabled={!canPrev}
            onClick={() => table.previousPage()}
            className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <div className="text-xs text-[var(--color-text-muted)]">{total === 0 ? "—" : `${pageIndex + 1}/${pageCount}`}</div>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => table.nextPage()}
            className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      <div className="border border-[var(--color-border)] rounded overflow-x-auto">
        <table className={`w-full text-sm border-collapse ${tableClassName ?? ""}`}>
          <thead>
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortIndicator = header.column.id ? dirIndicator(header.column.id) : null;
                  const align = (header.column.columnDef.meta as any)?.align as "left" | "right" | undefined;
                  const thClass =
                    align === "right"
                      ? "text-right p-2 font-medium"
                      : align === "left"
                        ? "text-left p-2 font-medium"
                        : "text-left p-2 font-medium";

                  return (
                    <th key={header.id} className={thClass}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="w-full flex items-center gap-2 justify-between"
                          aria-label={`Sort by ${header.column.id}`}
                        >
                          <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                          <span className="text-[var(--color-text-muted)] text-xs">{sortIndicator}</span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-4 text-[var(--color-text-muted)]">
                  No rows match your filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)]">
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as any)?.align as "left" | "right" | undefined;
                    const tdClass = align === "right" ? "p-2 text-right" : "p-2";
                    const value = cell.getValue();
                    return (
                      <td key={cell.id} className={tdClass}>
                        {renderCell ? renderCell({ cell, row, value }) : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

