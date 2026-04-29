/**
 * Heatmap SQL pipeline (Track A — §11.2 stages):
 * 1) Card predicates (`cardWhereClause` + optional group collapse)
 * 2) Printing / collection predicates (`buildHaving`, rarity / price-in-visible-sets / owned / …)
 * 3) Column resolution (`resolveHeatmapColumns`) — global set list before pagination
 * 4) Price filter applied with visible column codes
 * 5) Row selection + `ORDER BY` (global `setOrder` for value aggregates — see AGENTS.md); rows must
 *    have a printing in at least one visible column set so single-edition views do not list all-empty rows
 * 6) Per-cell `printing_matches` for strict vs context display (§11.2.6)
 */

import type Database from "better-sqlite3";
import type { HeatmapFilters } from "@/lib/filter-state";
import { getPinnedOracleIds, listOwnedScryfallIds, listWatchlistScryfallIds, userDbEnabled } from "@/lib/userdb";
import { resolveHeatmapColumns } from "./heatmap-column-resolve";
import { parseHeatmapUrlSearchParams, type CellPriceField } from "@/lib/heatmap-url-params";
import type { ColumnMeta } from "@/lib/heatmap-types";
import type { CellDTO, RowDTO } from "@/lib/heatmap/dto";
import { normalizeFilters, safeJsonArray, safeJsonRecord } from "@/lib/heatmap/filters";
import {
  buildHaving,
  cardWhereClause,
  groupCollapsedClause,
  groupKeyExpr,
  requirePrintingInHeatmapColumnsSql,
} from "@/lib/heatmap/sql";
import {
  buildValueLayoutCells,
  printingMatchesForDisplay,
} from "@/lib/heatmap/value-layout";

export type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
export type { ColumnMeta } from "@/lib/heatmap-types";
export type { CellDTO, RowDTO } from "@/lib/heatmap/dto";

export function parseFilters(sp: URLSearchParams): HeatmapFilters {
  return parseHeatmapUrlSearchParams(sp);
}

function aggSetInSql(f: HeatmapFilters, setOrder: string[]): { inner: string; params: unknown[] } {
  if (f.valueAggScope === "all" || !setOrder.length) return { inner: "", params: [] };
  const ph = setOrder.map(() => "?").join(",");
  return { inner: ` AND p.set_code IN (${ph}) `, params: [...setOrder] };
}

/** SQL value + filter aligned with `cellPriceForMode` (no `display_price`). */
function cellPriceAggregationSql(field: CellPriceField): { vExpr: string } {
  switch (field) {
    case "usd_foil":
      return {
        vExpr: `CASE WHEN pc.usd_foil IS NOT NULL AND pc.usd_foil > 0 THEN pc.usd_foil
             WHEN pc.usd IS NOT NULL AND pc.usd > 0 THEN pc.usd
             ELSE NULL END`,
      };
    case "eur":
      return { vExpr: `pc.eur` };
    case "tix":
      return { vExpr: `pc.tix` };
    default:
      return { vExpr: `pc.usd` };
  }
}

/** Match `printing_matches` rarity gate on per-printing aggregates (sort vs value cells). */
function rarityFilterForAggSql(f: HeatmapFilters): { sql: string; params: unknown[] } {
  if (!f.rarity.length) return { sql: "", params: [] };
  const ph = f.rarity.map(() => "?").join(",");
  return { sql: ` AND p.rarity IN (${ph}) `, params: [...f.rarity] };
}

