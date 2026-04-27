"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  HEATMAP_COL_WIDTH,
  HEATMAP_FROZEN_COL_W,
  HEATMAP_HEADER_H,
  HEATMAP_ROW_HEIGHT,
} from "@/lib/constants";
import type { CellDTO, ColumnMeta, RowDTO } from "@/lib/heatmap-query";
import type { PriceMode } from "@/lib/price-scale";
import { priceToColor } from "@/lib/price-scale";

type Props = {
  columns: ColumnMeta[];
  rows: RowDTO[];
  priceMode: PriceMode;
  dark: boolean;
  selectedRow: number;
  selectedCol: number;
  onSelectCell: (row: number, col: number) => void;
  onHoverCell: (row: number, col: number, cell: CellDTO | null, x: number, y: number) => void;
  onLeaveGrid: () => void;
};

/** Viewport-sized canvas + off-screen scroll spacer so large grids stay GPU-friendly. */
export function HeatmapGrid({
  columns,
  rows,
  priceMode,
  dark,
  selectedRow,
  selectedCol,
  onSelectCell,
  onHoverCell,
  onLeaveGrid,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const firstCol = Math.max(0, Math.floor((sl - HEATMAP_FROZEN_COL_W) / HEATMAP_COL_WIDTH));
    const lastCol = Math.min(
      columns.length - 1,
      Math.ceil((sl + vw - HEATMAP_FROZEN_COL_W) / HEATMAP_COL_WIDTH) + 1,
    );
    const firstRow = Math.max(0, Math.floor((st - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT));
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
      if (vy + HEATMAP_ROW_HEIGHT < HEATMAP_HEADER_H || vy > vh) continue;
      for (let c = firstCol; c <= lastCol; c++) {
        const docX = HEATMAP_FROZEN_COL_W + c * HEATMAP_COL_WIDTH;
        const vx = docX - sl;
        if (vx + HEATMAP_COL_WIDTH < 0 || vx > vw) continue;
        const cell = row.cells[c];
        const dto = cell
          ? { usd: cell.usd, usd_foil: cell.usd_foil, eur: cell.eur, tix: cell.tix }
          : { usd: null, usd_foil: null, eur: null, tix: null };
        ctx.fillStyle = priceToColor(dto, priceMode, dark);
        ctx.fillRect(vx + 0.5, vy + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
        if (cell && row.best_deal_col === c) {
          ctx.fillStyle = dark ? "#fbbf24" : "#b45309";
          ctx.font = "10px system-ui";
          ctx.fillText("⬇", vx + 2, vy + 12);
        }
      }
    }

    ctx.strokeStyle = dark ? "#374151" : "#d1d5db";
    ctx.lineWidth = 1;
    const dataBottom = Math.min(vh, HEATMAP_HEADER_H + gridH - st);
    for (let c = firstCol; c <= lastCol; c++) {
      const vx = HEATMAP_FROZEN_COL_W + c * HEATMAP_COL_WIDTH - sl;
      if (vx + HEATMAP_COL_WIDTH < 0 || vx > vw) continue;
      ctx.beginPath();
      ctx.moveTo(vx + 0.5, HEATMAP_HEADER_H);
      ctx.lineTo(vx + 0.5, dataBottom);
      ctx.stroke();
    }
    for (let r = firstRow; r <= lastRow; r++) {
      const hY = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT - st;
      if (hY + HEATMAP_ROW_HEIGHT < HEATMAP_HEADER_H || hY > vh) continue;
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
      if (vx + HEATMAP_COL_WIDTH < HEATMAP_FROZEN_COL_W || vx > vw) continue;
      ctx.fillStyle = headerBg;
      ctx.fillRect(vx, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      ctx.strokeStyle = dark ? "#374151" : "#e5e7eb";
      ctx.strokeRect(vx, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      ctx.fillStyle = fg;
      ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(c.code, vx + 3, 14);
      ctx.fillStyle = muted;
      ctx.font = "9px ui-monospace";
      ctx.fillText(c.year != null ? String(c.year) : "—", vx + 3, HEATMAP_HEADER_H - 6);
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
      if (vy + HEATMAP_ROW_HEIGHT < HEATMAP_HEADER_H || vy > vh) continue;
      ctx.fillStyle = rowLabelBg;
      ctx.fillRect(0, vy, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      ctx.strokeStyle = dark ? "#1f2937" : "#e5e7eb";
      ctx.strokeRect(0, vy, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      ctx.fillStyle = fg;
      ctx.font = "12px system-ui";
      const label = `${row.is_reserved ? "◆ " : ""}${row.name}`;
      ctx.fillText(label.length > 34 ? `${label.slice(0, 32)}…` : label, 6, vy + HEATMAP_ROW_HEIGHT / 2 + 4);
      if (row.mana_cost) {
        ctx.fillStyle = muted;
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(row.mana_cost, HEATMAP_FROZEN_COL_W - 70, vy + HEATMAP_ROW_HEIGHT / 2 + 3);
      }
      if (row.owned_qty > 0) {
        ctx.fillStyle = dark ? "#fbbf24" : "#b45309";
        ctx.strokeStyle = dark ? "#fbbf24" : "#b45309";
        ctx.lineWidth = 1;
        ctx.strokeRect(1.5, vy + 1.5, HEATMAP_FROZEN_COL_W - 3, HEATMAP_ROW_HEIGHT - 3);
        ctx.font = "bold 9px ui-monospace";
        ctx.fillText(String(row.owned_qty), HEATMAP_FROZEN_COL_W - 16, vy + HEATMAP_ROW_HEIGHT / 2 + 3);
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
        vx + HEATMAP_COL_WIDTH > 0 &&
        vx < vw &&
        vy + HEATMAP_ROW_HEIGHT > HEATMAP_HEADER_H &&
        vy < vh
      ) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.strokeRect(vx + 1, vy + 1, HEATMAP_COL_WIDTH - 2, HEATMAP_ROW_HEIGHT - 2);
      }
    }
  }, [columns, dark, gridH, priceMode, rows, selectedCol, selectedRow, totalW]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => draw();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [draw]);

  const onWheelCanvas = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += e.deltaY;
    el.scrollLeft += e.deltaX;
    e.preventDefault();
  };

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
    const hit = clientToCell(e.clientX, e.clientY);
    if (!hit) return;
    onSelectCell(hit.row, hit.col);
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = clientToCell(e.clientX, e.clientY);
    if (!hit) {
      onLeaveGrid();
      return;
    }
    const cell = rows[hit.row]?.cells[hit.col] ?? null;
    onHoverCell(hit.row, hit.col, cell, e.clientX, e.clientY);
  };

  return (
    <div className="relative flex min-h-[420px] flex-1 flex-col rounded-md border border-border">
      <div
        ref={scrollRef}
        className="relative max-h-[calc(100vh-12rem)] min-h-[320px] flex-1 overflow-auto overscroll-contain"
        onMouseLeave={onLeaveGrid}
      >
        <div className="pointer-events-none" style={{ width: totalW, height: totalH }} aria-hidden />
        <canvas
          ref={canvasRef}
          className="pointer-events-auto absolute inset-0 z-10 block h-full w-full cursor-crosshair"
          onClick={onClick}
          onMouseMove={onMove}
          onWheel={onWheelCanvas}
        />
      </div>
    </div>
  );
}
