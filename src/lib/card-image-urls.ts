import type { CellDTO, RowDTO } from "@/lib/heatmap-query";

/** Hover / compact preview: prefer Scryfall `normal` (~488px wide), then `small`. */
export function cardImageUrlForPreview(cell: CellDTO): string | null {
  return cell.image_normal ?? cell.image_small ?? null;
}

/** First printing art on the row for name-column hover (no extra API fields). */
export function cardImageUrlForRowPreview(row: RowDTO): string | null {
  for (const c of row.cells) {
    if (!c) continue;
    if (c.image_normal) return c.image_normal;
  }
  for (const c of row.cells) {
    if (!c?.image_small) continue;
    return c.image_small;
  }
  return null;
}

/** Expanded dialog: prefer `large` (~672px), then `normal`, then `small`. */
export function cardImageUrlForDetail(cell: CellDTO): string | null {
  return cell.image_large ?? cell.image_normal ?? cell.image_small ?? null;
}
