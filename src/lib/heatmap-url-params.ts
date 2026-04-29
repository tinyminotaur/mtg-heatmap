/**
 * §11.11 — Single hydration path: named query params + optional `s=` base64url JSON overlay.
 */

import { HEATMAP_MAX_PAGE_SIZE } from "@/lib/constants";
import {
  type HeatmapFilters,
  type HeatmapColumnLayout,
  defaultHeatmapFilters,
  effectiveSortSlots,
  parseSortSlotsFromUrl,
  slotsToPrimarySortString,
} from "@/lib/filter-state";
import { decodeAdvancedFiltersParam, encodeAdvancedFiltersParam } from "@/lib/heatmap/advanced-filters";
import {
  defaultColorOrFull,
  isNoOpColorLaneState,
  mergeExactAndIntoNotLanes,
  normalizeColorLaneList,
} from "@/lib/heatmap/color-lanes";

/** Allowed URL param values for controlled Selects (invalid → safe default). */
export const COL_SORT_OPTIONS = ["release", "release_desc", "code", "name", "type_release"] as const;
export type ColSortValue = (typeof COL_SORT_OPTIONS)[number];

export const ROW_SORT_OPTIONS = [
  "name",
  "printings",
  "reserved",
  "price_min",
  "price_max",
  "price_median",
  "cmc",
] as const;
export type RowSortValue = (typeof ROW_SORT_OPTIONS)[number];

export const CELL_PRICE_FIELDS = ["usd", "usd_foil", "eur", "tix"] as const;
export type CellPriceField = (typeof CELL_PRICE_FIELDS)[number];

export function parseHeatmapCellPriceField(sp: URLSearchParams): CellPriceField {
  const v = (sp.get("pm") ?? "").trim().toLowerCase();
  return (CELL_PRICE_FIELDS as readonly string[]).includes(v) ? (v as CellPriceField) : "usd";
}

const LEGACY_ROW_SORT = [...ROW_SORT_OPTIONS, "price_avg"] as const;

