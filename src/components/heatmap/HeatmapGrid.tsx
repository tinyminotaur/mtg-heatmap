"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  HEATMAP_COL_WIDTH,
  HEATMAP_FROZEN_COL_W,
  HEATMAP_FROZEN_ROLLUP_W,
  HEATMAP_HEADER_H,
  HEATMAP_IDENTITY_STRIP_W,
  HEATMAP_ROW_HEIGHT,
} from "@/lib/constants";
import {
  clientPointToCell,
  clientPointToHeatmapHover,
  readCellAnchorRectFromInputs,
  readFrozenBodyRowAnchorRect,
  readSetHeaderAnchorRect,
  type HeatmapCellAnchorRect,
  visibleGridRange,
} from "@/lib/heatmap/grid-geometry";
import { scryfallSetIconSvgUrl } from "@/lib/set-icon-url";
import {
  drawManaCostRight,
  drawTypeGlyphInStrip,
  fillIdentityStrip,
  typeLineToManaGlyph,
} from "@/lib/card-row-canvas";
import type { CellDTO, ColumnMeta, RowDTO } from "@/lib/heatmap-query";
import type { PriceMode } from "@/lib/price-scale";
import {
  cellEligibleForHeatmapHoverPreview,
  formatHeatmapCellPriceLabel,
  priceToColor,
} from "@/lib/price-scale";

export type HeatmapGridHandle = {
  getDataCellClientRect: (row: number, col: number) => HeatmapCellAnchorRect | null;
  /** Scroll the scroll port so the data cell (row, col) is visible; no-op if already in view. */
  scrollCellIntoView: (row: number, col: number) => void;
};

export type { HeatmapCellAnchorRect } from "@/lib/heatmap/grid-geometry";

type Props = {
  columns: ColumnMeta[];
  rows: RowDTO[];
  priceMode: PriceMode;
  dark: boolean;
  /** §11.2.6 — dim non-matching printings (context) or paint them as empty (strict). */
  matchMode?: "context" | "strict";
  selectedRow: number;
  selectedCol: number;
  onSelectCell: (row: number, col: number) => void;
  onHoverCell: (
    row: number,
    col: number,
    cell: CellDTO | null,
    clientX: number,
    clientY: number,
    anchor: HeatmapCellAnchorRect,
  ) => void;
  onLeaveGrid: () => void;
  /**
   * When the pointer exits the scroll/canvas port (e.g. toward a fixed floating preview).
   * Defaults to `onLeaveGrid`. Use a short delayed dismiss from the parent so the cursor can
   * cross the gap without clearing hover before it enters the preview card.
   */
  onLeaveInteractionPort?: () => void;
  /** Fires after scroll/resize redraw so the parent can re-read cell anchors (pinned preview). */
  onViewportChange?: () => void;
  /** Same node as the scroll port (canvas parent); used for “click outside” with pinned preview. */
  interactionPortRef?: RefObject<HTMLDivElement | null>;
  /** §11.5.6 — click a set header to temporarily sort rows by that column’s USD price. */
  onHeaderSetClick?: (setCode: string) => void;
  /** Hovering the frozen name / identity strip (body rows). */
  onHoverFrozenRowBody?: (
    row: number,
    clientX: number,
    clientY: number,
    anchor: HeatmapCellAnchorRect,
  ) => void;
  /** Hovering an edition column header (set symbol band). */
  onHoverEditionHeader?: (
    col: number,
    clientX: number,
    clientY: number,
    anchor: HeatmapCellAnchorRect,
  ) => void;
  /** Click frozen “Card” header — opens row sort menu (viewport anchor rect). */
  onCardNameHeaderClick?: (anchor: { left: number; top: number; width: number; height: number }) => void;
};

