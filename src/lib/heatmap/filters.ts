import type { HeatmapFilters } from "@/lib/filter-state";
import { defaultHeatmapFilters, effectiveSortSlots } from "@/lib/filter-state";
import {
  defaultColorOrFull,
  mergeExactAndIntoNotLanes,
  normalizeColorLaneList,
} from "@/lib/heatmap/color-lanes";

export function safeJsonArray(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function safeJsonRecord(raw: unknown): Record<string, string> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

/** Normalize older saved state missing new fields; migrates legacy `colorAndExact` into Not lanes. */
export function normalizeFilters(f: HeatmapFilters): HeatmapFilters {
  const merged = { ...defaultHeatmapFilters, ...f };
  const legacyExact =
    "colorAndExact" in (f as object) &&
    (f as HeatmapFilters & { colorAndExact?: boolean }).colorAndExact === true;

  let colorNot = normalizeColorLaneList(merged.colorNot ?? []);
  let colorOr = normalizeColorLaneList(merged.colorOr ?? []);
  let colorAnd = normalizeColorLaneList(merged.colorAnd ?? []);

  if (legacyExact && colorAnd.length) {
    const m = mergeExactAndIntoNotLanes(colorNot, colorOr, colorAnd);
    colorNot = m.colorNot;
    colorOr = m.colorOr;
    colorAnd = m.colorAnd;
  }

  if (!colorNot.length && !colorAnd.length && !colorOr.length) {
    colorOr = defaultColorOrFull();
  }

  const { colorAndExact: _drop, ...rest } = merged as typeof merged & { colorAndExact?: boolean };

  return {
    ...rest,
    colorNot,
    colorOr,
    colorAnd,
    sortSlots: effectiveSortSlots(f),
    quickPinRows: [...new Set(f.quickPinRows ?? [])].slice(0, 48),
    quickPinCols: [...new Set((f.quickPinCols ?? []).map((x) => x.trim().toLowerCase()))].filter(Boolean).slice(0, 36),
  };
}

