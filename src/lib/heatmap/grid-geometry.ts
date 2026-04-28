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

export function readCellAnchorRectFromInputs(args: {
  canvasRect: DOMRect;
  scrollLeft: number;
  scrollTop: number;
  row: number;
  col: number;
}): HeatmapCellAnchorRect {
  const { canvasRect, scrollLeft: sl, scrollTop: st, row, col } = args;
  return {
    left: canvasRect.left + HEATMAP_FROZEN_COL_W + HEATMAP_FROZEN_ROLLUP_W + col * HEATMAP_COL_WIDTH - sl,
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
}): CellHit | null {
  const { clientX, clientY, canvasRect, scrollLeft, scrollTop, columnsLength, rowsLength } = args;
  const x = clientX - canvasRect.left + scrollLeft;
  const y = clientY - canvasRect.top + scrollTop;
  if (x < HEATMAP_FROZEN_COL_W + HEATMAP_FROZEN_ROLLUP_W || y < HEATMAP_HEADER_H) return null;
  const col = Math.floor((x - (HEATMAP_FROZEN_COL_W + HEATMAP_FROZEN_ROLLUP_W)) / HEATMAP_COL_WIDTH);
  const row = Math.floor((y - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT);
  if (col < 0 || col >= columnsLength || row < 0 || row >= rowsLength) return null;
  return { row, col };
}

export function visibleGridRange(args: {
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  columnsLength: number;
  rowsLength: number;
}): { firstCol: number; lastCol: number; firstRow: number; lastRow: number } {
  const { scrollLeft: sl, scrollTop: st, viewportWidth: vw, viewportHeight: vh, columnsLength, rowsLength } = args;
  const firstCol = Math.max(0, Math.floor((sl - (HEATMAP_FROZEN_COL_W + HEATMAP_FROZEN_ROLLUP_W)) / HEATMAP_COL_WIDTH) - 1);
  const lastCol = Math.min(
    columnsLength - 1,
    Math.ceil((sl + vw - (HEATMAP_FROZEN_COL_W + HEATMAP_FROZEN_ROLLUP_W)) / HEATMAP_COL_WIDTH) + 1,
  );
  const firstRow = Math.max(0, Math.floor((st - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT) - 1);
  const lastRow = Math.min(
    rowsLength - 1,
    Math.ceil((st + vh - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT) + 1,
  );
  return { firstCol, lastCol, firstRow, lastRow };
}

