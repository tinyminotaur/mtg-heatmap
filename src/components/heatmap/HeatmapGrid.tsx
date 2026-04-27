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
  HEATMAP_HEADER_H,
  HEATMAP_IDENTITY_STRIP_W,
  HEATMAP_ROW_HEIGHT,
} from "@/lib/constants";
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

export type HeatmapCellAnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type HeatmapGridHandle = {
  getDataCellClientRect: (row: number, col: number) => HeatmapCellAnchorRect | null;
  /** Scroll the scroll port so the data cell (row, col) is visible; no-op if already in view. */
  scrollCellIntoView: (row: number, col: number) => void;
};

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
  /** When the pointer leaves the grid toward this element, do not dismiss hover (card preview). */
  cardPreviewContainerRef?: RefObject<HTMLElement | null>;
  /** Fires after scroll/resize redraw so the parent can re-read cell anchors (pinned preview). */
  onViewportChange?: () => void;
  /** Same node as the scroll port (canvas parent); used for “click outside” with pinned preview. */
  interactionPortRef?: RefObject<HTMLDivElement | null>;
  /** §11.5.6 — click a set header to temporarily sort rows by that column’s USD price. */
  onHeaderSetClick?: (setCode: string) => void;
};

function readCellAnchorRect(
  canvas: HTMLCanvasElement,
  scrollEl: HTMLDivElement,
  row: number,
  col: number,
): HeatmapCellAnchorRect {
  const canvasRect = canvas.getBoundingClientRect();
  const sl = scrollEl.scrollLeft;
  const st = scrollEl.scrollTop;
  return {
    left: canvasRect.left + HEATMAP_FROZEN_COL_W + col * HEATMAP_COL_WIDTH - sl,
    top: canvasRect.top + HEATMAP_HEADER_H + row * HEATMAP_ROW_HEIGHT - st,
    width: HEATMAP_COL_WIDTH,
    height: HEATMAP_ROW_HEIGHT,
  };
}

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
  const by = vy + HEATMAP_ROW_HEIGHT - ph - 2 - stackIndex * (ph + 3);
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

