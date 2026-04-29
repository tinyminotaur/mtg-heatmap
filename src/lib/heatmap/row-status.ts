import type { HeatmapFilters } from "@/lib/filter-state";

export type RowStatusTab = "all" | "owned" | "wishlist" | "none";

export function rowStatusFromFilters(f: HeatmapFilters): RowStatusTab {
  if (f.owned === true) return "owned";
  if (f.watchlist === true) return "wishlist";
  if (f.owned === false && f.watchlist === false) return "none";
  return "all";
}

export function applyRowStatus(f: HeatmapFilters, tab: RowStatusTab): HeatmapFilters {
  switch (tab) {
    case "all":
      return { ...f, owned: null, watchlist: null };
    case "owned":
      return { ...f, owned: true, watchlist: null };
    case "wishlist":
      return { ...f, watchlist: true, owned: null };
    case "none":
      return { ...f, owned: false, watchlist: false };
    default:
      return f;
  }
}
