import type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
import { slotsToPrimarySortString } from "@/lib/filter-state";

/** Primary row sort choices shown on the frozen “Card” header menu (matches advanced bar). */
export const ROW_SORT_OPTIONS: { key: SortSlot["key"]; label: string }[] = [
  { key: "name", label: "Name (A–Z)" },
  { key: "printings", label: "Printings" },
  { key: "reserved", label: "Reserved list" },
  { key: "price_min", label: "Lowest price" },
  { key: "price_max", label: "Highest price" },
  { key: "price_median", label: "Median price" },
  { key: "cmc", label: "Mana value (CMC)" },
];

export function primarySlotForSortKey(key: SortSlot["key"]): SortSlot {
  let dir: SortSlot["dir"] = null;
  if (key.startsWith("price_")) {
    dir = key === "price_min" ? "asc" : "desc";
  } else if (key === "cmc") {
    dir = "asc";
  }
  return { key, dir };
}

/** Apply a new primary row sort; clears edition-column price override so row sort is unambiguous. */
export function applyPrimaryRowSort(f: HeatmapFilters, key: SortSlot["key"]): HeatmapFilters {
  const primary = primarySlotForSortKey(key);
  const sortSlots = [primary, ...f.sortSlots.slice(1, 3)].slice(0, 3) as SortSlot[];
  return {
    ...f,
    sortSlots,
    sort: slotsToPrimarySortString(sortSlots),
    headerSortSetCode: null,
    headerSortDir: null,
  };
}
