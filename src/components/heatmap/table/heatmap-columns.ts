import type { CellDTO, RowDTO } from "@/lib/heatmap/dto";
import type { ColumnMeta } from "@/lib/heatmap-types";
import type { ColumnDef } from "@tanstack/react-table";

export type HeatmapColumnMeta =
  | {
      kind: "set";
      set: ColumnMeta;
      setIndex: number;
    }
  | {
      kind: "row";
      id: "name";
      label: string;
    };

export function createHeatmapColumns(columnMetas: ColumnMeta[]): ColumnDef<RowDTO>[] {
  const rowCols: ColumnDef<RowDTO>[] = [
    {
      id: "name",
      header: "Card",
      accessorFn: (row) => row.name,
      meta: { kind: "row", id: "name", label: "Card" } satisfies HeatmapColumnMeta,
    },
  ];

  const setCols: ColumnDef<RowDTO>[] = columnMetas.map((set, setIndex) => {
    return {
      id: `set:${set.code}`,
      header: set.code.toUpperCase(),
      accessorFn: (row) => row.cells[setIndex] ?? null,
      meta: { kind: "set", set, setIndex } satisfies HeatmapColumnMeta,
      enableSorting: false,
    } satisfies ColumnDef<RowDTO, CellDTO | null>;
  });

  return [...rowCols, ...setCols];
}

