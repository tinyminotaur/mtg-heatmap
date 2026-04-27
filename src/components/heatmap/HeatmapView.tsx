"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/app-theme-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cardImageUrlForDetail, cardImageUrlForPreview } from "@/lib/card-image-urls";
import { formatPriceKind, getHeatmapPriceRange } from "@/lib/heatmap-best-deal";
import type { CellDTO, ColumnMeta, RowDTO } from "@/lib/heatmap-query";
import type { PriceMode } from "@/lib/price-scale";
import { normalizedColSort, normalizedRowSort, parseHeatmapUrlSearchParams } from "@/lib/heatmap-url-params";
import { HeatmapCommandPalette } from "./HeatmapCommandPalette";
import { HeatmapFilterBar } from "./HeatmapFilterBar";
import { HeatmapFilterColumns } from "./HeatmapFilterColumns";
import { HeatmapGrid, type HeatmapCellAnchorRect, type HeatmapGridHandle } from "./HeatmapGrid";
import { Legend } from "./Legend";
import { Separator } from "@/components/ui/separator";
import { Maximize2, X } from "lucide-react";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

type HeatmapResponse = { columns: ColumnMeta[]; rows: RowDTO[]; total: number };

const RARITIES = ["common", "uncommon", "rare", "mythic", "special", "bonus"] as const;

/** Floating preview: vertical card + text needs width; height used for viewport clamping. */
const PREVIEW_PANEL_W = 400;
const PREVIEW_APPROX_H = 480;

function computeFloatingPreviewPosition(
  anchor: HeatmapCellAnchorRect | null | undefined,
  fallbackX: number,
  fallbackY: number,
): { left: number; top: number; width: number } {
  const pad = 10;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const overlap = 4;
  const gap = 6 - overlap;
  let left: number;
  let top: number;
  if (anchor && anchor.width > 0) {
    const rightSide = anchor.left + anchor.width + gap;
    const leftSide = anchor.left - PREVIEW_PANEL_W - gap;
    if (rightSide + PREVIEW_PANEL_W <= vw - pad) left = rightSide;
    else if (leftSide >= pad) left = leftSide;
    else left = Math.max(pad, Math.min(rightSide, vw - PREVIEW_PANEL_W - pad));
    top = anchor.top + (anchor.height - PREVIEW_APPROX_H) / 2;
    top = Math.max(pad, Math.min(top, vh - PREVIEW_APPROX_H - pad));
  } else {
    left = Math.max(pad, Math.min(fallbackX + 12, vw - PREVIEW_PANEL_W - pad));
    top = Math.max(pad, Math.min(fallbackY + 12, vh - PREVIEW_APPROX_H - pad));
  }
  return { left, top, width: PREVIEW_PANEL_W };
}

