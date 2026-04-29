import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";
import type { HeatmapFilters } from "@/lib/filter-state";
import { buildHaving, cardWhereClause, groupCollapsedClause, groupKeyExpr, requirePrintingInHeatmapColumnsSql } from "@/lib/heatmap/sql";
import { resolveHeatmapColumns } from "@/lib/heatmap-column-resolve";
import { normalizeFilters } from "@/lib/heatmap/filters";
import { parseFilters } from "@/lib/heatmap-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function withFacetCleared(
  f: HeatmapFilters,
  facet:
    | "rarity"
    | "colors"
    | "formats"
    | "types"
    | "rowScope",
): HeatmapFilters {
  switch (facet) {
    case "rarity":
      return { ...f, rarity: [] };
    case "colors":
      return { ...f, colors: [] };
    case "formats":
      return { ...f, formats: [] };
    case "types":
      return { ...f, types: [] };
    case "rowScope":
      return { ...f, owned: null, watchlist: null, pinned: null, reservedOnly: null };
    default:
      return f;
  }
}

type FacetsResponse = {
  total: number;
  /** Row-scope-independent counts for status tabs (same base as `rowScope` facet clears). */
  status: { all: number; owned: number; wishlist: number; none: number };
  rarity: { key: string; n: number }[];
  colorIdentity: { key: string; n: number }[];
  rowScope: { owned: number; watchlist: number; pinned: number; reserved: number };
  formats: { key: string; n: number }[];
  types: { key: string; n: number }[];
  topSets: { code: string; name: string; n: number }[];
  cmc: { min: number | null; max: number | null };
  priceUsdLike: { min: number | null; max: number | null };
  year: { min: number | null; max: number | null };
};

function baseCardWhere(
  f: HeatmapFilters,
  physicalSetCodes: string[],
): { sql: string; params: unknown[] } {
  const userId = LOCAL_USER_ID;
  const fx = normalizeFilters(f);
  const { sql: cardPred, params: cardParams } = cardWhereClause(fx);

  // Column resolution intentionally happens before pagination in the main endpoint.
  // For facets, we still want to respect the same “must have printing in visible columns” constraint.
  const { sql: havingSql, params: havingParams } = buildHaving(fx, userId, {
    priceSetCodes: physicalSetCodes,
  });
  const gexpr = groupKeyExpr(fx);
  const gc = groupCollapsedClause(fx, gexpr);
  const visPrint = requirePrintingInHeatmapColumnsSql(physicalSetCodes);

  const sql = `${cardPred} ${havingSql} ${gc.sql}${visPrint.sql}`;
  const params = [...cardParams, ...havingParams, ...gc.params, ...visPrint.params];
  return { sql, params };
}