function drawPriceRangeBadge(
  ctx: CanvasRenderingContext2D,
  vx: number,
  vy: number,
  label: string,
  variant: "low" | "high",
  dark: boolean,
  stackIndex: number,
) {
  const ph = 12;
  const padX = 5;
  ctx.save();
  ctx.font = "bold 8px system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  const pw = Math.ceil(tw + padX * 2);
  const bx = vx + HEATMAP_COL_WIDTH - pw - 2;
  const by = vy + 2 + stackIndex * (ph + 3);
  const style =
    variant === "low"
      ? dark
        ? { bg: "rgba(8, 145, 178, 0.95)", fg: "#ecfeff", stroke: "rgba(34, 211, 238, 0.55)" }
        : { bg: "rgba(224, 242, 254, 0.98)", fg: "#0c4a6e", stroke: "rgba(2, 132, 199, 0.45)" }
      : dark
        ? { bg: "rgba(190, 18, 60, 0.92)", fg: "#fff1f2", stroke: "rgba(251, 113, 133, 0.55)" }
        : { bg: "rgba(255, 228, 230, 0.98)", fg: "#881337", stroke: "rgba(244, 63, 94, 0.5)" };
  ctx.fillStyle = style.bg;
  ctx.beginPath();
  ctx.roundRect(bx, by, pw, ph, 3);
  ctx.fill();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = style.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + pw / 2, by + ph / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/** Pinned (row) top-left, watchlist middle-left, owned bottom-left — matches scope tab terminology. */
function drawCellScopeGlyphs(
  ctx: CanvasRenderingContext2D,
  vx: number,
  vy: number,
  row: RowDTO,
  cell: CellDTO,
  dark: boolean,
) {
  const pin = "\u{1F4CC}";
  const star = "\u2605";
  const lib = "\u{1F4DA}";
  ctx.save();
  ctx.textAlign = "left";
  if (row.pinned) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = dark ? "#e9d5ff" : "#7e22ce";
    ctx.textBaseline = "top";
    ctx.fillText(pin, vx + 3, vy + 3);
  }
  if (cell.watchlisted) {
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = dark ? "#93c5fd" : "#1d4ed8";
    ctx.textBaseline = "middle";
    ctx.fillText(star, vx + 4, vy + HEATMAP_ROW_HEIGHT / 2);
  }
  if (cell.owned_qty > 0) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = dark ? "#fcd34d" : "#b45309";
    ctx.textBaseline = "bottom";
    ctx.fillText(lib, vx + 3, vy + HEATMAP_ROW_HEIGHT - 3);
  }
  ctx.restore();
}

