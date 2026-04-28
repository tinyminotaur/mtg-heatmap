"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnMeta } from "@/lib/heatmap-query";
import type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
import {
  defaultHeatmapFilters,
  heatmapFiltersToFilterState,
  filterStateToHeatmapFilters,
} from "@/lib/filter-state";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";
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
import { HeatmapCardSearch } from "./HeatmapCardSearch";
import { FilterFieldTip } from "./FilterFieldTip";

export type ViewSessionMeta = { activeViewId: string | null; snapshotQuery: string | null };

const RARITIES = ["common", "uncommon", "rare", "mythic", "special", "bonus"] as const;

type Props = {
  queryString: string;
  columns: ColumnMeta[];
  onReplaceQuery: (params: URLSearchParams) => void;
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

function FoldSection({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/10">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium outline-none hover:bg-muted/40"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        {title}
      </button>
      {open ? <div className="border-t border-border px-3 py-3">{children}</div> : null}
    </div>
  );
}

export function HeatmapFilterBar({
  queryString,
  columns,
  onReplaceQuery,
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
}: Props) {
  const f = useMemo(() => filtersFromQuery(queryString), [queryString]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [newName, setNewName] = useState("");

  const [openViews, setOpenViews] = useState(false);
  const [openRows, setOpenRows] = useState(false);
  const [openCols, setOpenCols] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);

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

  const patch = useCallback(
    (mut: (base: HeatmapFilters) => HeatmapFilters) => {
      const base = filtersFromQuery(queryString);
      applyFilters(onReplaceQuery, mut(base));
    },
    [onReplaceQuery, queryString],
  );

  const setSortSlots = (slots: SortSlot[]) => {
    patch((b) => {
      const fs = heatmapFiltersToFilterState(b);
      fs.sort.slots = slots.slice(0, 3);
      return filterStateToHeatmapFilters(fs);
    });
  };

  const primarySort = f.sortSlots[0] ?? { key: "name" as const, dir: null };

  const raritySummary =
    f.rarity.length === 0 ? "Any rarity" : `${f.rarity.length} rarity type${f.rarity.length === 1 ? "" : "s"}`;

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

  return (
    <div
      className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/20 text-sm"
      suppressHydrationWarning
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left outline-none hover:bg-muted/35"
        onClick={() => onFiltersRootOpenChange(!filtersRootOpen)}
        aria-expanded={filtersRootOpen}
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            filtersRootOpen && "rotate-90",
          )}
        />
        <span className="font-medium">Filters &amp; sorts</span>
        <Badge variant="secondary" className="ml-auto font-normal">
          F to toggle
        </Badge>
      </button>

      {filtersRootOpen ? (
        <div className="border-t border-border px-3 pb-3">
          <div className="grid grid-cols-1 gap-3 pt-3 xl:grid-cols-2">
            <FoldSection title="Views" open={openViews} onOpenChange={setOpenViews}>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {savedViews.map((v) => (
                    <Button
                      key={v.id}
                      type="button"
                      variant={activeViewId === v.id ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => selectView(v)}
                    >
                      {v.name}
                      {activeViewId === v.id && dirty ? (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved" />
                      ) : null}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeViewId ? (
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={!dirty} onClick={saveActiveView}>
                      Save view
                    </Button>
                  ) : null}
                  <Input
                    placeholder="New view name"
                    className="h-8 max-w-[10rem] text-xs"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={createView}>
                    Save as…
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Link
                    href="/owned"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}
                    onClick={() => onPersistNav?.()}
                  >
                    Owned
                  </Link>
                  <Link
                    href="/watchlist"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}
                    onClick={() => onPersistNav?.()}
                  >
                    Watchlist
                  </Link>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenCommandPalette}>
                    Command ⌘K
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenKeyboardHelp}>
                    Keyboard ?
                  </Button>
                </div>

                <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                  <FilterFieldTip tip={HEATMAP_FILTER_TIPS.priceMode} side="right">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Price field</Label>
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
                          <SelectItem value="usd">USD (non-foil)</SelectItem>
                          <SelectItem value="usd_foil">USD foil</SelectItem>
                          <SelectItem value="eur">EUR</SelectItem>
                          <SelectItem value="tix">TIX</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FilterFieldTip>
                  <FilterFieldTip tip="Compact reduces padding and chrome for small screens." side="right">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Layout density</Label>
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
                  </FilterFieldTip>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3">
                  <FilterFieldTip tip={HEATMAP_FILTER_TIPS.matchStrict}>
                    <label className="flex cursor-help items-center gap-2 text-xs">
                      <Checkbox
                        checked={f.matchMode === "strict"}
                        onCheckedChange={(v) => patch((b) => ({ ...b, matchMode: v ? "strict" : "context" }))}
                      />
                      Strict cells
                    </label>
                  </FilterFieldTip>
                  <FilterFieldTip tip={HEATMAP_FILTER_TIPS.showPinnedStrip}>
                    <label className="flex cursor-help items-center gap-2 text-xs">
                      <Checkbox checked={f.showPinned} onCheckedChange={(v) => patch((b) => ({ ...b, showPinned: Boolean(v) }))} />
                      Pinned strip
                    </label>
                  </FilterFieldTip>
                </div>

                {activeViewId ? (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-dashed border-border pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (!activeViewId) return;
                        setSavedViews(duplicateSavedView(savedViews, activeViewId));
                      }}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => {
                        if (!activeViewId) return;
                        const next = deleteSavedView(savedViews, activeViewId);
                        setSavedViews(next);
                        onViewSessionChange({ activeViewId: null, snapshotQuery: null });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            </FoldSection>

            <FoldSection title="Rows" open={openRows} onOpenChange={setOpenRows}>
              <div className="space-y-4">
                <FilterFieldTip tip={HEATMAP_FILTER_TIPS.facetsBadge} side="right">
                  <Badge variant="secondary" className="font-normal">
                    {f.rarity.length || f.yearMin != null || f.yearMax != null || f.priceMin != null || f.priceMax != null
                      ? "Facets on"
                      : "No numeric facets"}
                  </Badge>
                </FilterFieldTip>

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
                        <SelectTrigger className="h-8 w-[11rem] text-xs">
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
                    tip={f.valueAggScope === "all" ? HEATMAP_FILTER_TIPS.valueAggAll : HEATMAP_FILTER_TIPS.valueAggVisible}
                    side="right"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">$ aggregate scope</Label>
                      <Select
                        value={f.valueAggScope}
                        onValueChange={(v) => patch((b) => ({ ...b, valueAggScope: v === "all" ? "all" : "visible" }))}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
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
                    +{f.sortSlots.length - 1} tiebreak via <code className="rounded bg-muted px-1">sk=</code> in URL
                  </p>
                ) : null}

                <div className="flex flex-wrap items-end gap-2">
                  <FilterFieldTip tip={HEATMAP_FILTER_TIPS.groupBy} side="right">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Group rows</Label>
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
                        <SelectTrigger className="h-8 w-36 text-xs">
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
                      <DropdownMenuLabel className="text-xs">Rarities (multi)</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {RARITIES.map((r) => (
                        <DropdownMenuCheckboxItem
                          key={r}
                          checked={f.rarity.includes(r)}
                          onCheckedChange={() => toggleRarity(r)}
                          className="capitalize"
                        >
                          {r}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-2 text-xs")}
                    >
                      Row scope{rowOptionsCount ? ` (${rowOptionsCount})` : ""}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-60" align="start">
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
                        Reserved List only
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={f.owned === true}
                        onCheckedChange={(v) => patch((b) => ({ ...b, owned: v ? true : null }))}
                      >
                        Owned only
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={f.watchlist === true}
                        onCheckedChange={(v) => patch((b) => ({ ...b, watchlist: v ? true : null }))}
                      >
                        Watchlist only
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={f.pinned === true}
                        onCheckedChange={(v) => patch((b) => ({ ...b, pinned: v ? true : null }))}
                      >
                        Pinned only
                      </DropdownMenuCheckboxItem>
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

                <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
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
                        <Label className="text-xs text-muted-foreground">Sort by column (click header)</Label>
                        <Select
                          value="__none__"
                          onValueChange={(code) => {
                            if (code === "__none__") return;
                            patch((b) => ({ ...b, headerSortSetCode: code }));
                          }}
                        >
                          <SelectTrigger className="h-8 w-[min(100%,13rem)] text-xs">
                            <SelectValue placeholder="Pick a set column…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Override: pick set…</SelectItem>
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
            </FoldSection>

            <FoldSection title="Columns" open={openCols} onOpenChange={setOpenCols}>
              <HeatmapFilterColumns
                queryString={queryString}
                onReplaceQuery={onReplaceQuery}
                showEmptyColumns={{
                  checked: f.showEmptyColumns,
                  onChange: (v) => patch((b) => ({ ...b, showEmptyColumns: v })),
                }}
              />
            </FoldSection>

            <FoldSection title="Card search" open={openSearch} onOpenChange={setOpenSearch}>
              <HeatmapCardSearch key={cardSearchMountKey} queryString={queryString} onReplaceQuery={onReplaceQuery} />
            </FoldSection>
          </div>
        </div>
      ) : null}
    </div>
  );
}