function yearFromDate(d: string | null): number | null {
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const f = parseFilters(req.nextUrl.searchParams);
    const fx = normalizeFilters(f);
    const userId = LOCAL_USER_ID;

    // Resolve physical set columns so price facets match “visible columns” logic.
    const { sql: cardPred, params: cardParams } = cardWhereClause(fx);
    const havingNoPrice = buildHaving(fx, userId, { skipPrice: true });
    const physicalColumns = resolveHeatmapColumns(
      db,
      fx,
      cardPred,
      cardParams,
      havingNoPrice.sql,
      havingNoPrice.params,
      userId,
    );
    const physicalSetCodes = physicalColumns.map((c) => c.code);

    const base = baseCardWhere(fx, physicalSetCodes);
    const baseForRarity = baseCardWhere(withFacetCleared(fx, "rarity"), physicalSetCodes);
    const baseForColors = baseCardWhere(withFacetCleared(fx, "colors"), physicalSetCodes);
    const baseForFormats = baseCardWhere(withFacetCleared(fx, "formats"), physicalSetCodes);
    const baseForTypes = baseCardWhere(withFacetCleared(fx, "types"), physicalSetCodes);
    const baseForRowScope = baseCardWhere(withFacetCleared(fx, "rowScope"), physicalSetCodes);

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS n FROM cards c WHERE ${base.sql}`)
      .get(...base.params) as { n: number };

    const rarityRows = db
      .prepare(
        `
        SELECT COALESCE(p.rarity, '(unknown)') AS k, COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        INNER JOIN printings p ON p.oracle_id = c.oracle_id
        WHERE ${baseForRarity.sql}
        GROUP BY k
        ORDER BY n DESC, k ASC
      `,
      )
      .all(...baseForRarity.params) as { k: string; n: number }[];

    const colorRows = db
      .prepare(
        `
        SELECT
          COALESCE(NULLIF(TRIM(j.value), ''), '(none)') AS k,
          COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        LEFT JOIN json_each(COALESCE(c.color_identity, '[]')) AS j ON 1=1
        WHERE ${baseForColors.sql}
        GROUP BY k
        ORDER BY n DESC, k ASC
      `,
      )
      .all(...baseForColors.params) as { k: string; n: number }[];

    const cmcRow = db
      .prepare(
        `
        SELECT
          MIN(COALESCE(c.cmc, 0)) AS min,
          MAX(COALESCE(c.cmc, 0)) AS max
        FROM cards c
        WHERE ${base.sql}
      `,
      )
      .get(...base.params) as { min: number | null; max: number | null };

    const ownedRow = db
      .prepare(
        `
        SELECT COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        WHERE ${baseForRowScope.sql}
          AND EXISTS (
            SELECT 1 FROM owned_cards o
            WHERE o.user_id = ? AND o.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
          )
      `,
      )
      .get(...baseForRowScope.params, userId) as { n: number };

    const watchRow = db
      .prepare(
        `
        SELECT COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        WHERE ${baseForRowScope.sql}
          AND EXISTS (
            SELECT 1 FROM watchlist w
            WHERE w.user_id = ? AND w.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
          )
      `,
      )
      .get(...baseForRowScope.params, userId) as { n: number };

    const allStatusRow = db
      .prepare(`SELECT COUNT(*) AS n FROM cards c WHERE ${baseForRowScope.sql}`)
      .get(...baseForRowScope.params) as { n: number };

    const noneStatusRow = db
      .prepare(
        `
        SELECT COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        WHERE ${baseForRowScope.sql}
          AND NOT EXISTS (
            SELECT 1 FROM owned_cards o
            WHERE o.user_id = ? AND o.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM watchlist w
            WHERE w.user_id = ? AND w.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
          )
      `,
      )
      .get(...baseForRowScope.params, userId, userId) as { n: number };

    const pinnedRow = db
      .prepare(
        `
        SELECT COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        WHERE ${baseForRowScope.sql}
          AND EXISTS (SELECT 1 FROM pinned pin WHERE pin.user_id = ? AND pin.oracle_id = c.oracle_id)
      `,
      )
      .get(...baseForRowScope.params, userId) as { n: number };

    const reservedRow = db
      .prepare(`SELECT COUNT(DISTINCT c.oracle_id) AS n FROM cards c WHERE ${baseForRowScope.sql} AND c.is_reserved = 1`)
      .get(...baseForRowScope.params) as { n: number };

    const formatsRows = db
      .prepare(
        `
        SELECT LOWER(j.key) AS k, COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        JOIN json_each(COALESCE(c.legalities, '{}')) AS j
        WHERE ${baseForFormats.sql} AND j.value = 'legal'
        GROUP BY k
        ORDER BY n DESC, k ASC
      `,
      )
      .all(...baseForFormats.params) as { k: string; n: number }[];

    const typesRows = db
      .prepare(
        `
        SELECT
          LOWER(COALESCE(NULLIF(TRIM(SUBSTR(COALESCE(c.type_line, ''), 1, 16)), ''), '(none)')) AS k,
          COUNT(DISTINCT c.oracle_id) AS n
        FROM cards c
        WHERE ${baseForTypes.sql}
        GROUP BY k
        ORDER BY n DESC, k ASC
        LIMIT 24
      `,
      )
      .all(...baseForTypes.params) as { k: string; n: number }[];

    const topSetsRows =
      physicalSetCodes.length > 0
        ? (db
            .prepare(
              `
              SELECT s.code AS code, s.name AS name, COUNT(DISTINCT c.oracle_id) AS n
              FROM cards c
              INNER JOIN printings p ON p.oracle_id = c.oracle_id
              INNER JOIN sets s ON s.code = p.set_code
              WHERE ${base.sql}
                AND p.set_code IN (${physicalSetCodes.map(() => "?").join(",")})
              GROUP BY s.code, s.name
              ORDER BY n DESC, s.release_date ASC, s.code ASC
              LIMIT 20
            `,
            )
            .all(...base.params, ...physicalSetCodes) as { code: string; name: string; n: number }[])
        : [];

    // “USD-like” price (matches existing price filters that use COALESCE(usd, usd_foil)).
    // Note: this facet is for UI guidance; actual sort/value layout uses `pm=` in SQL elsewhere.
    let priceMin: number | null = null;
    let priceMax: number | null = null;
    if (physicalSetCodes.length > 0) {
      const ph = physicalSetCodes.map(() => "?").join(",");
      const priceRow = db
        .prepare(
          `
          SELECT
            MIN(COALESCE(pc.usd, pc.usd_foil)) AS min,
            MAX(COALESCE(pc.usd, pc.usd_foil)) AS max
          FROM cards c
          INNER JOIN printings p ON p.oracle_id = c.oracle_id
          INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
          WHERE ${base.sql}
            AND p.set_code IN (${ph})
            AND COALESCE(pc.usd, pc.usd_foil) IS NOT NULL
            AND COALESCE(pc.usd, pc.usd_foil) > 0
        `,
        )
        .get(...base.params, ...physicalSetCodes) as { min: number | null; max: number | null };
      priceMin = priceRow.min;
      priceMax = priceRow.max;
    }

    // Year facet is based on current column scope (not row predicates), matching set filtering behavior.
    const years = physicalColumns.map((c) => yearFromDate(c.release_date)).filter((y): y is number => y != null);
    const year = years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null };

    const out: FacetsResponse = {
      total: totalRow.n ?? 0,
      status: {
        all: allStatusRow.n ?? 0,
        owned: ownedRow.n ?? 0,
        wishlist: watchRow.n ?? 0,
        none: noneStatusRow.n ?? 0,
      },
      rarity: rarityRows.map((r) => ({ key: r.k, n: r.n })),
      colorIdentity: colorRows.map((r) => ({ key: r.k, n: r.n })),
      rowScope: {
        owned: ownedRow.n ?? 0,
        watchlist: watchRow.n ?? 0,
        pinned: pinnedRow.n ?? 0,
        reserved: reservedRow.n ?? 0,
      },
      formats: formatsRows.map((r) => ({ key: r.k, n: r.n })),
      types: typesRows.map((r) => ({ key: r.k, n: r.n })),
      topSets: topSetsRows.map((r) => ({ code: r.code, name: r.name, n: r.n })),
      cmc: { min: cmcRow.min ?? null, max: cmcRow.max ?? null },
      priceUsdLike: { min: priceMin, max: priceMax },
      year,
    };

    return NextResponse.json(out);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "facets_failed", message }, { status: 500 });
  }
}

