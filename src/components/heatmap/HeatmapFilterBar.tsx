"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnMeta } from "@/lib/heatmap-query";
import type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
import { defaultHeatmapFilters, slotsToPrimarySortString } from "@/lib/filter-state";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { heatmapFiltersToTanStackState } from "@/lib/heatmap/tanstack-adapter";
import {
  deleteSavedView,
  duplicateSavedView,
  ensureSavedViewsLoaded,
  persistSavedViews,
  type SavedView,
  upsertSavedView,
} from "@/lib/saved-views";
import { HEATMAP_FILTER_TIPS } from "@/lib/heatmap-filter-tips";
import { cn } from "@/lib/utils";
import { HeatmapFilterColumns } from "./HeatmapFilterColumns";
import { FilterFieldTip } from "./FilterFieldTip";
import { useQuery } from "@tanstack/react-query";

export type ViewSessionMeta = { activeViewId: string | null; snapshotQuery: string | null };

const RARITIES = ["common", "uncommon", "rare", "mythic", "special", "bonus"] as const;
const COLOR_IDENTITY = ["W", "U", "B", "R", "G", "C"] as const;

type Props = {
  queryString: string;
  columns: ColumnMeta[];
  onReplaceQuery: (params: URLSearchParams) => void;
  /** Optional: drive sorting through TanStack state instead of local URL patching. */
  onSortingChange?: (sorting: SortingState) => void;
  /** Optional: drive column visibility through TanStack state. */
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  activeViewId: string | null;
  snapshotQuery: string | null;
  onViewSessionChange: (m: ViewSessionMeta) => void;
  filtersRootOpen: boolean;
  onFiltersRootOpenChange: (open: boolean) => void;
  density: "comfy" | "compact";
  onDensityChange: (d: "comfy" | "compact") => void;
  onOpenCommandPalette: () => void;
  onOpenKeyboardHelp: () => void;
  onPersistNav?: () => void;
  /** Open collection overlays instead of navigating away (heatmap shell). */
  onOpenOwnedPanel?: () => void;
  onOpenWishlistPanel?: () => void;
};

function filtersFromQuery(qs: string): HeatmapFilters {
  return parseHeatmapUrlSearchParams(new URLSearchParams(qs));
}

function applyFilters(onReplaceQuery: (p: URLSearchParams) => void, f: HeatmapFilters) {
  onReplaceQuery(serializeHeatmapUrlParams({ ...defaultHeatmapFilters, ...f }));
}

const SORT_LABEL: Record<SortSlot["key"], string> = {
  name: "Name",
  printings: "Printings",
  reserved: "Reserved",
  price_min: "Min $",
  price_max: "Max $",
  price_median: "Median $",
};

