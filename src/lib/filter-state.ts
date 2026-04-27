/**
 * Section 11.4 — FilterState + HeatmapFilters (SQL adapter).
 * HeatmapFilters stays the API contract; FilterState is the structured UI / saved-view shape.
 */

/** Up to three row-sort keys; value sorts use dir asc | desc. */
export type SortSlot = {
  key: "name" | "printings" | "reserved" | "price_min" | "price_max" | "price_median";
  dir: "asc" | "desc" | null;
};

export type ValueAggregationScope = "visible" | "all";

export type MatchDisplayMode = "context" | "strict";

export type GroupByMode = "none" | "reserved" | "color" | "type";

export type HeatmapFilters = {
  rarity: string[];
  sets: string[];
  hiddenSets: string[];
  excludeSetTypes: string[];
  excludeGroups: string[];
  yearMin: number | null;
  yearMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  colors: string[];
  formats: string[];
  types: string[];
  owned: boolean | null;
  watchlist: boolean | null;
  pinned: boolean | null;
  reservedOnly: boolean | null;
  includeDigital: boolean;
  specialGroup: string | null;
  search: string;
  /**
   * Primary row sort key (legacy URL `sort`); value keys are price_min | price_max | price_median.
   * Direction lives on sortSlots[0].dir for value sorts.
   */
  sort: string;
  /** §11.5.5 — up to three ORDER BY slots (heatmap SQL). */
  sortSlots: SortSlot[];
  valueAggScope: ValueAggregationScope;
  colSort: string;
  page: number;
  pageSize: number;
  showPinned: boolean;
  /** §11.2.4 — show set columns in scope even with zero qualifying cells. */
  showEmptyColumns: boolean;
  /** §11.2.6 — context = dim non-matching printings; strict = treat as empty visually. */
  matchMode: MatchDisplayMode;
  groupBy: GroupByMode;
  groupCollapsedKeys: string[];
  /** §11.5.6 — temporary single-column USD sort override. */
  headerSortSetCode: string | null;
};

export type FilterState = {
  filters: {
    rarity: string[];
    sets: string[];
    hiddenSets: string[];
    excludeSetTypes: string[];
    excludeGroups: string[];
    yearMin: number | null;
    yearMax: number | null;
    priceMin: number | null;
    priceMax: number | null;
    colors: string[];
    formats: string[];
    types: string[];
    owned: boolean | null;
    watchlist: boolean | null;
    pinned: boolean | null;
    reservedOnly: boolean | null;
    includeDigital: boolean;
    specialGroup: string | null;
    search: string;
  };
  display: {
    showEmptyColumns: boolean;
    matchMode: MatchDisplayMode;
    showPinnedStrip: boolean;
    colSort: string;
    page: number;
    pageSize: number;
  };
  sort: {
    slots: SortSlot[];
    valueAggregationScope: ValueAggregationScope;
    headerPriceSetCode: string | null;
  };
  group: {
    by: GroupByMode;
    collapsedKeys: string[];
  };
};

export const defaultHeatmapFilters: HeatmapFilters = {
  rarity: [],
  sets: [],
  hiddenSets: [],
  excludeSetTypes: [],
  excludeGroups: [],
  yearMin: null,
  yearMax: null,
  priceMin: null,
  priceMax: null,
  colors: [],
  formats: [],
  types: [],
  owned: null,
  watchlist: null,
  pinned: null,
  reservedOnly: null,
  includeDigital: false,
  specialGroup: null,
  search: "",
  sort: "name",
  sortSlots: [{ key: "name", dir: null }],
  valueAggScope: "visible",
  colSort: "release",
  page: 0,
  pageSize: 1000,
  showPinned: true,
  showEmptyColumns: false,
  matchMode: "context",
  groupBy: "none",
  groupCollapsedKeys: [],
  headerSortSetCode: null,
};

export const DEFAULT_FILTER_STATE: FilterState = {
  filters: {
    rarity: [],
    sets: [],
    hiddenSets: [],
    excludeSetTypes: [],
    excludeGroups: [],
    yearMin: null,
    yearMax: null,
    priceMin: null,
    priceMax: null,
    colors: [],
    formats: [],
    types: [],
    owned: null,
    watchlist: null,
    pinned: null,
    reservedOnly: null,
    includeDigital: false,
    specialGroup: null,
    search: "",
  },
  display: {
    showEmptyColumns: false,
    matchMode: "context",
    showPinnedStrip: true,
    colSort: "release",
    page: 0,
    pageSize: 1000,
  },
  sort: {
    slots: [{ key: "name", dir: null }],
    valueAggregationScope: "visible",
    headerPriceSetCode: null,
  },
  group: {
    by: "none",
    collapsedKeys: [],
  },
};

const ROW_SORT_KEYS = new Set([
  "name",
  "printings",
  "reserved",
  "price_min",
  "price_max",
  "price_median",
  "price_avg",
]);

export function parseSortSlotToken(token: string): SortSlot | null {
  const t = token.trim();
  if (!t) return null;
  const [k0, d0] = t.split(":");
  const rawKey = k0.trim();
  if (!ROW_SORT_KEYS.has(rawKey)) return null;
  const key: SortSlot["key"] = rawKey === "price_avg" ? "price_median" : (rawKey as SortSlot["key"]);
  const dir =
    d0 === "asc" || d0 === "desc"
      ? d0
      : key === "price_min"
        ? "asc"
        : key === "price_max" || key === "price_median"
          ? "desc"
          : null;
  return { key, dir: key.startsWith("price_") ? dir : null };
}

