import type { CellDTO, RowDTO } from "@/lib/heatmap-query";

/**
 * Scryfall serves the same asset at /small/, /normal/, and /large/ path tiers. When the DB only
 * stored `image_uri_small`, we can request a higher tier from the CDN without an extra API call.
 */
function scryfallCdnImageTier(url: string, target: "normal" | "large"): string {
  if (!url.includes("cards.scryfall.io/")) return url;
  return url.replace(/\/(small|normal|large)\//, `/${target}/`);
}

/** Hover / compact preview: `normal` (~488px), else upgrade `small`, else `small`. */
export function cardImageUrlForPreview(cell: CellDTO): string | null {
  if (cell.image_normal) return cell.image_normal;
  if (cell.image_small) {
    return scryfallCdnImageTier(cell.image_small, "normal");
  }
  return null;
}

/** First printing art on the row for name-column hover. */
export function cardImageUrlForRowPreview(row: RowDTO): string | null {
  for (const c of row.cells) {
    if (!c) continue;
    if (c.image_normal) return c.image_normal;
  }
  for (const c of row.cells) {
    if (!c?.image_small) continue;
    return scryfallCdnImageTier(c.image_small, "normal");
  }
  return null;
}

/** Expanded dialog: `large` (~672px), else upgrade `normal` or `small` to `large`. */
export function cardImageUrlForDetail(cell: CellDTO): string | null {
  if (cell.image_large) return cell.image_large;
  if (cell.image_normal) {
    return scryfallCdnImageTier(cell.image_normal, "large");
  }
  if (cell.image_small) {
    return scryfallCdnImageTier(cell.image_small, "large");
  }
  return null;
}
