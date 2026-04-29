import type { HeatmapFilters } from "@/lib/filter-state";
import { isNoOpColorLaneState, normalizeColorLaneList } from "@/lib/heatmap/color-lanes";

const WUBRGC = new Set(["W", "U", "B", "R", "G", "C"]);

/**
 * Scryfall `mana_cost` tokens: generic `{1}`…`{20}`, variable `{X}`, true colorless `{C}`.
 * Requires SQLite `REGEXP` (registered in `getDb` / `openDbAt`).
 */
const MANA_COST_NO_GENERIC_X_OR_C_SQL = `(
  c.mana_cost IS NULL
  OR TRIM(COALESCE(c.mana_cost, '')) = ''
  OR (
    NOT (c.mana_cost REGEXP ?)
    AND NOT (c.mana_cost REGEXP ?)
    AND NOT (c.mana_cost REGEXP ?)
  )
)`;

/** Patterns for `MANA_COST_NO_GENERIC_X_OR_C_SQL` placeholders (generic, X, C). */
export const SCRYFALL_MANA_EXCLUDE_COLORLESS_SYMBOL_PATTERNS = [
  String.raw`\{[0-9]+\}`,
  String.raw`\{X\}`,
  String.raw`\{C\}`,
] as const;

/** True when mana_cost has any symbol containing a given color letter (W/U/B/R/G). */
function sqlManaCostHasWubrg(): string {
  return `COALESCE(c.mana_cost, '') REGEXP ?`;
}

/** Regex matching any `{...}` mana symbol that contains this color letter. */
function scryfallManaHasColorPattern(p: string): string {
  return String.raw`\{[^}]*${p}[^}]*\}`;
}

/** Keep identity-based membership available for Advanced Filters (`field=color_identity`). */
export function sqlJsonIdentityHasWubrg(): string {
  const raw = `COALESCE(NULLIF(TRIM(c.color_identity), ''), NULLIF(TRIM(c.colors), ''), '[]')`;
  const safe = `CASE WHEN json_valid(${raw}) THEN ${raw} ELSE '[]' END`;
  return `EXISTS (SELECT 1 FROM json_each(${safe}) WHERE json_each.value = ?)`;
}

/** Land cards can imply/print mana without symbols in mana_cost (e.g., dual lands). */
function sqlLandProducesWubrg(): string {
  return `(
    LOWER(COALESCE(c.type_line, '')) LIKE '%land%'
    AND (
      COALESCE(c.oracle_text, '') REGEXP ?
      OR LOWER(COALESCE(c.type_line, '')) LIKE ?
    )
  )`;
}

/** Basic land subtype implication used as a fallback for old templating. */
function basicLandSubtypeLikePatternForColor(p: string): string {
  switch (p) {
    case "W":
      return "%plains%";
    case "U":
      return "%island%";
    case "B":
      return "%swamp%";
    case "R":
      return "%mountain%";
    case "G":
      return "%forest%";
    case "C":
      return "%wastes%";
    default:
      return "%";
  }
}

/** Lane-match for WUBRG: mana cost symbols, or land production/basic subtype implication. */
function sqlLaneHasWubrg(): string {
  return `(${sqlManaCostHasWubrg()} OR ${sqlLandProducesWubrg()})`;
}

/**
 * Adds conjuncts for color lanes (`colorNot` / `colorOr` / `colorAnd`) based on printed mana cost.
 * WUBRGC pips match symbols in `mana_cost`; lands are a special-case fallback so dual lands (and Wastes) still participate.
 * Returns null when no lane filters are active.
 */
export function colorLaneWhereClause(f: HeatmapFilters): { sql: string; params: unknown[] } | null {
  if (isNoOpColorLaneState(f)) return null;
  const not = normalizeColorLaneList(f.colorNot);
  const or = normalizeColorLaneList(f.colorOr);
  const and = normalizeColorLaneList(f.colorAnd);
  if (!not.length && !or.length && !and.length) return null;

  const conjuncts: { sql: string; params: unknown[] }[] = [];

  for (const p of not) {
    if (WUBRGC.has(p)) {
      conjuncts.push({
        sql: `NOT (${sqlLaneHasWubrg()})`,
        params: [scryfallManaHasColorPattern(p), scryfallManaHasColorPattern(p), basicLandSubtypeLikePatternForColor(p)],
      });
    }
  }

  if (and.length) {
    for (const p of and.filter((x): x is string => WUBRGC.has(x))) {
      conjuncts.push({
        sql: sqlLaneHasWubrg(),
        params: [scryfallManaHasColorPattern(p), scryfallManaHasColorPattern(p), basicLandSubtypeLikePatternForColor(p)],
      });
    }
  }

  // When Must-have lane is active, Any-of should not further constrain rows.
  // This makes "R+G must have" mean "identity includes both R and G", with any extras allowed.
  if (!and.length) {
    const orW = or.filter((x): x is string => WUBRGC.has(x));
    const orFragments: string[] = [];
    const orParams: unknown[] = [];
    for (const p of orW) {
      orFragments.push(sqlLaneHasWubrg());
      orParams.push(
        scryfallManaHasColorPattern(p),
        scryfallManaHasColorPattern(p),
        basicLandSubtypeLikePatternForColor(p),
      );
    }
    if (orFragments.length === 1) {
      conjuncts.push({ sql: orFragments[0]!, params: orParams });
    } else if (orFragments.length > 1) {
      conjuncts.push({ sql: `(${orFragments.join(" OR ")})`, params: orParams });
    }
  }

  const sql = conjuncts.map((c) => c.sql).join(" AND ");
  const params = conjuncts.flatMap((c) => c.params);
  return { sql, params };
}
