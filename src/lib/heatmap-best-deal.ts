import type { RowDTO } from "@/lib/heatmap-query";

export type HeatmapPriceRange = {
  lowCols: number[];
  highCols: number[];
  lowAmount: number;
  highAmount: number;
  lowPricedAsFoil: boolean;
  highPricedAsFoil: boolean;
};

function cellPrice(cell: NonNullable<RowDTO["cells"][number]>): number | null {
  const v = cell.usd ?? cell.usd_foil;
  if (v == null || !(v > 0)) return null;
  return v;
}

/**
 * When the row has at least two visible priced printings and min < max, returns column indices and amounts.
 * Otherwise null (no “Lowest” / “Highest” badges or callout).
 */
export function getHeatmapPriceRange(row: RowDTO | undefined): HeatmapPriceRange | null {
  if (!row?.price_low_cols.length && !row?.price_high_cols.length) return null;
  const lowCols = row.price_low_cols;
  const highCols = row.price_high_cols;
  if (!lowCols.length || !highCols.length) return null;
  const lowIdx = lowCols[0];
  const highIdx = highCols[0];
  const lowCell = row.cells[lowIdx];
  const highCell = row.cells[highIdx];
  if (!lowCell || !highCell) return null;
  const lowAmount = cellPrice(lowCell);
  const highAmount = cellPrice(highCell);
  if (lowAmount == null || highAmount == null) return null;
  return {
    lowCols,
    highCols,
    lowAmount,
    highAmount,
    lowPricedAsFoil: lowCell.usd == null && lowCell.usd_foil != null,
    highPricedAsFoil: highCell.usd == null && highCell.usd_foil != null,
  };
}

export function formatPriceKind(pricedAsFoil: boolean): string {
  return pricedAsFoil ? "foil USD (non-foil missing)" : "non-foil USD (Scryfall NM)";
}
