"use client";

import { useCallback, useMemo } from "react";
import {
  defaultHeatmapFilters,
  type HeatmapFilters,
} from "@/lib/filter-state";
import {
  parseHeatmapUrlSearchParams,
  serializeHeatmapUrlParams,
} from "@/lib/heatmap-url-params";

export function useHeatmapUrlFilters(
  queryString: string,
  onReplaceQuery: (params: URLSearchParams) => void,
) {
  const filters = useMemo(
    () => parseHeatmapUrlSearchParams(new URLSearchParams(queryString)),
    [queryString],
  );

  const patch = useCallback(
    (mut: (base: HeatmapFilters) => HeatmapFilters) => {
      const base = parseHeatmapUrlSearchParams(new URLSearchParams(queryString));
      onReplaceQuery(
        serializeHeatmapUrlParams({
          ...defaultHeatmapFilters,
          ...mut(base),
        }),
      );
    },
    [onReplaceQuery, queryString],
  );

  const replaceFilters = useCallback(
    (next: HeatmapFilters) => {
      onReplaceQuery(serializeHeatmapUrlParams({ ...defaultHeatmapFilters, ...next }));
    },
    [onReplaceQuery],
  );

  return { filters, patch, replaceFilters };
}
