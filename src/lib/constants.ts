export const LOCAL_USER_ID = "local";

/** NM=1.0, LP=0.85, … per spec */
export const CONDITION_VALUE_MULT: Record<string, number> = {
  NM: 1,
  LP: 0.85,
  MP: 0.65,
  HP: 0.45,
  DMG: 0.25,
};

export const POC_RELEASE_CUTOFF = "2005-12-31";

/** Tall enough for 12–13px price text + scope glyphs without clipping (see `HEATMAP_CANVAS_FONT`). */
export const HEATMAP_ROW_HEIGHT = 36;
/** Wide enough for monospace prices + optional scope glyphs (see HeatmapGrid layout). */
export const HEATMAP_COL_WIDTH = 60;
/** Full-height color identity strip at left of name column (px). */
export const HEATMAP_IDENTITY_STRIP_W = 22;
/** Wide enough for strip, name, and mana symbols. */
export const HEATMAP_FROZEN_COL_W = 308;
/** Frozen rollup column width for per-row metrics (px). */
export const HEATMAP_FROZEN_ROLLUP_W = 54;
/** Set header: centered symbol + gap + year (see HeatmapGrid header paint). */
export const HEATMAP_HEADER_H = 66;
/** Default and maximum rows per heatmap API page (large JSON payloads can fail on some hosts). */
export const HEATMAP_MAX_PAGE_SIZE = 1000;
