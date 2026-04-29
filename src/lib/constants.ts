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

export const HEATMAP_ROW_HEIGHT = 28;
export const HEATMAP_COL_WIDTH = 52;
/** Full-height color identity strip at left of name column (px). */
export const HEATMAP_IDENTITY_STRIP_W = 22;
/** Wide enough for strip, name, and mana symbols. */
export const HEATMAP_FROZEN_COL_W = 308;
/** Frozen rollup column width for per-row metrics (px). */
export const HEATMAP_FROZEN_ROLLUP_W = 54;
/** Fits set symbol + year with minimal vertical gap (see HeatmapGrid header paint). */
export const HEATMAP_HEADER_H = 58;
/** Default and maximum rows per heatmap API page (large JSON payloads can fail on some hosts). */
export const HEATMAP_MAX_PAGE_SIZE = 1000;
