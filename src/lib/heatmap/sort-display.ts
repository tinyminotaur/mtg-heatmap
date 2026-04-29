import type { SortSlot } from "@/lib/filter-state";
import { ROW_SORT_OPTIONS } from "@/lib/heatmap/row-sort-menu";

/** Short label for the primary row sort (toolbar / frozen header). */
export function primarySortButtonLabel(slots: SortSlot[]): string {
  const s = slots[0];
  if (!s) return "Name";
  const opt = ROW_SORT_OPTIONS.find((o) => o.key === s.key);
  const base = opt?.label ?? s.key;
  if (s.key === "name" || s.key === "printings" || s.key === "reserved") {
    return base;
  }
  if (s.dir === "asc") return `${base} · asc`;
  if (s.dir === "desc") return `${base} · desc`;
  return base;
}
