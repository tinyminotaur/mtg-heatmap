import type Database from "better-sqlite3";
import { POC_RELEASE_CUTOFF } from "@/lib/constants";
import { expandExcludeGroupTypes } from "@/lib/set-column-groups";
import type { ColumnMeta, HeatmapFilters } from "@/lib/heatmap-query";

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

/** Shared set/column filters (digital, allowlist, years, hidden sets, excluded types). */
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

/** Distinct columns for the full filtered card set (stable across pages). */
export function resolveHeatmapColumns(
  db: Database.Database,
  f: HeatmapFilters,
  cardPred: string,
  cardParams: unknown[],
  havingSql: string,
  havingParams: unknown[],
): ColumnMeta[] {
  let colSql = `
    SELECT DISTINCT s.code, s.name, s.release_date, s.set_type, s.icon_svg_path
    FROM sets s
    INNER JOIN printings p ON p.set_code = s.code
    WHERE p.oracle_id IN (SELECT c.oracle_id FROM cards c WHERE ${cardPred} ${havingSql})
    AND (s.release_date IS NULL OR s.release_date <= ?)
  `;
  const colParams: unknown[] = [...cardParams, ...havingParams, POC_RELEASE_CUTOFF];
  const scoped = appendColumnScopeFilters(f, colSql, colParams);
  colSql = `${scoped.sql} ORDER BY s.release_date ASC, s.code ASC`;
  const distinctRows = db.prepare(colSql).all(...scoped.params) as Omit<ColumnMeta, "year">[];
  return sortColumnMeta(
    distinctRows.map((r) => ({
      ...r,
      year: yearFromDate(r.release_date),
    })),
    f.colSort,
  );
}
