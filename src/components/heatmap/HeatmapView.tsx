"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
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
import type { CellDTO, ColumnMeta, RowDTO } from "@/lib/heatmap-query";
import type { PriceMode } from "@/lib/price-scale";
import { normalizedColSort, normalizedRowSort } from "@/lib/heatmap-url-params";
import { HeatmapCommandPalette } from "./HeatmapCommandPalette";
import { HeatmapFilterColumns } from "./HeatmapFilterColumns";
import { HeatmapGrid } from "./HeatmapGrid";
import { Legend } from "./Legend";
import { Separator } from "@/components/ui/separator";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

type HeatmapResponse = { columns: ColumnMeta[]; rows: RowDTO[]; total: number };

const RARITIES = ["common", "uncommon", "rare", "mythic", "special", "bonus"] as const;

export function HeatmapView() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const queryString = useMemo(() => sp.toString(), [sp]);
  const colSortSelectValue = useMemo(() => normalizedColSort(sp), [sp]);
  const rowSortSelectValue = useMemo(() => normalizedRowSort(sp), [sp]);

  useEffect(() => {
    const rawCol = sp.get("colSort");
    const rawSort = sp.get("sort");
    // #region agent log
    fetch("http://127.0.0.1:7544/ingest/d3bac746-7f30-4189-a378-b3d32ca27dd5", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e53e3b" },
      body: JSON.stringify({
        sessionId: "e53e3b",
        hypothesisId: "H_empty_select_value",
        location: "HeatmapView.tsx",
        message: "sort URL params vs normalized Select values",
        data: {
          rawCol,
          rawSort,
          colSortSelectValue,
          rowSortSelectValue,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [sp, colSortSelectValue, rowSortSelectValue]);

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
  } | null>(null);
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

  const maxR = Math.max(0, rows.length - 1);
  const maxC = Math.max(0, columns.length - 1);
  const rowIndex = rows.length ? Math.min(Math.max(0, selR), maxR) : 0;
  const colIndex = columns.length ? Math.min(Math.max(0, selC), maxC) : 0;

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
        setCmdOpen(false);
        setHelpOpen(false);
        setFiltersOpen(false);
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
  ]);

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <HeatmapCommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onApplySearch={(q) => setParam("q", q)}
      />

      <header className="flex flex-wrap items-center justify-between gap-3">
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
                    defaultValue={sp.get("q") ?? ""}
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
                      <SelectItem value="price_min">USD: best (min)</SelectItem>
                      <SelectItem value="price_avg">USD: mean (non-null)</SelectItem>
                      <SelectItem value="price_max">USD: highest (max)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Uses <span className="font-mono">COALESCE(usd, usd_foil)</span> on each visible
                    column (same set list as column filters). Min finds the cheapest printing among
                    editions shown; mean averages priced cells; max ranks by top printing. Median is
                    skipped for now (extra SQL and often noisy with many empty cells).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="yMin">Year min</Label>
                    <Input
                      id="yMin"
                      type="number"
                      defaultValue={sp.get("yearMin") ?? ""}
                      onBlur={(e) => setParam("yearMin", e.target.value.trim() || null)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="yMax">Year max</Label>
                    <Input
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

      <Legend dark={dark} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
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

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">Failed to load heatmap.</p> : null}

      {!isLoading && !error ? (
        <HeatmapGrid
          columns={columns}
          rows={rows}
          priceMode={priceMode}
          dark={dark}
          selectedRow={rowIndex}
          selectedCol={colIndex}
          onSelectCell={(r, c) => {
            setSelR(r);
            setSelC(c);
          }}
          onHoverCell={(r, c, cell, x, y) => setHover({ row: r, col: c, cell, x, y })}
          onLeaveGrid={() => setHover(null)}
        />
      ) : null}

      {hover?.cell ? (
        <div
          className="pointer-events-none fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="flex gap-3">
            {hover.cell.image_small ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hover.cell.image_small}
                alt=""
                width={120}
                height={168}
                className="h-40 w-[7.5rem] rounded-md border border-border object-cover"
              />
            ) : null}
            <div className="min-w-0 space-y-1 text-sm">
              <div className="font-medium leading-tight">{rows[hover.row]?.name}</div>
              <div className="text-muted-foreground">
                {columns[hover.col]?.name} ({columns[hover.col]?.release_date})
              </div>
              <div className="font-mono text-xs">
                USD {hover.cell.usd ?? "—"} · Foil {hover.cell.usd_foil ?? "—"}
              </div>
              <div className="pointer-events-auto flex flex-wrap gap-2 pt-2">
                {hover.cell.scryfall_uri ? (
                  <a
                    href={hover.cell.scryfall_uri}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    Scryfall
                  </a>
                ) : null}
                {hover.cell.tcgplayer_url ? (
                  <a
                    href={hover.cell.tcgplayer_url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    TCGplayer
                  </a>
                ) : null}
                {hover.cell.cardmarket_url ? (
                  <a
                    href={hover.cell.cardmarket_url}
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
              sort=price_min | price_avg | price_max (USD aggregate across heatmap columns); grid keeps
              the set header row and card name column fixed while you scroll
            </li>
          </ul>
        </SheetContent>
      </Sheet>

      <footer className="text-center text-xs text-muted-foreground">
        Card data from{" "}
        <a className="underline" href="https://scryfall.com">
          Scryfall
        </a>
        . Not affiliated with Wizards of the Coast.
      </footer>
    </div>
  );
}
