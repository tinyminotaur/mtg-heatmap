import {
  HEATMAP_COL_WIDTH,
  HEATMAP_FROZEN_COL_W,
  HEATMAP_FROZEN_ROLLUP_W,
  HEATMAP_HEADER_H,
  HEATMAP_ROW_HEIGHT,
} from "@/lib/constants";

export type HeatmapCellAnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CellHit = { row: number; col: number };

export type HeatmapHoverHit =
  | { kind: "dataCell"; row: number; col: number }
  | { kind: "nameColumn"; row: number }
  | { kind: "setHeader"; col: number }
  /** Frozen “Card” column header (row sort menu). */
  | { kind: "cardNameHeader" }
  /** Frozen printings rollup header (narrow layout may hide). */
  | { kind: "rollupHeader" };

/** Frozen name / identity / rollup strip for one body row (including header offset). */
export function readFrozenBodyRowAnchorRect(args: {
  canvasRect: DOMRect;
  scrollLeft: number;
  scrollTop: number;
  row: number;
  frozenColW?: number;
  rollupW?: number;
}): HeatmapCellAnchorRect {
  const { canvasRect, scrollLeft: sl, scrollTop: st, row } = args;
  const frozenColW = args.frozenColW ?? HEATMAP_FROZEN_COL_W;
  const rollupW = args.rollupW ?? HEATMAP_FROZEN_ROLLUP_W;
  const w = frozenColW + rollupW;
  return {
    left: canvasRect.left - sl,
    top: canvasRect.top + HEATMAP_HEADER_H + row * HEATMAP_ROW_HEIGHT - st,
    width: w,
    height: HEATMAP_ROW_HEIGHT,
  };
}

/** Set / edition column header cell. */
export function readSetHeaderAnchorRect(args: {
  canvasRect: DOMRect;
  scrollLeft: number;
  scrollTop: number;
  col: number;
  frozenColW?: number;
  rollupW?: number;
}): HeatmapCellAnchorRect {
  const { canvasRect, scrollLeft: sl, scrollTop: st, col } = args;
  const frozenColW = args.frozenColW ?? HEATMAP_FROZEN_COL_W;
  const rollupW = args.rollupW ?? HEATMAP_FROZEN_ROLLUP_W;
  return {
    left: canvasRect.left + frozenColW + rollupW + col * HEATMAP_COL_WIDTH - sl,
    top: canvasRect.top - st,
    width: HEATMAP_COL_WIDTH,
    height: HEATMAP_HEADER_H,
  };
}

export function readCellAnchorRectFromInputs(args: {
  canvasRect: DOMRect;
  scrollLeft: number;
  scrollTop: number;
  row: number;
  col: number;
  frozenColW?: number;
  rollupW?: number;
}): HeatmapCellAnchorRect {
  const { canvasRect, scrollLeft: sl, scrollTop: st, row, col } = args;
  const frozenColW = args.frozenColW ?? HEATMAP_FROZEN_COL_W;
  const rollupW = args.rollupW ?? HEATMAP_FROZEN_ROLLUP_W;
  return {
    left: canvasRect.left + frozenColW + rollupW + col * HEATMAP_COL_WIDTH - sl,
    top: canvasRect.top + HEATMAP_HEADER_H + row * HEATMAP_ROW_HEIGHT - st,
    width: HEATMAP_COL_WIDTH,
    height: HEATMAP_ROW_HEIGHT,
  };
}

export function clientPointToCell(args: {
  clientX: number;
  clientY: number;
  canvasRect: DOMRect;
  scrollLeft: number;
  scrollTop: number;
  columnsLength: number;
  rowsLength: number;
  frozenColW?: number;
  rollupW?: number;
}): CellHit | null {
  const { clientX, clientY, canvasRect, scrollLeft, scrollTop, columnsLength, rowsLength } = args;
  const frozenColW = args.frozenColW ?? HEATMAP_FROZEN_COL_W;
  const rollupW = args.rollupW ?? HEATMAP_FROZEN_ROLLUP_W;
  const x = clientX - canvasRect.left + scrollLeft;
  const y = clientY - canvasRect.top + scrollTop;
  if (x < frozenColW + rollupW || y < HEATMAP_HEADER_H) return null;
  const col = Math.floor((x - (frozenColW + rollupW)) / HEATMAP_COL_WIDTH);
  const row = Math.floor((y - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT);
  if (col < 0 || col >= columnsLength || row < 0 || row >= rowsLength) return null;
  return { row, col };
}

export function clientPointToHeatmapHover(args: {
  clientX: number;
  clientY: number;
  canvasRect: DOMRect;
  scrollLeft: number;
  scrollTop: number;
  columnsLength: number;
  rowsLength: number;
  frozenColW?: number;
  rollupW?: number;
}): HeatmapHoverHit | null {
  const {
    clientX,
    clientY,
    canvasRect,
    scrollLeft,
    scrollTop,
    columnsLength,
    rowsLength,
  } = args;
  const frozenColW = args.frozenColW ?? HEATMAP_FROZEN_COL_W;
  const rollupW = args.rollupW ?? HEATMAP_FROZEN_ROLLUP_W;
  const x = clientX - canvasRect.left + scrollLeft;
  const y = clientY - canvasRect.top + scrollTop;
  if (y < 0) return null;
  if (y >= 0 && y < HEATMAP_HEADER_H) {
    if (x < frozenColW + rollupW) {
      if (x < frozenColW) return { kind: "cardNameHeader" };
      return { kind: "rollupHeader" };
    }
    const col = Math.floor((x - (frozenColW + rollupW)) / HEATMAP_COL_WIDTH);
    if (col < 0 || col >= columnsLength) return null;
    return { kind: "setHeader", col };
  }
  const row = Math.floor((y - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT);
  if (row < 0 || row >= rowsLength) return null;
  if (x < frozenColW + rollupW) {
    return { kind: "nameColumn", row };
  }
  const col = Math.floor((x - (frozenColW + rollupW)) / HEATMAP_COL_WIDTH);
  if (col < 0 || col >= columnsLength) return null;
  return { kind: "dataCell", row, col };
}

export function visibleGridRange(args: {
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  columnsLength: number;
  rowsLength: number;
  frozenColW?: number;
  rollupW?: number;
}): { firstCol: number; lastCol: number; firstRow: number; lastRow: number } {
  const { scrollLeft: sl, scrollTop: st, viewportWidth: vw, viewportHeight: vh, columnsLength, rowsLength } = args;
  const frozenColW = args.frozenColW ?? HEATMAP_FROZEN_COL_W;
  const rollupW = args.rollupW ?? HEATMAP_FROZEN_ROLLUP_W;
  const firstCol = Math.max(0, Math.floor((sl - (frozenColW + rollupW)) / HEATMAP_COL_WIDTH) - 1);
  const lastCol = Math.min(
    columnsLength - 1,
    Math.ceil((sl + vw - (frozenColW + rollupW)) / HEATMAP_COL_WIDTH) + 1,
  );
  const firstRow = Math.max(0, Math.floor((st - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT) - 1);
  const lastRow = Math.min(
    rowsLength - 1,
    Math.ceil((st + vh - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT) + 1,
  );
  return { firstCol, lastCol, firstRow, lastRow };
}

