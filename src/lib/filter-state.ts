/**
 * Section 11.4 — FilterState + HeatmapFilters (SQL adapter).
 * HeatmapFilters stays the API contract; FilterState is the structured UI / saved-view shape.
 */

import { HEATMAP_MAX_PAGE_SIZE } from "@/lib/constants";
import { defaultColorOrFull } from "@/lib/heatmap/color-lanes";

/** Up to three row-sort keys; value sorts use dir asc | desc. */
export type SortSlot = {
  key: "name" | "printings" | "reserved" | "price_min" | "price_max" | "price_median" | "cmc";
  dir: "asc" | "desc" | null;
};

export type ValueAggregationScope = "visible" | "all";

/** Sets = one column per edition; value = Min / Median / Max across qualifying printings. */
export type HeatmapColumnLayout = "sets" | "value" | "printings";

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
  /** Total mana value (CMC); uses `cards.cmc`, null treated as 0 for comparison. */
  cmcMin: number | null;
  cmcMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  /** CI must not contain these pips (URL `cln=`). */
  colorNot: string[];
  /** CI must satisfy OR across these pips / colorless C (URL `clo=`). */
  colorOr: string[];
  /** CI must contain every pip here (URL `cla=`). */
  colorAnd: string[];
  formats: string[];
  types: string[];
  owned: boolean | null;
  watchlist: boolean | null;
  pinned: boolean | null;
  reservedOnly: boolean | null;
  includeDigital: boolean;
  specialGroup: string | null;
  search: string;
  /** When true, search includes oracle_text (rules/reminder text); default is name-only. */
  searchInText: boolean;
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
  /** URL `hdir` when `hcol` set: price sort direction for that column. */
  headerSortDir: "asc" | "desc" | null;
  /**
   * Session-only: oracle ids pinned to the top; row stays visible and cells ignore printing-level filters
   * (rarity / price / owned / watchlist dimming). URL `qr=`.
   */
  quickPinRows: string[];
  /** Session-only: set codes forced into the column list; cells in those columns ignore printing-level filters. URL `qc=`. */
  quickPinCols: string[];
  /** Columns: per-set vs aggregate Min / Median / Max (still uses same visible-set scope for SQL). */
  heatmapColumnLayout: HeatmapColumnLayout;
  /**
   * Field used for value-column aggregates and which printing wins min/med/max (URL `pm=`).
   * Set-column cell tint still uses client-side Price dropdown only; for value layout this drives API.
   */
  cellPriceField: "usd" | "usd_foil" | "eur" | "tix";
  /** Advanced rule-based filters serialized in URL `filters=` (base64url JSON). */
  advancedFilters: import("@/lib/heatmap/advanced-filters").FilterGroup | null;
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
    cmcMin: number | null;
    cmcMax: number | null;
    priceMin: number | null;
    priceMax: number | null;
    colorNot: string[];
    colorOr: string[];
    colorAnd: string[];
    formats: string[];
    types: string[];
    owned: boolean | null;
    watchlist: boolean | null;
    pinned: boolean | null;
    reservedOnly: boolean | null;
    includeDigital: boolean;
    specialGroup: string | null;
    search: string;
    searchInText: boolean;
    /** Session quick-pins (see HeatmapFilters.quickPinRows). */
    quickPinRows: string[];
    quickPinCols: string[];
  };
  display: {
    showEmptyColumns: boolean;
    matchMode: MatchDisplayMode;
    showPinnedStrip: boolean;
    colSort: string;
    page: number;
    pageSize: number;
    heatmapColumnLayout: HeatmapColumnLayout;
    cellPriceField: "usd" | "usd_foil" | "eur" | "tix";
  };
  sort: {
    slots: SortSlot[];
    valueAggregationScope: ValueAggregationScope;
    headerPriceSetCode: string | null;
    headerSortDir: "asc" | "desc" | null;
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
  cmcMin: null,
  cmcMax: null,
  priceMin: null,
  priceMax: null,
  colorNot: [],
  colorOr: defaultColorOrFull(),
  colorAnd: [],
  formats: [],
  types: [],
  owned: null,
  watchlist: null,
  pinned: null,
  reservedOnly: null,
  includeDigital: false,
  specialGroup: null,
  search: "",
  searchInText: false,
  sort: "name",
  sortSlots: [{ key: "name", dir: null }],
  valueAggScope: "visible",
  colSort: "release",
  page: 0,
  pageSize: HEATMAP_MAX_PAGE_SIZE,
  showPinned: true,
  showEmptyColumns: false,
  matchMode: "context",
  groupBy: "none",
  groupCollapsedKeys: [],
  headerSortSetCode: null,
  headerSortDir: null,
  quickPinRows: [],
  quickPinCols: [],
  heatmapColumnLayout: "sets",
  cellPriceField: "usd",
  advancedFilters: null,
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
    cmcMin: null,
    cmcMax: null,
    priceMin: null,
    priceMax: null,
    colorNot: [],
    colorOr: defaultColorOrFull(),
    colorAnd: [],
    formats: [],
    types: [],
    owned: null,
    watchlist: null,
    pinned: null,
    reservedOnly: null,
    includeDigital: false,
    specialGroup: null,
    search: "",
    searchInText: false,
    quickPinRows: [],
    quickPinCols: [],
  },
  display: {
    showEmptyColumns: false,
    matchMode: "context",
    showPinnedStrip: true,
    colSort: "release",
    page: 0,
    pageSize: HEATMAP_MAX_PAGE_SIZE,
    heatmapColumnLayout: "sets",
    cellPriceField: "usd",
  },
  sort: {
    slots: [{ key: "name", dir: null }],
    valueAggregationScope: "visible",
    headerPriceSetCode: null,
    headerSortDir: null,
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
  "cmc",
]);