function drawCellPriceLabel(
  ctx: CanvasRenderingContext2D,
  vx: number,
  vy: number,
  text: string,
  dark: boolean,
  emphasis: boolean,
) {
  /** Top of cell so we do not collide with Lowest/Highest badges (bottom-right). */
  const x = vx + 3;
  const y = vy + 3;
  const maxW = HEATMAP_COL_WIDTH - 6;
  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
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
    ctx.strokeText(text, x, y);
    ctx.fillStyle = dark ? "#f9fafb" : "#111827";
    ctx.fillText(text, x, y);
  } else {
    ctx.fillStyle = dark ? "rgba(156,163,175,0.98)" : "rgba(82,82,91,0.98)";
    ctx.fillText(text, x, y);
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
    cardPreviewContainerRef,
    onViewportChange,
    interactionPortRef,
    onHeaderSetClick,
  },
  ref,
) {
  /** Scroll port (spacer only); canvas is a sibling overlay so it never moves with scroll offset. */
  const portRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setImagesRef = useRef(new Map<string, HTMLImageElement>());
  const [setIconsEpoch, setSetIconsEpoch] = useState(0);
  const lastHoverWithCellRef = useRef<{ r: number; c: number; cell: CellDTO } | null>(null);

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
        return readCellAnchorRect(canvas, scrollEl, row, col);
      },
      scrollCellIntoView(row: number, col: number) {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        if (row < 0 || col < 0 || row >= rows.length || col >= columns.length) return;

        const pad = 12;
        const cellLeft = HEATMAP_FROZEN_COL_W + col * HEATMAP_COL_WIDTH;
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
    [rows.length, columns.length, onViewportChange],
  );

  const gridW = columns.length * HEATMAP_COL_WIDTH;
  const gridH = rows.length * HEATMAP_ROW_HEIGHT;
  const totalW = HEATMAP_FROZEN_COL_W + gridW;
  const totalH = HEATMAP_HEADER_H + gridH;

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

    const firstCol = Math.max(0, Math.floor((sl - HEATMAP_FROZEN_COL_W) / HEATMAP_COL_WIDTH) - 1);
    const lastCol = Math.min(
      columns.length - 1,
      Math.ceil((sl + vw - HEATMAP_FROZEN_COL_W) / HEATMAP_COL_WIDTH) + 1,
    );
    const firstRow = Math.max(0, Math.floor((st - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT) - 1);
    const lastRow = Math.min(
      rows.length - 1,
      Math.ceil((st + vh - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT) + 1,
    );

    // Scrollable data area only (never paint under frozen headers)
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      HEATMAP_FROZEN_COL_W,
      HEATMAP_HEADER_H,
      Math.max(0, vw - HEATMAP_FROZEN_COL_W),
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
        const docX = HEATMAP_FROZEN_COL_W + c * HEATMAP_COL_WIDTH;
        const vx = docX - sl;
        if (vx >= vw || vx + HEATMAP_COL_WIDTH <= HEATMAP_FROZEN_COL_W) continue;
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
          if (row.pinned) {
            ctx.fillStyle = dark ? "rgba(168, 85, 247, 0.22)" : "rgba(147, 51, 234, 0.16)";
            ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
          }
          if (cell.owned_qty > 0) {
            ctx.strokeStyle = dark ? "#eab308" : "#ca8a04";
            ctx.lineWidth = 2;
            ctx.strokeRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 2, HEATMAP_ROW_HEIGHT - 2);
          }
          if (cell.watchlisted) {
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = cell.owned_qty > 0 ? 1.5 : 2;
            ctx.setLineDash(cell.owned_qty > 0 ? [3, 2] : []);
            ctx.strokeRect(vx + 1.5, vy + 1.5, HEATMAP_COL_WIDTH - 4, HEATMAP_ROW_HEIGHT - 4);
            ctx.setLineDash([]);
          }
        }
        if (contextDim) {
          ctx.fillStyle = dark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.5)";
          ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
        }
        if (cell && !strictHide) {
          const priceLabel = formatHeatmapCellPriceLabel(cell, priceMode);
          drawCellPriceLabel(ctx, vx, vy, priceLabel ?? "—", dark, priceLabel != null);
          const badges: { label: string; variant: "low" | "high" }[] = [];
          if (row.price_low_cols.includes(c)) badges.push({ label: "Lowest", variant: "low" });
          if (row.price_high_cols.includes(c)) badges.push({ label: "Highest", variant: "high" });
          badges.forEach((b, i) => drawPriceRangeBadge(ctx, vx, vy, b.label, b.variant, dark, i));
        }
      }
    }

    ctx.strokeStyle = dark ? "#374151" : "#d1d5db";
    ctx.lineWidth = 1;
    const dataBottom = Math.min(vh, HEATMAP_HEADER_H + gridH - st);
    for (let c = firstCol; c <= lastCol; c++) {
      const vx = HEATMAP_FROZEN_COL_W + c * HEATMAP_COL_WIDTH - sl;
      if (vx >= vw || vx + HEATMAP_COL_WIDTH <= HEATMAP_FROZEN_COL_W) continue;
      ctx.beginPath();
      ctx.moveTo(vx + 0.5, HEATMAP_HEADER_H);
      ctx.lineTo(vx + 0.5, dataBottom);
      ctx.stroke();
    }
    for (let r = firstRow; r <= lastRow; r++) {
      const hY = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT - st;
      if (hY >= vh || hY + HEATMAP_ROW_HEIGHT <= HEATMAP_HEADER_H) continue;
      const x0 = HEATMAP_FROZEN_COL_W;
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
    ctx.rect(HEATMAP_FROZEN_COL_W, 0, Math.max(0, vw - HEATMAP_FROZEN_COL_W), HEATMAP_HEADER_H);
    ctx.clip();
    for (let j = firstCol; j <= lastCol; j++) {
      const c = columns[j];
      if (!c) continue;
      const vx = HEATMAP_FROZEN_COL_W + j * HEATMAP_COL_WIDTH - sl;
      if (vx >= vw || vx + HEATMAP_COL_WIDTH <= HEATMAP_FROZEN_COL_W) continue;
      ctx.fillStyle = headerBg;
      ctx.fillRect(vx, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      ctx.strokeStyle = dark ? "#374151" : "#e5e7eb";
      ctx.strokeRect(vx, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      const isz = 30;
      const iy = 5;
      if (c.set_type === "aggregate") {
        ctx.fillStyle = dark ? "#1e293b" : "#e2e8f0";
        ctx.beginPath();
        ctx.roundRect(vx + 3, iy, HEATMAP_COL_WIDTH - 6, isz + 10, 6);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.font = "bold 12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.name, vx + HEATMAP_COL_WIDTH / 2, iy + (isz + 10) / 2 + 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = muted;
        ctx.font = "9px ui-monospace, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Σ row", vx + HEATMAP_COL_WIDTH / 2, HEATMAP_HEADER_H - 6);
        ctx.textAlign = "left";
        continue;
      }
      const icon = setImagesRef.current.get(c.code);
      const ix = vx + (HEATMAP_COL_WIDTH - isz) / 2;
      if (icon && icon.complete && icon.naturalWidth > 0) {
        ctx.save();
        ctx.fillStyle = dark ? "rgba(248, 250, 252, 0.96)" : "rgba(255, 255, 255, 0.98)";
        ctx.beginPath();
        ctx.roundRect(ix - 2, iy - 2, isz + 4, isz + 4, 7);
        ctx.fill();
        ctx.strokeStyle = dark ? "rgba(148, 163, 184, 0.55)" : "rgba(15, 23, 42, 0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.drawImage(icon, ix, iy, isz, isz);
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
      ctx.fillStyle = fg;
      ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(c.code.toUpperCase(), vx + HEATMAP_COL_WIDTH / 2, iy + isz + 14);
      ctx.textAlign = "left";
      ctx.fillStyle = muted;
      ctx.font = "10px ui-monospace, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(c.year != null ? String(c.year) : "—", vx + HEATMAP_COL_WIDTH / 2, HEATMAP_HEADER_H - 6);
      ctx.textAlign = "left";
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEATMAP_HEADER_H, HEATMAP_FROZEN_COL_W, Math.max(0, vh - HEATMAP_HEADER_H));
    ctx.clip();
    for (let r = firstRow; r <= lastRow; r++) {
      const row = rows[r];
      if (!row) continue;
      const docY = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT;
      const vy = docY - st;
      if (vy >= vh || vy + HEATMAP_ROW_HEIGHT <= HEATMAP_HEADER_H) continue;
      ctx.fillStyle = rowLabelBg;
      ctx.fillRect(0, vy, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      if (row.pinned) {
        ctx.fillStyle = dark ? "rgba(168, 85, 247, 0.2)" : "rgba(147, 51, 234, 0.14)";
        ctx.fillRect(0, vy, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      }
      if (row.watchlisted) {
        ctx.fillStyle = dark ? "rgba(59, 130, 246, 0.16)" : "rgba(37, 99, 235, 0.12)";
        ctx.fillRect(0, vy, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      }
      if (row.owned_qty > 0) {
        ctx.fillStyle = dark ? "rgba(234, 179, 8, 0.14)" : "rgba(202, 138, 4, 0.12)";
        ctx.fillRect(0, vy, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      }
      ctx.strokeStyle = dark ? "#1f2937" : "#e5e7eb";
      ctx.strokeRect(0, vy, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      fillIdentityStrip(ctx, 0, vy, HEATMAP_IDENTITY_STRIP_W, HEATMAP_ROW_HEIGHT, row.color_identity);
      const midY = vy + HEATMAP_ROW_HEIGHT / 2;
      drawTypeGlyphInStrip(ctx, HEATMAP_IDENTITY_STRIP_W / 2, midY, typeLineToManaGlyph(row.type_line));
      const nameX = HEATMAP_IDENTITY_STRIP_W + 6;
      ctx.fillStyle = fg;
      ctx.font = "12px system-ui";
      const label = `${row.is_reserved ? "◆ " : ""}${row.name}`;
      const maxChars = 34;
      const truncated = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
      ctx.fillText(truncated, nameX, midY + 4);
      if (row.mana_cost) {
        drawManaCostRight(ctx, HEATMAP_FROZEN_COL_W - 4, midY + 4, row.mana_cost);
      }
      if (row.owned_qty > 0) {
        ctx.fillStyle = dark ? "#fbbf24" : "#b45309";
        ctx.strokeStyle = dark ? "#fbbf24" : "#b45309";
        ctx.lineWidth = 1;
        ctx.strokeRect(1.5, vy + 1.5, HEATMAP_FROZEN_COL_W - 3, HEATMAP_ROW_HEIGHT - 3);
        ctx.font = "bold 9px ui-monospace";
        ctx.fillText(String(row.owned_qty), HEATMAP_FROZEN_COL_W - 14, midY + 3);
      }
    }
    ctx.restore();

    ctx.fillStyle = headerBg;
    ctx.fillRect(0, 0, HEATMAP_FROZEN_COL_W, HEATMAP_HEADER_H);
    ctx.strokeStyle = dark ? "#374151" : "#e5e7eb";
    ctx.strokeRect(0, 0, HEATMAP_FROZEN_COL_W, HEATMAP_HEADER_H);
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui";
    ctx.fillText("Card", 8, HEATMAP_HEADER_H / 2 + 4);

    ctx.strokeStyle = dark ? "#4b5563" : "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HEATMAP_FROZEN_COL_W + 0.5, 0);
    ctx.lineTo(HEATMAP_FROZEN_COL_W + 0.5, vh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(HEATMAP_FROZEN_COL_W + 0.5, HEATMAP_HEADER_H + 0.5);
    ctx.lineTo(vw + 0.5, HEATMAP_HEADER_H + 0.5);
    ctx.stroke();

    if (
      selectedRow >= 0 &&
      selectedCol >= 0 &&
      selectedCol < columns.length &&
      selectedRow < rows.length
    ) {
      const vx = HEATMAP_FROZEN_COL_W + selectedCol * HEATMAP_COL_WIDTH - sl;
      const vy = HEATMAP_HEADER_H + selectedRow * HEATMAP_ROW_HEIGHT - st;
      if (
        vx + HEATMAP_COL_WIDTH > HEATMAP_FROZEN_COL_W &&
        vx < vw &&
        vy + HEATMAP_ROW_HEIGHT > HEATMAP_HEADER_H &&
        vy < vh
      ) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.strokeRect(vx + 1, vy + 1, HEATMAP_COL_WIDTH - 2, HEATMAP_ROW_HEIGHT - 2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setIconsEpoch bumps draw when set SVGs finish loading (not referenced inside draw)
  }, [columns, dark, gridH, matchMode, priceMode, rows, selectedCol, selectedRow, setIconsEpoch, totalW]);

  useEffect(() => {
    let cancelled = false;
    for (const col of columns) {
      if (col.set_type === "aggregate") continue;
      if (setImagesRef.current.has(col.code)) continue;
      const primary = col.icon_svg_path?.trim();
      const fallback = `https://svgs.scryfall.io/sets/${col.code.toLowerCase()}.svg`;
      const img = new Image();
      img.decoding = "async";
      let triedFallback = false;
      img.onload = () => {
        if (cancelled) return;
        setImagesRef.current.set(col.code, img);
        setSetIconsEpoch((n) => n + 1);
      };
      img.onerror = () => {
        if (cancelled || triedFallback || !primary) return;
        triedFallback = true;
        img.src = fallback;
      };
      img.src = primary || fallback;
    }
    return () => {
      cancelled = true;
    };
  }, [columns]);

  useEffect(() => {
    draw();
  }, [draw]);

  const refreshHoverAfterScroll = useCallback(() => {
    const h = lastHoverWithCellRef.current;
    if (!h) return;
    const canvas = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvas || !scrollEl) return;
    const cell = rows[h.r]?.cells[h.c] ?? null;
    if (!cellEligibleForHeatmapHoverPreview(cell, matchMode, priceMode)) {
      lastHoverWithCellRef.current = null;
      onLeaveGrid();
      return;
    }
    const a = readCellAnchorRect(canvas, scrollEl, h.r, h.c);
    onHoverCell(h.r, h.c, cell, a.left + a.width / 2, a.top + a.height / 2, a);
  }, [rows, matchMode, priceMode, onHoverCell, onLeaveGrid]);

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
      draw();
      refreshHoverAfterScroll();
      onViewportChange?.();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    if (port) ro.observe(port);
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

  const clientToCell = (clientX: number, clientY: number) => {
    const scrollEl = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left + scrollEl.scrollLeft;
    const y = clientY - rect.top + scrollEl.scrollTop;
    if (x < HEATMAP_FROZEN_COL_W || y < HEATMAP_HEADER_H) return null;
    const col = Math.floor((x - HEATMAP_FROZEN_COL_W) / HEATMAP_COL_WIDTH);
    const row = Math.floor((y - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT);
    if (col < 0 || col >= columns.length || row < 0 || row >= rows.length) return null;
    return { row, col };
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const scrollEl = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollEl.scrollLeft;
    const y = e.clientY - rect.top + scrollEl.scrollTop;
    if (
      onHeaderSetClick &&
      y >= 0 &&
      y < HEATMAP_HEADER_H &&
      x >= HEATMAP_FROZEN_COL_W &&
      columns.length > 0
    ) {
      const col = Math.floor((x - HEATMAP_FROZEN_COL_W) / HEATMAP_COL_WIDTH);
      if (col >= 0 && col < columns.length) {
        const code = columns[col]!.code;
        if (!code.startsWith("__")) onHeaderSetClick(code);
        return;
      }
    }
    const hit = clientToCell(e.clientX, e.clientY);
    if (!hit) return;
    onSelectCell(hit.row, hit.col);
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = clientToCell(e.clientX, e.clientY);
    if (!hit) {
      lastHoverWithCellRef.current = null;
      onLeaveGrid();
      return;
    }
    const canvas = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvas || !scrollEl) return;
    const cell = rows[hit.row]?.cells[hit.col] ?? null;
    if (!cellEligibleForHeatmapHoverPreview(cell, matchMode, priceMode)) {
      lastHoverWithCellRef.current = null;
      onLeaveGrid();
      return;
    }
    const anchor = readCellAnchorRect(canvas, scrollEl, hit.row, hit.col);
    lastHoverWithCellRef.current = { r: hit.row, c: hit.col, cell: cell! };
    onHoverCell(hit.row, hit.col, cell!, e.clientX, e.clientY, anchor);
  };

  const onPortMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    const next = e.relatedTarget;
    const previewEl = cardPreviewContainerRef?.current;
    if (previewEl && next instanceof Node && previewEl.contains(next)) return;
    onLeaveGrid();
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
        />
      </div>
    </div>
  );
});