function drawCellPriceLabel(
  ctx: CanvasRenderingContext2D,
  vx: number,
  vy: number,
  text: string,
  dark: boolean,
  emphasis: boolean,
) {
  /** Bottom-right; Min/Max badges use top-right. */
  const pad = 3;
  const maxW = HEATMAP_COL_WIDTH - pad * 2;
  const rightX = vx + HEATMAP_COL_WIDTH - pad;
  const bottomY = vy + HEATMAP_ROW_HEIGHT - pad;
  ctx.save();
  ctx.textBaseline = "bottom";
  ctx.textAlign = "right";
  let fontPx = 8;
  for (let i = 0; i < 4; i++) {
    ctx.font = `bold ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    if (ctx.measureText(text).width <= maxW || fontPx <= 6) break;
    fontPx -= 1;
  }
  if (emphasis) {
    ctx.lineWidth = 2.25;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = dark ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.82)";
    ctx.strokeText(text, rightX, bottomY);
    ctx.fillStyle = dark ? "#f9fafb" : "#111827";
    ctx.fillText(text, rightX, bottomY);
  } else {
    ctx.fillStyle = dark ? "rgba(156,163,175,0.98)" : "rgba(82,82,91,0.98)";
    ctx.fillText(text, rightX, bottomY);
  }
  ctx.restore();
}

/** Viewport-sized canvas + off-screen scroll spacer so large grids stay GPU-friendly. */
export const HeatmapGrid = forwardRef<HeatmapGridHandle, Props>(function HeatmapGrid(
  {
    columns,
    rows,
    priceMode,
    dark,
    matchMode = "context",
    selectedRow,
    selectedCol,
    onSelectCell,
    onHoverCell,
    onLeaveGrid,
    onLeaveInteractionPort,
    onViewportChange,
    interactionPortRef,
    onHeaderSetClick,
    onHoverFrozenRowBody,
    onHoverEditionHeader,
    onCardNameHeaderClick,
  },
  ref,
) {
  /** Scroll port (spacer only); canvas is a sibling overlay so it never moves with scroll offset. */
  const portRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportW, setViewportW] = useState(0);
  const setImagesRef = useRef(new Map<string, HTMLImageElement>());
  const [setIconsEpoch, setSetIconsEpoch] = useState(0);
  const [manaFontEpoch, setManaFontEpoch] = useState(0);
  const lastHoverWithCellRef = useRef<{ r: number; c: number; cell: CellDTO } | null>(null);
  const lastHoverAuxRef = useRef<{ kind: "name"; row: number } | { kind: "header"; col: number } | null>(null);

  const gridW = columns.length * HEATMAP_COL_WIDTH;
  const gridH = rows.length * HEATMAP_ROW_HEIGHT;
  const effFrozenColW =
    viewportW > 0 && viewportW < 520
      ? Math.max(220, Math.floor(viewportW * 0.58))
      : HEATMAP_FROZEN_COL_W;
  const effRollupW = viewportW > 0 && viewportW < 520 ? 0 : HEATMAP_FROZEN_ROLLUP_W;
  const totalW = effFrozenColW + effRollupW + gridW;
  const totalH = HEATMAP_HEADER_H + gridH;

  const setPortEl = useCallback(
    (el: HTMLDivElement | null) => {
      portRef.current = el;
      if (interactionPortRef) interactionPortRef.current = el;
    },
    [interactionPortRef],
  );

  useImperativeHandle(
    ref,
    () => ({
      getDataCellClientRect(row: number, col: number) {
        const canvas = canvasRef.current;
        const scrollEl = scrollRef.current;
        if (!canvas || !scrollEl) return null;
        if (row < 0 || col < 0 || row >= rows.length || col >= columns.length) return null;
        return readCellAnchorRectFromInputs({
          canvasRect: canvas.getBoundingClientRect(),
          scrollLeft: scrollEl.scrollLeft,
          scrollTop: scrollEl.scrollTop,
          row,
          col,
          frozenColW: effFrozenColW,
          rollupW: effRollupW,
        });
      },
      scrollCellIntoView(row: number, col: number) {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        if (row < 0 || col < 0 || row >= rows.length || col >= columns.length) return;

        const pad = 12;
        const cellLeft = effFrozenColW + effRollupW + col * HEATMAP_COL_WIDTH;
        const cellRight = cellLeft + HEATMAP_COL_WIDTH;
        const cellTop = HEATMAP_HEADER_H + row * HEATMAP_ROW_HEIGHT;
        const cellBottom = cellTop + HEATMAP_ROW_HEIGHT;

        const cw = scrollEl.clientWidth;
        const ch = scrollEl.clientHeight;
        let sl = scrollEl.scrollLeft;
        let st = scrollEl.scrollTop;

        const viewLeft = sl;
        const viewTop = st;

        if (cellLeft < viewLeft + pad) sl = cellLeft - pad;
        if (cellRight > sl + cw - pad) sl = cellRight - cw + pad;
        if (cellTop < viewTop + pad) st = cellTop - pad;
        if (cellBottom > st + ch - pad) st = cellBottom - ch + pad;

        const maxSl = Math.max(0, scrollEl.scrollWidth - cw);
        const maxSt = Math.max(0, scrollEl.scrollHeight - ch);
        scrollEl.scrollLeft = Math.min(maxSl, Math.max(0, sl));
        scrollEl.scrollTop = Math.min(maxSt, Math.max(0, st));
        onViewportChange?.();
      },
    }),
    [rows.length, columns.length, onViewportChange, effFrozenColW, effRollupW],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvas || !scrollEl) return;

    const vw = Math.max(1, scrollEl.clientWidth);
    const vh = Math.max(1, scrollEl.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sl = scrollEl.scrollLeft;
    const st = scrollEl.scrollTop;

    const bg = dark ? "#0a0a0a" : "#fafafa";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);

    const fg = dark ? "#e5e7eb" : "#111827";
    const muted = dark ? "#9ca3af" : "#6b7280";
    const headerBg = dark ? "#111827" : "#f3f4f6";
    const rowLabelBg = dark ? "#0f172a" : "#ffffff";

    const { firstCol, lastCol, firstRow, lastRow } = visibleGridRange({
      scrollLeft: sl,
      scrollTop: st,
      viewportWidth: vw,
      viewportHeight: vh,
      columnsLength: columns.length,
      rowsLength: rows.length,
      frozenColW: effFrozenColW,
      rollupW: effRollupW,
    });

    // Scrollable data area only (never paint under frozen headers)
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      effFrozenColW + effRollupW,
      HEATMAP_HEADER_H,
      Math.max(0, vw - (effFrozenColW + effRollupW)),
      Math.max(0, vh - HEATMAP_HEADER_H),
    );
    ctx.clip();

    for (let r = firstRow; r <= lastRow; r++) {
      const row = rows[r];
      if (!row) continue;
      const docY = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT;
      const vy = docY - st;
      if (vy >= vh || vy + HEATMAP_ROW_HEIGHT <= HEATMAP_HEADER_H) continue;
      for (let c = firstCol; c <= lastCol; c++) {
        const docX = effFrozenColW + effRollupW + c * HEATMAP_COL_WIDTH;
        const vx = docX - sl;
        if (vx >= vw || vx + HEATMAP_COL_WIDTH <= effFrozenColW + effRollupW) continue;
        const cell = row.cells[c];
        const strictHide = Boolean(
          cell && matchMode === "strict" && cell.printing_matches === false,
        );
        const contextDim = Boolean(
          cell && matchMode === "context" && cell.printing_matches === false,
        );
        const dto =
          cell && !strictHide
            ? { usd: cell.usd, usd_foil: cell.usd_foil, eur: cell.eur, tix: cell.tix }
            : { usd: null, usd_foil: null, eur: null, tix: null };
        ctx.fillStyle = priceToColor(dto, priceMode, dark);
        ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
        if (cell && !strictHide) {
          if (row.quick_pin_row) {
            ctx.fillStyle = dark ? "rgba(245, 158, 11, 0.26)" : "rgba(251, 191, 36, 0.22)";
            ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
          }
          if (columns[c]?.quick_pin_column) {
            ctx.fillStyle = dark ? "rgba(14, 165, 233, 0.22)" : "rgba(125, 211, 252, 0.28)";
            ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
          }
          if (row.pinned) {
            ctx.fillStyle = dark ? "rgba(168, 85, 247, 0.22)" : "rgba(147, 51, 234, 0.16)";
            ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
          }
        }
        if (contextDim) {
          ctx.fillStyle = dark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.5)";
          ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
        }
        if (cell && !strictHide) {
          drawCellScopeGlyphs(ctx, vx, vy, row, cell, dark);
          const badges: { label: string; variant: "low" | "high" }[] = [];
          if (row.price_low_cols.includes(c)) badges.push({ label: "Min", variant: "low" });
          if (row.price_high_cols.includes(c)) badges.push({ label: "Max", variant: "high" });
          badges.forEach((b, i) => drawPriceRangeBadge(ctx, vx, vy, b.label, b.variant, dark, i));
          const priceLabel = formatHeatmapCellPriceLabel(cell, priceMode);
          drawCellPriceLabel(ctx, vx, vy, priceLabel ?? "—", dark, priceLabel != null);
        }
      }
    }

    ctx.strokeStyle = dark ? "#374151" : "#d1d5db";
    ctx.lineWidth = 1;
    const dataBottom = Math.min(vh, HEATMAP_HEADER_H + gridH - st);
    for (let c = firstCol; c <= lastCol; c++) {
      const vx = effFrozenColW + effRollupW + c * HEATMAP_COL_WIDTH - sl;
      if (vx >= vw || vx + HEATMAP_COL_WIDTH <= effFrozenColW + effRollupW) continue;
      ctx.beginPath();
      ctx.moveTo(vx + 0.5, HEATMAP_HEADER_H);
      ctx.lineTo(vx + 0.5, dataBottom);
      ctx.stroke();
    }
    for (let r = firstRow; r <= lastRow; r++) {
      const hY = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT - st;
      if (hY >= vh || hY + HEATMAP_ROW_HEIGHT <= HEATMAP_HEADER_H) continue;
      const x0 = effFrozenColW + effRollupW;
      const x1 = Math.min(vw, totalW - sl);
      if (x1 <= x0) continue;
      ctx.beginPath();
      ctx.moveTo(x0, hY + 0.5);
      ctx.lineTo(x1, hY + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      effFrozenColW + effRollupW,
      0,
      Math.max(0, vw - (effFrozenColW + effRollupW)),
      HEATMAP_HEADER_H,
    );
    ctx.clip();
    for (let j = firstCol; j <= lastCol; j++) {
      const c = columns[j];
      if (!c) continue;
      const vx = effFrozenColW + effRollupW + j * HEATMAP_COL_WIDTH - sl;
      if (vx >= vw || vx + HEATMAP_COL_WIDTH <= effFrozenColW + effRollupW) continue;
      ctx.fillStyle = headerBg;
      ctx.fillRect(vx, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      if (c.quick_pin_column) {
        ctx.fillStyle = dark ? "rgba(14, 165, 233, 0.35)" : "rgba(125, 211, 252, 0.45)";
        ctx.fillRect(vx, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      }
      ctx.strokeStyle = dark ? "#374151" : "#e5e7eb";
      ctx.strokeRect(vx, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      const isz = 28;
      const gapIconYear = 5;
      const yearFontPx = 10;
      /** Stack height: icon + gap + year line (top baseline). */
      const stackH = isz + gapIconYear + yearFontPx * 1.15;
      const blockTop = Math.max(3, Math.floor((HEATMAP_HEADER_H - stackH) / 2));
      const iy = blockTop;
      if (c.set_type === "aggregate") {
        const aggH = isz + 10;
        const aggTop = Math.max(2, Math.floor((HEATMAP_HEADER_H - aggH - 14) / 2));
        ctx.fillStyle = dark ? "#1e293b" : "#e2e8f0";
        ctx.beginPath();
        ctx.roundRect(vx + 3, aggTop, HEATMAP_COL_WIDTH - 6, aggH, 6);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.font = "bold 12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.name, vx + HEATMAP_COL_WIDTH / 2, aggTop + aggH / 2 + 1);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = muted;
        ctx.font = "9px ui-monospace, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("Σ row", vx + HEATMAP_COL_WIDTH / 2, aggTop + aggH + 4);
        ctx.textAlign = "left";
        continue;
      }
      const icon = setImagesRef.current.get(c.code);
      const ix = vx + (HEATMAP_COL_WIDTH - isz) / 2;
      const hasSetIcon = Boolean(icon && icon.complete && icon.naturalWidth > 0);
      if (hasSetIcon) {
        ctx.save();
        ctx.fillStyle = dark ? "rgba(248, 250, 252, 0.96)" : "rgba(255, 255, 255, 0.98)";
        ctx.beginPath();
        ctx.roundRect(ix - 2, iy - 2, isz + 4, isz + 4, 7);
        ctx.fill();
        ctx.strokeStyle = dark ? "rgba(148, 163, 184, 0.55)" : "rgba(15, 23, 42, 0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.drawImage(icon!, ix, iy, isz, isz);
        ctx.restore();
      } else {
        ctx.fillStyle = dark ? "#27272a" : "#f4f4f5";
        const r = 6;
        ctx.beginPath();
        ctx.roundRect(ix, iy, isz, isz, r);
        ctx.fill();
        ctx.strokeStyle = dark ? "#3f3f46" : "#d4d4d8";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = dark ? "#fafafa" : "#18181b";
        ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.code.slice(0, 3).toUpperCase(), vx + HEATMAP_COL_WIDTH / 2, iy + isz / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      ctx.fillStyle = muted;
      ctx.font = `${yearFontPx}px ui-monospace, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(
        c.year != null ? String(c.year) : "—",
        vx + HEATMAP_COL_WIDTH / 2,
        iy + isz + gapIconYear,
      );
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      0,
      HEATMAP_HEADER_H,
      effFrozenColW + effRollupW,
      Math.max(0, vh - HEATMAP_HEADER_H),
    );
    ctx.clip();
    for (let r = firstRow; r <= lastRow; r++) {
      const row = rows[r];
      if (!row) continue;
      const docY = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT;
      const vy = docY - st;
      if (vy >= vh || vy + HEATMAP_ROW_HEIGHT <= HEATMAP_HEADER_H) continue;
      ctx.fillStyle = rowLabelBg;
      ctx.fillRect(0, vy, effFrozenColW + effRollupW, HEATMAP_ROW_HEIGHT);
      if (row.quick_pin_row) {
        ctx.fillStyle = dark ? "rgba(245, 158, 11, 0.22)" : "rgba(251, 191, 36, 0.18)";
        ctx.fillRect(0, vy, effFrozenColW + effRollupW, HEATMAP_ROW_HEIGHT);
      }
      if (row.pinned) {
        ctx.fillStyle = dark ? "rgba(168, 85, 247, 0.3)" : "rgba(147, 51, 234, 0.22)";
        ctx.fillRect(0, vy, effFrozenColW + effRollupW, HEATMAP_ROW_HEIGHT);
      }
      if (row.watchlisted) {
        ctx.fillStyle = dark ? "rgba(59, 130, 246, 0.26)" : "rgba(37, 99, 235, 0.18)";
        ctx.fillRect(0, vy, effFrozenColW + effRollupW, HEATMAP_ROW_HEIGHT);
      }
      if (row.owned_qty > 0) {
        ctx.fillStyle = dark ? "rgba(234, 179, 8, 0.24)" : "rgba(202, 138, 4, 0.2)";
        ctx.fillRect(0, vy, effFrozenColW + effRollupW, HEATMAP_ROW_HEIGHT);
      }
      ctx.strokeStyle = dark ? "#1f2937" : "#e5e7eb";
      ctx.strokeRect(0, vy, effFrozenColW + effRollupW, HEATMAP_ROW_HEIGHT);
      fillIdentityStrip(ctx, 0, vy, HEATMAP_IDENTITY_STRIP_W, HEATMAP_ROW_HEIGHT, row.color_identity);
      if (row.pinned) {
        ctx.fillStyle = dark ? "#a855f7" : "#9333ea";
        ctx.fillRect(0, vy, 3, HEATMAP_ROW_HEIGHT);
      } else if (row.watchlisted) {
        ctx.fillStyle = dark ? "#3b82f6" : "#2563eb";
        ctx.fillRect(0, vy, 3, HEATMAP_ROW_HEIGHT);
      } else if (row.owned_qty > 0) {
        ctx.fillStyle = dark ? "#eab308" : "#ca8a04";
        ctx.fillRect(0, vy, 3, HEATMAP_ROW_HEIGHT);
      }
      const midY = vy + HEATMAP_ROW_HEIGHT / 2;
      drawTypeGlyphInStrip(ctx, HEATMAP_IDENTITY_STRIP_W / 2, midY, typeLineToManaGlyph(row.type_line));
      const nameX = HEATMAP_IDENTITY_STRIP_W + 6;
      ctx.fillStyle = fg;
      ctx.font = "12px system-ui";
      const label = `${row.is_reserved ? "◆ " : ""}${row.name}`;
      const maxChars = 28;
      const truncated = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
      ctx.fillText(truncated, nameX, midY + 4);
      if (row.mana_cost) {
        drawManaCostRight(ctx, effFrozenColW - 4, midY + 4, row.mana_cost);
      }
      // Printings rollup column (right of name column).
      if (effRollupW > 0) {
        const rx0 = effFrozenColW;
        ctx.strokeStyle = dark ? "#374151" : "#cbd5e1";
        ctx.beginPath();
        ctx.moveTo(rx0 + 0.5, vy);
        ctx.lineTo(rx0 + 0.5, vy + HEATMAP_ROW_HEIGHT);
        ctx.stroke();
        ctx.fillStyle = muted;
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(String(row.printings_count ?? 0), rx0 + effRollupW - 6, midY + 1);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      if (row.owned_qty > 0) {
        ctx.fillStyle = dark ? "#fbbf24" : "#b45309";
        ctx.strokeStyle = dark ? "#fbbf24" : "#b45309";
        ctx.lineWidth = 1;
        ctx.strokeRect(1.5, vy + 1.5, effFrozenColW + effRollupW - 3, HEATMAP_ROW_HEIGHT - 3);
        ctx.font = "bold 9px ui-monospace";
        ctx.fillText(String(row.owned_qty), effFrozenColW - 14, midY + 3);
      }
    }
    ctx.restore();

    ctx.fillStyle = headerBg;
    ctx.fillRect(0, 0, effFrozenColW + effRollupW, HEATMAP_HEADER_H);
    ctx.strokeStyle = dark ? "#374151" : "#e5e7eb";
    ctx.strokeRect(0, 0, effFrozenColW + effRollupW, HEATMAP_HEADER_H);
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui";
    ctx.fillText("Card", 8, HEATMAP_HEADER_H / 2 + 4);
    ctx.fillText("▾", effFrozenColW - 12, HEATMAP_HEADER_H / 2 + 4);
    // Printings header.
    if (effRollupW > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(effFrozenColW, 0, effRollupW, HEATMAP_HEADER_H);
      ctx.clip();
      ctx.strokeStyle = dark ? "#374151" : "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(effFrozenColW + 0.5, 0);
      ctx.lineTo(effFrozenColW + 0.5, HEATMAP_HEADER_H);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Print", effFrozenColW + effRollupW / 2, HEATMAP_HEADER_H / 2 + 4);
      ctx.restore();
    }

    ctx.strokeStyle = dark ? "#4b5563" : "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(effFrozenColW + effRollupW + 0.5, 0);
    ctx.lineTo(effFrozenColW + effRollupW + 0.5, vh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(effFrozenColW + effRollupW + 0.5, HEATMAP_HEADER_H + 0.5);
    ctx.lineTo(vw + 0.5, HEATMAP_HEADER_H + 0.5);
    ctx.stroke();

    if (
      selectedRow >= 0 &&
      selectedCol >= 0 &&
      selectedCol < columns.length &&
      selectedRow < rows.length
    ) {
      const vx =
        effFrozenColW + effRollupW + selectedCol * HEATMAP_COL_WIDTH - sl;
      const vy = HEATMAP_HEADER_H + selectedRow * HEATMAP_ROW_HEIGHT - st;
      const dataX0 = effFrozenColW + effRollupW;
      const clipL = Math.max(vx, dataX0);
      const clipR = Math.min(vx + HEATMAP_COL_WIDTH, vw);
      if (
        clipR > clipL &&
        vy + HEATMAP_ROW_HEIGHT > HEATMAP_HEADER_H &&
        vy < vh
      ) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.strokeRect(clipL + 1, vy + 1, clipR - clipL - 2, HEATMAP_ROW_HEIGHT - 2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- epochs bump draw when fonts/icons finish loading (not referenced inside draw)
  }, [columns, dark, effFrozenColW, effRollupW, gridH, matchMode, priceMode, rows, selectedCol, selectedRow, setIconsEpoch, manaFontEpoch, totalW]);

  useEffect(() => {
    let cancelled = false;
    async function loadManaFont() {
      // Canvas text can render tofu boxes until the font is ready; ensure we redraw once it's available.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fonts = (globalThis as any).document?.fonts as FontFaceSet | undefined;
      if (!fonts?.load) return;
      try {
        await fonts.load('15px "Mana"');
        await fonts.ready;
      } catch {
        return;
      }
      if (cancelled) return;
      setManaFontEpoch((n) => n + 1);
    }
    void loadManaFont();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const col of columns) {
      if (col.set_type === "aggregate") continue;
      if (setImagesRef.current.has(col.code)) continue;
      const primary = col.icon_svg_path?.trim();
      const fallback = scryfallSetIconSvgUrl(col.code);
      const img = new Image();
      img.decoding = "async";
      let triedFallback = false;
      const usePrimary =
        Boolean(primary) &&
        // Avoid spamming 404s when local set icons are not deployed (common in hosted environments).
        !primary!.startsWith("/set-icons/");
      img.onload = () => {
        if (cancelled) return;
        setImagesRef.current.set(col.code, img);
        setSetIconsEpoch((n) => n + 1);
      };
      img.onerror = () => {
        if (cancelled || triedFallback || !usePrimary) return;
        triedFallback = true;
        img.src = fallback;
      };
      img.src = usePrimary ? primary! : fallback;
    }
    return () => {
      cancelled = true;
    };
  }, [columns]);

  useEffect(() => {
    draw();
  }, [draw]);

  const refreshHoverAfterScroll = useCallback(() => {
    const canvas = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvas || !scrollEl) return;
    const canvasRect = canvas.getBoundingClientRect();
    const sl = scrollEl.scrollLeft;
    const st = scrollEl.scrollTop;
    const aux = lastHoverAuxRef.current;
    if (aux?.kind === "name") {
      const anchor = readFrozenBodyRowAnchorRect({
        canvasRect,
        scrollLeft: sl,
        scrollTop: st,
        row: aux.row,
        frozenColW: effFrozenColW,
        rollupW: effRollupW,
      });
      onHoverFrozenRowBody?.(aux.row, anchor.left + anchor.width / 2, anchor.top + anchor.height / 2, anchor);
      return;
    }
    if (aux?.kind === "header") {
      const anchor = readSetHeaderAnchorRect({
        canvasRect,
        scrollLeft: sl,
        scrollTop: st,
        col: aux.col,
        frozenColW: effFrozenColW,
        rollupW: effRollupW,
      });
      onHoverEditionHeader?.(aux.col, anchor.left + anchor.width / 2, anchor.top + anchor.height / 2, anchor);
      return;
    }
    const h = lastHoverWithCellRef.current;
    if (!h) return;
    const cell = rows[h.r]?.cells[h.c] ?? null;
    if (!cellEligibleForHeatmapHoverPreview(cell, matchMode, priceMode)) {
      lastHoverWithCellRef.current = null;
      onLeaveGrid();
      return;
    }
    const a = readCellAnchorRectFromInputs({
      canvasRect,
      scrollLeft: sl,
      scrollTop: st,
      row: h.r,
      col: h.c,
      frozenColW: effFrozenColW,
      rollupW: effRollupW,
    });
    onHoverCell(h.r, h.c, cell, a.left + a.width / 2, a.top + a.height / 2, a);
  }, [
    rows,
    matchMode,
    priceMode,
    onHoverCell,
    onLeaveGrid,
    effFrozenColW,
    effRollupW,
    onHoverFrozenRowBody,
    onHoverEditionHeader,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    const port = portRef.current;
    if (!el) return;
    const onScroll = () => {
      draw();
      refreshHoverAfterScroll();
      onViewportChange?.();
    };
    const onResize = () => {
      setViewportW(el.clientWidth);
      draw();
      refreshHoverAfterScroll();
      onViewportChange?.();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    if (port) ro.observe(port);
    setViewportW(el.clientWidth);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [draw, onViewportChange, refreshHoverAfterScroll]);

  /** Wheel on port (capture) so it runs before the canvas; scroll element is only the spacer layer. */
  useEffect(() => {
    const port = portRef.current;
    const scroll = scrollRef.current;
    if (!port || !scroll) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      scroll.scrollTop += e.deltaY;
      scroll.scrollLeft += e.deltaX;
      e.preventDefault();
      e.stopPropagation();
    };
    port.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => port.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  /** Touch drag on the canvas scrolls the grid (canvas sits above the overflow scroll layer). */
  useEffect(() => {
    const canvas = canvasRef.current;
    const scroll = scrollRef.current;
    if (!canvas || !scroll) return;
    let touchId: number | null = null;
    let lastY = 0;
    let lastX = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchId = t.identifier;
      lastY = t.clientY;
      lastX = t.clientX;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchId == null || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.identifier !== touchId) return;
      const y = t.clientY;
      const x = t.clientX;
      scroll.scrollTop += lastY - y;
      scroll.scrollLeft += lastX - x;
      lastY = y;
      lastX = x;
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchId == null) return;
      if (e.changedTouches.length && [...e.changedTouches].some((c) => c.identifier === touchId)) {
        touchId = null;
      }
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const scrollEl = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollEl.scrollLeft;
    const y = e.clientY - rect.top + scrollEl.scrollTop;
    if (
      onCardNameHeaderClick &&
      y >= 0 &&
      y < HEATMAP_HEADER_H &&
      x >= 0 &&
      x < effFrozenColW
    ) {
      const br = canvas.getBoundingClientRect();
      onCardNameHeaderClick({
        left: br.left,
        top: br.top,
        width: effFrozenColW,
        height: HEATMAP_HEADER_H,
      });
      return;
    }
    if (
      onHeaderSetClick &&
      y >= 0 &&
      y < HEATMAP_HEADER_H &&
      x >= effFrozenColW + effRollupW &&
      columns.length > 0
    ) {
      const col = Math.floor((x - (effFrozenColW + effRollupW)) / HEATMAP_COL_WIDTH);
      if (col >= 0 && col < columns.length) {
        const code = columns[col]!.code;
        if (!code.startsWith("__")) onHeaderSetClick(code);
        return;
      }
    }
    const hit = clientPointToCell({
      clientX: e.clientX,
      clientY: e.clientY,
      canvasRect: rect,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
      columnsLength: columns.length,
      rowsLength: rows.length,
      frozenColW: effFrozenColW,
      rollupW: effRollupW,
    });
    if (!hit) return;
    onSelectCell(hit.row, hit.col);
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const scrollEl = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas) return;
    canvas.style.cursor = "crosshair";
    const rect = canvas.getBoundingClientRect();
    const hoverHit = clientPointToHeatmapHover({
      clientX: e.clientX,
      clientY: e.clientY,
      canvasRect: rect,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
      columnsLength: columns.length,
      rowsLength: rows.length,
      frozenColW: effFrozenColW,
      rollupW: effRollupW,
    });
    if (!hoverHit) {
      lastHoverWithCellRef.current = null;
      lastHoverAuxRef.current = null;
      onLeaveGrid();
      return;
    }
    if (hoverHit.kind === "cardNameHeader" || hoverHit.kind === "rollupHeader") {
      lastHoverWithCellRef.current = null;
      lastHoverAuxRef.current = null;
      onLeaveGrid();
      canvas.style.cursor = hoverHit.kind === "cardNameHeader" ? "pointer" : "crosshair";
      return;
    }
    if (hoverHit.kind === "nameColumn") {
      lastHoverWithCellRef.current = null;
      lastHoverAuxRef.current = { kind: "name", row: hoverHit.row };
      const anchor = readFrozenBodyRowAnchorRect({
        canvasRect: rect,
        scrollLeft: scrollEl.scrollLeft,
        scrollTop: scrollEl.scrollTop,
        row: hoverHit.row,
        frozenColW: effFrozenColW,
        rollupW: effRollupW,
      });
      onHoverFrozenRowBody?.(hoverHit.row, e.clientX, e.clientY, anchor);
      return;
    }
    if (hoverHit.kind === "setHeader") {
      lastHoverWithCellRef.current = null;
      lastHoverAuxRef.current = { kind: "header", col: hoverHit.col };
      const anchor = readSetHeaderAnchorRect({
        canvasRect: rect,
        scrollLeft: scrollEl.scrollLeft,
        scrollTop: scrollEl.scrollTop,
        col: hoverHit.col,
        frozenColW: effFrozenColW,
        rollupW: effRollupW,
      });
      onHoverEditionHeader?.(hoverHit.col, e.clientX, e.clientY, anchor);
      return;
    }
    lastHoverAuxRef.current = null;
    const cell = rows[hoverHit.row]?.cells[hoverHit.col] ?? null;
    if (!cellEligibleForHeatmapHoverPreview(cell, matchMode, priceMode)) {
      lastHoverWithCellRef.current = null;
      onLeaveGrid();
      return;
    }
    const anchor = readCellAnchorRectFromInputs({
      canvasRect: rect,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
      row: hoverHit.row,
      col: hoverHit.col,
      frozenColW: effFrozenColW,
      rollupW: effRollupW,
    });
    lastHoverWithCellRef.current = { r: hoverHit.row, c: hoverHit.col, cell: cell! };
    onHoverCell(hoverHit.row, hoverHit.col, cell!, e.clientX, e.clientY, anchor);
  };

  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    startX: number;
    startY: number;
    hit: { row: number; col: number } | null;
    fired: boolean;
  }>({ timer: null, startX: 0, startY: 0, hit: null, fired: false });

  const cancelLongPress = useCallback(() => {
    const lp = longPressRef.current;
    if (lp.timer) clearTimeout(lp.timer);
    lp.timer = null;
    lp.hit = null;
    lp.fired = false;
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch") return;
    const scrollEl = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hit = clientPointToCell({
      clientX: e.clientX,
      clientY: e.clientY,
      canvasRect: rect,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
      columnsLength: columns.length,
      rowsLength: rows.length,
      frozenColW: effFrozenColW,
      rollupW: effRollupW,
    });
    if (!hit) return;
    cancelLongPress();
    const lp = longPressRef.current;
    lp.startX = e.clientX;
    lp.startY = e.clientY;
    lp.hit = hit;
    lp.fired = false;
    lp.timer = setTimeout(() => {
      const cur = longPressRef.current;
      if (!cur.hit) return;
      cur.fired = true;
      onSelectCell(cur.hit.row, cur.hit.col);
    }, 420);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch") return;
    const lp = longPressRef.current;
    if (!lp.timer) return;
    const dx = e.clientX - lp.startX;
    const dy = e.clientY - lp.startY;
    if (dx * dx + dy * dy > 12 * 12) cancelLongPress();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch") return;
    const fired = longPressRef.current.fired;
    cancelLongPress();
    if (fired) e.preventDefault();
  };

  const onPortMouseLeave = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = "crosshair";
    (onLeaveInteractionPort ?? onLeaveGrid)();
  };

  return (
    <div className="relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col rounded-md border border-border">
      <div
        ref={setPortEl}
        className="relative isolate min-h-0 min-w-0 w-full max-w-full flex-1"
        onMouseLeave={onPortMouseLeave}
      >
        <div ref={scrollRef} className="absolute inset-0 z-0 overflow-auto overscroll-contain">
          <div className="pointer-events-none" style={{ width: totalW, height: totalH }} aria-hidden />
        </div>
        <canvas
          ref={canvasRef}
          className="pointer-events-auto absolute inset-0 z-10 block h-full w-full cursor-crosshair"
          onClick={onClick}
          onMouseMove={onMove}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
});
