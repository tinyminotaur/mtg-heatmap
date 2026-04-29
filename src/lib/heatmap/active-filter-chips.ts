import type { HeatmapFilters } from "@/lib/filter-state";
import { rowStatusFromFilters } from "@/lib/heatmap/row-status";

export type ActiveChipKind =
  | "search"
  | "color"
  | "rarity"
  | "sets"
  | "hiddenSets"
  | "status"
  | "price"
  | "year"
  | "cmc"
  | "formats"
  | "types"
  | "reserved"
  | "pinned"
  | "digital"
  | "group";

export type ActiveFilterChip = {
  id: string;
  label: string;
  kind: ActiveChipKind;
};

const WUBRG_LABEL: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

export function buildActiveFilterChips(f: HeatmapFilters): ActiveFilterChip[] {
  const out: ActiveFilterChip[] = [];

  if (f.search.trim()) {
    out.push({
      id: "q",
      label: `Search: ${f.search.trim()}`,
      kind: "search",
    });
  }

  if (f.colors.length) {
    const mode = f.colorMode === "exact" ? "exact" : "any";
    const parts = f.colors.map((c) => WUBRG_LABEL[c] ?? c).join(", ");
    out.push({
      id: "colors",
      label: `Colors (${mode}): ${parts}`,
      kind: "color",
    });
  }

  if (f.rarity.length) {
    out.push({
      id: "rarity",
      label: `Rarity: ${f.rarity.join(", ")}`,
      kind: "rarity",
    });
  }

  if (f.sets.length) {
    out.push({
      id: "sets",
      label: `Sets only (${f.sets.length})`,
      kind: "sets",
    });
  }

  if (f.hiddenSets.length) {
    out.push({
      id: "hideSets",
      label: `Hidden sets (${f.hiddenSets.length})`,
      kind: "hiddenSets",
    });
  }

  const st = rowStatusFromFilters(f);
  if (st !== "all") {
    out.push({
      id: "status",
      label:
        st === "owned"
          ? "Status: Owned"
          : st === "wishlist"
            ? "Status: Wishlist"
            : "Status: Not owned",
      kind: "status",
    });
  }

  if (f.priceMin != null || f.priceMax != null) {
    const a = f.priceMin != null ? `$${f.priceMin}` : "—";
    const b = f.priceMax != null ? `$${f.priceMax}` : "—";
    out.push({
      id: "price",
      label: `Price: ${a} – ${b}`,
      kind: "price",
    });
  }

  if (f.yearMin != null || f.yearMax != null) {
    out.push({
      id: "year",
      label: `Year: ${f.yearMin ?? "…"}–${f.yearMax ?? "…"}`,
      kind: "year",
    });
  }

  if (f.cmcMin != null || f.cmcMax != null) {
    out.push({
      id: "cmc",
      label: `CMC: ${f.cmcMin ?? "…"}–${f.cmcMax ?? "…"}`,
      kind: "cmc",
    });
  }

  if (f.formats.length) {
    out.push({
      id: "formats",
      label: `Formats (${f.formats.length})`,
      kind: "formats",
    });
  }

  if (f.types.length) {
    out.push({
      id: "types",
      label: `Types (${f.types.length})`,
      kind: "types",
    });
  }

  if (f.reservedOnly === true) {
    out.push({ id: "reserved", label: "Reserved List", kind: "reserved" });
  }

  if (f.pinned === true) {
    out.push({ id: "pinned", label: "Pinned rows only", kind: "pinned" });
  }

  if (f.includeDigital) {
    out.push({ id: "digital", label: "Digital sets", kind: "digital" });
  }

  if (f.specialGroup) {
    out.push({
      id: "group",
      label: `Group: ${f.specialGroup}`,
      kind: "group",
    });
  }

  return out;
}

export function clearChip(
  f: HeatmapFilters,
  chipId: string,
): HeatmapFilters {
  switch (chipId) {
    case "q":
      return { ...f, search: "" };
    case "colors":
      return { ...f, colors: [], colorMode: "any" };
    case "rarity":
      return { ...f, rarity: [] };
    case "sets":
      return { ...f, sets: [] };
    case "hideSets":
      return { ...f, hiddenSets: [] };
    case "status":
      return { ...f, owned: null, watchlist: null };
    case "price":
      return { ...f, priceMin: null, priceMax: null };
    case "year":
      return { ...f, yearMin: null, yearMax: null };
    case "cmc":
      return { ...f, cmcMin: null, cmcMax: null };
    case "formats":
      return { ...f, formats: [] };
    case "types":
      return { ...f, types: [] };
    case "reserved":
      return { ...f, reservedOnly: null };
    case "pinned":
      return { ...f, pinned: null };
    case "digital":
      return { ...f, includeDigital: false };
    case "group":
      return { ...f, specialGroup: null };
    default:
      return f;
  }
}
