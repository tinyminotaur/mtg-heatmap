import { describe, expect, it } from "vitest";
import { clientPointToHeatmapHover } from "./grid-geometry";
import {
  HEATMAP_COL_WIDTH,
  HEATMAP_FROZEN_COL_W,
  HEATMAP_FROZEN_ROLLUP_W,
  HEATMAP_HEADER_H,
} from "@/lib/constants";

const fr = (left: number, top: number) =>
  ({ left, top, right: left + 800, bottom: top + 600, width: 800, height: 600, x: left, y: top, toJSON: () => "" }) as DOMRect;

describe("clientPointToHeatmapHover (frozen column hit-test)", () => {
  it("treats viewport-x within the frozen strip as name column, not a scrolled-under data cell", () => {
    const canvasRect = fr(100, 40);
    const sl = 420;
    const insideFrozenVx = HEATMAP_FROZEN_COL_W + HEATMAP_FROZEN_ROLLUP_W - 10;
    const clientX = canvasRect.left + insideFrozenVx;
    const bodyY = HEATMAP_HEADER_H + 20;
    const clientY = canvasRect.top + bodyY;

    const hit = clientPointToHeatmapHover({
      clientX,
      clientY,
      canvasRect,
      scrollLeft: sl,
      scrollTop: 0,
      columnsLength: 40,
      rowsLength: 20,
    });

    expect(hit).toEqual({ kind: "nameColumn", row: 0 });
  });

  it("maps data cells using vx + scrollLeft past the frozen strip", () => {
    const canvasRect = fr(0, 0);
    const sl = 400;
    const dataPaneLeft = HEATMAP_FROZEN_COL_W + HEATMAP_FROZEN_ROLLUP_W;
    /** Column index ~8 is the first whose left edge clears the frozen strip when sl=400 (see draw math). */
    const col = 9;
    const clientX = dataPaneLeft + col * HEATMAP_COL_WIDTH - sl + 10;
    expect(clientX).toBeGreaterThanOrEqual(dataPaneLeft);
    const bodyY = HEATMAP_HEADER_H + 5;
    const clientY = bodyY;

    const hit = clientPointToHeatmapHover({
      clientX,
      clientY,
      canvasRect,
      scrollLeft: sl,
      scrollTop: 0,
      columnsLength: 40,
      rowsLength: 20,
    });

    expect(hit?.kind).toBe("dataCell");
    if (hit?.kind === "dataCell") {
      expect(hit.col).toBe(col);
      expect(hit.row).toBe(0);
    }
  });
});
