"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnMeta } from "@/lib/heatmap-query";
import type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
import { defaultHeatmapFilters, heatmapFiltersToFilterState, filterStateToHeatmapFilters } from "@/lib/filter-state";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";
import {
  deleteSavedView,
  duplicateSavedView,
  ensureSavedViewsLoaded,
  persistSavedViews,
  type SavedView,
  upsertSavedView,
} from "@/lib/saved-views";

type Props = {
  queryString: string;
  columns: ColumnMeta[];
  total: number;
  rowCount: number;
  page: number;
  pageSize: number;
  onReplaceQuery: (params: URLSearchParams) => void;
  onOpenFullFilters: () => void;
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
  total,
  rowCount,
  page,
  pageSize,
  onReplaceQuery,
  onOpenFullFilters,
}: Props) {
  const f = useMemo(() => filtersFromQuery(queryString), [queryString]);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() =>
    typeof window !== "undefined" ? ensureSavedViewsLoaded() : [],
  );
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [snapshotQuery, setSnapshotQuery] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const dirty = useMemo(() => {
    if (!activeViewId || snapshotQuery == null) return false;
    return queryString !== snapshotQuery;
  }, [activeViewId, queryString, snapshotQuery]);

  const selectView = useCallback(
    (v: SavedView) => {
      setActiveViewId(v.id);
      setSnapshotQuery(v.query);
      onReplaceQuery(new URLSearchParams(v.query));
    },
    [onReplaceQuery],
  );

  const saveActiveView = useCallback(() => {
    if (!activeViewId) return;
    const next = savedViews.map((v) =>
      v.id === activeViewId ? { ...v, query: queryString } : v,
    );
    setSavedViews(next);
    persistSavedViews(next);
    setSnapshotQuery(queryString);
  }, [activeViewId, queryString, savedViews]);

  const createView = useCallback(() => {
    const name = newName.trim() || `View ${savedViews.length + 1}`;
    const v: SavedView = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      query: queryString,
    };
    const next = upsertSavedView(savedViews, v);
    setSavedViews(next);
    setActiveViewId(v.id);
    setSnapshotQuery(queryString);
    setNewName("");
  }, [newName, queryString, savedViews]);

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

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Views</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
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
        <div className="flex flex-wrap items-center gap-1">
          {activeViewId ? (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={!dirty} onClick={saveActiveView}>
              Save
            </Button>
          ) : null}
          <div className="flex items-center gap-1">
            <Input
              placeholder="New view name"
              className="h-7 w-32 text-xs"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={createView}>
              Save as…
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filters</span>
        <Badge variant="secondary" className="font-normal">
          {f.rarity.length || f.yearMin != null || f.yearMax != null || f.priceMin != null || f.priceMax != null
            ? "Facets on"
            : "No row facets"}
        </Badge>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenFullFilters}>
          Sheet filters…
        </Button>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <Checkbox
            checked={f.showEmptyColumns}
            onCheckedChange={(v) => patch((b) => ({ ...b, showEmptyColumns: Boolean(v) }))}
          />
          Empty cols
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <Checkbox
            checked={f.matchMode === "strict"}
            onCheckedChange={(v) => patch((b) => ({ ...b, matchMode: v ? "strict" : "context" }))}
          />
          Strict cells
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <Checkbox
            checked={f.showPinned}
            onCheckedChange={(v) => patch((b) => ({ ...b, showPinned: Boolean(v) }))}
          />
          Pinned strip
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sort</span>
        <Select
          value={primarySort.key}
          onValueChange={(key) => {
            const k = key as SortSlot["key"];
            const dir: SortSlot["dir"] =
              k === "price_min" ? "asc" : k.startsWith("price_") ? "desc" : null;
            setSortSlots([{ key: k, dir }]);
          }}
        >
          <SelectTrigger className="h-7 w-[10.5rem] text-xs">
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
        {primarySort.key.startsWith("price_") ? (
          <Select
            value={primarySort.dir ?? (primarySort.key === "price_min" ? "asc" : "desc")}
            onValueChange={(dir) => {
              const d = dir as "asc" | "desc";
              setSortSlots([{ ...primarySort, dir: d }, ...f.sortSlots.slice(1, 3)]);
            }}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Asc</SelectItem>
              <SelectItem value="desc">Desc</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={f.valueAggScope}
          onValueChange={(v) => patch((b) => ({ ...b, valueAggScope: v === "all" ? "all" : "visible" }))}
        >
          <SelectTrigger className="h-7 w-36 text-xs" title="Price aggregate scope for row sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="visible">$ in visible cols</SelectItem>
            <SelectItem value="all">$ all printings</SelectItem>
          </SelectContent>
        </Select>
        {f.sortSlots.length > 1 ? (
          <span className="text-xs text-muted-foreground">
            +{f.sortSlots.length - 1} tiebreak{""}
            <code className="ml-1 rounded bg-muted px-1">sk=</code> in URL
          </span>
        ) : null}
        {f.headerSortSetCode ? (
          <Badge variant="outline" className="gap-1 font-mono text-[10px]">
            Col: {f.headerSortSetCode.toUpperCase()}
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
        {columns.length > 0 ? (
          <Select
            value="__none__"
            onValueChange={(code) => {
              if (code === "__none__") return;
              patch((b) => ({ ...b, headerSortSetCode: code }));
            }}
          >
            <SelectTrigger className="h-7 w-[11rem] text-xs" title="§11.5.6 column price sort">
              <SelectValue placeholder="Sort by column…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sort by column…</SelectItem>
              {columns.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code.toUpperCase()} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Group</span>
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
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="color">Color (CI)</SelectItem>
            <SelectItem value="type">Type prefix</SelectItem>
          </SelectContent>
        </Select>
        {f.groupCollapsedKeys.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => patch((b) => ({ ...b, groupCollapsedKeys: [] }))}
          >
            Expand all groups
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{total.toLocaleString()}</span> cards match · showing{" "}
          <span className="font-medium text-foreground">{rowCount.toLocaleString()}</span> on page{" "}
          <span className="font-mono">{page + 1}</span> ({pageSize}/page) · match: {f.matchMode}
        </span>
        {activeViewId ? (
          <div className="flex gap-1">
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
                setActiveViewId(null);
                setSnapshotQuery(null);
              }}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