function HeatmapPriceRangeCallout({
  row,
  activeCol,
  columns,
  variant = "default",
}: {
  row: RowDTO | undefined;
  activeCol: number;
  columns: ColumnMeta[];
  variant?: "default" | "compact";
}) {
  const range = getHeatmapPriceRange(row);
  if (!range) return null;
  const compact = variant === "compact";
  const onLow = range.lowCols.includes(activeCol);
  const onHigh = range.highCols.includes(activeCol);
  const lowStr = range.lowAmount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const highStr = range.highAmount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const lowCol = columns[range.lowCols[0]];
  const highCol = columns[range.highCols[0]];
  if (!lowCol || !highCol) return null;
  const borderClass =
    onLow && !onHigh
      ? "border-cyan-500/55 bg-cyan-500/10 dark:border-cyan-400/45 dark:bg-cyan-400/10"
      : onHigh && !onLow
        ? "border-rose-500/55 bg-rose-500/10 dark:border-rose-400/45 dark:bg-rose-400/10"
        : "border-border bg-muted/35";
  return (
    <div
      className={cn(
        "rounded-md border leading-snug",
        compact ? "space-y-1 p-2 text-[11px]" : "space-y-1.5 p-2.5 text-xs",
        borderClass,
      )}
    >
      <p className="font-semibold text-foreground">Price range on this heatmap</p>
      {compact ? (
        <p className="text-muted-foreground">
          <span className="font-semibold text-cyan-800 dark:text-cyan-200">Lowest</span>:{" "}
          <span className="font-mono">${lowStr}</span> ({formatPriceKind(range.lowPricedAsFoil)}) in{" "}
          <span className="font-mono">{lowCol.code.toUpperCase()}</span>
          {" · "}
          <span className="font-semibold text-rose-800 dark:text-rose-200">Highest</span>:{" "}
          <span className="font-mono">${highStr}</span> ({formatPriceKind(range.highPricedAsFoil)}) in{" "}
          <span className="font-mono">{highCol.code.toUpperCase()}</span>
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Among visible set columns, the cheapest printing is{" "}
            <span className="font-medium text-foreground">
              {lowCol.name} ({lowCol.code.toUpperCase()})
            </span>
            {lowCol.release_date ? ` · ${lowCol.release_date}` : null} at{" "}
            <span className="font-mono font-medium text-foreground">${lowStr}</span> (
            {formatPriceKind(range.lowPricedAsFoil)}). The priciest visible printing is{" "}
            <span className="font-medium text-foreground">
              {highCol.name} ({highCol.code.toUpperCase()})
            </span>
            {highCol.release_date ? ` · ${highCol.release_date}` : null} at{" "}
            <span className="font-mono font-medium text-foreground">${highStr}</span> (
            {formatPriceKind(range.highPricedAsFoil)}).
          </p>
          <p className="text-muted-foreground">
            <span className="font-semibold text-cyan-800 dark:text-cyan-200">Lowest</span> /{" "}
            <span className="font-semibold text-rose-800 dark:text-rose-200">Highest</span> badges on the grid
            mark those cells (only when at least two columns have a price and min ≠ max).
          </p>
        </>
      )}
      {onLow && !onHigh ? (
        <p
          className={cn(
            "font-medium text-cyan-950 dark:text-cyan-100",
            compact && "text-[11px] leading-snug",
          )}
        >
          This cell is a lowest-priced column for this row.
        </p>
      ) : onHigh && !onLow ? (
        <p
          className={cn(
            "font-medium text-rose-950 dark:text-rose-100",
            compact && "text-[11px] leading-snug",
          )}
        >
          This cell is a highest-priced column for this row.
        </p>
      ) : null}
    </div>
  );
}

