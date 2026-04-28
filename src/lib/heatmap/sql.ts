import type { HeatmapFilters } from "@/lib/filter-state";

export function groupKeyExpr(f: HeatmapFilters): string | null {
  switch (f.groupBy) {
    case "reserved":
      return `CASE WHEN c.is_reserved = 1 THEN 'Reserved' ELSE 'Core' END`;
    case "color":
      return `COALESCE(NULLIF(TRIM(json_extract(c.color_identity, '$[0]')), ''), '(none)')`;
    case "type":
      return `LOWER(COALESCE(NULLIF(TRIM(SUBSTR(COALESCE(c.type_line, ''), 1, 16)), ''), '(none)'))`;
    default:
      return null;
  }
}

export function groupCollapsedClause(
  f: HeatmapFilters,
  gexpr: string | null,
): { sql: string; params: unknown[] } {
  if (!gexpr || !f.groupCollapsedKeys.length) return { sql: "", params: [] };
  const ph = f.groupCollapsedKeys.map(() => "?").join(",");
  return { sql: ` AND (${gexpr}) NOT IN (${ph}) `, params: [...f.groupCollapsedKeys] };
}

/** Drop cards with no printing in any visible column (e.g. one-edition filter should not list all-empty rows). */
export function requirePrintingInHeatmapColumnsSql(
  setOrder: string[],
): { sql: string; params: unknown[] } {
  if (!setOrder.length) return { sql: "", params: [] };
  const ph = setOrder.map(() => "?").join(",");
  return {
    sql: ` AND EXISTS (SELECT 1 FROM printings pv WHERE pv.oracle_id = c.oracle_id AND pv.set_code IN (${ph}))`,
    params: [...setOrder],
  };
}

export function cardWhereClause(f: HeatmapFilters): { sql: string; params: unknown[] } {
  const parts: string[] = ["1=1"];
  const params: unknown[] = [];
  if (f.reservedOnly === true) {
    parts.push("c.is_reserved = 1");
  }
  if (f.search.trim().length >= 2) {
    parts.push("c.name LIKE ?");
    params.push(`%${f.search.trim()}%`);
  }
  if (f.colors.length) {
    for (const col of f.colors) {
      parts.push(`instr(COALESCE(c.color_identity, c.colors, ''), ?) > 0`);
      params.push(`"${col}"`);
    }
  }
  if (f.types.length) {
    for (const t of f.types) {
      parts.push("LOWER(c.type_line) LIKE ?");
      params.push(`%${t.toLowerCase()}%`);
    }
  }
  if (f.formats.length) {
    for (const fmt of f.formats) {
      parts.push(`json_extract(c.legalities, '$.' || ?) = 'legal'`);
      params.push(fmt);
    }
  }
  if (f.specialGroup) {
    parts.push(
      `c.oracle_id IN (SELECT value FROM json_each((SELECT oracle_ids FROM special_groups WHERE slug = ?)))`,
    );
    params.push(f.specialGroup);
  }
  return { sql: parts.join(" AND "), params };
}

export type BuildHavingOpts = {
  skipPrice?: boolean;
  priceSetCodes?: string[];
};

export function buildHaving(
  f: HeatmapFilters,
  userId: string,
  opts: BuildHavingOpts = {},
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const skipPrice = opts.skipPrice === true;
  const priceSets = opts.priceSetCodes ?? [];
  const priceInVisibleSets = priceSets.length > 0;
  const setPh = priceSets.map(() => "?").join(",");

  if (f.rarity.length) {
    parts.push(
      `EXISTS (SELECT 1 FROM printings p2 WHERE p2.oracle_id = c.oracle_id AND p2.rarity IN (${f.rarity
        .map(() => "?")
        .join(",")}))`,
    );
    params.push(...f.rarity);
  }
  const wantsPrice = !skipPrice && (f.priceMin != null || f.priceMax != null);
  if (wantsPrice) {
    if (!priceInVisibleSets) {
      parts.push("0=1");
    } else if (f.priceMin != null && f.priceMax != null) {
      parts.push(`EXISTS (
      SELECT 1 FROM printings p3 JOIN prices_current pc3 ON pc3.scryfall_id = p3.scryfall_id
      WHERE p3.oracle_id = c.oracle_id AND p3.set_code IN (${setPh})
      AND COALESCE(pc3.usd, pc3.usd_foil) IS NOT NULL
      AND COALESCE(pc3.usd, pc3.usd_foil) >= ?
      AND COALESCE(pc3.usd, pc3.usd_foil) <= ?
    )`);
      params.push(...priceSets, f.priceMin, f.priceMax);
    } else if (f.priceMin != null) {
      parts.push(`EXISTS (
      SELECT 1 FROM printings p3 JOIN prices_current pc3 ON pc3.scryfall_id = p3.scryfall_id
      WHERE p3.oracle_id = c.oracle_id AND p3.set_code IN (${setPh})
      AND COALESCE(pc3.usd, pc3.usd_foil) IS NOT NULL
      AND COALESCE(pc3.usd, pc3.usd_foil) >= ?
    )`);
      params.push(...priceSets, f.priceMin);
    } else if (f.priceMax != null) {
      parts.push(`EXISTS (
      SELECT 1 FROM printings p4 JOIN prices_current pc4 ON pc4.scryfall_id = p4.scryfall_id
      WHERE p4.oracle_id = c.oracle_id AND p4.set_code IN (${setPh})
      AND COALESCE(pc4.usd, pc4.usd_foil) IS NOT NULL
      AND COALESCE(pc4.usd, pc4.usd_foil) <= ?
    )`);
      params.push(...priceSets, f.priceMax);
    }
  }
  if (f.owned === true) {
    parts.push(`EXISTS (
      SELECT 1 FROM owned_cards o
      WHERE o.user_id = ? AND o.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
    )`);
    params.push(userId);
  }
  if (f.watchlist === true) {
    parts.push(`EXISTS (
      SELECT 1 FROM watchlist w
      WHERE w.user_id = ? AND w.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
    )`);
    params.push(userId);
  }
  if (f.pinned === true) {
    parts.push(
      `EXISTS (SELECT 1 FROM pinned pin WHERE pin.user_id = ? AND pin.oracle_id = c.oracle_id)`,
    );
    params.push(userId);
  }
  const sql = parts.length ? `AND (${parts.join(" AND ")})` : "";
  return { sql, params };
}

