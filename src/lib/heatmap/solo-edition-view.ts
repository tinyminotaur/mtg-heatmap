import {
  defaultHeatmapFilters,
  slotsToPrimarySortString,
  type HeatmapFilters,
  type SortSlot,
} from "@/lib/filter-state";

/**
 * Narrow the heatmap to a single edition column (`sets=[code]`), clearing facet/search/session filters,
 * while preserving primary row sort (`sortSlots`), price field, column sort order, value aggregation scope,
 * and current page size.
 */
export function buildSoloEditionViewFilters(current: HeatmapFilters, editionSetCode: string): HeatmapFilters {
  const code = editionSetCode.trim().toLowerCase();
  if (!code || code.startsWith("__")) {
    return current;
  }

  const sortSlots: SortSlot[] =
    current.sortSlots?.length > 0 ? current.sortSlots.map((s) => ({ ...s })) : [{ key: "name", dir: null }];

  return {
    ...defaultHeatmapFilters,
    sortSlots,
    sort: slotsToPrimarySortString(sortSlots),
    cellPriceField: current.cellPriceField,
    colSort: current.colSort,
    valueAggScope: current.valueAggScope,
    heatmapColumnLayout: "sets",
    sets: [code],
    page: 0,
    pageSize: current.pageSize,
  };
}
