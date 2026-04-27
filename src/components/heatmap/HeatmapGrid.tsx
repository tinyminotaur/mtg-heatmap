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
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(totalW * dpr);
    canvas.height = Math.floor(totalH * dpr);
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bg = dark ? "#0a0a0a" : "#fafafa";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, totalW, totalH);

    const fg = dark ? "#e5e7eb" : "#111827";
    const muted = dark ? "#9ca3af" : "#6b7280";

    ctx.fillStyle = dark ? "#111827" : "#f3f4f6";
    ctx.fillRect(0, 0, totalW, HEATMAP_HEADER_H);
    ctx.fillRect(0, 0, HEATMAP_FROZEN_COL_W, totalH);

    ctx.fillStyle = muted;
    ctx.font = "11px system-ui";
    ctx.fillText("Card", 8, HEATMAP_HEADER_H / 2 + 4);

    columns.forEach((c, j) => {
      const x = HEATMAP_FROZEN_COL_W + j * HEATMAP_COL_WIDTH;
      ctx.strokeStyle = dark ? "#374151" : "#e5e7eb";
      ctx.strokeRect(x, 0, HEATMAP_COL_WIDTH, HEATMAP_HEADER_H);
      ctx.fillStyle = fg;
      ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(c.code, x + 3, 14);
      ctx.fillStyle = muted;
      ctx.font = "9px ui-monospace";
      ctx.fillText(c.year != null ? String(c.year) : "—", x + 3, HEATMAP_HEADER_H - 6);
    });

    const sl = scrollEl.scrollLeft;
    const st = scrollEl.scrollTop;
    const vw = scrollEl.clientWidth;
    const vh = scrollEl.clientHeight;
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

    for (let r = firstRow; r <= lastRow; r++) {
      const row = rows[r];
      const y = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT;
      ctx.fillStyle = dark ? "#0f172a" : "#ffffff";
      ctx.fillRect(0, y, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      ctx.strokeStyle = dark ? "#1f2937" : "#e5e7eb";
      ctx.strokeRect(0, y, HEATMAP_FROZEN_COL_W, HEATMAP_ROW_HEIGHT);
      ctx.fillStyle = fg;
      ctx.font = "12px system-ui";
      const label = `${row.is_reserved ? "◆ " : ""}${row.name}`;
      ctx.fillText(label.length > 34 ? `${label.slice(0, 32)}…` : label, 6, y + HEATMAP_ROW_HEIGHT / 2 + 4);
      if (row.mana_cost) {
        ctx.fillStyle = muted;
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(row.mana_cost, HEATMAP_FROZEN_COL_W - 70, y + HEATMAP_ROW_HEIGHT / 2 + 3);
      }
      if (row.owned_qty > 0) {
        ctx.fillStyle = dark ? "#fbbf24" : "#b45309";
        ctx.strokeStyle = dark ? "#fbbf24" : "#b45309";
        ctx.lineWidth = 1;
        ctx.strokeRect(1.5, y + 1.5, HEATMAP_FROZEN_COL_W - 3, HEATMAP_ROW_HEIGHT - 3);
        ctx.font = "bold 9px ui-monospace";
        ctx.fillText(String(row.owned_qty), HEATMAP_FROZEN_COL_W - 16, y + HEATMAP_ROW_HEIGHT / 2 + 3);
      }
    }

    for (let c = firstCol; c <= lastCol; c++) {
      const x = HEATMAP_FROZEN_COL_W + c * HEATMAP_COL_WIDTH;
      ctx.fillStyle = dark ? "#111827" : "#f3f4f6";
      ctx.fillRect(x, HEATMAP_HEADER_H, HEATMAP_COL_WIDTH, gridH);
    }

    for (let r = firstRow; r <= lastRow; r++) {
      const row = rows[r];
      const y = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT;
      for (let c = firstCol; c <= lastCol; c++) {
        const cell = row.cells[c];
        const x = HEATMAP_FROZEN_COL_W + c * HEATMAP_COL_WIDTH;
        const dto = cell
          ? { usd: cell.usd, usd_foil: cell.usd_foil, eur: cell.eur, tix: cell.tix }
          : { usd: null, usd_foil: null, eur: null, tix: null };
        ctx.fillStyle = priceToColor(dto, priceMode, dark);
        ctx.fillRect(x + 0.5, y + 0.5, HEATMAP_COL_WIDTH - 1, HEATMAP_ROW_HEIGHT - 1);
        if (cell && row.best_deal_col === c) {
          ctx.fillStyle = dark ? "#fbbf24" : "#b45309";
          ctx.font = "10px system-ui";
          ctx.fillText("⬇", x + 2, y + 12);
        }
      }
    }

    ctx.strokeStyle = dark ? "#374151" : "#d1d5db";
    ctx.lineWidth = 1;
    for (let c = firstCol; c <= lastCol; c++) {
      const x = HEATMAP_FROZEN_COL_W + c * HEATMAP_COL_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, HEATMAP_HEADER_H);
      ctx.lineTo(x + 0.5, totalH);
      ctx.stroke();
    }
    for (let r = firstRow; r <= lastRow; r++) {
      const y = HEATMAP_HEADER_H + r * HEATMAP_ROW_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(HEATMAP_FROZEN_COL_W, y + 0.5);
      ctx.lineTo(totalW, y + 0.5);
      ctx.stroke();
    }

    if (selectedRow >= 0 && selectedCol >= 0) {
      const x = HEATMAP_FROZEN_COL_W + selectedCol * HEATMAP_COL_WIDTH;
      const y = HEATMAP_HEADER_H + selectedRow * HEATMAP_ROW_HEIGHT;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, HEATMAP_COL_WIDTH - 2, HEATMAP_ROW_HEIGHT - 2);
    }
  }, [columns, dark, gridH, priceMode, rows, selectedCol, selectedRow, totalH, totalW]);

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

  const clientToCell = (clientX: number, clientY: number) => {
    const scrollEl = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < HEATMAP_FROZEN_COL_W || y < HEATMAP_HEADER_H) return null;
    const col = Math.floor((x - HEATMAP_FROZEN_COL_W) / HEATMAP_COL_WIDTH);
    const row = Math.floor((y - HEATMAP_HEADER_H) / HEATMAP_ROW_HEIGHT);
    if (col < 0 || col >= columns.length || row < 0 || row >= rows.length) return null;
    return { row, col };
  };

  const onClick = (e: React.MouseEvent) => {
    const hit = clientToCell(e.clientX, e.clientY);
    if (!hit) return;
    onSelectCell(hit.row, hit.col);
  };

  const onMove = (e: React.MouseEvent) => {
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
        className="relative max-h-[calc(100vh-12rem)] flex-1 overflow-auto overscroll-contain"
        onMouseLeave={onLeaveGrid}
      >
        <canvas ref={canvasRef} className="block cursor-crosshair" onClick={onClick} onMouseMove={onMove} />
      </div>
    </div>
  );
}
