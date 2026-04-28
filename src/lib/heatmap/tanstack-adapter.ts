import type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
import { defaultHeatmapFilters, slotsToPrimarySortString } from "@/lib/filter-state";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import type { ColumnMeta } from "@/lib/heatmap-types";

export type HeatmapTanStackState = {
  sorting: SortingState;
  columnVisibility: VisibilityState;
};

function sortSlotToColumnId(slot: SortSlot["key"]): string {
  // These are “virtual” columns for row ordering controls; they do not need to
  // correspond 1:1 with rendered heatmap columns.
  return slot;
}

function columnIdToSortSlotKey(id: string): SortSlot["key"] | null {
  switch (id) {
    case "name":
    case "printings":
    case "reserved":
    case "price_min":
    case "price_max":
    case "price_median":
      return id;
    default:
      return null;
  }
}

function sortSlotDirToDesc(slot: SortSlot): boolean {
  // For non-price sorts, SQL uses fixed direction; keep TanStack direction stable anyway.
  if (!slot.key.startsWith("price_")) return false;
  const d = slot.dir ?? (slot.key === "price_min" ? "asc" : "desc");
  return d === "desc";
}

function sortingStateToSortSlots(sorting: SortingState): SortSlot[] {
  const slots: SortSlot[] = [];
  for (const s of sorting.slice(0, 3)) {
    const key = columnIdToSortSlotKey(String(s.id));
    if (!key) continue;
    const dir: SortSlot["dir"] = key.startsWith("price_") ? (s.desc ? "desc" : "asc") : null;
    slots.push({ key, dir });
  }
  return slots.length ? slots : [{ key: "name", dir: null }];
}

export function heatmapFiltersToTanStackState(f: HeatmapFilters): HeatmapTanStackState {
  const slots = (f.sortSlots?.length ? f.sortSlots : defaultHeatmapFilters.sortSlots).slice(0, 3);
  const sorting: SortingState = slots.map((slot) => ({
    id: sortSlotToColumnId(slot.key),
    desc: sortSlotDirToDesc(slot),
  }));
  return { sorting, columnVisibility: {} };
}

export function tanStackStateToHeatmapFilters(
  state: HeatmapTanStackState,
  base: HeatmapFilters,
): HeatmapFilters {
  const sortSlots = sortingStateToSortSlots(state.sorting ?? []);
  return {
    ...defaultHeatmapFilters,
    ...base,
    sortSlots,
    // Keep legacy `sort` aligned with the first slot. `filter-state.ts` already
    // normalizes directions for price sorts, but the URL serializer expects both.
    sort: slotsToPrimarySortString(sortSlots),
  };
}

function isPhysicalSetColumn(c: ColumnMeta): boolean {
  return c.set_type !== "aggregate" && !c.code.startsWith("__");
}

export function heatmapFiltersToColumnVisibility(
  f: HeatmapFilters,
  columns: ColumnMeta[],
): VisibilityState {
  const allow = new Set(f.sets);
  const hide = new Set(f.hiddenSets);
  const allowMode = f.sets.length > 0;

  const vis: VisibilityState = {};
  for (const c of columns) {
    if (!isPhysicalSetColumn(c)) continue;
    const id = `set:${c.code}`;
    const visible = allowMode ? allow.has(c.code) && !hide.has(c.code) : !hide.has(c.code);
    vis[id] = visible;
  }
  return vis;
}

export function applyColumnVisibilityToHeatmapFilters(
  base: HeatmapFilters,
  columns: ColumnMeta[],
  columnVisibility: VisibilityState,
): HeatmapFilters {
  const codes = columns.filter(isPhysicalSetColumn).map((c) => c.code);
  const allowMode = base.sets.length > 0;

  const desiredVisible = (code: string) => {
    const v = columnVisibility[`set:${code}`];
    return v !== false;
  };

  if (allowMode) {
    const nextAllow = codes.filter((c) => desiredVisible(c));
    return {
      ...defaultHeatmapFilters,
      ...base,
      sets: nextAllow,
    };
  }

  const nextHiddenInScope = codes.filter((c) => !desiredVisible(c));
  const preservedHidden = base.hiddenSets.filter((c) => !codes.includes(c));
  return {
    ...defaultHeatmapFilters,
    ...base,
    hiddenSets: [...new Set([...preservedHidden, ...nextHiddenInScope])],
  };
}

/**
 * Future: Phase 6 (Advanced Filtering)
 *
 * When adding rule-based filters (e.g., "price > $10 AND color IN (W, U)"),
 * extend this adapter to:
 *
 * 1. Accept advancedFilters: FilterGroup from TanStack state
 * 2. Serialize to ?filters=<base64> URL param
 * 3. Pass to /api/heatmap as WHERE clause input
 * 4. Update facets endpoint to respect filter context
 *
 * This keeps filtering logic server-side and maintains URL shareability.
 */

