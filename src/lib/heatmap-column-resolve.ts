import type Database from "better-sqlite3";
import { POC_RELEASE_CUTOFF } from "@/lib/constants";
import type { HeatmapFilters } from "@/lib/filter-state";
import type { ColumnMeta } from "@/lib/heatmap-types";
import { expandExcludeGroupTypes } from "@/lib/set-column-groups";

type CacheEntry = { cols: ColumnMeta[]; at: number };
const COL_CACHE = new Map<string, CacheEntry>();
const COL_CACHE_MAX = 50;
const COL_CACHE_TTL_MS = 30_000;

function stableKeyParts(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(stableKeyParts).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${k}:${stableKeyParts(o[k])}`).join(",")}}`;
  }
  return String(v);
}

function colResolveCacheKey(
  f: HeatmapFilters,
  cardPred: string,
  cardParams: unknown[],
  havingSql: string,
  havingParams: unknown[],
  userId: string,
): string {
  const fx = {
    includeDigital: f.includeDigital,
    sets: f.sets,
    yearMin: f.yearMin,
    yearMax: f.yearMax,
    hiddenSets: f.hiddenSets,
    excludeSetTypes: f.excludeSetTypes,
    excludeGroups: f.excludeGroups,
    showEmptyColumns: f.showEmptyColumns,
    showPinned: f.showPinned,
    quickPinCols: f.quickPinCols ?? [],
    colSort: f.colSort,
  };
  return [
    "v1",
    userId,
    cardPred,
    stableKeyParts(cardParams),
    havingSql,
    stableKeyParts(havingParams),
    stableKeyParts(fx),
  ].join("|");
}