function decodeSblob(s: string): Record<string, unknown> | null {
  const t = s.trim();
  if (!t) return null;
  try {
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(t, "base64url").toString("utf8");
    } else {
      const b64 = t.replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    }
    const v = JSON.parse(json) as Record<string, unknown>;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function encodeSblob(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Blob keys are defaults; explicit query params override. */
function mergeBlob(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  const raw = sp.get("s");
  const blob = raw ? decodeSblob(raw) : null;
  if (blob) {
    for (const [k, val] of Object.entries(blob)) {
      if (typeof val === "string") out.set(k, val);
      else if (typeof val === "number" || typeof val === "boolean") out.set(k, String(val));
    }
  }
  for (const [k, v] of sp.entries()) {
    if (k === "s") continue;
    out.set(k, v);
  }
  return out;
}

export function normalizedColSort(sp: URLSearchParams): ColSortValue {
  const v = (sp.get("colSort") ?? "").trim();
  return (COL_SORT_OPTIONS as readonly string[]).includes(v) ? (v as ColSortValue) : "release";
}

export function normalizedRowSort(sp: URLSearchParams): RowSortValue {
  const merged = mergeBlob(sp);
  const token = (merged.get("sort") ?? "").split(":")[0]?.trim() || "name";
  return (LEGACY_ROW_SORT as readonly string[]).includes(token)
    ? token === "price_avg"
      ? "price_median"
      : (token as RowSortValue)
    : "name";
}

/** §11.11 — Parse URL (after `s=` overlay) into HeatmapFilters. */
export function parseHeatmapUrlSearchParams(sp: URLSearchParams): HeatmapFilters {
  const merged = mergeBlob(sp);
  const rarity = merged.get("rarity")?.split(",").filter(Boolean) ?? [];
  const sets = merged.get("sets")?.split(",").filter(Boolean) ?? [];
  const hiddenSets = merged.get("hideSets")?.split(",").filter(Boolean) ?? [];
  const excludeSetTypes = merged.get("exclTypes")?.split(",").filter(Boolean) ?? [];
  const excludeGroups = merged.get("exclGroups")?.split(",").filter(Boolean) ?? [];
  const legacyColorsRaw = merged.get("colors")?.split(",").filter(Boolean) ?? [];
  const legacyExact = merged.get("colorMode") === "exact";
  const clnRaw = merged.get("cln")?.split(",").filter(Boolean) ?? [];
  const cloRaw = merged.get("clo")?.split(",").filter(Boolean) ?? [];
  const claRaw = merged.get("cla")?.split(",").filter(Boolean) ?? [];
  const hasLaneParams =
    merged.has("cln") || merged.has("clo") || merged.has("cla") || merged.has("clx");

  let colorNot = normalizeColorLaneList(clnRaw);
  let colorOr = normalizeColorLaneList(cloRaw);
  let colorAnd = normalizeColorLaneList(claRaw);

  if (!hasLaneParams && legacyColorsRaw.length) {
    const legacyNorm = normalizeColorLaneList(legacyColorsRaw);
    if (legacyExact) {
      colorAnd = legacyNorm;
    } else {
      colorOr = legacyNorm;
    }
  } else if (!hasLaneParams && !legacyColorsRaw.length) {
    colorOr = defaultColorOrFull();
  }

  const wantsExactMigration =
    merged.get("clx") === "1" || (!hasLaneParams && legacyColorsRaw.length && legacyExact);

  if (wantsExactMigration && colorAnd.length) {
    const m = mergeExactAndIntoNotLanes(colorNot, colorOr, colorAnd);
    colorNot = m.colorNot;
    colorOr = m.colorOr;
    colorAnd = m.colorAnd;
  }
  const formats = merged.get("formats")?.split(",").filter(Boolean) ?? [];
  const types = merged.get("types")?.split(",").filter(Boolean) ?? [];
  const advancedFilters = merged.get("filters") ? decodeAdvancedFiltersParam(String(merged.get("filters"))) : null;
  const yearMin = merged.get("yearMin") ? Number(merged.get("yearMin")) : null;
  const yearMax = merged.get("yearMax") ? Number(merged.get("yearMax")) : null;
  const cmcMin = merged.get("cmcMin") ? Number(merged.get("cmcMin")) : null;
  const cmcMax = merged.get("cmcMax") ? Number(merged.get("cmcMax")) : null;
  const priceMin = merged.get("priceMin") ? Number(merged.get("priceMin")) : null;
  const priceMax = merged.get("priceMax") ? Number(merged.get("priceMax")) : null;
  const parseBool = (k: string): boolean | null => {
    const v = merged.get(k);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return null;
  };

  const sortSlots = parseSortSlotsFromUrl(merged);
  const grp = (merged.get("grp") ?? "none").trim();
  const groupBy =
    grp === "reserved" || grp === "color" || grp === "type" ? grp : "none";
  let groupCollapsedKeys: string[] = [];
  const gc = merged.get("gc");
  if (gc) {
    try {
      const arr = JSON.parse(gc) as unknown;
      if (Array.isArray(arr)) groupCollapsedKeys = arr.filter((x): x is string => typeof x === "string");
    } catch {
      /* ignore */
    }
  }

  return {
    ...defaultHeatmapFilters,
    rarity,
    sets,
    hiddenSets,
    excludeSetTypes,
    excludeGroups,
    colorNot,
    colorOr,
    colorAnd,
    formats,
    types,
    advancedFilters,
    yearMin: Number.isFinite(yearMin as number) ? yearMin : null,
    yearMax: Number.isFinite(yearMax as number) ? yearMax : null,
    cmcMin: Number.isFinite(cmcMin as number) ? cmcMin : null,
    cmcMax: Number.isFinite(cmcMax as number) ? cmcMax : null,
    priceMin: Number.isFinite(priceMin as number) ? priceMin : null,
    priceMax: Number.isFinite(priceMax as number) ? priceMax : null,
    owned: parseBool("owned"),
    watchlist: parseBool("watchlist"),
    pinned: parseBool("pinned"),
    reservedOnly: parseBool("reserved"),
    includeDigital: merged.get("digital") === "1",
    specialGroup: merged.get("group") || null,
    search: merged.get("q") ?? "",
    sort: slotsToPrimarySortString(sortSlots),
    sortSlots,
    valueAggScope: merged.get("vscope") === "all" ? "all" : "visible",
    colSort: normalizedColSort(merged),
    page: Math.max(0, Number(merged.get("page") ?? 0) || 0),
    pageSize: Math.min(
      HEATMAP_MAX_PAGE_SIZE,
      Math.max(1, Number(merged.get("pageSize") ?? HEATMAP_MAX_PAGE_SIZE) || HEATMAP_MAX_PAGE_SIZE),
    ),
    showPinned: merged.get("hidePinned") !== "1",
    showEmptyColumns: merged.get("emptyCols") === "1",
    matchMode: merged.get("strict") === "1" ? "strict" : "context",
    groupBy,
    groupCollapsedKeys,
    headerSortSetCode: merged.get("hcol")?.trim().toLowerCase() || null,
    headerSortDir:
      merged.get("hdir") === "asc" ? "asc" : merged.get("hdir") === "desc" ? "desc" : null,
    heatmapColumnLayout: (merged.get("hlay") === "value" ? "value" : "sets") as HeatmapColumnLayout,
    cellPriceField: parseHeatmapCellPriceField(merged),
    quickPinRows: parseQuickPinRows(merged),
    quickPinCols: parseQuickPinCols(merged),
  };
}

const QUICK_PIN_ROWS_MAX = 48;
const QUICK_PIN_COLS_MAX = 36;

function parseQuickPinRows(sp: URLSearchParams): string[] {
  const raw = sp.get("qr")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return [...new Set(raw)].slice(0, QUICK_PIN_ROWS_MAX);
}

function parseQuickPinCols(sp: URLSearchParams): string[] {
  const raw =
    sp.get("qc")?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) ?? [];
  return [...new Set(raw)].slice(0, QUICK_PIN_COLS_MAX);
}

function setIf(out: URLSearchParams, key: string, val: string | null | undefined, omit?: string) {
  if (!val || val === omit) out.delete(key);
  else out.set(key, val);
}

/** Serialize filters to URLSearchParams (named params; long facet lists overflow into `s=`). */
export function serializeHeatmapUrlParams(f: HeatmapFilters): URLSearchParams {
  const out = new URLSearchParams();

  if (f.rarity.length) out.set("rarity", f.rarity.join(","));
  if (f.sets.length) out.set("sets", f.sets.join(","));
  if (f.hiddenSets.length) out.set("hideSets", f.hiddenSets.join(","));
  if (f.excludeSetTypes.length) out.set("exclTypes", f.excludeSetTypes.join(","));
  if (f.excludeGroups.length) out.set("exclGroups", f.excludeGroups.join(","));
  if (!isNoOpColorLaneState(f)) {
    if (f.colorNot.length) out.set("cln", f.colorNot.join(","));
    out.set("clo", normalizeColorLaneList(f.colorOr).join(","));
    if (f.colorAnd.length) out.set("cla", f.colorAnd.join(","));
  }
  if (f.formats.length) out.set("formats", f.formats.join(","));
  if (f.types.length) out.set("types", f.types.join(","));
  if (f.advancedFilters) out.set("filters", encodeAdvancedFiltersParam(f.advancedFilters));
  if (f.yearMin != null) out.set("yearMin", String(f.yearMin));
  if (f.yearMax != null) out.set("yearMax", String(f.yearMax));
  if (f.cmcMin != null) out.set("cmcMin", String(f.cmcMin));
  if (f.cmcMax != null) out.set("cmcMax", String(f.cmcMax));
  if (f.priceMin != null) out.set("priceMin", String(f.priceMin));
  if (f.priceMax != null) out.set("priceMax", String(f.priceMax));
  if (f.owned === true) out.set("owned", "1");
  if (f.owned === false) out.set("owned", "0");
  if (f.watchlist === true) out.set("watchlist", "1");
  if (f.watchlist === false) out.set("watchlist", "0");
  if (f.pinned === true) out.set("pinned", "1");
  if (f.pinned === false) out.set("pinned", "0");
  if (f.reservedOnly === true) out.set("reserved", "1");
  if (f.reservedOnly === false) out.set("reserved", "0");
  if (f.includeDigital) out.set("digital", "1");
  if (f.specialGroup) out.set("group", f.specialGroup);
  if (f.search.trim()) out.set("q", f.search.trim());
  if (f.colSort !== "release") out.set("colSort", f.colSort);
  if (f.page > 0) out.set("page", String(f.page));
  if (f.pageSize !== HEATMAP_MAX_PAGE_SIZE) out.set("pageSize", String(f.pageSize));
  if (!f.showPinned) out.set("hidePinned", "1");
  if (f.showEmptyColumns) out.set("emptyCols", "1");
  if (f.matchMode === "strict") out.set("strict", "1");
  if (f.valueAggScope === "all") out.set("vscope", "all");
  if (f.groupBy !== "none") out.set("grp", f.groupBy);
  if (f.groupCollapsedKeys.length) out.set("gc", JSON.stringify(f.groupCollapsedKeys));
  if (f.headerSortSetCode) out.set("hcol", f.headerSortSetCode);
  if (f.headerSortSetCode && f.headerSortDir) out.set("hdir", f.headerSortDir);
  // Always write `hlay` so it overrides any `s=` blob defaults.
  out.set("hlay", f.heatmapColumnLayout === "value" ? "value" : "sets");
  if (f.cellPriceField !== "usd") out.set("pm", f.cellPriceField);
  if (f.quickPinRows.length) out.set("qr", f.quickPinRows.join(","));
  if (f.quickPinCols.length) out.set("qc", f.quickPinCols.join(","));

  const rowSortSlots = effectiveSortSlots(f).slice(0, 3);
  const skStr = rowSortSlots
    .map((s) =>
      s.key.startsWith("price_") ? `${s.key}:${s.dir ?? (s.key === "price_min" ? "asc" : "desc")}` : s.key,
    )
    .join("~");
  if (skStr !== "name") out.set("sk", skStr);
  setIf(out, "sort", slotsToPrimarySortString(rowSortSlots), "name");

  let str = out.toString();
  if (str.length > 2000) {
    const overflow: Record<string, unknown> = {};
    for (const [k, v] of out.entries()) {
      if (k === "s") continue;
      if (
        v.length > 80 ||
        k === "rarity" ||
        k === "sets" ||
        k === "hideSets" ||
        k === "sk" ||
        k === "filters" ||
        k === "qr" ||
        k === "qc" ||
        k === "cln" ||
        k === "clo" ||
        k === "cla"
      )
        overflow[k] = v;
    }
    const compact = new URLSearchParams();
    for (const [k, v] of out.entries()) {
      if (k === "s") continue;
      if (overflow[k as string] != null) continue;
      compact.set(k, v);
    }
    compact.set("s", encodeSblob(overflow));
    str = compact.toString();
    return compact;
  }

  return out;
}
