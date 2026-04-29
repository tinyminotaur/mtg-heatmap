"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Filter, MoreHorizontal, SlidersHorizontal } from "lucide-react";
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
import { buildActiveFilterChips, clearChip } from "@/lib/heatmap/active-filter-chips";
import { ActiveFiltersRow } from "@/components/heatmap/filter-bar/ActiveFiltersRow";
import { ColorFilter } from "@/components/heatmap/filter-bar/ColorFilter";
import { FilterSearch } from "@/components/heatmap/filter-bar/FilterSearch";
import { PriceFilter } from "@/components/heatmap/filter-bar/PriceFilter";
import { RarityFilter } from "@/components/heatmap/filter-bar/RarityFilter";
import { SaveViewDialog } from "@/components/heatmap/filter-bar/SaveViewDialog";
import { SetsPicker } from "@/components/heatmap/filter-bar/SetsPicker";
import { SavedViewTabs } from "@/components/heatmap/filter-bar/SavedViewTabs";
import { StatusTabs } from "@/components/heatmap/filter-bar/StatusTabs";

export type ViewSessionMeta = { activeViewId: string | null; snapshotQuery: string | null };

const EXTRA_RARITIES = ["special", "bonus"] as const;

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
  } = props;
  const { filters: f, patch } = useHeatmapUrlFilters(queryString, onReplaceQuery);

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
      onViewSessionChange({ activeViewId: v.id, snapshotQuery: v.query });
      onReplaceQuery(new URLSearchParams(v.query));
    },
    [onReplaceQuery, onViewSessionChange],
  );

  const selectStatusTab = useCallback(
    (tab: RowStatusTab) => {
      patch((b) => applyRowStatus(b, tab));
      onViewSessionChange({ activeViewId: null, snapshotQuery: null });
    },
    [patch, onViewSessionChange],
  );

  const saveActiveView = useCallback(() => {
    if (!activeViewId) return;
    const next = savedViews.map((v) => (v.id === activeViewId ? { ...v, query: queryString } : v));
    setSavedViews(next);
    persistSavedViews(next);
    onViewSessionChange({ activeViewId, snapshotQuery: queryString });
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
      const v: SavedView = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        query: queryString,
      };
      const next = upsertSavedView(savedViews, v);
      setSavedViews(next);
      onViewSessionChange({ activeViewId: v.id, snapshotQuery: queryString });
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
    setSavedViews(next);
    if (created) {
      onViewSessionChange({ activeViewId: created.id, snapshotQuery: created.query });
      onReplaceQuery(new URLSearchParams(created.query));
    }
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
      className="flex min-h-0 shrink-0 flex-col overflow-hidden bg-muted/20 text-sm"
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
        <div className="hidden flex-wrap items-center gap-x-2 gap-y-2 px-2 py-2 md:flex md:px-3">
          <FilterSearch
            value={f.search}
            onChange={(v) => patch((b) => ({ ...b, search: v }))}
          />
          <ColorFilter
            selected={f.colors.filter((c) => ["W", "U", "B", "R", "G"].includes(c))}
            onChange={(colors) =>
              patch((b) => {
                const keepC = b.colors.filter((c) => c === "C");
                return { ...b, colors: [...new Set([...colors, ...keepC])].sort() };
              })
            }
            mode={f.colorMode}
            onModeChange={(colorMode) => patch((b) => ({ ...b, colorMode }))}
          />
          <RarityFilter
            selected={f.rarity}
            onChange={(rarity) => patch((b) => ({ ...b, rarity }))}
          />
          <SetsPicker
            selectedSets={f.sets}
            onSelectedSetsChange={(sets) => patch((b) => ({ ...b, sets }))}
            includeDigital={f.includeDigital}
            onPresetReservedRows={() => patch((b) => ({ ...b, reservedOnly: true }))}
          />
          <PriceFilter
            priceMin={f.priceMin}
            priceMax={f.priceMax}
            onChange={(priceMin, priceMax) => patch((b) => ({ ...b, priceMin, priceMax }))}
          />
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/25 px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">Edition</span>
            <button
              type="button"
              role="switch"
              aria-checked={f.heatmapColumnLayout === "value"}
              title={
                f.heatmapColumnLayout === "value"
                  ? "Showing Min / Median / Max rollup columns — click for per-edition columns"
                  : "Showing one column per edition — click for Min / Median / Max rollup"
              }
              className={cn(
                "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                f.heatmapColumnLayout === "value" ? "bg-primary" : "bg-muted",
              )}
              onClick={() =>
                patch((b) => ({
                  ...b,
                  heatmapColumnLayout: b.heatmapColumnLayout === "value" ? "sets" : "value",
                }))
              }
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-4 translate-x-0.5 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform",
                  f.heatmapColumnLayout === "value" && "translate-x-[1.125rem]",
                )}
                aria-hidden
              />
            </button>
            <span className="text-xs font-medium text-muted-foreground">Rollup</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1 text-xs"
            onClick={() => onFiltersRootOpenChange(!filtersRootOpen)}
          >
            <SlidersHorizontal className="size-3.5" />
            Advanced
          </Button>
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

        <ActiveFiltersRow
          chips={activeChips}
          onRemove={(id) => patch((b) => clearChip(b, id))}
          onClearAll={onClearFilterState}
        />
      </div>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Colors</p>
              <ColorFilter
                selected={f.colors.filter((c) => ["W", "U", "B", "R", "G"].includes(c))}
                onChange={(colors) =>
                  patch((b) => {
                    const keepC = b.colors.filter((c) => c === "C");
                    return { ...b, colors: [...new Set([...colors, ...keepC])].sort() };
                  })
                }
                mode={f.colorMode}
                onModeChange={(colorMode) => patch((b) => ({ ...b, colorMode }))}
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
                onTabChange={(tab) => patch((b) => applyRowStatus(b, tab))}
                counts={statusCounts}
                loading={facetsLoading}
              />
            </section>
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Price</p>
              <PriceFilter
                priceMin={f.priceMin}
                priceMax={f.priceMax}
                onChange={(priceMin, priceMax) => patch((b) => ({ ...b, priceMin, priceMax }))}
              />
            </section>
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Columns</p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/25 px-3 py-2">
                <span className="text-xs text-muted-foreground">Edition</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.heatmapColumnLayout === "value"}
                  className={cn(
                    "relative inline-flex h-7 w-11 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    f.heatmapColumnLayout === "value" ? "bg-primary" : "bg-muted",
                  )}
                  onClick={() =>
                    patch((b) => ({
                      ...b,
                      heatmapColumnLayout: b.heatmapColumnLayout === "value" ? "sets" : "value",
                    }))
                  }
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5 translate-x-0.5 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform",
                      f.heatmapColumnLayout === "value" && "translate-x-[1.25rem]",
                    )}
                    aria-hidden
                  />
                </button>
                <span className="text-xs text-muted-foreground">Rollup (Min / Med / Max)</span>
              </div>
            </section>
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Sets</p>
              <SetsPicker
                selectedSets={f.sets}
                onSelectedSetsChange={(sets) => patch((b) => ({ ...b, sets }))}
                includeDigital={f.includeDigital}
                onPresetReservedRows={() => patch((b) => ({ ...b, reservedOnly: true }))}
              />
            </section>
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Price field</span>
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
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox
                      checked={f.colors.includes("C")}
                      onCheckedChange={(v) => {
                        const on = Boolean(v);
                        patch((b) => {
                          const s = new Set(b.colors);
                          if (on) s.add("C");
                          else s.delete("C");
                          return { ...b, colors: [...s].sort() };
                        });
                      }}
                    />
                    Colorless color identity (C)
                  </label>
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
