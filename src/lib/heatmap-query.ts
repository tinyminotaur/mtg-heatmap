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
import { LOCAL_USER_ID } from "@/lib/constants";
import type { HeatmapFilters } from "@/lib/filter-state";
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
    orderParts.push(`(CASE WHEN _hdr_price IS NULL THEN 1 ELSE 0 END), _hdr_price DESC`);
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

export function getHeatmapData(
  db: Database.Database,
  f: HeatmapFilters,
): { columns: ColumnMeta[]; rows: RowDTO[]; total: number } {
  const userId = LOCAL_USER_ID;
  const fx = normalizeFilters(f);

  const { sql: cardPred, params: cardParams } = cardWhereClause(fx);
  const havingNoPrice = buildHaving(fx, userId, { skipPrice: true });
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

  const { sql: havingSql, params: havingParams } = buildHaving(fx, userId, {
    priceSetCodes: physicalSetCodes,
  });

  const visPrint = requirePrintingInHeatmapColumnsSql(physicalSetCodes);
  const whereTail = `${havingSql} ${gc.sql}${visPrint.sql}`;
  const whereParams = [...havingParams, ...gc.params, ...visPrint.params];

  const countSql =
    fx.quickPinRows.length > 0
      ? `SELECT COUNT(*) AS n FROM cards c WHERE (${cardPred} ${whereTail}) OR (c.oracle_id IN (${fx.quickPinRows.map(() => "?").join(",")}) ${whereTail})`
      : `SELECT COUNT(*) AS n FROM cards c WHERE ${cardPred} ${whereTail}`;
  const countParams =
    fx.quickPinRows.length > 0
      ? [...cardParams, ...whereParams, ...fx.quickPinRows, ...whereParams]
      : [...cardParams, ...whereParams];
  const total = (db.prepare(countSql).get(...countParams) as { n: number }).n;

  const gSelect = gexpr ? `, (${gexpr}) AS _gk` : ", NULL AS _gk";
  const ordering = buildRowOrdering(fx, physicalSetCodes, gexpr);

  const qpPh = fx.quickPinRows.map(() => "?").join(",");
  const quickPinRowsData =
    fx.quickPinRows.length > 0
      ? (db
          .prepare(
            `SELECT c.* ${gSelect}${ordering.select} FROM cards c
             WHERE c.oracle_id IN (${qpPh}) ${whereTail}`,
          )
          .all(...ordering.params, ...fx.quickPinRows, ...whereParams) as Record<string, unknown>[])
      : [];
  const qOrder = new Map(fx.quickPinRows.map((id, i) => [id, i]));
  quickPinRowsData.sort(
    (a, b) =>
      (qOrder.get(a.oracle_id as string) ?? 999) - (qOrder.get(b.oracle_id as string) ?? 999),
  );

  const pinnedRows: Record<string, unknown>[] = fx.showPinned
    ? (db
        .prepare(
          `SELECT c.* ${gSelect}${ordering.select} FROM cards c
       JOIN pinned pin ON pin.oracle_id = c.oracle_id AND pin.user_id = ?
       WHERE ${cardPred} ${whereTail}
       ORDER BY ${ordering.orderBy}`,
        )
        .all(...ordering.params, userId, ...cardParams, ...whereParams) as Record<string, unknown>[])
    : [];

  const offset = fx.page * fx.pageSize;
  const quickPageEx =
    fx.quickPinRows.length > 0
      ? ` AND c.oracle_id NOT IN (${fx.quickPinRows.map(() => "?").join(",")}) `
      : "";
  const pageRows = db
    .prepare(
      `SELECT c.* ${gSelect}${ordering.select} FROM cards c
     WHERE ${cardPred} ${whereTail}${quickPageEx}
     ORDER BY ${ordering.orderBy}
     LIMIT ? OFFSET ?`,
    )
    .all(
      ...ordering.params,
      ...cardParams,
      ...whereParams,
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
  `
    : `
    SELECT p.*, pc.usd, pc.usd_foil, pc.eur, pc.tix
    FROM printings p
    LEFT JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
    WHERE p.oracle_id IN (${inList})
  `;
  const printingRows = db
    .prepare(printSql)
    .all(...oracleIds, ...(restrictPrintingsToVisibleSets ? physicalSetCodes : [])) as PrintingRow[];

  const byOracle = new Map<string, Map<string, PrintingRow>>();
  for (const pr of printingRows) {
    if (!byOracle.has(pr.oracle_id)) byOracle.set(pr.oracle_id, new Map());
    byOracle.get(pr.oracle_id)!.set(pr.set_code, pr);
  }

  const ownedStmt = db.prepare(`
    SELECT scryfall_id, COUNT(*) AS n FROM owned_cards WHERE user_id = ? AND scryfall_id IN (
      SELECT scryfall_id FROM printings WHERE oracle_id IN (${inList})
    ) GROUP BY scryfall_id
  `);
  const ownedMap = new Map(
    (ownedStmt.all(userId, ...oracleIds) as { scryfall_id: string; n: number }[]).map((o) => [
      o.scryfall_id,
      o.n,
    ]),
  );

  const wl = new Set(
    (
      db
        .prepare(
          `SELECT scryfall_id FROM watchlist WHERE user_id = ? AND scryfall_id IN (SELECT scryfall_id FROM printings WHERE oracle_id IN (${inList}))`,
        )
        .all(userId, ...oracleIds) as { scryfall_id: string }[]
    ).map((x) => x.scryfall_id),
  );

  const pin = new Set(
    (
      db
        .prepare(`SELECT oracle_id FROM pinned WHERE user_id = ? AND oracle_id IN (${inList})`)
        .all(userId, ...oracleIds) as { oracle_id: string }[]
    ).map((x) => x.oracle_id),
  );

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

    let owned_qty = 0;
    for (const c of cells) {
      if (!c) continue;
      owned_qty += ownedMap.get(c.scryfall_id) ?? 0;
    }

    let watchlisted = false;
    for (const c of cells) {
      if (c && wl.has(c.scryfall_id)) {
        watchlisted = true;
        break;
      }
    }

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
