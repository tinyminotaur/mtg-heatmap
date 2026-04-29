"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CellDTO, ColumnMeta, RowDTO } from "@/lib/heatmap-query";
import type { PriceMode } from "@/lib/price-scale";
import { cardImageUrlForDetail } from "@/lib/card-image-urls";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: RowDTO;
  columns: ColumnMeta[];
  /** Initially focused printing column (from selection). */
  initialCol: number;
  priceMode: PriceMode;
  oraclePinned: boolean;
  onTogglePinOracle: () => void;
  onToggleOwnedPrinting: (cell: CellDTO) => void;
  onToggleWatchPrinting: (cell: CellDTO) => void;
  onRemoveOneOwned: (cell: CellDTO) => void;
  onJumpToPrinting: (col: number) => void;
};

export function HeatmapCardInspectDialog({
  open,
  onOpenChange,
  row,
  columns,
  initialCol,
  priceMode,
  oraclePinned,
  onTogglePinOracle,
  onToggleOwnedPrinting,
  onToggleWatchPrinting,
  onRemoveOneOwned,
  onJumpToPrinting,
}: Props) {
  const [focusCol, setFocusCol] = useState(initialCol);
  const [lockedCol, setLockedCol] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setFocusCol(initialCol);
      setLockedCol(initialCol);
      setHoverCol(null);
    }
  }, [open, initialCol]);

  const printingRows = useMemo(() => {
    const out: { col: number; meta: ColumnMeta; cell: CellDTO }[] = [];
    for (let c = 0; c < columns.length; c++) {
      const cell = row.cells[c];
      const meta = columns[c];
      if (!cell || !meta) continue;
      out.push({ col: c, meta, cell });
    }
    return out;
  }, [row, columns]);

  const previewCol = lockedCol ?? hoverCol ?? focusCol;
  const previewCell =
    previewCol >= 0 && previewCol < row.cells.length ? (row.cells[previewCol] ?? null) : null;
  const previewUrl = previewCell ? cardImageUrlForDetail(previewCell) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,880px)] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
            <DialogTitle className="text-lg leading-tight">{row.name}</DialogTitle>
            <Button
              type="button"
              size="sm"
              variant={oraclePinned ? "secondary" : "outline"}
              onClick={() => onTogglePinOracle()}
            >
              {oraclePinned ? "Pinned card ✓" : "Pin card"}
            </Button>
          </div>
          {row.type_line ? (
            <p className="mt-1 text-xs text-muted-foreground">{row.type_line}</p>
          ) : null}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:flex-row">
          <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3 md:w-[200px] md:border-b-0 md:border-r">
            <p className="text-xs font-medium text-muted-foreground">Art preview</p>
            <div className="relative aspect-[5/7] w-full max-w-[180px] overflow-hidden rounded-md border border-border bg-muted/20 md:mx-auto">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="size-full object-contain"
                  decoding="async"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hover a printing row for a quick preview; click a row to lock its art. Selected column matches the
              heatmap.
            </p>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Printings on this heatmap
            </p>
            <ul className="space-y-2">
              {printingRows.map(({ col, meta, cell }) => {
                const active = col === focusCol;
                const setLabel =
                  meta.set_type === "aggregate"
                    ? `${meta.name}${cell.source_set_name ? ` · ${cell.source_set_name}` : ""}`
                    : `${meta.name} (${meta.release_date ?? meta.code})`;
                return (
                  <li key={`${col}-${meta.code}`}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/15 hover:bg-muted/40",
                      )}
                      onMouseEnter={() => setHoverCol(col)}
                      onMouseLeave={() => setHoverCol(null)}
                      onClick={() => {
                        setLockedCol(col);
                        setFocusCol(col);
                        onJumpToPrinting(col);
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{setLabel}</div>
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                            USD {cell.usd ?? "—"} · Foil {cell.usd_foil ?? "—"} · EUR {cell.eur ?? "—"} · Tix{" "}
                            {cell.tix ?? "—"}
                          </div>
                          {cell.rarity ? (
                            <div className="text-[11px] text-muted-foreground">Rarity: {cell.rarity}</div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={cell.watchlisted ? "secondary" : "outline"}
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onToggleWatchPrinting(cell);
                            }}
                          >
                            Watchlist
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={cell.owned_qty > 0 ? "secondary" : "outline"}
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onToggleOwnedPrinting(cell);
                            }}
                          >
                            Owned{cell.owned_qty > 0 ? ` (${cell.owned_qty})` : ""}
                          </Button>
                          {cell.owned_qty > 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                void onRemoveOneOwned(cell);
                              }}
                            >
                              −1
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {printingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No printings in the current column scope.</p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Price mode for banding elsewhere: <span className="font-mono">{priceMode}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
