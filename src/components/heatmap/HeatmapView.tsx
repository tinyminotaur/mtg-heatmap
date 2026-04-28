"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useTheme } from "@/components/app-theme-provider";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HEATMAP_MAX_PAGE_SIZE } from "@/lib/constants";
import { cardImageUrlForDetail, cardImageUrlForPreview, cardImageUrlForRowPreview } from "@/lib/card-image-urls";
import { readHeatmapSession, writeHeatmapSession } from "@/lib/heatmap-session";
import { formatPriceKind, getHeatmapPriceRange } from "@/lib/heatmap-best-deal";
import type { CellDTO, ColumnMeta, RowDTO } from "@/lib/heatmap-query";
import { cellEligibleForHeatmapHoverPreview, type PriceMode } from "@/lib/price-scale";
import {
  parseHeatmapCellPriceField,
  parseHeatmapUrlSearchParams,
  serializeHeatmapUrlParams,
} from "@/lib/heatmap-url-params";
import {
  applyColumnVisibilityToHeatmapFilters,
  heatmapFiltersToColumnVisibility,
  tanStackStateToHeatmapFilters,
} from "@/lib/heatmap/tanstack-adapter";
import { HeatmapCommandPalette } from "./HeatmapCommandPalette";
import { HeatmapFilterBar, type ViewSessionMeta } from "./HeatmapFilterBar";
import { HeatmapGrid, type HeatmapCellAnchorRect, type HeatmapGridHandle } from "./HeatmapGrid";
import { HeatmapGuideDialog } from "./HeatmapGuideDialog";
import { OwnedListPanel } from "@/components/owned/OwnedListPanel";
import { WatchlistListPanel } from "@/components/watchlist/WatchlistListPanel";
import { Bookmark, Library, Maximize2, Palette, Search, X } from "lucide-react";
import type { SortingState, VisibilityState } from "@tanstack/react-table";

/** Toggle `qr=` / `qc=` comma lists in the URL (session quick-pins). */
function patchCommaSearchParam(sp: ReadonlyURLSearchParams, key: "qr" | "qc", token: string): URLSearchParams {
  const cur = sp.get(key)?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const t = key === "qc" ? token.trim().toLowerCase() : token.trim();
  if (!t) return new URLSearchParams(sp.toString());
  const i = cur.indexOf(t);
  const next = i >= 0 ? cur.filter((_, j) => j !== i) : [...cur, t];
  const p = new URLSearchParams(sp.toString());
  if (next.length) p.set(key, next.join(","));
  else p.delete(key);
  return p;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = String(res.status);
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      if (body.message) detail = `${res.status}: ${body.message}`;
      else if (body.error) detail = `${res.status}: ${body.error}`;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  return res.json();
}

type HeatmapResponse = { columns: ColumnMeta[]; rows: RowDTO[]; total: number };

/** Floating preview: vertical card + text needs width; height used for viewport clamping. */
const PREVIEW_PANEL_W = 400;
const PREVIEW_APPROX_H = 480;
const PREVIEW_EDITION_APPROX_H = 300;

function humanizeSetType(setType: string | null): string {
  if (!setType) return "Magic: The Gathering edition.";
  const map: Record<string, string> = {
    core: "Core set — evergreen cards aimed at newer players.",
    expansion: "Expansion — large standalone release with new mechanics.",
    masters: "Masters-style — reprints aimed at constructed formats.",
    commander: "Commander product.",
    draft_innovation: "Draft-focused innovation set.",
    masterpiece: "Masterpiece / ultra-premium subset.",
    promo: "Promotional release.",
    duel_deck: "Duel Decks–style duel product.",
    starter: "Starter / introductory product.",
    box: "Box set or compilation.",
    from_the_vault: "From the Vault–style premium reprint subset.",
    premium_deck: "Premium deck product.",
    funpack: "Fun Pack / casual product.",
  };
  return map[setType] ?? `Scryfall set type “${setType.replace(/_/g, " ")}”.`;
}

function firstDetailCell(row: RowDTO): CellDTO | null {
  for (const c of row.cells) {
    if (c?.scryfall_uri) return c;
  }
  for (const c of row.cells) {
    if (c) return c;
  }
  return null;
}

type StatusResponse = {
  ok: true;
  last_updated_utc: string | null;
  refresh_schedule: { kind: "daily"; hour_utc: number; minute_utc: number };
};