export function parseSortSlotToken(token: string): SortSlot | null {
  const t = token.trim();
  if (!t) return null;
  const [k0, d0] = t.split(":");
  const rawKey = k0.trim();
  if (!ROW_SORT_KEYS.has(rawKey)) return null;
  const key: SortSlot["key"] = rawKey === "price_avg" ? "price_median" : (rawKey as SortSlot["key"]);
  if (key === "cmc") {
    const dir: SortSlot["dir"] = d0 === "desc" ? "desc" : "asc";
    return { key: "cmc", dir };
  }
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
  if (first.key === "cmc") {
    const d = first.dir ?? "asc";
    return `cmc:${d}`;
  }
  if (first.key.startsWith("price_")) {
    const d = first.dir ?? (first.key === "price_min" ? "asc" : "desc");
    return `${first.key}:${d}`;
  }
  return first.key;
}

/** Row-sort slots for SQL / URL when `sortSlots` is empty but legacy `sort` still describes the intent. */
export function effectiveSortSlots(f: HeatmapFilters): SortSlot[] {
  if (f.sortSlots?.length) return f.sortSlots;
  return parseSortSlotsFromUrl(new URLSearchParams({ sort: f.sort }));
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
    cmcMin: fs.filters.cmcMin,
    cmcMax: fs.filters.cmcMax,
    priceMin: fs.filters.priceMin,
    priceMax: fs.filters.priceMax,
    colorNot: [...fs.filters.colorNot],
    colorOr: [...fs.filters.colorOr],
    colorAnd: [...fs.filters.colorAnd],
    formats: fs.filters.formats,
    types: fs.filters.types,
    owned: fs.filters.owned,
    watchlist: fs.filters.watchlist,
    pinned: fs.filters.pinned,
    reservedOnly: fs.filters.reservedOnly,
    includeDigital: fs.filters.includeDigital,
    specialGroup: fs.filters.specialGroup,
    search: fs.filters.search,
    searchInText: fs.filters.searchInText,
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
    headerSortDir: fs.sort.headerSortDir ?? null,
    heatmapColumnLayout: fs.display.heatmapColumnLayout,
    cellPriceField: fs.display.cellPriceField,
    quickPinRows: [...fs.filters.quickPinRows],
    quickPinCols: [...fs.filters.quickPinCols],
    advancedFilters: null,
  };
}

export function heatmapFiltersToFilterState(f: HeatmapFilters): FilterState {
  const slots = effectiveSortSlots(f).slice(0, 3);
  return {
    filters: {
      rarity: [...f.rarity],
      sets: [...f.sets],
      hiddenSets: [...f.hiddenSets],
      excludeSetTypes: [...f.excludeSetTypes],
      excludeGroups: [...f.excludeGroups],
      yearMin: f.yearMin,
      yearMax: f.yearMax,
      cmcMin: f.cmcMin,
      cmcMax: f.cmcMax,
      priceMin: f.priceMin,
      priceMax: f.priceMax,
      colorNot: [...f.colorNot],
      colorOr: [...f.colorOr],
      colorAnd: [...f.colorAnd],
      formats: [...f.formats],
      types: [...f.types],
      owned: f.owned,
      watchlist: f.watchlist,
      pinned: f.pinned,
      reservedOnly: f.reservedOnly,
      includeDigital: f.includeDigital,
      specialGroup: f.specialGroup,
      search: f.search,
      searchInText: f.searchInText,
      quickPinRows: [...f.quickPinRows],
      quickPinCols: [...f.quickPinCols],
    },
    display: {
      showEmptyColumns: f.showEmptyColumns,
      matchMode: f.matchMode,
      showPinnedStrip: f.showPinned,
      colSort: f.colSort,
      page: f.page,
      pageSize: f.pageSize,
      heatmapColumnLayout: f.heatmapColumnLayout,
      cellPriceField: f.cellPriceField,
    },
    sort: {
      slots,
      valueAggregationScope: f.valueAggScope,
      headerPriceSetCode: f.headerSortSetCode,
      headerSortDir: f.headerSortDir ?? null,
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