function yearFromDate(d: string | null): number | null {
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function mergedExcludedSetTypes(f: HeatmapFilters): string[] {
  const s = new Set<string>([...f.excludeSetTypes, ...expandExcludeGroupTypes(f.excludeGroups)]);
  return [...s];
}

function sortColumnMeta(cols: ColumnMeta[], mode: string): ColumnMeta[] {
  const cmpDate = (a: ColumnMeta, b: ColumnMeta) => {
    const da = a.release_date ?? "";
    const db = b.release_date ?? "";
    return da.localeCompare(db);
  };
  const out = [...cols];
  switch (mode) {
    case "release_desc":
      return out.sort((a, b) => -cmpDate(a, b) || a.code.localeCompare(b.code));
    case "code":
      return out.sort((a, b) => a.code.localeCompare(b.code));
    case "name":
      return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    case "type_release":
      return out.sort(
        (a, b) =>
          (a.set_type ?? "").localeCompare(b.set_type ?? "") ||
          cmpDate(a, b) ||
          a.code.localeCompare(b.code),
      );
    default:
      return out.sort((a, b) => cmpDate(a, b) || a.code.localeCompare(b.code));
  }
}

function appendColumnScopeFilters(
  f: HeatmapFilters,
  sql: string,
  params: unknown[],
): { sql: string; params: unknown[] } {
  let s = sql;
  const p = [...params];
  if (!f.includeDigital) s += ` AND s.is_digital = 0`;
  if (f.sets.length) {
    s += ` AND s.code IN (${f.sets.map(() => "?").join(",")})`;
    p.push(...f.sets);
  }
  if (f.yearMin != null) {
    s += ` AND CAST(strftime('%Y', s.release_date) AS INTEGER) >= ?`;
    p.push(f.yearMin);
  }
  if (f.yearMax != null) {
    s += ` AND CAST(strftime('%Y', s.release_date) AS INTEGER) <= ?`;
    p.push(f.yearMax);
  }
  if (f.hiddenSets.length) {
    s += ` AND s.code NOT IN (${f.hiddenSets.map(() => "?").join(",")})`;
    p.push(...f.hiddenSets);
  }
  const exTypes = mergedExcludedSetTypes(f);
  if (exTypes.length) {
    s += ` AND (s.set_type IS NULL OR s.set_type NOT IN (${exTypes.map(() => "?").join(",")}))`;
    p.push(...exTypes);
  }
  return { sql: s, params: p };
}

function rowToMeta(r: Omit<ColumnMeta, "year">): ColumnMeta {
  return { ...r, year: yearFromDate(r.release_date) };
}

type SetColumnRow = Omit<ColumnMeta, "year">;

/**
 * §11.2.3–11.2.4 — Distinct heatmap columns for the full filtered card set (stable across pages).
 */
export function resolveHeatmapColumns(
  db: Database.Database,
  f: HeatmapFilters,
  cardPred: string,
  cardParams: unknown[],
  havingSql: string,
  havingParams: unknown[],
  userId: string,
  pinnedOracleIds?: string[],
): ColumnMeta[] {
  const now = Date.now();
  const key = colResolveCacheKey(f, cardPred, cardParams, havingSql, havingParams, userId);
  const hit = COL_CACHE.get(key);
  if (hit && now - hit.at < COL_CACHE_TTL_MS) return hit.cols;

  let qualSql = `
    SELECT DISTINCT s.code, s.name, s.release_date, s.set_type, s.icon_svg_path, s.parent_set_code
    FROM sets s
    INNER JOIN printings p ON p.set_code = s.code
    WHERE p.oracle_id IN (SELECT c.oracle_id FROM cards c WHERE ${cardPred} ${havingSql})
    AND (s.release_date IS NULL OR s.release_date <= ?)
  `;
  const qualParams: unknown[] = [...cardParams, ...havingParams, POC_RELEASE_CUTOFF];
  const qualScoped = appendColumnScopeFilters(f, qualSql, qualParams);
  qualSql = `${qualScoped.sql} ORDER BY s.release_date ASC, s.code ASC`;
  const qualRows = db.prepare(qualSql).all(...qualScoped.params) as SetColumnRow[];

  const byCode = new Map<string, ColumnMeta>();
  for (const r of qualRows) {
    byCode.set(r.code, rowToMeta(r));
  }

  if (f.showEmptyColumns) {
    let scopeSql = `
      SELECT DISTINCT s.code, s.name, s.release_date, s.set_type, s.icon_svg_path, s.parent_set_code
      FROM sets s
      WHERE (s.release_date IS NULL OR s.release_date <= ?)
    `;
    const scopeParams: unknown[] = [POC_RELEASE_CUTOFF];
    const scopeScoped = appendColumnScopeFilters(f, scopeSql, scopeParams);
    scopeSql = `${scopeScoped.sql} ORDER BY s.release_date ASC, s.code ASC`;
    const scopeRows = db.prepare(scopeScoped.sql).all(...scopeScoped.params) as SetColumnRow[];
    for (const r of scopeRows) {
      if (!byCode.has(r.code)) byCode.set(r.code, rowToMeta(r));
    }
  }

  if (f.showPinned) {
    const known = [...byCode.keys()];
    const notIn =
      known.length > 0 ? `AND p.set_code NOT IN (${known.map(() => "?").join(",")})` : "";
    const pins = (pinnedOracleIds ?? []).filter(Boolean);
    if (pins.length) {
      const ph = pins.map(() => "?").join(",");
      const pinSql = `
        SELECT DISTINCT s.code, s.name, s.release_date, s.set_type, s.icon_svg_path, s.parent_set_code
        FROM printings p
        INNER JOIN sets s ON s.code = p.set_code
        WHERE p.oracle_id IN (${ph}) ${notIn}
          AND (s.release_date IS NULL OR s.release_date <= ?)
      `;
      const pinParams: unknown[] = [...pins, ...known, POC_RELEASE_CUTOFF];
      const pinScoped = appendColumnScopeFilters(f, pinSql, pinParams);
      const pinRows = db.prepare(pinScoped.sql).all(...pinScoped.params) as SetColumnRow[];
      for (const r of pinRows) {
        if (!byCode.has(r.code)) byCode.set(r.code, rowToMeta(r));
      }
    }
  }

  if (f.quickPinCols?.length) {
    const want = [...new Set(f.quickPinCols.map((c) => c.trim().toLowerCase()).filter(Boolean))];
    const missing = want.filter((code) => !byCode.has(code));
    if (missing.length) {
      const ph = missing.map(() => "?").join(",");
      const forced = db
        .prepare(
          `SELECT s.code, s.name, s.release_date, s.set_type, s.icon_svg_path, s.parent_set_code
           FROM sets s
           WHERE s.code IN (${ph}) AND (s.release_date IS NULL OR s.release_date <= ?)`,
        )
        .all(...missing, POC_RELEASE_CUTOFF) as SetColumnRow[];
      for (const r of forced) {
        if (!byCode.has(r.code)) byCode.set(r.code, rowToMeta(r));
      }
    }
  }

  const cols = sortColumnMeta([...byCode.values()], f.colSort);
  COL_CACHE.set(key, { cols, at: now });
  // Cheap LRU-ish eviction: drop oldest when above cap.
  if (COL_CACHE.size > COL_CACHE_MAX) {
    let oldestK: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of COL_CACHE.entries()) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestK = k;
      }
    }
    if (oldestK) COL_CACHE.delete(oldestK);
  }
  return cols;
}