function nextUtcDaily(h: number, m: number, now = new Date()): Date {
  const y = now.getUTCFullYear();
  const mon = now.getUTCMonth();
  const d = now.getUTCDate();
  const candidate = new Date(Date.UTC(y, mon, d, h, m, 0, 0));
  if (candidate.getTime() > now.getTime()) return candidate;
  return new Date(Date.UTC(y, mon, d + 1, h, m, 0, 0));
}

function computeFloatingPreviewPosition(
  anchor: HeatmapCellAnchorRect | null | undefined,
  fallbackX: number,
  fallbackY: number,
  approxH: number = PREVIEW_APPROX_H,
): { left: number; top: number; width: number } {
  const pad = 10;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const width = Math.max(260, Math.min(PREVIEW_PANEL_W, vw - pad * 2));
  const overlap = 4;
  const gap = 6 - overlap;
  let left: number;
  let top: number;
  if (anchor && anchor.width > 0) {
    const rightSide = anchor.left + anchor.width + gap;
    const leftSide = anchor.left - width - gap;
    if (rightSide + width <= vw - pad) left = rightSide;
    else if (leftSide >= pad) left = leftSide;
    else left = Math.max(pad, Math.min(rightSide, vw - width - pad));
    top = anchor.top + (anchor.height - approxH) / 2;
    top = Math.max(pad, Math.min(top, vh - approxH - pad));
  } else {
    left = Math.max(pad, Math.min(fallbackX + 12, vw - width - pad));
    top = Math.max(pad, Math.min(fallbackY + 12, vh - approxH - pad));
  }
  return { left, top, width };
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
          <span className="font-semibold text-cyan-800 dark:text-cyan-200">Min</span>:{" "}
          <span className="font-mono">${lowStr}</span> ({formatPriceKind(range.lowPricedAsFoil)}) in{" "}
          <span className="font-mono">{lowCol.code.toUpperCase()}</span>
          {" · "}
          <span className="font-semibold text-rose-800 dark:text-rose-200">Max</span>:{" "}
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
            <span className="font-semibold text-cyan-800 dark:text-cyan-200">Min</span> /{" "}
            <span className="font-semibold text-rose-800 dark:text-rose-200">Max</span> badges on the grid
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
          This cell is the minimum-priced column for this row.
        </p>
      ) : onHigh && !onLow ? (
        <p
          className={cn(
            "font-medium text-rose-950 dark:text-rose-100",
            compact && "text-[11px] leading-snug",
          )}
        >
          This cell is the maximum-priced column for this row.
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
  const [isMobile, setIsMobile] = useState(false);
  const [density, setDensity] = useState<"comfy" | "compact">("comfy");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const queryString = useMemo(() => sp.toString(), [sp]);
  const urlFilters = useMemo(() => parseHeatmapUrlSearchParams(sp), [sp]);

  const { data, isLoading, isFetching, error } = useQuery<HeatmapResponse>({
    queryKey: ["heatmap", queryString],
    queryFn: () => fetchJson(`/api/heatmap?${queryString}`),
    // Keep rendering the previous heatmap while the next one loads (no “blink out”).
    placeholderData: (prev) => prev,
  });

  const { data: statusData } = useQuery<StatusResponse>({
    queryKey: ["heatmap-status"],
    queryFn: () => fetchJson(`/api/status`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const priceMode = useMemo(() => parseHeatmapCellPriceField(sp) as PriceMode, [sp]);
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
  const [nameRowHover, setNameRowHover] = useState<{
    row: number;
    x: number;
    y: number;
    anchor: HeatmapCellAnchorRect;
  } | null>(null);
  const [editionHeaderHover, setEditionHeaderHover] = useState<{
    col: number;
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
  const nameRowPreviewRef = useRef<HTMLDivElement>(null);
  const editionPreviewRef = useRef<HTMLDivElement>(null);
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
    hoverDismissRef.current = setTimeout(() => {
      setHover(null);
      setNameRowHover(null);
      setEditionHeaderHover(null);
    }, 450);
  }, [cancelHoverDismiss]);

  /** Immediate hover clear (leaving the grid port or a non-preview cell). */
  const clearHoverNow = useCallback(() => {
    cancelHoverDismiss();
    setHover(null);
    setNameRowHover(null);
    setEditionHeaderHover(null);
  }, [cancelHoverDismiss]);

  const hoverPreviewContains = useCallback((node: EventTarget | Node | null) => {
    if (!(node instanceof Node)) return false;
    return Boolean(
      cardPreviewRef.current?.contains(node) ||
        nameRowPreviewRef.current?.contains(node) ||
        editionPreviewRef.current?.contains(node),
    );
  }, []);

  useEffect(() => {
    return () => cancelHoverDismiss();
  }, [cancelHoverDismiss]);
  const [filtersRootOpen, setFiltersRootOpen] = useState(false);
  const [viewSession, setViewSession] = useState<ViewSessionMeta>({
    activeViewId: null,
    snapshotQuery: null,
  });
  const sessionBootstrapped = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [ownedOverlayOpen, setOwnedOverlayOpen] = useState(false);
  const [wishlistOverlayOpen, setWishlistOverlayOpen] = useState(false);
  const [modK] = useState(() => (/mac|iphone|ipad|ipod/i.test(navigator.userAgent) ? "⌘K" : "Ctrl+K"));
  const goPending = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useMemo(() => (data?.rows ?? []) as RowDTO[], [data?.rows]);
  const columns = useMemo(() => data?.columns ?? [], [data?.columns]);
  const total = data?.total ?? 0;
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const pageSize = Math.min(
    HEATMAP_MAX_PAGE_SIZE,
    Math.max(1, Number(sp.get("pageSize") ?? HEATMAP_MAX_PAGE_SIZE) || HEATMAP_MAX_PAGE_SIZE),
  );
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

  const onSortingChange = useCallback(
    (nextSorting: SortingState) => {
      const nextFilters = tanStackStateToHeatmapFilters({ sorting: nextSorting }, urlFilters);
      replaceQuery(serializeHeatmapUrlParams(nextFilters));
    },
    [replaceQuery, urlFilters],
  );

  const columnVisibility = useMemo(
    () => heatmapFiltersToColumnVisibility(urlFilters, columns),
    [urlFilters, columns],
  );

  const onColumnVisibilityChange = useCallback(
    (nextVisibility: VisibilityState) => {
      const nextFilters = applyColumnVisibilityToHeatmapFilters(urlFilters, columns, nextVisibility);
      replaceQuery(serializeHeatmapUrlParams(nextFilters));
    },
    [replaceQuery, urlFilters, columns],
  );

  useEffect(() => {
    if (sessionBootstrapped.current) return;
    sessionBootstrapped.current = true;
    const snap = readHeatmapSession();
    startTransition(() => {
      if (snap) setViewSession({ activeViewId: snap.activeViewId, snapshotQuery: snap.snapshotQuery });
    });
    const q = window.location.search.replace(/^\?/, "");
    if (snap?.search && q === "") router.replace(`/?${snap.search}`);
  }, [router]);

  useEffect(() => {
    writeHeatmapSession({
      search: sp.toString(),
      activeViewId: viewSession.activeViewId,
      snapshotQuery: viewSession.snapshotQuery,
    });
  }, [sp, viewSession]);

  const persistSessionNav = useCallback(() => {
    writeHeatmapSession({
      search: sp.toString(),
      activeViewId: viewSession.activeViewId,
      snapshotQuery: viewSession.snapshotQuery,
    });
  }, [sp, viewSession]);

  const toggleFiltersPanel = useCallback(() => {
    setFiltersRootOpen((o) => !o);
  }, []);

  const heatmapMatchMode = useMemo(
    () => (parseHeatmapUrlSearchParams(sp).matchMode === "strict" ? "strict" : "context"),
    [sp],
  );

  const maxR = Math.max(0, rows.length - 1);
  const maxC = Math.max(0, columns.length - 1);
  const rowIndex = rows.length ? Math.min(Math.max(0, selR), maxR) : 0;
  const colIndex = columns.length ? Math.min(Math.max(0, selC), maxC) : 0;
  const selectionCell = rows.length ? (rows[rowIndex]?.cells[colIndex] ?? null) : null;

  useEffect(() => {
    if (!rows.length || !columns.length) return;
    const id = requestAnimationFrame(() => {
      heatmapGridRef.current?.scrollCellIntoView(rowIndex, colIndex);
    });
    return () => cancelAnimationFrame(id);
  }, [rowIndex, colIndex, rows.length, columns.length]);

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

  const toggleQuickPinRowForOracle = useCallback(
    (oracleId: string) => {
      const p = patchCommaSearchParam(sp, "qr", oracleId);
      router.replace(`/?${p.toString()}`);
    },
    [router, sp],
  );

  const toggleQuickPinColForCode = useCallback(
    (setCode: string) => {
      if (setCode.startsWith("__")) return;
      const p = patchCommaSearchParam(sp, "qc", setCode);
      router.replace(`/?${p.toString()}`);
    },
    [router, sp],
  );

  const openScryfallSelection = useCallback(() => {
    const cell = rows[rowIndex]?.cells[colIndex];
    const uri = cell?.scryfall_uri;
    if (uri) window.open(uri, "_blank", "noopener,noreferrer");
  }, [rows, colIndex, rowIndex]);

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
        setFiltersRootOpen(false);
        cancelHoverDismiss();
        setHover(null);
        setNameRowHover(null);
        setEditionHeaderHover(null);
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
        if (k === "o") {
          persistSessionNav();
          setOwnedOverlayOpen(true);
        } else if (k === "w") {
          persistSessionNav();
          setWishlistOverlayOpen(true);
        } else {
          persistSessionNav();
          router.push("/");
        }
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
        toggleFiltersPanel();
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
    persistSessionNav,
    router,
    rows.length,
    toggleFiltersPanel,
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

  const nameRowPreviewLayout = useMemo(() => {
    if (!nameRowHover || previewPinned || isMobile) return null;
    if (!rows[nameRowHover.row]) return null;
    return computeFloatingPreviewPosition(nameRowHover.anchor, nameRowHover.x, nameRowHover.y);
  }, [nameRowHover, rows, previewPinned, isMobile]);

  const editionPreviewLayout = useMemo(() => {
    if (!editionHeaderHover || previewPinned || isMobile) return null;
    if (!columns[editionHeaderHover.col]) return null;
    return computeFloatingPreviewPosition(
      editionHeaderHover.anchor,
      editionHeaderHover.x,
      editionHeaderHover.y,
      PREVIEW_EDITION_APPROX_H,
    );
  }, [editionHeaderHover, columns, previewPinned, isMobile]);

  const openCardDetailFromNameRow = useCallback(() => {
    if (!nameRowHover) return;
    const row = rows[nameRowHover.row];
    if (!row) return;
    const cell = firstDetailCell(row);
    if (!cell) return;
    const col = row.cells.findIndex((c) => c === cell);
    setDetailPayload({ row: nameRowHover.row, col: Math.max(0, col), cell });
    setCardDetailOpen(true);
  }, [nameRowHover, rows]);

  const openCardDetail = useCallback(() => {
    const p = floatingPreview;
    if (!p?.cell) return;
    setDetailPayload({ row: p.row, col: p.col, cell: p.cell });
    setCardDetailOpen(true);
  }, [floatingPreview]);

  const statusLine = useMemo(() => {
    const s = statusData;
    if (!s?.ok) return null;
    const last =
      s.last_updated_utc && s.last_updated_utc.trim()
        ? new Date(`${s.last_updated_utc.replace(" ", "T")}Z`)
        : null;
    const next =
      s.refresh_schedule?.kind === "daily"
        ? nextUtcDaily(s.refresh_schedule.hour_utc, s.refresh_schedule.minute_utc)
        : null;
    const fmt = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    return {
      lastLabel: last ? fmt.format(last) : "unknown",
      nextLabel: next ? fmt.format(next) : "unknown",
    };
  }, [statusData]);

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden p-2 sm:p-4",
        density === "compact" ? "gap-2" : "gap-3",
      )}
    >
      <HeatmapCommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenFilters={() => setFiltersRootOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onApplySearch={(q) => setParam("q", q)}
        onNavigateOwned={() => setOwnedOverlayOpen(true)}
        onNavigateWishlist={() => setWishlistOverlayOpen(true)}
      />

      <HeatmapGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        dark={dark}
        statusLine={statusLine}
      />

      <Sheet open={ownedOverlayOpen} onOpenChange={setOwnedOverlayOpen}>
        <SheetContent
          side="right"
          showCloseButton
          className="flex w-[min(100vw-0.5rem,56rem)] max-w-none flex-col gap-0 overflow-hidden border-l bg-popover p-0 sm:w-[min(100vw-1rem,56rem)] sm:max-w-[56rem]"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain p-4 sm:p-6">
              <OwnedListPanel embedded />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={wishlistOverlayOpen} onOpenChange={setWishlistOverlayOpen}>
        <SheetContent
          side="right"
          showCloseButton
          className="flex w-[min(100vw-0.5rem,56rem)] max-w-none flex-col gap-0 overflow-hidden border-l bg-popover p-0 sm:w-[min(100vw-1rem,56rem)] sm:max-w-[56rem]"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain p-4 sm:p-6">
              <WatchlistListPanel embedded />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="glass-value-map-panel px-4 py-2.5">
          <h1
            className={cn(
              "font-[family-name:var(--font-value-map-display)] text-2xl font-semibold tracking-tight sm:text-3xl",
              "text-value-map-title",
            )}
          >
            MTG Value Map
          </h1>
        </div>
        <nav
          className="flex max-w-full flex-wrap items-center justify-end gap-1.5 sm:gap-2"
          aria-label="Shortcuts and pages"
        >
          <button
            type="button"
            className="header-toolbar-action cursor-pointer"
            onClick={() => setOwnedOverlayOpen(true)}
          >
            <Library className="size-4 shrink-0 text-amber-200/90" aria-hidden />
            <span>Owned</span>
          </button>
          <button
            type="button"
            className="header-toolbar-action cursor-pointer"
            onClick={() => setWishlistOverlayOpen(true)}
          >
            <Bookmark className="size-4 shrink-0 text-amber-200/90" aria-hidden />
            <span>Wishlist</span>
          </button>
          <button type="button" className="header-toolbar-action cursor-pointer" onClick={() => setGuideOpen(true)}>
            <Palette className="size-4 shrink-0 text-amber-200/90" aria-hidden />
            <span>Legend</span>
          </button>
          <button type="button" className="header-toolbar-action cursor-pointer" onClick={() => setCmdOpen(true)}>
            <Search className="size-4 shrink-0 text-amber-200/90" aria-hidden />
            <span className="inline-flex flex-wrap items-baseline gap-x-1 gap-y-0">
              <span>Search &amp; commands</span>
              <span className="text-xs font-normal text-muted-foreground">
                (<span className="font-mono">{modK}</span>)
              </span>
            </span>
          </button>
        </nav>
      </header>

      <HeatmapFilterBar
        queryString={queryString}
        columns={columns}
        onReplaceQuery={replaceQuery}
        onSortingChange={onSortingChange}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={onColumnVisibilityChange}
        activeViewId={viewSession.activeViewId}
        snapshotQuery={viewSession.snapshotQuery}
        onViewSessionChange={setViewSession}
        filtersRootOpen={filtersRootOpen}
        onFiltersRootOpenChange={setFiltersRootOpen}
        density={density}
        onDensityChange={setDensity}
        onOpenCommandPalette={() => setCmdOpen(true)}
        onOpenKeyboardHelp={() => setHelpOpen(true)}
        onPersistNav={persistSessionNav}
        onOpenOwnedPanel={() => setOwnedOverlayOpen(true)}
        onOpenWishlistPanel={() => setWishlistOverlayOpen(true)}
      />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{total.toLocaleString()}</span> cards match ·{" "}
          <span className="font-medium text-foreground">{rows.length.toLocaleString()}</span> rows this page ·{" "}
          {pageSize}/page
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col max-sm:min-h-[40dvh]">
        {!data && isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data && error ? (
          <div className="text-sm text-destructive">
            <p>Failed to load heatmap.</p>
            {error instanceof Error && error.message !== "500" ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">{error.message}</p>
            ) : null}
          </div>
        ) : (
          <div className="relative min-h-0 min-w-0 flex-1">
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
                setPreviewPinned(
                  cellEligibleForHeatmapHoverPreview(cell, heatmapMatchMode, priceMode),
                );
              }}
              onHoverCell={(r, c, cell, x, y, anchor) => {
                cancelHoverDismiss();
                setNameRowHover(null);
                setEditionHeaderHover(null);
                if (!cellEligibleForHeatmapHoverPreview(cell, heatmapMatchMode, priceMode)) {
                  setHover(null);
                  return;
                }
                setHover({ row: r, col: c, cell, x, y, anchor });
              }}
              onLeaveGrid={clearHoverNow}
              cardPreviewContainerRef={cardPreviewRef}
              cardPreviewContains={hoverPreviewContains}
              onViewportChange={bumpPinnedAnchor}
              interactionPortRef={heatmapPortRef}
              onHeaderSetClick={(setCode) => setParam("hcol", setCode)}
              onHoverFrozenRowBody={
                previewPinned || isMobile
                  ? undefined
                  : (row, x, y, anchor) => {
                      cancelHoverDismiss();
                      setHover(null);
                      setEditionHeaderHover(null);
                      setNameRowHover({ row, x, y, anchor });
                    }
              }
              onHoverEditionHeader={
                previewPinned || isMobile
                  ? undefined
                  : (col, x, y, anchor) => {
                      cancelHoverDismiss();
                      setHover(null);
                      setNameRowHover(null);
                      setEditionHeaderHover({ col, x, y, anchor });
                    }
              }
            />
            {isFetching ? (
              <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-2">
                <div className="rounded-md border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                  Updating…
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {floatingPreview?.cell && compactPreviewStyle && !isMobile ? (
        <div
          ref={cardPreviewRef}
          className="pointer-events-auto fixed z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
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
                {columns[floatingPreview.col]?.set_type === "aggregate"
                  ? `${columns[floatingPreview.col]?.name} (row aggregate)`
                  : `${columns[floatingPreview.col]?.name} (${columns[floatingPreview.col]?.release_date})`}
              </div>
              {floatingPreview.cell.source_set_name ? (
                <div className="text-xs text-muted-foreground">
                  Printing: {floatingPreview.cell.source_set_name}{" "}
                  <span className="font-mono">
                    ({(floatingPreview.cell.source_set_code ?? "").toUpperCase()})
                  </span>
                </div>
              ) : null}
              {floatingPreview.cell.aggregate_note ? (
                <div className="text-[11px] leading-snug text-muted-foreground">{floatingPreview.cell.aggregate_note}</div>
              ) : null}
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
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant={rows[floatingPreview.row]?.quick_pin_row ? "secondary" : "outline"}
                  onClick={() => {
                    const row = rows[floatingPreview.row];
                    if (row) toggleQuickPinRowForOracle(row.oracle_id);
                  }}
                >
                  {rows[floatingPreview.row]?.quick_pin_row ? "Quick-pin row ✓" : "Quick-pin row"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={columns[floatingPreview.col]?.quick_pin_column ? "secondary" : "outline"}
                  disabled={Boolean(columns[floatingPreview.col]?.code?.startsWith("__"))}
                  onClick={() => {
                    const code = columns[floatingPreview.col]?.code;
                    if (code) toggleQuickPinColForCode(code);
                  }}
                >
                  {columns[floatingPreview.col]?.quick_pin_column ? "Quick-pin col ✓" : "Quick-pin column"}
                </Button>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Session pins (URL <span className="font-mono">qr</span> / <span className="font-mono">qc</span>): full
                row or column stays on the grid; printing cells are not dimmed by rarity, price, owned, or watchlist
                filters.
              </p>
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

      {nameRowHover && nameRowPreviewLayout && rows[nameRowHover.row] ? (
        <div
          ref={nameRowPreviewRef}
          className="pointer-events-auto fixed z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          style={{
            left: nameRowPreviewLayout.left,
            top: nameRowPreviewLayout.top,
            width: nameRowPreviewLayout.width,
            maxWidth: "calc(100vw - 2rem)",
          }}
          onMouseEnter={cancelHoverDismiss}
          onMouseLeave={scheduleHoverDismiss}
        >
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2">
            <span className="text-xs font-medium text-muted-foreground">Card</span>
            <Button type="button" variant="secondary" size="sm" className="h-7 gap-1 text-xs" onClick={openCardDetailFromNameRow}>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              Expand
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {cardImageUrlForRowPreview(rows[nameRowHover.row]) ? (
              <div className="flex justify-center border-b border-border pb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImageUrlForRowPreview(rows[nameRowHover.row])!}
                  alt=""
                  width={488}
                  height={680}
                  className="max-h-[min(280px,48vh)] w-full max-w-[240px] rounded-md border border-border object-contain"
                  sizes="(max-width: 480px) 85vw, 240px"
                  decoding="async"
                />
              </div>
            ) : null}
            <div className="min-w-0 space-y-1 text-sm">
              <div className="font-medium leading-tight">{rows[nameRowHover.row]?.name}</div>
              {rows[nameRowHover.row]?.type_line ? (
                <div className="text-xs text-muted-foreground">{rows[nameRowHover.row]!.type_line}</div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                CMC{" "}
                <span className="font-mono text-foreground">
                  {rows[nameRowHover.row]!.cmc != null
                    ? rows[nameRowHover.row]!.cmc!.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })
                    : "—"}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                className="mt-1 w-full"
                variant={rows[nameRowHover.row]?.quick_pin_row ? "secondary" : "outline"}
                onClick={() => {
                  const row = rows[nameRowHover.row];
                  if (row) toggleQuickPinRowForOracle(row.oracle_id);
                }}
              >
                {rows[nameRowHover.row]?.quick_pin_row ? "Quick-pin row ✓" : "Quick-pin this row"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editionHeaderHover && editionPreviewLayout && columns[editionHeaderHover.col] ? (
        <div
          ref={editionPreviewRef}
          className="pointer-events-auto fixed z-50 max-w-md rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          style={{
            left: editionPreviewLayout.left,
            top: editionPreviewLayout.top,
            width: editionPreviewLayout.width,
            maxWidth: "min(380px, calc(100vw - 2rem))",
          }}
          onMouseEnter={cancelHoverDismiss}
          onMouseLeave={scheduleHoverDismiss}
        >
          <div className="mb-2 border-b border-border pb-2 text-xs font-medium text-muted-foreground">Edition</div>
          <div className="flex gap-3">
            {columns[editionHeaderHover.col]!.set_type !== "aggregate" ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    columns[editionHeaderHover.col]!.icon_svg_path?.trim() ||
                    `https://svgs.scryfall.io/sets/${columns[editionHeaderHover.col]!.code.toLowerCase()}.svg`
                  }
                  alt=""
                  width={56}
                  height={56}
                  className="h-full w-full object-contain p-1"
                  decoding="async"
                />
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-[10px] font-semibold leading-tight text-muted-foreground">
                Σ
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1.5 text-sm">
              <div className="font-semibold leading-snug">{columns[editionHeaderHover.col]!.name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {(columns[editionHeaderHover.col]!.code || "").toUpperCase()}
                {columns[editionHeaderHover.col]!.year != null
                  ? ` · ${columns[editionHeaderHover.col]!.year}`
                  : ""}
                {columns[editionHeaderHover.col]!.release_date
                  ? ` · ${columns[editionHeaderHover.col]!.release_date}`
                  : ""}
              </div>
              {columns[editionHeaderHover.col]!.set_type === "aggregate" ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Row-level aggregate: cheap / typical / expensive pricing across the visible printings for each card,
                  using your selected price field.
                </p>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {humanizeSetType(columns[editionHeaderHover.col]!.set_type)}
                  </p>
                  {columns[editionHeaderHover.col]!.parent_set_code ? (
                    <p className="text-[11px] text-muted-foreground">
                      Parent / block code:{" "}
                      <span className="font-mono">
                        {columns[editionHeaderHover.col]!.parent_set_code!.toUpperCase()}
                      </span>
                    </p>
                  ) : null}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Each column is one edition; cells are printings of that card from this set (when present in your
                    column scope).
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-1 w-full"
                    variant={columns[editionHeaderHover.col]?.quick_pin_column ? "secondary" : "outline"}
                    onClick={() => toggleQuickPinColForCode(columns[editionHeaderHover.col]!.code)}
                  >
                    {columns[editionHeaderHover.col]?.quick_pin_column
                      ? "Quick-pin column ✓"
                      : "Quick-pin this column"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {floatingPreview?.cell ? (
        <Sheet
          open={isMobile && previewPinned}
          onOpenChange={(open) => {
            if (!open) setPreviewPinned(false);
          }}
        >
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-0">
            <SheetHeader className="border-b border-border">
              <SheetTitle className="pr-8">{rows[floatingPreview.row]?.name}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                Tap a cell to open preview · Esc / close to dismiss
              </p>
            </SheetHeader>
            <div className={cn("space-y-4 text-sm", density === "compact" ? "p-3" : "p-4")}>
              {cardImageUrlForPreview(floatingPreview.cell) ? (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cardImageUrlForPreview(floatingPreview.cell)!}
                    alt=""
                    width={488}
                    height={680}
                    className="w-full max-w-[min(420px,92vw)] rounded-lg border border-border object-contain"
                    sizes="92vw"
                    decoding="async"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <div className="text-muted-foreground">
                  {columns[floatingPreview.col]?.set_type === "aggregate"
                    ? `${columns[floatingPreview.col]?.name} (row aggregate)`
                    : `${columns[floatingPreview.col]?.name} (${columns[floatingPreview.col]?.release_date})`}
                </div>
                {floatingPreview.cell.source_set_name ? (
                  <div className="text-xs text-muted-foreground">
                    Printing: {floatingPreview.cell.source_set_name}{" "}
                    <span className="font-mono">
                      ({(floatingPreview.cell.source_set_code ?? "").toUpperCase()})
                    </span>
                  </div>
                ) : null}
                {floatingPreview.cell.aggregate_note ? (
                  <div className="text-[11px] leading-snug text-muted-foreground">
                    {floatingPreview.cell.aggregate_note}
                  </div>
                ) : null}
                <div className="font-mono text-xs">
                  USD {floatingPreview.cell.usd ?? "—"} · Foil {floatingPreview.cell.usd_foil ?? "—"}
                </div>
                <HeatmapPriceRangeCallout
                  row={rows[floatingPreview.row]}
                  activeCol={floatingPreview.col}
                  columns={columns}
                  variant="compact"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={floatingPreview.cell.owned_qty > 0 ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => void toggleOwned()}
                >
                  {floatingPreview.cell.owned_qty > 0
                    ? `Owned (${floatingPreview.cell.owned_qty})`
                    : "Add owned"}
                </Button>
                <Button
                  type="button"
                  variant={floatingPreview.cell.watchlisted ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => void toggleWatch()}
                >
                  {floatingPreview.cell.watchlisted ? "Watchlisted" : "Watchlist"}
                </Button>
                <Button
                  type="button"
                  variant={rows[floatingPreview.row]?.pinned ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => void togglePin()}
                >
                  {rows[floatingPreview.row]?.pinned ? "Pinned row" : "Pin row"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={floatingPreview.cell.owned_qty <= 0}
                  onClick={() => void decOwned()}
                >
                  Remove one
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={rows[floatingPreview.row]?.quick_pin_row ? "secondary" : "outline"}
                  onClick={() => {
                    const row = rows[floatingPreview.row];
                    if (row) toggleQuickPinRowForOracle(row.oracle_id);
                  }}
                >
                  {rows[floatingPreview.row]?.quick_pin_row ? "Quick-pin row ✓" : "Quick-pin row"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={columns[floatingPreview.col]?.quick_pin_column ? "secondary" : "outline"}
                  disabled={Boolean(columns[floatingPreview.col]?.code?.startsWith("__"))}
                  onClick={() => {
                    const code = columns[floatingPreview.col]?.code;
                    if (code) toggleQuickPinColForCode(code);
                  }}
                >
                  {columns[floatingPreview.col]?.quick_pin_column ? "Quick-pin col ✓" : "Quick-pin column"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={openCardDetail}>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  Expand
                </Button>
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
          </SheetContent>
        </Sheet>
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
            <li>W: watchlist · P: pin to favorites strip (API)</li>
            <li>
              Quick-pin row/column: buttons in cell preview, name popover, or edition popover; stored in URL{" "}
              <span className="font-mono">qr</span> / <span className="font-mono">qc</span> (session, not
              card-level)
            </li>
            <li>F: filter sheet (draft until Apply) · /: search · Esc: close panels</li>
            <li>⌘K / Ctrl+K: command palette</li>
            <li>G then O / W / H: Owned / Watchlist / Home</li>
            <li>
              URL: colSort (release, release_desc, code, name, type_release); hideSets, exclTypes,
              exclGroups (preset column groups); sets = allowlist columns
            </li>
            <li>
              <span className="font-medium text-foreground">Display toggles (chip bar)</span>:{" "}
              <em>Empty columns</em> adds every in-scope set as a column even when no row has a card there.{" "}
              <em>Strict cells</em> draws non-matching printings as blank squares; leave off for dimmed
              &quot;context&quot; cells. <em>Pinned strip</em> keeps favorited oracle cards in a block at
              the top (separate from <em>Pinned only</em> in the sheet, which filters the row list).
            </li>
            <li>
              sort / sk: price_min | price_median | price_max with asc/desc; optional hcol= set code for
              temporary column sort; strict=1 and emptyCols=1 mirror the chip toggles; grid keeps the set
              header row and card name column fixed while you scroll
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
