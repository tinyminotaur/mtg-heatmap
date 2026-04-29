/**
 * Typography policy for MTG Heatmap
 *
 * - **React / Tailwind:** Prefer `text-xs` (12px) as the smallest UI size; use `text-sm` (14px) for
 *   secondary body and filter panels. Avoid arbitrary `text-[9px]`–`text-[11px]` except where we
 *   migrate them to the scale below.
 * - **Canvas heatmap:** Uses pixel fonts independent of Tailwind. Keep **≥11px** for numbers users
 *   must read; start prices at **13px** and shrink only if the label overflows the cell (floor 11px).
 */

/** Canvas font sizes (px) — heatmap grid painting */
export const HEATMAP_CANVAS_FONT = {
  /** Primary cell price — start here; shrink to `cellPriceMin` only if text overflows. */
  cellPriceStart: 13,
  cellPriceMin: 11,
  /** Min / max price badges (top-right of cell) */
  rangeBadge: 11,
  rangeBadgeHeight: 15,
  rangeBadgePadX: 6,
  /** Watchlist star (top-left) & owned book (bottom-left) */
  scopeGlyph: 11,
  /** Edition header year & fallback set code */
  headerYear: 12,
  headerSetFallback: 11,
  aggregateSigma: 11,
  /** Frozen pane: card name, printings count, owned qty */
  frozenName: 13,
  frozenPrintings: 12,
  frozenOwnedQty: 11,
  frozenCardHeader: 12,
  frozenPrintHeader: 12,
} as const;