export function parseSortSlotsFromUrl(sp: URLSearchParams): SortSlot[] {
  const sk = sp.get("sk");
  if (sk && sk.trim()) {
    const slots = sk
      .split("~")
      .map(parseSortSlotToken)
      .filter((s): s is SortSlot => Boolean(s))
      .slice(0, 3);
    if (slots.length) return slots;
  }
  const legacy = sp.get("sort")?.trim() || "name";
  const slot = parseSortSlotToken(legacy);
  return slot ? [slot] : [{ key: "name", dir: null }];
}

export function slotsToPrimarySortString(slots: SortSlot[]): string {
  const first = slots[0] ?? { key: "name", dir: null };
  if (first.key.startsWith("price_")) {
    const d = first.dir ?? (first.key === "price_min" ? "asc" : "desc");
    return `${first.key}:${d}`;
  }
  return first.key;
}

export function filterStateToHeatmapFilters(fs: FilterState): HeatmapFilters {
  const slots: SortSlot[] = fs.sort.slots.length ? fs.sort.slots.slice(0, 3) : [{ key: "name", dir: null }];
  return {
    rarity: fs.filters.rarity,
    sets: fs.filters.sets,
    hiddenSets: fs.filters.hiddenSets,
    excludeSetTypes: fs.filters.excludeSetTypes,
    excludeGroups: fs.filters.excludeGroups,
    yearMin: fs.filters.yearMin,
    yearMax: fs.filters.yearMax,
    priceMin: fs.filters.priceMin,
    priceMax: fs.filters.priceMax,
    colors: fs.filters.colors,
    formats: fs.filters.formats,
    types: fs.filters.types,
    owned: fs.filters.owned,
    watchlist: fs.filters.watchlist,
    pinned: fs.filters.pinned,
    reservedOnly: fs.filters.reservedOnly,
    includeDigital: fs.filters.includeDigital,
    specialGroup: fs.filters.specialGroup,
    search: fs.filters.search,
    sort: slotsToPrimarySortString(slots),
    sortSlots: slots,
    valueAggScope: fs.sort.valueAggregationScope,
    colSort: fs.display.colSort,
    page: fs.display.page,
    pageSize: fs.display.pageSize,
    showPinned: fs.display.showPinnedStrip,
    showEmptyColumns: fs.display.showEmptyColumns,
    matchMode: fs.display.matchMode,
    groupBy: fs.group.by,
    groupCollapsedKeys: [...fs.group.collapsedKeys],
    headerSortSetCode: fs.sort.headerPriceSetCode,
  };
}

export function heatmapFiltersToFilterState(f: HeatmapFilters): FilterState {
  const slots =
    f.sortSlots?.length && f.sortSlots.length > 0
      ? f.sortSlots.slice(0, 3)
      : parseSortSlotsFromUrl(new URLSearchParams({ sort: f.sort }));
  return {
    filters: {
      rarity: [...f.rarity],
      sets: [...f.sets],
      hiddenSets: [...f.hiddenSets],
      excludeSetTypes: [...f.excludeSetTypes],
      excludeGroups: [...f.excludeGroups],
      yearMin: f.yearMin,
      yearMax: f.yearMax,
      priceMin: f.priceMin,
      priceMax: f.priceMax,
      colors: [...f.colors],
      formats: [...f.formats],
      types: [...f.types],
      owned: f.owned,
      watchlist: f.watchlist,
      pinned: f.pinned,
      reservedOnly: f.reservedOnly,
      includeDigital: f.includeDigital,
      specialGroup: f.specialGroup,
      search: f.search,
    },
    display: {
      showEmptyColumns: f.showEmptyColumns,
      matchMode: f.matchMode,
      showPinnedStrip: f.showPinned,
      colSort: f.colSort,
      page: f.page,
      pageSize: f.pageSize,
    },
    sort: {
      slots,
      valueAggregationScope: f.valueAggScope,
      headerPriceSetCode: f.headerSortSetCode,
    },
    group: {
      by: f.groupBy,
      collapsedKeys: [...f.groupCollapsedKeys],
    },
  };
}

export function buildFilterStateFromUrlParts(
  partial: Partial<FilterState> & { filters?: Partial<FilterState["filters"]> },
): FilterState {
  return {
    filters: { ...DEFAULT_FILTER_STATE.filters, ...partial.filters },
    display: { ...DEFAULT_FILTER_STATE.display, ...partial.display },
    sort: {
      ...DEFAULT_FILTER_STATE.sort,
      ...partial.sort,
      slots: partial.sort?.slots?.length ? partial.sort.slots : DEFAULT_FILTER_STATE.sort.slots,
    },
    group: { ...DEFAULT_FILTER_STATE.group, ...partial.group },
  };
}

export function filterStateJson(fs: FilterState): string {
  return JSON.stringify(fs);
}

export function filterStateFromJson(s: string): FilterState | null {
  try {
    const v = JSON.parse(s) as FilterState;
    if (!v || typeof v !== "object" || !("filters" in v)) return null;
    return buildFilterStateFromUrlParts(v);
  } catch {
    return null;
  }
}
