import type { HeatmapFilters } from "@/lib/filter-state";
import { defaultHeatmapFilters } from "@/lib/filter-state";

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

/** Normalize older saved state missing new fields. */
export function normalizeFilters(f: HeatmapFilters): HeatmapFilters {
  return {
    ...defaultHeatmapFilters,
    ...f,
    sortSlots:
      f.sortSlots?.length && f.sortSlots.length > 0
        ? f.sortSlots
        : [{ key: "name", dir: null }],
  };
}