export function HeatmapView() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const queryString = useMemo(() => sp.toString(), [sp]);
  const colSortSelectValue = useMemo(() => normalizedColSort(sp), [sp]);
  const rowSortSelectValue = useMemo(() => {
    const raw = (sp.get("sort") ?? "").split(":")[0]?.trim();
    if (raw === "price_avg") return "price_median";
    return normalizedRowSort(sp);
  }, [sp]);

  const { data, isLoading, error } = useQuery<HeatmapResponse>({
    queryKey: ["heatmap", queryString],
    queryFn: () => fetchJson(`/api/heatmap?${queryString}`),
  });

  const [priceMode, setPriceMode] = useState<PriceMode>("usd");
  const [selR, setSelR] = useState(0);
  const [selC, setSelC] = useState(0);
  const [hover, setHover] = useState<{
    row: number;
    col: number;
    cell: CellDTO | null;
    x: number;
    y: number;
    anchor: HeatmapCellAnchorRect;
  } | null>(null);
  const [previewPinned, setPreviewPinned] = useState(false);
  const [anchorEpoch, setAnchorEpoch] = useState(0);
  const [pinnedAnchor, setPinnedAnchor] = useState<HeatmapCellAnchorRect | null>(null);
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [detailPayload, setDetailPayload] = useState<{
    row: number;
    col: number;
    cell: CellDTO;
  } | null>(null);
  const hoverDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardPreviewRef = useRef<HTMLDivElement>(null);
  const heatmapGridRef = useRef<HeatmapGridHandle>(null);
  const heatmapPortRef = useRef<HTMLDivElement>(null);

  const cancelHoverDismiss = useCallback(() => {
    if (hoverDismissRef.current) {
      clearTimeout(hoverDismissRef.current);
      hoverDismissRef.current = null;
    }
  }, []);

  const scheduleHoverDismiss = useCallback(() => {
    cancelHoverDismiss();
    hoverDismissRef.current = setTimeout(() => setHover(null), 450);
  }, [cancelHoverDismiss]);

  useEffect(() => {
    return () => cancelHoverDismiss();
  }, [cancelHoverDismiss]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const goPending = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useMemo(() => (data?.rows ?? []) as RowDTO[], [data?.rows]);
  const columns = useMemo(() => data?.columns ?? [], [data?.columns]);
  const total = data?.total ?? 0;
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const pageSize = Math.min(1500, Math.max(1, Number(sp.get("pageSize") ?? 1000) || 1000));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(sp.toString());
      if (value === null || value === "") p.delete(key);
      else p.set(key, value);
      router.replace(`/?${p.toString()}`);
    },
    [router, sp],
  );

  const setPage = useCallback(
    (next: number) => {
      const p = new URLSearchParams(sp.toString());
      if (next <= 0) p.delete("page");
      else p.set("page", String(next));
      router.replace(`/?${p.toString()}`);
    },
    [router, sp],
  );

  const replaceQuery = useCallback(
    (p: URLSearchParams) => {
      router.replace(`/?${p.toString()}`);
    },
    [router],
  );

  const heatmapMatchMode = useMemo(
    () => (parseHeatmapUrlSearchParams(sp).matchMode === "strict" ? "strict" : "context"),
    [sp],
  );

  const maxR = Math.max(0, rows.length - 1);
  const maxC = Math.max(0, columns.length - 1);
  const rowIndex = rows.length ? Math.min(Math.max(0, selR), maxR) : 0;
  const colIndex = columns.length ? Math.min(Math.max(0, selC), maxC) : 0;
  const selectionCell = rows.length ? (rows[rowIndex]?.cells[colIndex] ?? null) : null;

  const bumpPinnedAnchor = useCallback(() => {
    if (previewPinned) setAnchorEpoch((n) => n + 1);
  }, [previewPinned]);

  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      if (!previewPinned) {
        setPinnedAnchor(null);
        return;
      }
      if (!selectionCell) {
        setPreviewPinned(false);
        setPinnedAnchor(null);
        return;
      }
      const a = heatmapGridRef.current?.getDataCellClientRect(rowIndex, colIndex) ?? null;
      setPinnedAnchor(a);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [previewPinned, selectionCell, rowIndex, colIndex, anchorEpoch, rows.length, columns.length]);

  useEffect(() => {
    if (!previewPinned) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (cardPreviewRef.current?.contains(t)) return;
      if (heatmapPortRef.current?.contains(t)) return;
      setPreviewPinned(false);
    };
    document.addEventListener("mousedown", onDocDown, true);
    return () => document.removeEventListener("mousedown", onDocDown, true);
  }, [previewPinned]);

  const toggleOwned = useCallback(async () => {
    const cell = rows[rowIndex]?.cells[colIndex];
    if (!cell) return;
    await fetch("/api/owned/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scryfall_id: cell.scryfall_id }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
    await qc.invalidateQueries({ queryKey: ["portfolio"] });
  }, [qc, rows, colIndex, rowIndex]);

  const decOwned = useCallback(async () => {
    const cell = rows[rowIndex]?.cells[colIndex];
    if (!cell) return;
    await fetch("/api/owned/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scryfall_id: cell.scryfall_id, action: "remove" }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
    await qc.invalidateQueries({ queryKey: ["portfolio"] });
  }, [qc, rows, colIndex, rowIndex]);

  const toggleWatch = useCallback(async () => {
    const cell = rows[rowIndex]?.cells[colIndex];
    if (!cell) return;
    await fetch("/api/watchlist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scryfall_id: cell.scryfall_id }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
  }, [qc, rows, colIndex, rowIndex]);

  const togglePin = useCallback(async () => {
    const row = rows[rowIndex];
    if (!row) return;
    await fetch("/api/pinned/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oracle_id: row.oracle_id }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
  }, [qc, rows, rowIndex]);

  const openScryfallSelection = useCallback(() => {
    const cell = rows[rowIndex]?.cells[colIndex];
    const uri = cell?.scryfall_uri;
    if (uri) window.open(uri, "_blank", "noopener,noreferrer");
  }, [rows, colIndex, rowIndex]);

  const raritySet = useMemo(() => new Set(sp.get("rarity")?.split(",").filter(Boolean) ?? []), [sp]);

  const toggleRarity = useCallback(
    (r: string) => {
      const next = new Set(raritySet);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      const v = [...next].join(",");
      setParam("rarity", v || null);
    },
    [raritySet, setParam],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const inField = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }

      if (e.key === "Escape") {
        if (cardDetailOpen) {
          e.preventDefault();
          setCardDetailOpen(false);
          setDetailPayload(null);
          return;
        }
        if (previewPinned) {
          e.preventDefault();
          setPreviewPinned(false);
          return;
        }
        setCmdOpen(false);
        setHelpOpen(false);
        setFiltersOpen(false);
        cancelHoverDismiss();
        setHover(null);
        return;
      }

      if (inField) return;

      if (e.key === "Enter") {
        e.preventDefault();
        openScryfallSelection();
        return;
      }

      if ((e.key === "g" || e.key === "G") && !e.metaKey && !e.ctrlKey) {
        goPending.current = true;
        if (goTimer.current) clearTimeout(goTimer.current);
        goTimer.current = setTimeout(() => {
          goPending.current = false;
        }, 900);
        return;
      }

      if (
        goPending.current &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === "o" ||
          e.key === "O" ||
          e.key === "w" ||
          e.key === "W" ||
          e.key === "h" ||
          e.key === "H")
      ) {
        e.preventDefault();
        goPending.current = false;
        const k = e.key.toLowerCase();
        if (k === "o") router.push("/owned");
        else if (k === "w") router.push("/watchlist");
        else router.push("/");
        return;
      }

      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        if (e.shiftKey) void decOwned();
        else void toggleOwned();
      }
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        void toggleWatch();
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        void togglePin();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelC((c) => Math.min(columns.length - 1, c + 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelC((c) => Math.max(0, c - 1));
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelR((r) => Math.min(rows.length - 1, r + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelR((r) => Math.max(0, r - 1));
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFiltersOpen((v) => !v);
      }
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("heatmap-search")?.focus();
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (goTimer.current) clearTimeout(goTimer.current);
    };
  }, [
    columns.length,
    decOwned,
    openScryfallSelection,
    router,
    rows.length,
    toggleOwned,
    togglePin,
    toggleWatch,
    cardDetailOpen,
    cancelHoverDismiss,
    previewPinned,
  ]);

  const floatingPreview = useMemo(() => {
    if (previewPinned && selectionCell) {
      const cx = pinnedAnchor ? pinnedAnchor.left + pinnedAnchor.width / 2 : 0;
      const cy = pinnedAnchor ? pinnedAnchor.top + pinnedAnchor.height / 2 : 0;
      return {
        row: rowIndex,
        col: colIndex,
        cell: selectionCell,
        anchor: pinnedAnchor,
        x: cx,
        y: cy,
        locked: true as const,
      };
    }
    if (hover?.cell) {
      return {
        row: hover.row,
        col: hover.col,
        cell: hover.cell,
        anchor: hover.anchor,
        x: hover.x,
        y: hover.y,
        locked: false as const,
      };
    }
    return null;
  }, [previewPinned, selectionCell, rowIndex, colIndex, pinnedAnchor, hover]);

  const compactPreviewStyle = useMemo(() => {
    const p = floatingPreview;
    if (!p?.cell) return null;
    if (p.locked && !p.anchor) return null;
    return computeFloatingPreviewPosition(p.anchor, p.x, p.y);
  }, [floatingPreview]);

  const openCardDetail = useCallback(() => {
    const p = floatingPreview;
    if (!p?.cell) return;
    setDetailPayload({ row: p.row, col: p.col, cell: p.cell });
    setCardDetailOpen(true);
  }, [floatingPreview]);

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-hidden p-4">
      <HeatmapCommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onApplySearch={(q) => setParam("q", q)}
      />

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">MTG Heatmap</h1>
          <p className="text-sm text-muted-foreground">
            Rows = cards · Columns = all sets matching filters · POC ≤ 2005 · header row / name column
            stay fixed while scrolling
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/owned" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Owned
          </Link>
          <Link href="/watchlist" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Watchlist
          </Link>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
            onClick={() => setCmdOpen(true)}
          >
            ⌘K
          </button>
          <Select
            value={colSortSelectValue}
            onValueChange={(v) => setParam("colSort", v === "release" ? null : v)}
          >
            <SelectTrigger
              className="h-9 w-[min(100vw-8rem,11rem)] text-xs"
              title="Column order (sets left → right)"
            >
              <SelectValue placeholder="Columns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="release">Cols: release ↑</SelectItem>
              <SelectItem value="release_desc">Cols: release ↓</SelectItem>
              <SelectItem value="code">Cols: set code</SelectItem>
              <SelectItem value="name">Cols: set name</SelectItem>
              <SelectItem value="type_release">Cols: type + date</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Price: {priceMode}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["usd", "usd_foil", "eur", "tix"] as const).map((m) => (
                <DropdownMenuItem key={m} onClick={() => setPriceMode(m)}>
                  {m}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Filters (F)
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-5 text-sm">
                <HeatmapFilterColumns searchParamsString={queryString} setParam={setParam} />
                <Separator />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Row filters
                </p>
                <div className="space-y-2">
                  <Label htmlFor="heatmap-search">Search</Label>
                  <Input
                    id="heatmap-search"
                    value={sp.get("q") ?? ""}
                    onChange={(e) => setParam("q", e.target.value || null)}
                    placeholder="Card name contains…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort rows</Label>
                  <Select value={rowSortSelectValue} onValueChange={(v) => setParam("sort", v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name (A–Z)</SelectItem>
                      <SelectItem value="printings">Print count (most first)</SelectItem>
                      <SelectItem value="reserved">Reserved first</SelectItem>
                      <SelectItem value="price_min">USD: min</SelectItem>
                      <SelectItem value="price_median">USD: median</SelectItem>
                      <SelectItem value="price_max">USD: max</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Uses <span className="font-mono">COALESCE(usd, usd_foil)</span> with the global
                    heatmap column list (see chip bar for visible vs all printings). Max / min / median
                    × asc/desc; multi-sort via URL <span className="font-mono">sk=</span>.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="yMin">Year min</Label>
                    <Input
                      key={`yearMin-${sp.get("yearMin") ?? ""}`}
                      id="yMin"
                      type="number"
                      defaultValue={sp.get("yearMin") ?? ""}
                      onBlur={(e) => setParam("yearMin", e.target.value.trim() || null)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="yMax">Year max</Label>
                    <Input
                      key={`yearMax-${sp.get("yearMax") ?? ""}`}
                      id="yMax"
                      type="number"
                      defaultValue={sp.get("yearMax") ?? ""}
                      onBlur={(e) => setParam("yearMax", e.target.value.trim() || null)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pMin">Price min (USD)</Label>
                    <Input
                      key={`priceMin-${sp.get("priceMin") ?? ""}`}
                      id="pMin"
                      type="number"
                      step="0.01"
                      defaultValue={sp.get("priceMin") ?? ""}
                      onBlur={(e) => setParam("priceMin", e.target.value.trim() || null)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pMax">Price max (USD)</Label>
                    <Input
                      key={`priceMax-${sp.get("priceMax") ?? ""}`}
                      id="pMax"
                      type="number"
                      step="0.01"
                      defaultValue={sp.get("priceMax") ?? ""}
                      onBlur={(e) => setParam("priceMax", e.target.value.trim() || null)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rarity</Label>
                  <div className="flex flex-wrap gap-2">
                    {RARITIES.map((r) => (
                      <label key={r} className="flex items-center gap-1.5 capitalize">
                        <Checkbox
                          checked={raritySet.has(r)}
                          onCheckedChange={() => toggleRarity(r)}
                        />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="dig"
                    checked={sp.get("digital") === "1"}
                    onCheckedChange={(v) => setParam("digital", v ? "1" : null)}
                  />
                  <Label htmlFor="dig">Include digital sets</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="res"
                    checked={sp.get("reserved") === "1"}
                    onCheckedChange={(v) => setParam("reserved", v ? "1" : null)}
                  />
                  <Label htmlFor="res">Reserved List only</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="owned"
                    checked={sp.get("owned") === "1"}
                    onCheckedChange={(v) => setParam("owned", v ? "1" : null)}
                  />
                  <Label htmlFor="owned">Owned only</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="wl"
                    checked={sp.get("watchlist") === "1"}
                    onCheckedChange={(v) => setParam("watchlist", v ? "1" : null)}
                  />
                  <Label htmlFor="wl">Watchlist only</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pin"
                    checked={sp.get("pinned") === "1"}
                    onCheckedChange={(v) => setParam("pinned", v ? "1" : null)}
                  />
                  <Label htmlFor="pin">Pinned only</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hidePin"
                    checked={sp.get("hidePinned") === "1"}
                    onCheckedChange={(v) => setParam("hidePinned", v ? "1" : null)}
                  />
                  <Label htmlFor="hidePin">Hide pinned strip</Label>
                </div>
                <div className="space-y-2">
                  <Label>Special group slug</Label>
                  <Input
                    key={`group-${sp.get("group") ?? ""}`}
                    defaultValue={sp.get("group") ?? ""}
                    onBlur={(e) => setParam("group", e.target.value.trim() || null)}
                    placeholder="e.g. power_nine"
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <HeatmapFilterBar
        queryString={queryString}
        columns={columns}
        total={total}
        rowCount={rows.length}
        page={page}
        pageSize={pageSize}
        onReplaceQuery={replaceQuery}
        onOpenFullFilters={() => setFiltersOpen(true)}
      />

      <div className="shrink-0">
        <Legend dark={dark} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {total.toLocaleString()} cards match · showing {rows.length.toLocaleString()} on this page
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 0 && "pointer-events-none opacity-40")}
            disabled={page <= 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="font-mono text-xs">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              page + 1 >= totalPages && "pointer-events-none opacity-40",
            )}
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load heatmap.</p>
        ) : (
          <HeatmapGrid
            ref={heatmapGridRef}
            columns={columns}
            rows={rows}
            priceMode={priceMode}
            dark={dark}
            matchMode={heatmapMatchMode}
            selectedRow={rowIndex}
            selectedCol={colIndex}
            onSelectCell={(r, c) => {
              setSelR(r);
              setSelC(c);
              const cell = rows[r]?.cells[c] ?? null;
              setPreviewPinned(Boolean(cell));
            }}
            onHoverCell={(r, c, cell, x, y, anchor) => {
              cancelHoverDismiss();
              setHover({ row: r, col: c, cell, x, y, anchor });
            }}
            onLeaveGrid={scheduleHoverDismiss}
            cardPreviewContainerRef={cardPreviewRef}
            onViewportChange={bumpPinnedAnchor}
            interactionPortRef={heatmapPortRef}
            onHeaderSetClick={(setCode) => setParam("hcol", setCode)}
          />
        )}
      </div>

      {floatingPreview?.cell && compactPreviewStyle ? (
        <div
          ref={cardPreviewRef}
          className="pointer-events-auto fixed z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{
            left: compactPreviewStyle.left,
            top: compactPreviewStyle.top,
            width: compactPreviewStyle.width,
            maxWidth: "calc(100vw - 2rem)",
          }}
          onMouseEnter={cancelHoverDismiss}
          onMouseLeave={floatingPreview.locked ? undefined : scheduleHoverDismiss}
        >
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {floatingPreview.locked ? "Pinned preview" : "Preview"}
              </span>
              {floatingPreview.locked ? (
                <span className="text-[10px] leading-tight text-muted-foreground">
                  Stays open while this cell is selected · Esc or click outside to close
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {floatingPreview.locked ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Close pinned preview"
                  onClick={() => setPreviewPinned(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
              <Button type="button" variant="secondary" size="sm" className="h-7 gap-1 text-xs" onClick={openCardDetail}>
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                Expand
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {cardImageUrlForPreview(floatingPreview.cell) ? (
              <div className="flex justify-center border-b border-border pb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImageUrlForPreview(floatingPreview.cell)!}
                  alt=""
                  width={488}
                  height={680}
                  className="max-h-[min(320px,52vh)] w-full max-w-[260px] rounded-md border border-border object-contain"
                  sizes="(max-width: 480px) 85vw, 260px"
                  decoding="async"
                />
              </div>
            ) : null}
            <div className="min-w-0 space-y-1.5 text-sm">
              <div className="font-medium leading-tight">{rows[floatingPreview.row]?.name}</div>
              <div className="text-muted-foreground">
                {columns[floatingPreview.col]?.name} ({columns[floatingPreview.col]?.release_date})
              </div>
              <div className="font-mono text-xs">
                USD {floatingPreview.cell.usd ?? "—"} · Foil {floatingPreview.cell.usd_foil ?? "—"}
              </div>
              {floatingPreview.cell.rarity ? (
                <div className="text-xs text-muted-foreground">Rarity: {floatingPreview.cell.rarity}</div>
              ) : null}
              <HeatmapPriceRangeCallout
                row={rows[floatingPreview.row]}
                activeCol={floatingPreview.col}
                columns={columns}
                variant="compact"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {floatingPreview.cell.scryfall_uri ? (
                  <a
                    href={floatingPreview.cell.scryfall_uri}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    Scryfall
                  </a>
                ) : null}
                {floatingPreview.cell.tcgplayer_url ? (
                  <a
                    href={floatingPreview.cell.tcgplayer_url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    TCGplayer
                  </a>
                ) : null}
                {floatingPreview.cell.cardmarket_url ? (
                  <a
                    href={floatingPreview.cell.cardmarket_url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    Cardmarket
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={cardDetailOpen}
        onOpenChange={(open) => {
          setCardDetailOpen(open);
          if (!open) setDetailPayload(null);
        }}
      >
        <DialogContent className="max-h-[min(92vh,900px)] w-full max-w-3xl overflow-y-auto">
          {detailPayload ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{rows[detailPayload.row]?.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {columns[detailPayload.col]?.name} · {columns[detailPayload.col]?.release_date ?? "—"}
                </p>
                <HeatmapPriceRangeCallout
                  row={rows[detailPayload.row]}
                  activeCol={detailPayload.col}
                  columns={columns}
                />
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  {cardImageUrlForDetail(detailPayload.cell) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cardImageUrlForDetail(detailPayload.cell)!}
                      alt=""
                      width={672}
                      height={936}
                      className="mx-auto w-full max-w-[min(672px,92vw)] shrink-0 rounded-lg border border-border object-contain lg:mx-0 lg:max-w-[min(672px,48vw)]"
                      sizes="(max-width: 1024px) 92vw, 672px"
                      loading="eager"
                      decoding="async"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-mono text-xs leading-relaxed">
                      USD {detailPayload.cell.usd ?? "—"} · Foil {detailPayload.cell.usd_foil ?? "—"} · EUR{" "}
                      {detailPayload.cell.eur ?? "—"} · Tix {detailPayload.cell.tix ?? "—"}
                    </p>
                    {detailPayload.cell.rarity ? (
                      <p className="text-xs text-muted-foreground">Rarity: {detailPayload.cell.rarity}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {detailPayload.cell.scryfall_uri ? (
                        <a
                          href={detailPayload.cell.scryfall_uri}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ size: "sm", variant: "default" }))}
                        >
                          Open on Scryfall
                        </a>
                      ) : null}
                      {detailPayload.cell.tcgplayer_url ? (
                        <a
                          href={detailPayload.cell.tcgplayer_url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                        >
                          TCGplayer
                        </a>
                      ) : null}
                      {detailPayload.cell.cardmarket_url ? (
                        <a
                          href={detailPayload.cell.cardmarket_url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                        >
                          Cardmarket
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Keyboard</SheetTitle>
          </SheetHeader>
          <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Arrows: move selection</li>
            <li>Enter: open Scryfall for selected printing</li>
            <li>O: add owned · Shift+O: remove one copy</li>
            <li>W: watchlist · P: pin</li>
            <li>F: filters · /: search · Esc: close panels</li>
            <li>⌘K / Ctrl+K: command palette</li>
            <li>G then O / W / H: Owned / Watchlist / Home</li>
            <li>
              URL: colSort (release, release_desc, code, name, type_release); hideSets, exclTypes,
              exclGroups (preset column groups); sets = allowlist columns
            </li>
            <li>
              sort / sk: price_min | price_median | price_max with asc/desc; optional hcol= set code for
              temporary column sort; strict=1 hides non-matching printings; emptyCols=1 shows in-scope
              empty columns; grid keeps the set header row and card name column fixed while you scroll
            </li>
            <li>
              Click a cell that has a printing to pin the card preview next to that cell (anchored). Esc,
              the preview close button, a click outside the grid and preview, or moving to an empty cell
              unpins. Hover preview still uses a short dismiss delay when unpinned.
            </li>
          </ul>
        </SheetContent>
      </Sheet>

      <footer className="shrink-0 text-center text-xs text-muted-foreground">
        Card data from{" "}
        <a className="underline" href="https://scryfall.com">
          Scryfall
        </a>
        . Not affiliated with Wizards of the Coast.
      </footer>
    </div>
  );
}
