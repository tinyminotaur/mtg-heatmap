import type { HeatmapFilters } from "@/lib/filter-state";
import { compileAdvancedFiltersToSql } from "@/lib/heatmap/advanced-filters";

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

const WUBRG = new Set(["W", "U", "B", "R", "G"]);

export function cardWhereClause(f: HeatmapFilters): { sql: string; params: unknown[] } {
  const parts: string[] = ["1=1"];
  const params: unknown[] = [];
  if (f.reservedOnly === true) {
    parts.push("c.is_reserved = 1");
  }
  const q = f.search.trim();
  if (q.length >= 2) {
    const term = `%${q}%`;
    parts.push(
      "(c.name LIKE ? OR COALESCE(c.type_line, '') LIKE ? OR COALESCE(c.oracle_text, '') LIKE ?)",
    );
    params.push(term, term, term);
  }
  if (f.colors.length) {
    const mode = f.colorMode ?? "any";
    const wubrgSel = f.colors.filter((c): c is string => WUBRG.has(c));
    const wantColorless = f.colors.includes("C");
    if (mode === "exact") {
      if (wubrgSel.length === 0 && wantColorless) {
        parts.push(
          "(c.color_identity IS NULL OR c.color_identity = '[]' OR TRIM(c.color_identity) = '')",
        );
      } else if (wubrgSel.length) {
        const sorted = [...new Set(wubrgSel)].sort().join(",");
        parts.push(
          "(SELECT GROUP_CONCAT(v, ',') FROM (SELECT j.value AS v FROM json_each(COALESCE(c.color_identity, '[]')) AS j WHERE j.value IN ('W','U','B','R','G') ORDER BY j.value)) = ?",
        );
        params.push(sorted);
      }
    } else {
      const ors: string[] = [];
      for (const col of wubrgSel) {
        ors.push(`instr(COALESCE(c.color_identity, c.colors, ''), ?) > 0`);
        params.push(`"${col}"`);
      }
      if (wantColorless) {
        ors.push(`(c.color_identity IS NULL OR c.color_identity = '[]' OR TRIM(c.color_identity) = '')`);
      }
      if (ors.length === 1) {
        parts.push(ors[0]!);
      } else if (ors.length > 1) {
        parts.push(`(${ors.join(" OR ")})`);
      }
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
  if (f.cmcMin != null) {
    parts.push(`COALESCE(c.cmc, 0) >= ?`);
    params.push(f.cmcMin);
  }
  if (f.cmcMax != null) {
    parts.push(`COALESCE(c.cmc, 0) <= ?`);
    params.push(f.cmcMax);
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
  if (f.owned === false) {
    parts.push(`NOT EXISTS (
      SELECT 1 FROM owned_cards o
      WHERE o.user_id = ? AND o.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
    )`);
    params.push(userId);
  }
  if (f.watchlist === false) {
    parts.push(`NOT EXISTS (
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
  if (f.advancedFilters) {
    const adv = compileAdvancedFiltersToSql(f.advancedFilters, {
      userId,
      priceSetCodes: priceSets,
      allowVisiblePrice: !skipPrice,
    });
    if (adv.sql.trim()) {
      parts.push(adv.sql);
      params.push(...adv.params);
    }
  }
  const sql = parts.length ? `AND (${parts.join(" AND ")})` : "";
  return { sql, params };
}

