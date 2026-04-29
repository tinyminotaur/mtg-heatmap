import type { HeatmapFilters } from "@/lib/filter-state";

/** Locked scope tabs for the views row (mutually exclusive). */
export type RowStatusTab = "all" | "pinned" | "watchlist" | "owned" | "reserved";

export function rowStatusFromFilters(f: HeatmapFilters): RowStatusTab {
  if (f.reservedOnly === true) return "reserved";
  if (f.pinned === true) return "pinned";
  if (f.owned === true) return "owned";
  if (f.watchlist === true) return "watchlist";
  return "all";
}

export function applyRowStatus(f: HeatmapFilters, tab: RowStatusTab): HeatmapFilters {
  switch (tab) {
    case "all":
      return { ...f, owned: null, watchlist: null, pinned: null, reservedOnly: null };
    case "owned":
      return { ...f, owned: true, watchlist: null, pinned: null, reservedOnly: null };
    case "watchlist":
      return { ...f, watchlist: true, owned: null, pinned: null, reservedOnly: null };
    case "pinned":
      return { ...f, pinned: true, owned: null, watchlist: null, reservedOnly: null };
    case "reserved":
      return { ...f, reservedOnly: true, owned: null, watchlist: null, pinned: null };
    default:
      return f;
  }
}
