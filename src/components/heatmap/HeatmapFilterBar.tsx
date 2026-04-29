"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Filter, MoreHorizontal, Settings } from "lucide-react";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnMeta } from "@/lib/heatmap-query";
import type { SortSlot } from "@/lib/filter-state";
import { defaultHeatmapFilters, slotsToPrimarySortString } from "@/lib/filter-state";
import { serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";
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
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHeatmapUrlFilters } from "@/hooks/use-heatmap-url-filters";
import { applyRowStatus, rowStatusFromFilters, type RowStatusTab } from "@/lib/heatmap/row-status";
import { HEATMAP_MAX_PAGE_SIZE } from "@/lib/constants";
import { buildActiveFilterChips, clearChip } from "@/lib/heatmap/active-filter-chips";
import { ActiveFiltersRow, type ResultStatsSummary } from "@/components/heatmap/filter-bar/ActiveFiltersRow";
import { ColorFilter, type ColorLaneIntent } from "@/components/heatmap/filter-bar/ColorFilter";
import { cycleColorPip, moveColorPip } from "@/lib/heatmap/color-lanes";
import { FilterSearch } from "@/components/heatmap/filter-bar/FilterSearch";
import { PriceFilter } from "@/components/heatmap/filter-bar/PriceFilter";
import { RarityFilter } from "@/components/heatmap/filter-bar/RarityFilter";
import { SaveViewDialog } from "@/components/heatmap/filter-bar/SaveViewDialog";
import { SetsPicker } from "@/components/heatmap/filter-bar/SetsPicker";
import { SavedViewTabs } from "@/components/heatmap/filter-bar/SavedViewTabs";
import { StatusTabs } from "@/components/heatmap/filter-bar/StatusTabs";

export type ViewSessionMeta = { activeViewId: string | null; snapshotQuery: string | null };

const EXTRA_RARITIES = ["special", "bonus"] as const;
const RARITY_PILLS = ["common", "uncommon", "rare", "mythic"] as const;
const TYPE_PILLS = ["creature", "instant", "sorcery", "enchantment", "artifact", "land"] as const;

const RARITY_PILL_ON: Record<(typeof RARITY_PILLS)[number], string> = {
  common: "border-muted-foreground/60 bg-muted text-foreground",
  uncommon: "border-sky-400/70 bg-sky-500/15 text-sky-950 dark:text-sky-50",
  rare: "border-amber-500/80 bg-amber-500/15 text-amber-950 dark:text-amber-50",
  mythic: "border-orange-600/90 bg-gradient-to-br from-orange-500/25 to-rose-600/25 text-foreground",
};

function clampSavedViewQueryString(qs: string): string {
  const p = new URLSearchParams(qs);
  const ps = Number(p.get("pageSize") ?? HEATMAP_MAX_PAGE_SIZE);
  if (Number.isFinite(ps) && ps > HEATMAP_MAX_PAGE_SIZE) {
    p.set("pageSize", String(HEATMAP_MAX_PAGE_SIZE));
  }
  return p.toString();
}

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
  onOpenWatchlistPanel?: () => void;
  /** Shown in the filter summary panel (match · rows · page cap). */
  resultStats: ResultStatsSummary;
};

const SORT_LABEL: Record<SortSlot["key"], string> = {
  name: "Name",
  printings: "Printings",
  reserved: "Reserved",
  price_min: "Min $",
  price_max: "Max $",
  price_median: "Median $",
  cmc: "CMC",
};

