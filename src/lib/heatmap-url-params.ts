/** Allowed URL param values for controlled Selects (invalid → safe default). */
export const COL_SORT_OPTIONS = ["release", "release_desc", "code", "name", "type_release"] as const;
export type ColSortValue = (typeof COL_SORT_OPTIONS)[number];

export const ROW_SORT_OPTIONS = [
  "name",
  "printings",
  "reserved",
  "price_min",
  "price_avg",
  "price_max",
] as const;
export type RowSortValue = (typeof ROW_SORT_OPTIONS)[number];

export function normalizedColSort(sp: URLSearchParams): ColSortValue {
  const v = (sp.get("colSort") ?? "").trim();
  return (COL_SORT_OPTIONS as readonly string[]).includes(v) ? (v as ColSortValue) : "release";
}

export function normalizedRowSort(sp: URLSearchParams): RowSortValue {
  const v = (sp.get("sort") ?? "").trim();
  return (ROW_SORT_OPTIONS as readonly string[]).includes(v) ? (v as RowSortValue) : "name";
}