function priceValueSubquery(
  kind: "min" | "max" | "median",
  f: HeatmapFilters,
  setOrder: string[],
): { expr: string; params: unknown[] } {
  const { inner, params: setParams } = aggSetInSql(f, setOrder);
  const { sql: raritySql, params: rarityParams } = rarityFilterForAggSql(f);
  const { vExpr } = cellPriceAggregationSql(f.cellPriceField ?? "usd");
  const baseWhere = `p.oracle_id = c.oracle_id ${inner}${raritySql}
      AND (${vExpr}) IS NOT NULL AND (${vExpr}) > 0`;
  const inParams = [...setParams, ...rarityParams];
  if (kind === "min") {
    return {
      expr: `(SELECT MIN(${vExpr}) FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id WHERE ${baseWhere})`,
      params: inParams,
    };
  }
  if (kind === "max") {
    return {
      expr: `(SELECT MAX(${vExpr}) FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id WHERE ${baseWhere})`,
      params: inParams,
    };
  }
  return {
    expr: `(SELECT AVG(t.v) FROM (
      SELECT ${vExpr} AS v,
        ROW_NUMBER() OVER (ORDER BY ${vExpr} ASC, p.set_code COLLATE NOCASE ASC) AS rn,
        COUNT(*) OVER () AS cnt
      FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
      WHERE ${baseWhere}
    ) AS t WHERE t.cnt > 0 AND t.rn IN ((t.cnt + 1) / 2, (t.cnt + 2) / 2))`,
    params: inParams,
  };
}

const ORDER_TIEBREAKER = "c.name COLLATE NOCASE ASC, c.oracle_id";

type RowOrdering = { select: string; orderBy: string; params: unknown[] };

function buildRowOrdering(
  f: HeatmapFilters,
  setOrder: string[],
  groupExpr: string | null,
): RowOrdering {
  const fx = normalizeFilters(f);
  const selectParts: string[] = [];
  const orderParts: string[] = [];
  const params: unknown[] = [];

  if (fx.headerSortSetCode && setOrder.includes(fx.headerSortSetCode)) {
    const { vExpr } = cellPriceAggregationSql(fx.cellPriceField ?? "usd");
    const { sql: raritySql, params: rarityParams } = rarityFilterForAggSql(fx);
    const headerCol = `(SELECT ${vExpr} FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
        WHERE p.oracle_id = c.oracle_id AND p.set_code = ?${raritySql} AND (${vExpr}) IS NOT NULL AND (${vExpr}) > 0)`;
    selectParts.push(`${headerCol} AS _hdr_price`);
    params.push(fx.headerSortSetCode, ...rarityParams);
    // Portable nulls-last (SQLite <3.30 has no NULLS LAST in ORDER BY).
    const headerDir = fx.headerSortDir === "asc" ? "ASC" : "DESC";
    orderParts.push(`(CASE WHEN _hdr_price IS NULL THEN 1 ELSE 0 END), _hdr_price ${headerDir}`);
  }

  if (groupExpr && fx.groupBy !== "none") {
    orderParts.push(fx.groupBy === "reserved" ? `${groupExpr} DESC` : `${groupExpr} ASC`);
  }

  const slots = fx.sortSlots.length ? fx.sortSlots : [{ key: "name" as const, dir: null }];
  for (const [i, slot] of slots.slice(0, 3).entries()) {
    if (slot.key === "name") {
      orderParts.push(`c.name COLLATE NOCASE ASC`);
      continue;
    }
    if (slot.key === "reserved") {
      orderParts.push(`c.is_reserved DESC`);
      continue;
    }
    if (slot.key === "printings") {
      orderParts.push(`(SELECT COUNT(*) FROM printings p0 WHERE p0.oracle_id = c.oracle_id) DESC`);
      continue;
    }
    if (slot.key === "cmc") {
      const cdir = slot.dir === "desc" ? "DESC" : "ASC";
      orderParts.push(
        `(CASE WHEN c.cmc IS NULL THEN 1 ELSE 0 END), COALESCE(c.cmc, 0) ${cdir}`,
      );
      continue;
    }
    if (!setOrder.length) continue;
    const dir = slot.dir ?? (slot.key === "price_min" ? "asc" : "desc");
    const kind = slot.key === "price_min" ? "min" : slot.key === "price_median" ? "median" : "max";
    const { expr, params: exprParams } = priceValueSubquery(kind, fx, setOrder);
    const alias = `_s${i}`;
    selectParts.push(`${expr} AS ${alias}`);
    params.push(...exprParams);
    orderParts.push(`(CASE WHEN ${alias} IS NULL THEN 1 ELSE 0 END), ${alias} ${dir.toUpperCase()}`);
  }

  orderParts.push(ORDER_TIEBREAKER);
  return {
    select: selectParts.length ? `, ${selectParts.join(", ")}` : "",
    orderBy: orderParts.join(", "),
    params,
  };
}

