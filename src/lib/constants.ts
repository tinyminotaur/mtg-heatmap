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
export const HEATMAP_COL_WIDTH = 44;
export const HEATMAP_FROZEN_COL_W = 280;
export const HEATMAP_HEADER_H = 56;
export const HEATMAP_PAGE_SIZE = 1000;
