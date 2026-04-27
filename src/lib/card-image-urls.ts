import type { CellDTO } from "@/lib/heatmap-query";

/** Hover / compact preview: prefer Scryfall `normal` (~488px wide), then `small`. */
export function cardImageUrlForPreview(cell: CellDTO): string | null {
  return cell.image_normal ?? cell.image_small ?? null;
}

/** Expanded dialog: prefer `large` (~672px), then `normal`, then `small`. */
export function cardImageUrlForDetail(cell: CellDTO): string | null {
  return cell.image_large ?? cell.image_normal ?? cell.image_small ?? null;
}
