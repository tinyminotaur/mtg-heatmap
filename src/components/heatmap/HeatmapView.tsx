"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { CellDTO, ColumnMeta, RowDTO } from "@/lib/heatmap-query";
import type { PriceMode } from "@/lib/price-scale";
import { HeatmapGrid } from "./HeatmapGrid";
import { Legend } from "./Legend";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

type HeatmapResponse = { columns: ColumnMeta[]; rows: RowDTO[]; total: number };

export function HeatmapView() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const queryString = useMemo(() => sp.toString(), [sp]);
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

  const rows = useMemo(() => (data?.rows ?? []) as RowDTO[], [data?.rows]);
  const columns = useMemo(() => data?.columns ?? [], [data?.columns]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(sp.toString());
      if (value === null || value === "") p.delete(key);
      else p.set(key, value);
      router.replace(`/?${p.toString()}`);
    },
    [router, sp],
  );

  const toggleOwned = useCallback(async () => {
    const cell = rows[selR]?.cells[selC];
    if (!cell) return;
    await fetch("/api/owned/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scryfall_id: cell.scryfall_id }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
    await qc.invalidateQueries({ queryKey: ["portfolio"] });
  }, [qc, rows, selC, selR]);

  const decOwned = useCallback(async () => {
    const cell = rows[selR]?.cells[selC];
    if (!cell) return;
    await fetch("/api/owned/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scryfall_id: cell.scryfall_id, action: "remove" }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
    await qc.invalidateQueries({ queryKey: ["portfolio"] });
  }, [qc, rows, selC, selR]);

  const toggleWatch = useCallback(async () => {
    const cell = rows[selR]?.cells[selC];
    if (!cell) return;
    await fetch("/api/watchlist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scryfall_id: cell.scryfall_id }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
  }, [qc, rows, selC, selR]);

  const togglePin = useCallback(async () => {
    const row = rows[selR];
    if (!row) return;
    await fetch("/api/pinned/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oracle_id: row.oracle_id }),
    });
    await qc.invalidateQueries({ queryKey: ["heatmap"] });
  }, [qc, rows, selR]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
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
    return () => window.removeEventListener("keydown", onKey);
  }, [columns.length, decOwned, rows.length, toggleOwned, togglePin, toggleWatch]);

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">MTG Heatmap</h1>
          <p className="text-sm text-muted-foreground">
            Rows = cards · Columns = sets (chronological) · POC ≤ 2005
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/owned" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Owned
          </Link>
          <Link href="/watchlist" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Watchlist
          </Link>
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
              <div className="mt-4 space-y-4 text-sm">
                <div className="space-y-2">
                  <Label>Search</Label>
                  <Input
                    id="heatmap-search"
                    defaultValue={sp.get("q") ?? ""}
                    onChange={(e) => setParam("q", e.target.value || null)}
                    placeholder="Card name contains…"
                  />
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
                <div className="space-y-2">
                  <Label>Special group</Label>
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

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">Failed to load heatmap.</p> : null}

      {!isLoading && !error ? (
        <HeatmapGrid
          columns={columns}
          rows={rows}
          priceMode={priceMode}
          dark={dark}
          selectedRow={selR}
          selectedCol={selC}
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
            <li>O: add owned copy · Shift+O: remove one</li>
            <li>W: watchlist · P: pin</li>
            <li>F: filters · /: search</li>
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