type PrintingRow = {
  oracle_id: string;
  set_code: string;
  scryfall_id: string;
  collector_number?: string | null;
  released_at?: string | null;
  usd: number | null;
  usd_foil: number | null;
  eur: number | null;
  tix: number | null;
  rarity: string | null;
  image_uri_small: string | null;
  image_uri_normal: string | null;
  image_uri_large: string | null;
  scryfall_uri: string | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
  is_promo?: number | null;
  is_foil_only?: number | null;
  is_nonfoil_only?: number | null;
};

function valueLayoutColumnMetas(): ColumnMeta[] {
  return [
    {
      code: "__min__",
      name: "Min",
      release_date: null,
      set_type: "aggregate",
      icon_svg_path: null,
      year: null,
      parent_set_code: null,
    },
    {
      code: "__med__",
      name: "Median",
      release_date: null,
      set_type: "aggregate",
      icon_svg_path: null,
      year: null,
      parent_set_code: null,
    },
    {
      code: "__max__",
      name: "Max",
      release_date: null,
      set_type: "aggregate",
      icon_svg_path: null,
      year: null,
      parent_set_code: null,
    },
  ];
}

export async function getHeatmapData(
  db: Database.Database,
  f: HeatmapFilters,
  userId: string,
): Promise<{ columns: ColumnMeta[]; rows: RowDTO[]; total: number }> {
  const fx = normalizeFilters(f);

  // Pull user-specific sets from Postgres.
  const [pinnedOracleIds, ownedSids, watchSids] = userDbEnabled()
    ? await Promise.all([
        getPinnedOracleIds(userId),
        listOwnedScryfallIds(userId),
        listWatchlistScryfallIds(userId),
      ])
    : ([
        (db.prepare(`SELECT oracle_id FROM pinned WHERE user_id = ?`).all(userId) as { oracle_id: string }[]).map(
          (r) => r.oracle_id,
        ),
        (db.prepare(`SELECT scryfall_id FROM owned_cards WHERE user_id = ?`).all(userId) as { scryfall_id: string }[]).map(
          (r) => r.scryfall_id,
        ),
        (db.prepare(`SELECT scryfall_id FROM watchlist WHERE user_id = ?`).all(userId) as { scryfall_id: string }[]).map(
          (r) => r.scryfall_id,
        ),
      ] as const);
  const pinnedOracleSet = new Set(pinnedOracleIds);
  const ownedSidSet = new Set(ownedSids);
  const watchSidSet = new Set(watchSids);

  const ownedOracleIds =
    ownedSids.length > 0
      ? (db
          .prepare(
            `SELECT DISTINCT oracle_id FROM printings WHERE scryfall_id IN (${ownedSids.map(() => "?").join(",")})`,
          )
          .all(...ownedSids) as { oracle_id: string }[]).map((r) => r.oracle_id)
      : [];
  const watchOracleIds =
    watchSids.length > 0
      ? (db
          .prepare(
            `SELECT DISTINCT oracle_id FROM printings WHERE scryfall_id IN (${watchSids.map(() => "?").join(",")})`,
          )
          .all(...watchSids) as { oracle_id: string }[]).map((r) => r.oracle_id)
      : [];
  const ownedOracleSet = new Set(ownedOracleIds);
  const watchOracleSet = new Set(watchOracleIds);

  // Owned/watchlist/pinned are handled via Postgres-backed sets below, not via SQLite tables.
  const fxUserless = { ...fx, owned: null, watchlist: null, pinned: null };

  const { sql: cardPred, params: cardParams } = cardWhereClause(fxUserless);
  const havingNoPrice = buildHaving(fxUserless, userId, { skipPrice: true });
  const gexpr = groupKeyExpr(fx);
  const gc = groupCollapsedClause(fx, gexpr);

  const physicalColumns = resolveHeatmapColumns(
    db,
    fx,
    cardPred,
    cardParams,
    havingNoPrice.sql,
    havingNoPrice.params,
    userId,
    pinnedOracleIds,
  );
  const physicalSetCodes = physicalColumns.map((c) => c.code);
  const valueLayout = fx.heatmapColumnLayout === "value" && physicalSetCodes.length > 0;
  const pinRowSet = new Set(fx.quickPinRows);
  const pinColSet = new Set(fx.quickPinCols.map((c) => c.toLowerCase()));
  const heatmapColumns = valueLayout
    ? valueLayoutColumnMetas()
    : physicalColumns.map((c) => ({
        ...c,
        quick_pin_column: pinColSet.has(c.code.toLowerCase()),
      }));

  const { sql: havingSql, params: havingParams } = buildHaving(fxUserless, userId, {
    priceSetCodes: physicalSetCodes,
  });

  const visPrint = requirePrintingInHeatmapColumnsSql(physicalSetCodes);
  const whereTail = `${havingSql} ${gc.sql}${visPrint.sql}`;
  const whereParams = [...havingParams, ...gc.params, ...visPrint.params];

  const userClauseParts: string[] = [];
  const userClauseParams: unknown[] = [];
  const addOracleIn = (ids: string[], negate: boolean) => {
    if (!ids.length) {
      if (!negate) userClauseParts.push("0=1");
      return;
    }
    const ph = ids.map(() => "?").join(",");
    userClauseParts.push(`c.oracle_id ${negate ? "NOT " : ""}IN (${ph})`);
    userClauseParams.push(...ids);
  };
  if (fx.owned === true) addOracleIn(ownedOracleIds, false);
  else if (fx.owned === false) addOracleIn(ownedOracleIds, true);
  if (fx.watchlist === true) addOracleIn(watchOracleIds, false);
  else if (fx.watchlist === false) addOracleIn(watchOracleIds, true);
  if (fx.pinned === true) addOracleIn(pinnedOracleIds, false);
  else if (fx.pinned === false) addOracleIn(pinnedOracleIds, true);
  const userWhereSql = userClauseParts.length ? ` AND (${userClauseParts.join(" AND ")})` : "";

  const countSql =
    fx.quickPinRows.length > 0
      ? `SELECT COUNT(*) AS n FROM cards c WHERE (${cardPred} ${whereTail}${userWhereSql}) OR (c.oracle_id IN (${fx.quickPinRows.map(() => "?").join(",")}) ${whereTail}${userWhereSql})`
      : `SELECT COUNT(*) AS n FROM cards c WHERE ${cardPred} ${whereTail}${userWhereSql}`;
  const countParams =
    fx.quickPinRows.length > 0
      ? [...cardParams, ...whereParams, ...userClauseParams, ...fx.quickPinRows, ...whereParams, ...userClauseParams]
      : [...cardParams, ...whereParams, ...userClauseParams];
  const total = (db.prepare(countSql).get(...countParams) as { n: number }).n;

  const gSelect = gexpr ? `, (${gexpr}) AS _gk` : ", NULL AS _gk";
  const ordering = buildRowOrdering(fx, physicalSetCodes, gexpr);

  const qpPh = fx.quickPinRows.map(() => "?").join(",");
  const quickPinRowsData =
    fx.quickPinRows.length > 0
      ? (db
          .prepare(
            `SELECT c.* ${gSelect}${ordering.select} FROM cards c
             WHERE c.oracle_id IN (${qpPh}) ${whereTail}${userWhereSql}`,
          )
          .all(...ordering.params, ...fx.quickPinRows, ...whereParams, ...userClauseParams) as Record<string, unknown>[])
      : [];
  const qOrder = new Map(fx.quickPinRows.map((id, i) => [id, i]));
  quickPinRowsData.sort(
    (a, b) =>
      (qOrder.get(a.oracle_id as string) ?? 999) - (qOrder.get(b.oracle_id as string) ?? 999),
  );

  const pinnedRows: Record<string, unknown>[] =
    fx.showPinned && pinnedOracleIds.length > 0
      ? (db
          .prepare(
            `SELECT c.* ${gSelect}${ordering.select} FROM cards c
             WHERE c.oracle_id IN (${pinnedOracleIds.map(() => "?").join(",")})
               AND ${cardPred} ${whereTail}${userWhereSql}
             ORDER BY ${ordering.orderBy}`,
          )
          .all(
            ...ordering.params,
            ...pinnedOracleIds,
            ...cardParams,
            ...whereParams,
            ...userClauseParams,
          ) as Record<string, unknown>[])
      : [];

  const offset = fx.page * fx.pageSize;
  const quickPageEx =
    fx.quickPinRows.length > 0
      ? ` AND c.oracle_id NOT IN (${fx.quickPinRows.map(() => "?").join(",")}) `
      : "";
  const pageRows = db
    .prepare(
      `SELECT c.* ${gSelect}${ordering.select} FROM cards c
     WHERE ${cardPred} ${whereTail}${userWhereSql}${quickPageEx}
     ORDER BY ${ordering.orderBy}
     LIMIT ? OFFSET ?`,
    )
    .all(
      ...ordering.params,
      ...cardParams,
      ...whereParams,
      ...userClauseParams,
      ...(fx.quickPinRows.length ? fx.quickPinRows : []),
      fx.pageSize,
      offset,
    ) as Record<string, unknown>[];

  const merged: Record<string, unknown>[] = [];
  const seenOracle = new Set<string>();
  if (fx.showPinned) {
    for (const r of pinnedRows) {
      const id = r.oracle_id as string;
      if (!seenOracle.has(id)) {
        merged.push(r);
        seenOracle.add(id);
      }
    }
  }
  for (const r of quickPinRowsData) {
    const id = r.oracle_id as string;
    if (!seenOracle.has(id)) {
      merged.push(r);
      seenOracle.add(id);
    }
  }
  for (const r of pageRows) {
    const id = r.oracle_id as string;
    if (seenOracle.has(id)) continue;
    merged.push(r);
    seenOracle.add(id);
  }

  const oracleIds = merged.map((r) => r.oracle_id as string);
  if (!oracleIds.length) {
    return { columns: heatmapColumns, rows: [], total };
  }

  const inList = oracleIds.map(() => "?").join(",");

  const restrictPrintingsToVisibleSets =
    physicalSetCodes.length > 0 && !(valueLayout && fx.valueAggScope === "all");
  const printSql = restrictPrintingsToVisibleSets
    ? `
    SELECT p.*, pc.usd, pc.usd_foil, pc.eur, pc.tix
    FROM printings p
    LEFT JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
    WHERE p.oracle_id IN (${inList})
      AND p.set_code IN (${physicalSetCodes.map(() => "?").join(",")})
    ORDER BY p.oracle_id, p.set_code COLLATE NOCASE,
      COALESCE(p.is_promo, 0) ASC,
      COALESCE(p.is_foil_only, 0) ASC,
      COALESCE(p.is_nonfoil_only, 0) ASC,
      (CASE WHEN p.released_at IS NULL OR p.released_at = '' THEN 1 ELSE 0 END) ASC,
      p.released_at ASC,
      (CASE WHEN p.collector_number IS NULL OR p.collector_number = '' THEN 1 ELSE 0 END) ASC,
      LENGTH(p.collector_number) ASC,
      p.collector_number COLLATE NOCASE ASC
  `
    : `
    SELECT p.*, pc.usd, pc.usd_foil, pc.eur, pc.tix
    FROM printings p
    LEFT JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
    WHERE p.oracle_id IN (${inList})
    ORDER BY p.oracle_id, p.set_code COLLATE NOCASE,
      COALESCE(p.is_promo, 0) ASC,
      COALESCE(p.is_foil_only, 0) ASC,
      COALESCE(p.is_nonfoil_only, 0) ASC,
      (CASE WHEN p.released_at IS NULL OR p.released_at = '' THEN 1 ELSE 0 END) ASC,
      p.released_at ASC,
      (CASE WHEN p.collector_number IS NULL OR p.collector_number = '' THEN 1 ELSE 0 END) ASC,
      LENGTH(p.collector_number) ASC,
      p.collector_number COLLATE NOCASE ASC
  `;
  const printingRows = db
    .prepare(printSql)
    .all(...oracleIds, ...(restrictPrintingsToVisibleSets ? physicalSetCodes : [])) as PrintingRow[];

  const byOracle = new Map<string, Map<string, PrintingRow>>();
  for (const pr of printingRows) {
    if (!byOracle.has(pr.oracle_id)) byOracle.set(pr.oracle_id, new Map());
    // Some sets have multiple printings (promos/variants). Pick a stable "best" printing per set_code
    // so cell metadata (image/links/prices) doesn't randomly flip depending on query order.
    const pmap = byOracle.get(pr.oracle_id)!;
    if (!pmap.has(pr.set_code)) {
      pmap.set(pr.set_code, pr);
      continue;
    }
    const cur = pmap.get(pr.set_code)!;
    const curPromo = Number(cur.is_promo ?? 0);
    const nextPromo = Number(pr.is_promo ?? 0);
    if (curPromo !== nextPromo && nextPromo < curPromo) {
      pmap.set(pr.set_code, pr);
      continue;
    }
    const curFoilOnly = Number(cur.is_foil_only ?? 0);
    const nextFoilOnly = Number(pr.is_foil_only ?? 0);
    if (curFoilOnly !== nextFoilOnly && nextFoilOnly < curFoilOnly) {
      pmap.set(pr.set_code, pr);
      continue;
    }
    const curNonfoilOnly = Number(cur.is_nonfoil_only ?? 0);
    const nextNonfoilOnly = Number(pr.is_nonfoil_only ?? 0);
    if (curNonfoilOnly !== nextNonfoilOnly && nextNonfoilOnly < curNonfoilOnly) {
      pmap.set(pr.set_code, pr);
      continue;
    }
  }

  // Owned / watchlist / pinned are stored in Postgres; derive per-printing and per-oracle state here.
  const ownedMap = new Map<string, number>();
  for (const sid of ownedSids) {
    ownedMap.set(sid, (ownedMap.get(sid) ?? 0) + 1);
  }

  const wl = new Set<string>(watchSids);
  const watchlistedOracles = new Set<string>(watchOracleIds);
  const pin = new Set<string>(pinnedOracleIds.filter((oid) => oracleIds.includes(oid)));

  // Total owned copies per oracle (any printing), for row chrome — not limited to visible set columns.
  const ownedQtyByOracle = new Map<string, number>();
  const uniqOwnedSids = [...new Set(ownedSids)];
  const sidToOracle =
    uniqOwnedSids.length > 0
      ? new Map(
          (db
            .prepare(
              `SELECT scryfall_id, oracle_id FROM printings WHERE scryfall_id IN (${uniqOwnedSids.map(() => "?").join(",")})`,
            )
            .all(...uniqOwnedSids) as { scryfall_id: string; oracle_id: string }[]).map((r) => [
            r.scryfall_id,
            r.oracle_id,
          ]),
        )
      : new Map<string, string>();
  for (const sid of ownedSids) {
    const oid = sidToOracle.get(sid);
    if (!oid) continue;
    ownedQtyByOracle.set(oid, (ownedQtyByOracle.get(oid) ?? 0) + 1);
  }

  const countAllPrintings = fx.valueAggScope === "all" || physicalSetCodes.length === 0;
  const printingsCountSql = countAllPrintings
    ? `SELECT oracle_id, COUNT(*) AS n FROM printings WHERE oracle_id IN (${inList}) GROUP BY oracle_id`
    : `SELECT oracle_id, COUNT(*) AS n FROM printings WHERE oracle_id IN (${inList}) AND set_code IN (${physicalSetCodes.map(() => "?").join(",")}) GROUP BY oracle_id`;
  const countRows = db
    .prepare(printingsCountSql)
    .all(...oracleIds, ...(countAllPrintings ? [] : physicalSetCodes)) as { oracle_id: string; n: number }[];
  const printingsCountByOracle = new Map(countRows.map((r) => [r.oracle_id, r.n]));

  const priceSetsForCells = physicalSetCodes;
  const metaBySet = new Map(physicalColumns.map((c) => [c.code, c]));
  const setDisplayName = (code: string) => metaBySet.get(code)?.name ?? code.toUpperCase();

  const rows: RowDTO[] = merged.map((card) => {
    const oid = card.oracle_id as string;
    const pmap = byOracle.get(oid) ?? new Map();
    const cells: (CellDTO | null)[] = valueLayout
      ? buildValueLayoutCells(
          pmap,
          physicalSetCodes,
          setDisplayName,
          fx,
          fx.cellPriceField ?? "usd",
          ownedMap,
          wl,
          oid,
          pinRowSet,
          pinColSet,
        )
      : physicalSetCodes.map((code) => {
          const p = pmap.get(code);
          if (!p) return null;
          const oq = ownedMap.get(p.scryfall_id) ?? 0;
          const wlisted = wl.has(p.scryfall_id);
          const pm = printingMatchesForDisplay(
            fx,
            oid,
            code,
            p,
            priceSetsForCells,
            oq,
            wlisted,
            pinRowSet,
            pinColSet,
          );
          return {
            scryfall_id: p.scryfall_id,
            usd: p.usd,
            usd_foil: p.usd_foil,
            eur: p.eur,
            tix: p.tix,
            rarity: p.rarity,
            image_small: p.image_uri_small,
            image_normal: p.image_uri_normal,
            image_large: p.image_uri_large,
            scryfall_uri: p.scryfall_uri,
            tcgplayer_url: p.tcgplayer_url,
            cardmarket_url: p.cardmarket_url,
            owned_qty: oq,
            watchlisted: wlisted,
            printing_matches: pm,
          };
        });

    const priced: { idx: number; v: number }[] = [];
    if (!valueLayout) {
      cells.forEach((cell, idx) => {
        if (!cell) return;
        const v = cell.usd ?? cell.usd_foil;
        if (v == null || !(v > 0)) return;
        priced.push({ idx, v });
      });
    }
    const price_low_cols: number[] = [];
    const price_high_cols: number[] = [];
    if (!valueLayout && priced.length >= 2) {
      const minV = Math.min(...priced.map((p) => p.v));
      const maxV = Math.max(...priced.map((p) => p.v));
      if (minV < maxV) {
        for (const p of priced) {
          if (p.v === minV) price_low_cols.push(p.idx);
        }
        for (const p of priced) {
          if (p.v === maxV) price_high_cols.push(p.idx);
        }
      }
    }

    const owned_qty = ownedQtyByOracle.get(oid) ?? 0;

    const watchlisted = watchlistedOracles.has(oid);

    const gkRaw = card._gk;
    const group_key =
      typeof gkRaw === "string" || typeof gkRaw === "number" ? String(gkRaw) : fx.groupBy === "none" ? null : null;

    const rawCmc = card.cmc;
    const cmc =
      typeof rawCmc === "number"
        ? rawCmc
        : rawCmc != null && String(rawCmc).trim() !== ""
          ? Number(rawCmc)
          : null;

    return {
      oracle_id: oid,
      name: card.name as string,
      cmc: Number.isFinite(cmc as number) ? (cmc as number) : null,
      mana_cost: (card.mana_cost as string) ?? null,
      colors: safeJsonArray(card.colors),
      color_identity: safeJsonArray(card.color_identity),
      is_reserved: Boolean(card.is_reserved),
      type_line: (card.type_line as string) ?? null,
      legalities: safeJsonRecord(card.legalities),
      cells,
      printings_count: printingsCountByOracle.get(oid) ?? 0,
      owned_qty,
      watchlisted,
      pinned: pin.has(oid),
      quick_pin_row: pinRowSet.has(oid),
      price_low_cols,
      price_high_cols,
      group_key: fx.groupBy === "none" ? null : group_key,
    };
  });

  return { columns: heatmapColumns, rows, total };
}
