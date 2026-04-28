import type { RowDTO } from "@/lib/heatmap/dto";
import type { ColumnMeta } from "@/lib/heatmap-types";
import { createHeatmapColumns } from "@/components/heatmap/table/heatmap-columns";
import {
  getCoreRowModel,
  useReactTable,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import { useMemo } from "react";

export type UseHeatmapTableArgs = {
  rows: RowDTO[];
  columns: ColumnMeta[];
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((prev: SortingState) => SortingState)) => void;
};

/**
 * Headless TanStack table for the heatmap.
 *
 * Important: the heatmap’s heavy filtering/sorting/pagination is server-side (SQL).
 * This table instance is mainly a canonical column registry + state container for UI.
 */
export function useHeatmapTable({
  rows,
  columns,
  sorting,
  onSortingChange,
}: UseHeatmapTableArgs): Table<RowDTO> {
  const columnDefs = useMemo(() => createHeatmapColumns(columns), [columns]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is intentionally used as a headless state/model layer
  return useReactTable<RowDTO>({
    data: rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    // Do not enable client-side sorting/filtering row models here; SQL is authoritative.
    manualSorting: true,
  });
}