export function HeatmapFilterBar(props: Props) {
  const {
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
    resultStats,
  } = props;
  const { filters: f, patch } = useHeatmapUrlFilters(queryString, onReplaceQuery);

  const onColorLaneIntent = useCallback(
    (intent: ColorLaneIntent) => {
      patch((b) => {
        const lanes = { colorNot: b.colorNot, colorOr: b.colorOr, colorAnd: b.colorAnd };
        const next =
          intent.kind === "set"
            ? moveColorPip(lanes, intent.pip, intent.lane)
            : cycleColorPip(lanes, intent.pip, intent.dir);
        return { ...b, ...next, page: 0 };
      });
    },
    [patch],
  );

  const facetsUrl = useMemo(() => `/api/heatmap/facets?${queryString}`, [queryString]);
  const { data: facets, isFetching: facetsLoading } = useQuery<{
    total: number;
    status: { all: number; owned: number; watchlist: number; none: number };
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
    staleTime: 30_000,
  });
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  useEffect(() => {
    startTransition(() => setSavedViews(ensureSavedViewsLoaded()));
  }, []);

  useEffect(() => {
    if (!savedViews.length) return;
    const hit = savedViews.find((v) => v.query === queryString);
    if (!hit) return;
    if (activeViewId === hit.id && snapshotQuery === hit.query) return;
    if (activeViewId && snapshotQuery != null && queryString !== snapshotQuery) return;
    startTransition(() => onViewSessionChange({ activeViewId: hit.id, snapshotQuery: hit.query }));
  }, [queryString, savedViews, activeViewId, snapshotQuery, onViewSessionChange]);

  const selectView = useCallback(
    (v: SavedView) => {
      const p = new URLSearchParams(clampSavedViewQueryString(v.query));
      p.set("page", "0");
      p.set("pageSize", String(HEATMAP_MAX_PAGE_SIZE));
      const qs = p.toString();
      onViewSessionChange({ activeViewId: v.id, snapshotQuery: qs });
      onReplaceQuery(p);
    },
    [onReplaceQuery, onViewSessionChange],
  );

  const selectStatusTab = useCallback(
    (tab: RowStatusTab) => {
      patch((b) => ({
        ...applyRowStatus(b, tab),
        page: 0,
        pageSize: HEATMAP_MAX_PAGE_SIZE,
      }));
      onViewSessionChange({ activeViewId: null, snapshotQuery: null });
    },
    [patch, onViewSessionChange],
  );

  const saveActiveView = useCallback(() => {
    if (!activeViewId) return;
    const q = clampSavedViewQueryString(queryString);
    const next = savedViews.map((v) => (v.id === activeViewId ? { ...v, query: q } : v));
    setSavedViews(next);
    persistSavedViews(next);
    onViewSessionChange({ activeViewId, snapshotQuery: q });
  }, [activeViewId, queryString, savedViews, onViewSessionChange]);

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

  const typePillGlyph = useCallback((t: string): string | null => {
    // Mana font type icons (same codes as `typeLineToManaGlyph`).
    switch (t) {
      case "creature":
        return String.fromCharCode(0xe61f);
      case "instant":
        return String.fromCharCode(0xe621);
      case "sorcery":
        return String.fromCharCode(0xe624);
      case "enchantment":
        return String.fromCharCode(0xe620);
      case "artifact":
        return String.fromCharCode(0xe61e);
      case "land":
        return String.fromCharCode(0xe622);
      default:
        return null;
    }
  }, []);

  const rarityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of facets?.rarity ?? []) m.set(r.key, r.n);
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

  const rowExtraOptionsCount = useMemo(() => {
    let n = 0;
    if (f.includeDigital) n++;
    if (f.reservedOnly) n++;
    if (f.pinned === true) n++;
    return n;
  }, [f.includeDigital, f.reservedOnly, f.pinned]);

  const activeChips = useMemo(() => buildActiveFilterChips(f), [f]);

  const onClearFilterState = useCallback(() => {
    onReplaceQuery(
      serializeHeatmapUrlParams({
        ...defaultHeatmapFilters,
        cellPriceField: f.cellPriceField,
        heatmapColumnLayout: f.heatmapColumnLayout,
        colSort: f.colSort,
        valueAggScope: f.valueAggScope,
        showPinned: f.showPinned,
        matchMode: f.matchMode,
        pageSize: f.pageSize,
        quickPinRows: f.quickPinRows,
        quickPinCols: f.quickPinCols,
      }),
    );
  }, [
    f.cellPriceField,
    f.colSort,
    f.heatmapColumnLayout,
    f.matchMode,
    f.pageSize,
    f.quickPinCols,
    f.quickPinRows,
    f.showPinned,
    f.valueAggScope,
    onReplaceQuery,
  ]);

  const createNamedView = useCallback(
    (name: string) => {
      const q = clampSavedViewQueryString(queryString);
      const v: SavedView = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        query: q,
      };
      const next = upsertSavedView(savedViews, v);
      setSavedViews(next);
      onViewSessionChange({ activeViewId: v.id, snapshotQuery: q });
    },
    [queryString, savedViews, onViewSessionChange],
  );

  const renameView = useCallback((id: string, name: string) => {
    setSavedViews((prev) => {
      const next = prev.map((v) => (v.id === id ? { ...v, name } : v));
      persistSavedViews(next);
      return next;
    });
  }, []);

  const duplicateActiveView = useCallback(() => {
    if (!activeViewId) return;
    const next = duplicateSavedView(savedViews, activeViewId);
    const created = next.find((v) => !savedViews.some((o) => o.id === v.id));
    if (!created) return;
    const q = clampSavedViewQueryString(created.query);
    const fixed = next.map((v) => (v.id === created.id ? { ...v, query: q } : v));
    setSavedViews(fixed);
    persistSavedViews(fixed);
    onViewSessionChange({ activeViewId: created.id, snapshotQuery: q });
    onReplaceQuery(new URLSearchParams(q));
  }, [activeViewId, savedViews, onReplaceQuery, onViewSessionChange]);

  const statusCounts = useMemo(
    () => ({
      all: facets?.status?.all ?? facets?.total ?? 0,
      owned: facets?.status?.owned ?? 0,
      watchlist: facets?.status?.watchlist ?? 0,
      pinned: facets?.rowScope?.pinned ?? 0,
      reserved: facets?.rowScope?.reserved ?? 0,
    }),
    [facets],
  );

  const toggleRarity = (r: string) => {
    patch((b) => {
      const s = new Set(b.rarity);
      if (s.has(r)) s.delete(r);
      else s.add(r);
      return { ...b, rarity: [...s].sort() };
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
      className="flex min-h-0 shrink-0 flex-col overflow-hidden bg-muted/20 text-xs"
      suppressHydrationWarning
    >
      {/* Locked scope tabs + reorderable saved views */}
      <div className="shrink-0 bg-muted/10 px-2 py-1.5 sm:px-3">
        <SavedViewTabs
          savedViews={savedViews}
          activeViewId={activeViewId}
          queryString={queryString}
          snapshotQuery={snapshotQuery}
          activeStatusTab={rowStatusFromFilters(f)}
          statusCounts={statusCounts}
          onSelectStatusTab={selectStatusTab}
          onSelectView={selectView}
          onDeleteView={(id) => {
            const next = deleteSavedView(savedViews, id);
            setSavedViews(next);
            onViewSessionChange({ activeViewId: null, snapshotQuery: null });
          }}
          onRenameView={renameView}
          onSaveActiveView={saveActiveView}
          onSaveAsCopy={() => setSaveDialogOpen(true)}
          onDuplicateActiveView={duplicateActiveView}
          onNewView={() => setSaveDialogOpen(true)}
        />
      </div>

      {/* Filter bar: sticky on md+, mobile sheet for full controls */}
      <div className="sticky top-0 z-40 border-t border-b border-border bg-muted/25 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-muted/15">
        <div className="hidden flex-col gap-2 px-2 py-2 md:flex md:px-3">
          <div className="grid grid-cols-12 gap-3">
            {/* Left: search + sets/price */}
            <div className="col-span-12 space-y-2 lg:col-span-5">
              <FilterSearch
                className="max-w-none"
                value={f.search}
                onChange={(v) => patch((b) => ({ ...b, search: v }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <SetsPicker
                  className="w-full min-w-0 justify-between"
                  selectedSets={f.sets}
                  onSelectedSetsChange={(sets) => patch((b) => ({ ...b, sets }))}
                  includeDigital={f.includeDigital}
                  onPresetReservedRows={() => patch((b) => ({ ...b, reservedOnly: true }))}
                />
                <PriceFilter
                  className="w-full min-w-0 justify-between"
                  priceMin={f.priceMin}
                  priceMax={f.priceMax}
                  onChange={(priceMin, priceMax) => patch((b) => ({ ...b, priceMin, priceMax }))}
                  cellPriceField={f.cellPriceField}
                  onPriceFieldChange={(cellPriceField) =>
                    patch((b) => ({
                      ...b,
                      cellPriceField:
                        cellPriceField === "usd_foil" || cellPriceField === "eur" || cellPriceField === "tix"
                          ? cellPriceField
                          : "usd",
                    }))
                  }
                />
              </div>
            </div>

            {/* Middle: mana lanes + pills + advanced */}
            <div className="col-span-12 flex items-start gap-2 lg:col-span-7">
              <div className="w-fit max-w-full shrink-0">
                <ColorFilter
                  colorNot={f.colorNot}
                  colorOr={f.colorOr}
                  colorAnd={f.colorAnd}
                  onIntent={onColorLaneIntent}
                />
              </div>

              {/* Rarity + Type groups (keep them visually separate) */}
              <div className="flex min-w-0 flex-wrap items-start gap-2 pt-[2px]">
                <div className="grid shrink-0 grid-cols-2 gap-1">
                  {RARITY_PILLS.map((r) => {
                    const on = f.rarity.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        className={cn(
                          // Fit the longest rarity label; keep pills equal width within the group.
                          "inline-flex h-6 w-[6.5rem] items-center justify-center rounded-full border px-2 text-xs font-semibold capitalize tracking-wide transition-colors",
                          on
                            ? RARITY_PILL_ON[r]
                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                        )}
                        onClick={() =>
                          patch((b) => {
                            const s = new Set(b.rarity);
                            if (s.has(r)) s.delete(r);
                            else s.add(r);
                            return { ...b, rarity: [...s].sort() };
                          })
                        }
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>

                <div className="grid shrink-0 grid-cols-2 gap-1">
                  {TYPE_PILLS.map((t) => {
                    const on = f.types.includes(t);
                    const glyph = typePillGlyph(t);
                    const label = t.slice(0, 1).toUpperCase() + t.slice(1);
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        className={cn(
                          // Fit the longest type label ("Enchantment"); equal width within group.
                          "inline-flex h-6 w-[7.75rem] items-center justify-center gap-1.5 rounded-full border px-2 text-xs font-semibold transition-colors",
                          on
                            ? "border-border bg-background text-foreground shadow-sm"
                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                        )}
                        onClick={() => toggleType(t)}
                      >
                        {glyph ? (
                          <span aria-hidden style={{ fontFamily: "Mana", fontSize: 13, lineHeight: 1 }}>
                            {glyph}
                          </span>
                        ) : null}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advanced (icon-only, never overflow) */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0 self-start"
                aria-label="Advanced filters"
                onClick={() => onFiltersRootOpenChange(!filtersRootOpen)}
              >
                <Settings className="size-4" />
              </Button>
            </div>

            {/* Below: active filters + stats */}
            <ActiveFiltersRow
              chips={activeChips}
              statsSummary={resultStats}
              className={cn(
                "col-span-12 w-full shrink-0 rounded-lg",
                activeChips.length
                  ? "border border-border bg-muted/30 p-2.5"
                  : "border border-border/50 bg-transparent px-0 py-1.5",
              )}
              onRemove={(id) => patch((b) => clearChip(b, id))}
              onClearAll={onClearFilterState}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-2 py-2 md:hidden">
          <FilterSearch
            className="min-w-0 flex-1"
            value={f.search}
            onChange={(v) => patch((b) => ({ ...b, search: v }))}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 shrink-0 gap-1 px-2 text-xs"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="size-4" aria-hidden />
            Filters ({activeChips.length})
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Advanced filters"
            onClick={() => onFiltersRootOpenChange(!filtersRootOpen)}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </div>

      </div>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 p-0 text-xs">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-xs font-medium">Filters</SheetTitle>
            <p className="pt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{resultStats.totalMatches.toLocaleString()}</span> match ·{" "}
              <span className="font-medium text-foreground">{resultStats.rowsLoaded.toLocaleString()}</span> rows · cap{" "}
              <span className="font-mono tabular-nums">{resultStats.pageSizeCap}</span>
            </p>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Sets</p>
                <SetsPicker
                  className="w-full min-w-0 justify-between"
                  selectedSets={f.sets}
                  onSelectedSetsChange={(sets) => patch((b) => ({ ...b, sets }))}
                  includeDigital={f.includeDigital}
                  onPresetReservedRows={() => patch((b) => ({ ...b, reservedOnly: true }))}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Price</p>
                <PriceFilter
                  className="w-full min-w-0 justify-between"
                  priceMin={f.priceMin}
                  priceMax={f.priceMax}
                  onChange={(priceMin, priceMax) => patch((b) => ({ ...b, priceMin, priceMax }))}
                  cellPriceField={f.cellPriceField}
                  onPriceFieldChange={(cellPriceField) =>
                    patch((b) => ({
                      ...b,
                      cellPriceField:
                        cellPriceField === "usd_foil" || cellPriceField === "eur" || cellPriceField === "tix"
                          ? cellPriceField
                          : "usd",
                    }))
                  }
                />
              </div>
            </section>
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Colors</p>
              <ColorFilter
                colorNot={f.colorNot}
                colorOr={f.colorOr}
                colorAnd={f.colorAnd}
                onIntent={onColorLaneIntent}
              />
            </section>
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Rarity</p>
              <RarityFilter
                selected={f.rarity}
                onChange={(rarity) => patch((b) => ({ ...b, rarity }))}
              />
            </section>
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <StatusTabs
                variant="rail"
                filters={f}
                onTabChange={(tab) => {
                  patch((b) => ({
                    ...applyRowStatus(b, tab),
                    page: 0,
                    pageSize: HEATMAP_MAX_PAGE_SIZE,
                  }));
                  onViewSessionChange({ activeViewId: null, snapshotQuery: null });
                }}
                counts={statusCounts}
                loading={facetsLoading}
              />
            </section>
            {activeChips.length > 0 ? (
              <section className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Active filters</p>
                <ActiveFiltersRow
                  chips={activeChips}
                  onRemove={(id) => patch((b) => clearChip(b, id))}
                  onClearAll={onClearFilterState}
                  className="rounded-md border border-border bg-muted/15 p-2"
                />
              </section>
            ) : null}
          </div>
          <SheetFooter className="border-t border-border px-4 py-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => setMobileFiltersOpen(false)}
            >
              Show {(facets?.status?.all ?? facets?.total ?? 0).toLocaleString()} results
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        currentFilters={f}
        visibleColumnCount={columns.filter((c) => c.set_type !== "aggregate" && !c.code.startsWith("__")).length}
        onSave={(name) => {
          createNamedView(name);
          setSaveDialogOpen(false);
        }}
      />

      {filtersRootOpen ? (
        <div className="max-h-[min(58dvh,520px)] overflow-y-auto border-t border-border px-2 pb-3 pt-2 sm:max-h-[min(70dvh,720px)] sm:px-3">
          {facetSummary ? (
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {facetSummary.year ? <Badge variant="secondary">Year: {facetSummary.year}</Badge> : null}
              {facetSummary.cmc ? <Badge variant="secondary">CMC: {facetSummary.cmc}</Badge> : null}
              {facetSummary.price ? <Badge variant="secondary">Price: {facetSummary.price}</Badge> : null}
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="rounded-lg border border-border bg-muted/10 p-3 lg:col-span-2">
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Display
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Density</span>
                  <Select
                    value={density}
                    onValueChange={(v) => onDensityChange(v === "compact" ? "compact" : "comfy")}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfy">Comfy</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-2 text-xs">
                  <Checkbox
                    checked={f.matchMode === "strict"}
                    onCheckedChange={(v) => patch((b) => ({ ...b, matchMode: v ? "strict" : "context" }))}
                  />
                  Strict cells
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-2 text-xs">
                  <Checkbox
                    checked={f.showPinned}
                    onCheckedChange={(v) => patch((b) => ({ ...b, showPinned: Boolean(v) }))}
                  />
                  Pinned strip
                </label>
              </div>
            </section>

            {/* Rows */}
            <section className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rows
              </p>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,200px)]">
                <div className="space-y-3 rounded-md border border-border/70 bg-background/40 p-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Beyond the bar</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      The sticky bar covers search, mana colors, common–mythic rarity, status, USD price, and edition
                      scope. Here: release year, mana value, format legality, type line prefixes, colorless (C), bonus
                      rarities, and row flags that are not status tabs.
                    </p>
                  </div>
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
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                                <span className="font-mono text-xs text-muted-foreground">
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
                                <span className="font-mono text-xs text-muted-foreground">
                                  {t.n.toLocaleString()}
                                </span>
                              </span>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Row flags{rowExtraOptionsCount ? ` (${rowExtraOptionsCount})` : ""}
                    </p>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={f.includeDigital}
                        onCheckedChange={(v) => patch((b) => ({ ...b, includeDigital: Boolean(v) }))}
                      />
                      Include digital sets
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={Boolean(f.reservedOnly)}
                        onCheckedChange={(v) => patch((b) => ({ ...b, reservedOnly: v ? true : null }))}
                      />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span>Reserved List only</span>
                        {facets?.rowScope ? (
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {facets.rowScope.reserved.toLocaleString()}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={f.pinned === true}
                        onCheckedChange={(v) => patch((b) => ({ ...b, pinned: v ? true : null }))}
                      />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span>Pinned rows only</span>
                        {facets?.rowScope ? (
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {facets.rowScope.pinned.toLocaleString()}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <p className="text-xs leading-snug text-muted-foreground">
                      Owned / watchlist filters use the <span className="font-medium text-foreground">scope tabs</span>{" "}
                      in the bar (not duplicated here).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Bonus rarities</p>
                    <p className="text-xs text-muted-foreground">
                      The bar toggles common–mythic. Enable special or bonus when you need them.
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {EXTRA_RARITIES.map((r) => (
                        <label key={r} className="flex cursor-pointer items-center gap-1.5 text-xs capitalize">
                          <Checkbox checked={f.rarity.includes(r)} onCheckedChange={() => toggleRarity(r)} />
                          {r}
                          {rarityCounts.has(r) ? (
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {rarityCounts.get(r)!.toLocaleString()}
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </div>
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
                              let dir: SortSlot["dir"] = null;
                              if (k.startsWith("price_")) {
                                dir = k === "price_min" ? "asc" : "desc";
                              } else if (k === "cmc") {
                                dir = "asc";
                              }
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
                      ) : primarySort.key === "cmc" ? (
                        <Select
                          value={primarySort.dir ?? "asc"}
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
                      <p className="text-xs text-muted-foreground">
                        +{f.sortSlots.length - 1} tiebreak via <code className="rounded bg-muted px-1">sk=</code>
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
                      {f.headerSortSetCode ? (
                        <Badge variant="outline" className="gap-1 font-mono text-xs">
                          Col sort: {f.headerSortSetCode.toUpperCase()}
                          <button
                            type="button"
                            className="ml-1 rounded hover:bg-muted"
                            aria-label="Clear column sort"
                            onClick={() => patch((b) => ({ ...b, headerSortSetCode: null, headerSortDir: null }))}
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
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Columns
              </p>
              <div className="space-y-4 rounded-md border border-border/70 bg-background/40 p-3">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Edition scope & exclusions</p>
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
                <div className="border-t border-border/70 pt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Column order & layout</p>
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

          <p className="mt-3 text-xs text-muted-foreground">
            <span className="sr-only">Tip:</span>
            Press <kbd className="rounded border border-border px-1 font-mono text-xs">F</kbd> to toggle this panel.
          </p>
        </div>
      ) : null}
    </div>
  );
}