export function HeatmapFilterBar({
  queryString,
  columns,
  onReplaceQuery,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
  activeViewId,
  snapshotQuery,
  onViewSessionChange,
  filtersRootOpen,
  onFiltersRootOpenChange,
  density,
  onDensityChange,
  onOpenCommandPalette,
  onOpenKeyboardHelp,
  onPersistNav,
  onOpenOwnedPanel,
  onOpenWishlistPanel,
}: Props) {
  const router = useRouter();
  const f = useMemo(() => filtersFromQuery(queryString), [queryString]);

  const facetsUrl = useMemo(() => `/api/heatmap/facets?${queryString}`, [queryString]);
  const { data: facets } = useQuery<{
    total: number;
    rarity: { key: string; n: number }[];
    colorIdentity: { key: string; n: number }[];
    rowScope: { owned: number; watchlist: number; pinned: number; reserved: number };
    formats: { key: string; n: number }[];
    types: { key: string; n: number }[];
    topSets: { code: string; name: string; n: number }[];
    cmc: { min: number | null; max: number | null };
    priceUsdLike: { min: number | null; max: number | null };
    year: { min: number | null; max: number | null };
  }>({
    queryKey: ["heatmap-facets", facetsUrl],
    queryFn: async () => {
      const res = await fetch(facetsUrl);
      if (!res.ok) throw new Error("facets");
      return res.json();
    },
    staleTime: 15_000,
  });
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [newName, setNewName] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startTransition(() => setSavedViews(ensureSavedViewsLoaded()));
  }, []);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!savedViews.length) return;
    const hit = savedViews.find((v) => v.query === queryString);
    if (!hit) return;
    if (activeViewId === hit.id && snapshotQuery === hit.query) return;
    if (activeViewId && snapshotQuery != null && queryString !== snapshotQuery) return;
    startTransition(() => onViewSessionChange({ activeViewId: hit.id, snapshotQuery: hit.query }));
  }, [queryString, savedViews, activeViewId, snapshotQuery, onViewSessionChange]);

  const dirty = useMemo(() => {
    if (!activeViewId || snapshotQuery == null) return false;
    return queryString !== snapshotQuery;
  }, [activeViewId, queryString, snapshotQuery]);

  const selectView = useCallback(
    (v: SavedView) => {
      onViewSessionChange({ activeViewId: v.id, snapshotQuery: v.query });
      onReplaceQuery(new URLSearchParams(v.query));
    },
    [onReplaceQuery, onViewSessionChange],
  );

  const saveActiveView = useCallback(() => {
    if (!activeViewId) return;
    const next = savedViews.map((v) => (v.id === activeViewId ? { ...v, query: queryString } : v));
    setSavedViews(next);
    persistSavedViews(next);
    onViewSessionChange({ activeViewId, snapshotQuery: queryString });
  }, [activeViewId, queryString, savedViews, onViewSessionChange]);

  const createView = useCallback(() => {
    const name = newName.trim() || `View ${savedViews.length + 1}`;
    const v: SavedView = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      query: queryString,
    };
    const next = upsertSavedView(savedViews, v);
    setSavedViews(next);
    onViewSessionChange({ activeViewId: v.id, snapshotQuery: queryString });
    setNewName("");
  }, [newName, queryString, savedViews, onViewSessionChange]);

  const quickNewView = useCallback(() => {
    const name = `View ${savedViews.length + 1}`;
    const v: SavedView = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      query: queryString,
    };
    const next = upsertSavedView(savedViews, v);
    setSavedViews(next);
    onViewSessionChange({ activeViewId: v.id, snapshotQuery: queryString });
  }, [queryString, savedViews, onViewSessionChange]);

  const patch = useCallback(
    (mut: (base: HeatmapFilters) => HeatmapFilters) => {
      const base = filtersFromQuery(queryString);
      applyFilters(onReplaceQuery, mut(base));
    },
    [onReplaceQuery, queryString],
  );

  const applySearchDebounced = useCallback(
    (text: string) => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        patch((b) => ({ ...b, search: text }));
      }, 320);
    },
    [patch],
  );

  const setSortSlots = (slots: SortSlot[]) => {
    const next = slots.slice(0, 3);
    const resolved: SortSlot[] = next.length ? next : [{ key: "name", dir: null }];
    if (onSortingChange) {
      // Let the parent (HeatmapView) serialize sorting into URL params via adapter.
      const sorting = heatmapFiltersToTanStackState({ ...f, sortSlots: resolved }).sorting;
      onSortingChange(sorting);
      return;
    }
    patch((b) => ({
      ...b,
      sortSlots: resolved,
      sort: slotsToPrimarySortString(resolved),
    }));
  };

  const primarySort = f.sortSlots[0] ?? { key: "name" as const, dir: null };

  const raritySummary =
    f.rarity.length === 0 ? "Any rarity" : `${f.rarity.length} rarity type${f.rarity.length === 1 ? "" : "s"}`;

  const rarityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of facets?.rarity ?? []) m.set(r.key, r.n);
    return m;
  }, [facets]);

  const colorCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of facets?.colorIdentity ?? []) m.set(r.key, r.n);
    return m;
  }, [facets]);

  const facetSummary = useMemo(() => {
    if (!facets) return null;
    const year =
      facets.year.min != null && facets.year.max != null ? `${facets.year.min}–${facets.year.max}` : null;
    const cmc =
      facets.cmc.min != null && facets.cmc.max != null
        ? `${facets.cmc.min.toLocaleString(undefined, { maximumFractionDigits: 1 })}–${facets.cmc.max.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
        : null;
    const price =
      facets.priceUsdLike.min != null && facets.priceUsdLike.max != null
        ? `$${facets.priceUsdLike.min.toFixed(2)}–$${facets.priceUsdLike.max.toFixed(2)}`
        : null;
    return { year, cmc, price };
  }, [facets]);

  const rowOptionsCount = useMemo(() => {
    let n = 0;
    if (f.includeDigital) n++;
    if (f.reservedOnly) n++;
    if (f.owned === true) n++;
    if (f.watchlist === true) n++;
    if (f.pinned === true) n++;
    return n;
  }, [f.includeDigital, f.reservedOnly, f.owned, f.watchlist, f.pinned]);

  const cardSearchMountKey = useMemo(() => new URLSearchParams(queryString).get("q") ?? "", [queryString]);

  const toggleRarity = (r: string) => {
    patch((b) => {
      const s = new Set(b.rarity);
      if (s.has(r)) s.delete(r);
      else s.add(r);
      return { ...b, rarity: [...s].sort() };
    });
  };

  const toggleColorIdentity = (c: string) => {
    patch((b) => {
      const s = new Set(b.colors);
      if (s.has(c)) s.delete(c);
      else s.add(c);
      return { ...b, colors: [...s].sort() };
    });
  };

  const toggleFormat = (fmt: string) => {
    patch((b) => {
      const s = new Set(b.formats);
      if (s.has(fmt)) s.delete(fmt);
      else s.add(fmt);
      return { ...b, formats: [...s].sort() };
    });
  };

  const toggleType = (t: string) => {
    patch((b) => {
      const s = new Set(b.types);
      if (s.has(t)) s.delete(t);
      else s.add(t);
      return { ...b, types: [...s].sort() };
    });
  };

  const showEmptyPatch = {
    checked: f.showEmptyColumns,
    onChange: (v: boolean) => patch((b) => ({ ...b, showEmptyColumns: v })),
  };

  return (
    <div
      className="flex min-h-0 shrink-0 flex-col rounded-lg border border-border bg-muted/20 text-sm"
      suppressHydrationWarning
    >
      {/* Toolbar: matches wireframe — toggle, title, views, search, more */}
      <div className="flex min-h-10 w-full items-center gap-1.5 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded-md p-1 hover:bg-muted/50"
          onClick={() => onFiltersRootOpenChange(!filtersRootOpen)}
          aria-expanded={filtersRootOpen}
          aria-label={filtersRootOpen ? "Collapse filters" : "Expand filters"}
        >
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              filtersRootOpen && "rotate-90",
            )}
          />
        </button>
        <span className="hidden shrink-0 font-medium sm:inline">Filter &amp; Sort</span>

        <div className="min-h-8 min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1 pr-1">
            {savedViews.map((v) => (
              <Button
                key={v.id}
                type="button"
                variant={activeViewId === v.id ? "secondary" : "outline"}
                size="sm"
                className="h-8 shrink-0 rounded-full px-3 text-xs"
                onClick={() => selectView(v)}
              >
                {v.name}
                {activeViewId === v.id && dirty ? (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved" />
                ) : null}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={quickNewView}>
              + New
            </Button>
          </div>
        </div>

        <div className="relative min-w-0 max-w-[42%] sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="heatmap-search"
            className="h-8 border-border/80 bg-background pl-8 text-xs"
            placeholder="Search cards…"
            defaultValue={f.search}
            key={cardSearchMountKey}
            onChange={(e) => applySearchDebounced(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                patch((b) => ({ ...b, search: (e.target as HTMLInputElement).value }));
              }
            }}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "size-8 shrink-0 sm:size-9",
            )}
            aria-label="More view and display options"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {activeViewId ? (
              <>
                <DropdownMenuItem disabled={!dirty} onClick={saveActiveView}>
                  Save view
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">New saved view</DropdownMenuLabel>
              <div className="flex gap-2 px-2 pb-2">
                <Input
                  placeholder="Name"
                  className="h-8 text-xs"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Button type="button" size="sm" className="h-8 shrink-0 text-xs" onClick={createView}>
                  Save as…
                </Button>
              </div>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onPersistNav?.();
                if (onOpenOwnedPanel) onOpenOwnedPanel();
                else router.push("/owned");
              }}
            >
              Owned
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onPersistNav?.();
                if (onOpenWishlistPanel) onOpenWishlistPanel();
                else router.push("/watchlist");
              }}
            >
              Watchlist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenCommandPalette}>Command palette (⌘K)</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenKeyboardHelp}>Keyboard shortcuts (?)</DropdownMenuItem>
            <DropdownMenuSeparator />
            {activeViewId ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    if (!activeViewId) return;
                    setSavedViews(duplicateSavedView(savedViews, activeViewId));
                  }}
                >
                  Duplicate view
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (!activeViewId) return;
                    const next = deleteSavedView(savedViews, activeViewId);
                    setSavedViews(next);
                    onViewSessionChange({ activeViewId: null, snapshotQuery: null });
                  }}
                >
                  Delete view
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">Display</DropdownMenuLabel>
              <div className="space-y-2 px-2 pb-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Price field</span>
                  <Select
                    value={f.cellPriceField}
                    onValueChange={(v) =>
                      patch((b) => ({
                        ...b,
                        cellPriceField: v === "usd_foil" || v === "eur" || v === "tix" ? v : "usd",
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD</SelectItem>
                      <SelectItem value="usd_foil">USD foil</SelectItem>
                      <SelectItem value="eur">EUR</SelectItem>
                      <SelectItem value="tix">TIX</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Density</span>
                  <Select value={density} onValueChange={(v) => onDensityChange(v === "compact" ? "compact" : "comfy")}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfy">Comfy</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={f.matchMode === "strict"}
                    onCheckedChange={(v) => patch((b) => ({ ...b, matchMode: v ? "strict" : "context" }))}
                  />
                  Strict cells
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={f.showPinned} onCheckedChange={(v) => patch((b) => ({ ...b, showPinned: Boolean(v) }))} />
                  Pinned strip
                </label>
              </div>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtersRootOpen ? (
        <div className="max-h-[min(58dvh,520px)] overflow-y-auto border-t border-border px-2 pb-3 pt-2 sm:max-h-[min(70dvh,720px)] sm:px-3">
          {facetSummary ? (
            <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {facetSummary.year ? <Badge variant="secondary">Year: {facetSummary.year}</Badge> : null}
              {facetSummary.cmc ? <Badge variant="secondary">CMC: {facetSummary.cmc}</Badge> : null}
              {facetSummary.price ? <Badge variant="secondary">Price: {facetSummary.price}</Badge> : null}
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* Rows */}
            <section className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rows
              </p>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,200px)]">
                <div className="space-y-3 rounded-md border border-border/70 bg-background/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Filter by</p>
                  <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetSearch} side="right" className="block w-full">
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      Card name matching uses the{" "}
                      <span className="font-medium text-foreground">Search cards…</span> field in the top bar — not
                      duplicated here.
                    </span>
                  </FilterFieldTip>
                  <FilterFieldTip tip={HEATMAP_FILTER_TIPS.facetsBadge} side="right">
                    <Badge variant="secondary" className="font-normal">
                      {f.rarity.length ||
                      f.yearMin != null ||
                      f.yearMax != null ||
                      f.cmcMin != null ||
                      f.cmcMax != null ||
                      f.priceMin != null ||
                      f.priceMax != null
                        ? "Facets on"
                        : "No numeric facets"}
                    </Badge>
                  </FilterFieldTip>
                  <div className="grid grid-cols-2 gap-3">
                    <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetYear} side="right">
                      <div className="space-y-1">
                        <Label className="text-xs">Year min</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={f.yearMin ?? ""}
                          onChange={(e) =>
                            patch((b) => ({
                              ...b,
                              yearMin: e.target.value === "" ? null : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </FilterFieldTip>
                    <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetYear} side="right">
                      <div className="space-y-1">
                        <Label className="text-xs">Year max</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={f.yearMax ?? ""}
                          onChange={(e) =>
                            patch((b) => ({
                              ...b,
                              yearMax: e.target.value === "" ? null : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </FilterFieldTip>
                    <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetCmc} side="right">
                      <div className="space-y-1">
                        <Label className="text-xs">CMC min</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min={0}
                          className="h-8 text-xs"
                          value={f.cmcMin ?? ""}
                          onChange={(e) =>
                            patch((b) => ({
                              ...b,
                              cmcMin: e.target.value === "" ? null : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </FilterFieldTip>
                    <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetCmc} side="right">
                      <div className="space-y-1">
                        <Label className="text-xs">CMC max</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min={0}
                          className="h-8 text-xs"
                          value={f.cmcMax ?? ""}
                          onChange={(e) =>
                            patch((b) => ({
                              ...b,
                              cmcMax: e.target.value === "" ? null : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </FilterFieldTip>
                    <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetPrice} side="right">
                      <div className="space-y-1">
                        <Label className="text-xs">Price min $</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-xs"
                          value={f.priceMin ?? ""}
                          onChange={(e) =>
                            patch((b) => ({
                              ...b,
                              priceMin: e.target.value === "" ? null : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </FilterFieldTip>
                    <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetPrice} side="right">
                      <div className="space-y-1">
                        <Label className="text-xs">Price max $</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-xs"
                          value={f.priceMax ?? ""}
                          onChange={(e) =>
                            patch((b) => ({
                              ...b,
                              priceMax: e.target.value === "" ? null : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </FilterFieldTip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-2 text-xs")}
                      >
                        Rarity: {raritySummary}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-52" align="start">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs">Rarities (multi)</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {RARITIES.map((r) => (
                            <DropdownMenuCheckboxItem
                              key={r}
                              checked={f.rarity.includes(r)}
                              onCheckedChange={() => toggleRarity(r)}
                              className="capitalize"
                            >
                              <span className="flex w-full items-center justify-between gap-2">
                                <span>{r}</span>
                                {rarityCounts.has(r) ? (
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {rarityCounts.get(r)!.toLocaleString()}
                                  </span>
                                ) : null}
                              </span>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-2 text-xs")}
                      >
                        Color ID:{" "}
                        {f.colors.length
                          ? f.colors.join("")
                          : colorCounts.has("(none)")
                            ? `Any (colorless ${colorCounts.get("(none)")!.toLocaleString()})`
                            : "Any"}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56" align="start">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs">Color identity (multi)</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {COLOR_IDENTITY.map((c) => (
                            <DropdownMenuCheckboxItem
                              key={c}
                              checked={f.colors.includes(c)}
                              onCheckedChange={() => toggleColorIdentity(c)}
                              className="font-mono"
                            >
                              <span className="flex w-full items-center justify-between gap-2">
                                <span>{c === "C" ? "Colorless" : c}</span>
                                {c === "C" ? (
                                  colorCounts.has("(none)") ? (
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                      {colorCounts.get("(none)")!.toLocaleString()}
                                    </span>
                                  ) : null
                                ) : colorCounts.has(c) ? (
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {colorCounts.get(c)!.toLocaleString()}
                                  </span>
                                ) : null}
                              </span>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-2 text-xs")}
                      >
                        Formats{f.formats.length ? ` (${f.formats.length})` : ""}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-64" align="start">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs">Formats (multi)</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {(facets?.formats ?? []).map((fmt) => (
                            <DropdownMenuCheckboxItem
                              key={fmt.key}
                              checked={f.formats.includes(fmt.key)}
                              onCheckedChange={() => toggleFormat(fmt.key)}
                              className="font-mono"
                            >
                              <span className="flex w-full items-center justify-between gap-2">
                                <span>{fmt.key}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {fmt.n.toLocaleString()}
                                </span>
                              </span>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-2 text-xs")}
                      >
                        Types{f.types.length ? ` (${f.types.length})` : ""}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-72" align="start">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs">Type prefixes (multi)</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {(facets?.types ?? []).map((t) => (
                            <DropdownMenuCheckboxItem
                              key={t.key}
                              checked={f.types.includes(t.key)}
                              onCheckedChange={() => toggleType(t.key)}
                              className="font-mono"
                            >
                              <span className="flex w-full items-center justify-between gap-2">
                                <span className="truncate">{t.key}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {t.n.toLocaleString()}
                                </span>
                              </span>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-2 text-xs")}
                      >
                        Row scope{rowOptionsCount ? ` (${rowOptionsCount})` : ""}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-60" align="start">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs">Restrict rows</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            checked={f.includeDigital}
                            onCheckedChange={(v) => patch((b) => ({ ...b, includeDigital: Boolean(v) }))}
                          >
                            Include digital sets
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={Boolean(f.reservedOnly)}
                            onCheckedChange={(v) => patch((b) => ({ ...b, reservedOnly: v ? true : null }))}
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span>Reserved List only</span>
                              {facets?.rowScope ? (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {facets.rowScope.reserved.toLocaleString()}
                                </span>
                              ) : null}
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={f.owned === true}
                            onCheckedChange={(v) => patch((b) => ({ ...b, owned: v ? true : null }))}
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span>Owned only</span>
                              {facets?.rowScope ? (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {facets.rowScope.owned.toLocaleString()}
                                </span>
                              ) : null}
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={f.watchlist === true}
                            onCheckedChange={(v) => patch((b) => ({ ...b, watchlist: v ? true : null }))}
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span>Watchlist only</span>
                              {facets?.rowScope ? (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {facets.rowScope.watchlist.toLocaleString()}
                                </span>
                              ) : null}
                            </span>
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={f.pinned === true}
                            onCheckedChange={(v) => patch((b) => ({ ...b, pinned: v ? true : null }))}
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span>Pinned only</span>
                              {facets?.rowScope ? (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {facets.rowScope.pinned.toLocaleString()}
                                </span>
                              ) : null}
                            </span>
                          </DropdownMenuCheckboxItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <FilterFieldTip tip={HEATMAP_FILTER_TIPS.specialGroup} side="right">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Special group slug</Label>
                      <Input
                        className="h-8 text-xs"
                        value={f.specialGroup ?? ""}
                        onChange={(e) => patch((b) => ({ ...b, specialGroup: e.target.value.trim() || null }))}
                        placeholder="e.g. power_nine"
                      />
                    </div>
                  </FilterFieldTip>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="space-y-3 rounded-md border border-border/70 bg-background/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Sort by</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <FilterFieldTip tip={HEATMAP_FILTER_TIPS.primarySort} side="right">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Sort rows</Label>
                          <Select
                            value={primarySort.key}
                            onValueChange={(key) => {
                              const k = key as SortSlot["key"];
                              const dir: SortSlot["dir"] =
                                k === "price_min" ? "asc" : k.startsWith("price_") ? "desc" : null;
                              setSortSlots([{ key: k, dir }]);
                            }}
                          >
                            <SelectTrigger className="h-8 min-w-[10rem] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(SORT_LABEL) as SortSlot["key"][]).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {SORT_LABEL[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </FilterFieldTip>
                      {primarySort.key.startsWith("price_") ? (
                        <Select
                          value={primarySort.dir ?? (primarySort.key === "price_min" ? "asc" : "desc")}
                          onValueChange={(dir) => {
                            const d = dir as "asc" | "desc";
                            setSortSlots([{ ...primarySort, dir: d }, ...f.sortSlots.slice(1, 3)]);
                          }}
                        >
                          <SelectTrigger className="h-8 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asc">Asc</SelectItem>
                            <SelectItem value="desc">Desc</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : null}
                      <FilterFieldTip
                        tip={
                          f.valueAggScope === "all" ? HEATMAP_FILTER_TIPS.valueAggAll : HEATMAP_FILTER_TIPS.valueAggVisible
                        }
                        side="right"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">$ aggregate scope</Label>
                          <Select
                            value={f.valueAggScope}
                            onValueChange={(v) => patch((b) => ({ ...b, valueAggScope: v === "all" ? "all" : "visible" }))}
                          >
                            <SelectTrigger className="h-8 w-[10.5rem] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="visible">Visible columns</SelectItem>
                              <SelectItem value="all">All printings</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FilterFieldTip>
                    </div>
                    {f.sortSlots.length > 1 ? (
                      <p className="text-[11px] text-muted-foreground">
                        +{f.sortSlots.length - 1} tiebreak via <code className="rounded bg-muted px-1">sk=</code>
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
                      {f.headerSortSetCode ? (
                        <Badge variant="outline" className="gap-1 font-mono text-[10px]">
                          Col sort: {f.headerSortSetCode.toUpperCase()}
                          <button
                            type="button"
                            className="ml-1 rounded hover:bg-muted"
                            aria-label="Clear column sort"
                            onClick={() => patch((b) => ({ ...b, headerSortSetCode: null }))}
                          >
                            ×
                          </button>
                        </Badge>
                      ) : null}
                      {columns.length > 0 && columns[0]?.set_type !== "aggregate" ? (
                        <FilterFieldTip tip={HEATMAP_FILTER_TIPS.headerColumnSort} side="top">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Sort by column</Label>
                            <Select
                              value={
                                f.headerSortSetCode &&
                                columns.some((c) => c.code === f.headerSortSetCode)
                                  ? f.headerSortSetCode
                                  : "__none__"
                              }
                              onValueChange={(code) => {
                                if (code === "__none__") return;
                                patch((b) => ({ ...b, headerSortSetCode: code }));
                              }}
                            >
                              <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                                <SelectValue placeholder="Pick set column…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Pick set…</SelectItem>
                                {columns.map((c) => (
                                  <SelectItem key={c.code} value={c.code}>
                                    {c.code.toUpperCase()} — {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </FilterFieldTip>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-md border border-border/70 bg-background/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Group by</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <FilterFieldTip tip={HEATMAP_FILTER_TIPS.groupBy} side="right">
                        <div className="space-y-1">
                          <Select
                            value={f.groupBy}
                            onValueChange={(v) =>
                              patch((b) => ({
                                ...b,
                                groupBy: v === "reserved" || v === "color" || v === "type" ? v : "none",
                                groupCollapsedKeys: [],
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="reserved">Reserved</SelectItem>
                              <SelectItem value="color">Color (CI)</SelectItem>
                              <SelectItem value="type">Type prefix</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FilterFieldTip>
                      {f.groupCollapsedKeys.length ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => patch((b) => ({ ...b, groupCollapsedKeys: [] }))}
                        >
                          Expand all groups
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Columns */}
            <section className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Columns
              </p>
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-border/70 bg-background/40 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Filter by</p>
                  <HeatmapFilterColumns
                    variant="columnFilters"
                    queryString={queryString}
                    onReplaceQuery={onReplaceQuery}
                    showEmptyColumns={showEmptyPatch}
                    currentColumns={columns}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={onColumnVisibilityChange}
                    topSets={facets?.topSets ?? []}
                  />
                </div>
                <div className="rounded-md border border-border/70 bg-background/40 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Sort by</p>
                  <HeatmapFilterColumns
                    variant="columnSort"
                    queryString={queryString}
                    onReplaceQuery={onReplaceQuery}
                    showEmptyColumns={showEmptyPatch}
                    currentColumns={columns}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={onColumnVisibilityChange}
                    topSets={facets?.topSets ?? []}
                  />
                </div>
              </div>
            </section>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            <span className="sr-only">Tip:</span>
            Press <kbd className="rounded border border-border px-1 font-mono text-[10px]">F</kbd> to toggle this panel.
          </p>
        </div>
      ) : null}
    </div>
  );
}
