/**
 * Heatmap SQL pipeline (Track A — §11.2 stages):
 * 1) Card predicates (`cardWhereClause` + optional group collapse)
 * 2) Printing / collection predicates (`buildHaving`, rarity / price-in-visible-sets / owned / …)
 * 3) Column resolution (`resolveHeatmapColumns`) — global set list before pagination
 * 4) Price filter applied with visible column codes
 * 5) Row selection + `ORDER BY` (global `setOrder` for value aggregates — see AGENTS.md)
 * 6) Per-cell `printing_matches` for strict vs context display (§11.2.6)
 */

import type Database from "better-sqlite3";
import { LOCAL_USER_ID } from "@/lib/constants";
import type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
import { defaultHeatmapFilters } from "@/lib/filter-state";
import { resolveHeatmapColumns } from "./heatmap-column-resolve";
import { parseHeatmapUrlSearchParams } from "@/lib/heatmap-url-params";
import type { ColumnMeta } from "@/lib/heatmap-types";

export type { HeatmapFilters, SortSlot } from "@/lib/filter-state";
export { defaultHeatmapFilters } from "@/lib/filter-state";
export type { ColumnMeta } from "@/lib/heatmap-types";

export type CellDTO = {
  scryfall_id: string;
  usd: number | null;
  usd_foil: number | null;
  eur: number | null;
  tix: number | null;
  rarity: string | null;
  image_small: string | null;
  image_normal: string | null;
  image_large: string | null;
  scryfall_uri: string | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
  owned_qty: number;
  watchlisted: boolean;
  /** Printing-level predicates (rarity / visible-set price / per-printing owned & watchlist). */
  printing_matches: boolean;
};

export type RowDTO = {
  oracle_id: string;
  name: string;
  mana_cost: string | null;
  colors: string[];
  color_identity: string[];
  is_reserved: boolean;
  type_line: string | null;
  legalities: Record<string, string>;
  cells: (CellDTO | null)[];
  owned_qty: number;
  watchlisted: boolean;
  pinned: boolean;
  price_low_cols: number[];
  price_high_cols: number[];
  /** Single-level group key for §11.6 UI (null when not grouping). */
  group_key: string | null;
};

export function parseFilters(sp: URLSearchParams): HeatmapFilters {
  return parseHeatmapUrlSearchParams(sp);
}

/** Normalize older saved state missing new fields. */
function normalizeFilters(f: HeatmapFilters): HeatmapFilters {
  return {
    ...defaultHeatmapFilters,
    ...f,
    sortSlots:
      f.sortSlots?.length && f.sortSlots.length > 0
        ? f.sortSlots
        : [{ key: "name", dir: null }],
  };
}

function groupKeyExpr(f: HeatmapFilters): string | null {
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

function groupCollapsedClause(f: HeatmapFilters, gexpr: string | null): { sql: string; params: unknown[] } {
  if (!gexpr || !f.groupCollapsedKeys.length) return { sql: "", params: [] };
  const ph = f.groupCollapsedKeys.map(() => "?").join(",");
  return { sql: ` AND (${gexpr}) NOT IN (${ph}) `, params: [...f.groupCollapsedKeys] };
}

function aggSetInSql(f: HeatmapFilters, setOrder: string[]): { inner: string; params: unknown[] } {
  if (f.valueAggScope === "all" || !setOrder.length) return { inner: "", params: [] };
  const ph = setOrder.map(() => "?").join(",");
  return { inner: ` AND p.set_code IN (${ph}) `, params: [...setOrder] };
}

function priceValueSubquery(
  kind: "min" | "max" | "median",
  f: HeatmapFilters,
  setOrder: string[],
): { expr: string; params: unknown[] } {
  const { inner, params: inParams } = aggSetInSql(f, setOrder);
  const baseWhere = `p.oracle_id = c.oracle_id ${inner}
      AND COALESCE(pc.usd, pc.usd_foil) IS NOT NULL AND COALESCE(pc.usd, pc.usd_foil) > 0`;
  if (kind === "min") {
    return {
      expr: `(SELECT MIN(COALESCE(pc.usd, pc.usd_foil)) FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id WHERE ${baseWhere})`,
      params: inParams,
    };
  }
  if (kind === "max") {
    return {
      expr: `(SELECT MAX(COALESCE(pc.usd, pc.usd_foil)) FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id WHERE ${baseWhere})`,
      params: inParams,
    };
  }
  return {
    expr: `(SELECT AVG(t.v) FROM (
      SELECT COALESCE(pc.usd, pc.usd_foil) AS v,
        ROW_NUMBER() OVER (ORDER BY COALESCE(pc.usd, pc.usd_foil)) AS rn,
        COUNT(*) OVER () AS cnt
      FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
      WHERE ${baseWhere}
    ) AS t WHERE t.cnt > 0 AND t.rn IN ((t.cnt + 1) / 2, (t.cnt + 2) / 2))`,
    params: inParams,
  };
}

const ORDER_TIEBREAKER = "c.name COLLATE NOCASE ASC, c.oracle_id";

/** One ORDER BY column expression (tiebreaker appended once after all slots). */
function slotMetric(slot: SortSlot, f: HeatmapFilters, setOrder: string[]): { sql: string; orderParams: unknown[] } {
  if (slot.key === "name") return { sql: `c.name COLLATE NOCASE ASC`, orderParams: [] };
  if (slot.key === "reserved") return { sql: `c.is_reserved DESC`, orderParams: [] };
  if (slot.key === "printings") {
    return {
      sql: `(SELECT COUNT(*) FROM printings p0 WHERE p0.oracle_id = c.oracle_id) DESC`,
      orderParams: [],
    };
  }
  if (!setOrder.length) return { sql: ORDER_TIEBREAKER, orderParams: [] };
  const dir = slot.dir ?? (slot.key === "price_min" ? "asc" : "desc");
  const nullPlacement = "NULLS LAST";
  const kind = slot.key === "price_min" ? "min" : slot.key === "price_median" ? "median" : "max";
  const { expr, params } = priceValueSubquery(kind, f, setOrder);
  return {
    sql: `${expr} ${dir.toUpperCase()} ${nullPlacement}`,
    orderParams: params,
  };
}

function buildRowOrderClause(
  f: HeatmapFilters,
  setOrder: string[],
  groupExpr: string | null,
): { clause: string; orderParams: unknown[] } {
  const fx = normalizeFilters(f);
  const parts: string[] = [];
  const orderParams: unknown[] = [];

  if (fx.headerSortSetCode && setOrder.includes(fx.headerSortSetCode)) {
    parts.push(
      `(SELECT COALESCE(pc.usd, pc.usd_foil) FROM printings p INNER JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
        WHERE p.oracle_id = c.oracle_id AND p.set_code = ? AND COALESCE(pc.usd, pc.usd_foil) IS NOT NULL AND COALESCE(pc.usd, pc.usd_foil) > 0) DESC NULLS LAST`,
    );
    orderParams.push(fx.headerSortSetCode);
  }

  if (groupExpr && fx.groupBy !== "none") {
    parts.push(fx.groupBy === "reserved" ? `${groupExpr} DESC` : `${groupExpr} ASC`);
  }

  const slots = fx.sortSlots.length ? fx.sortSlots : [{ key: "name" as const, dir: null }];
  for (const slot of slots.slice(0, 3)) {
    const { sql, orderParams: op } = slotMetric(slot, fx, setOrder);
    parts.push(sql);
    orderParams.push(...op);
  }

  parts.push(ORDER_TIEBREAKER);
  return { clause: parts.join(", "), orderParams };
}

function cardWhereClause(f: HeatmapFilters): {
  sql: string;
  params: unknown[];
} {
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

type BuildHavingOpts = {
  skipPrice?: boolean;
  priceSetCodes?: string[];
};

function buildHaving(
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
      `EXISTS (SELECT 1 FROM printings p2 WHERE p2.oracle_id = c.oracle_id AND p2.rarity IN (${f.rarity.map(() => "?").join(",")}))`,
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

function printingMatchesCell(
  f: HeatmapFilters,
  setCode: string,
  p: {
    rarity: string | null;
    usd: number | null;
    usd_foil: number | null;
    scryfall_id: string;
  },
  priceSets: string[],
  ownedQty: number,
  watchlisted: boolean,
): boolean {
  if (f.rarity.length) {
    if (!p.rarity || !f.rarity.includes(p.rarity)) return false;
  }
  const wantsPrice = f.priceMin != null || f.priceMax != null;
  if (wantsPrice && priceSets.includes(setCode)) {
    const v = p.usd ?? p.usd_foil;
    if (v == null || !(v > 0)) return false;
    if (f.priceMin != null && v < f.priceMin) return false;
    if (f.priceMax != null && v > f.priceMax) return false;
  }
  if (f.owned === true && ownedQty <= 0) return false;
  if (f.watchlist === true && !watchlisted) return false;
  return true;
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

  const heatmapColumns = resolveHeatmapColumns(
    db,
    fx,
    cardPred,
    cardParams,
    havingNoPrice.sql,
    havingNoPrice.params,
    userId,
  );
  const setOrder = heatmapColumns.map((c) => c.code);

  const { sql: havingSql, params: havingParams } = buildHaving(fx, userId, {
    priceSetCodes: setOrder,
  });

  const whereTail = `${havingSql} ${gc.sql}`;
  const whereParams = [...havingParams, ...gc.params];

  const countSql = `SELECT COUNT(*) AS n FROM cards c WHERE ${cardPred} ${whereTail}`;
  const total = (db.prepare(countSql).get(...cardParams, ...whereParams) as { n: number }).n;

  const gSelect = gexpr ? `, (${gexpr}) AS _gk` : ", NULL AS _gk";
  const { clause: orderClause, orderParams } = buildRowOrderClause(fx, setOrder, gexpr);

  const pinnedRows: Record<string, unknown>[] = fx.showPinned
    ? (db
        .prepare(
          `SELECT c.* ${gSelect} FROM cards c
       JOIN pinned pin ON pin.oracle_id = c.oracle_id AND pin.user_id = ?
       WHERE ${cardPred} ${whereTail}
       ORDER BY ${orderClause}`,
        )
        .all(userId, ...cardParams, ...whereParams, ...orderParams) as Record<string, unknown>[])
    : [];

  const offset = fx.page * fx.pageSize;
  const pageRows = db
    .prepare(
      `SELECT c.* ${gSelect} FROM cards c
     WHERE ${cardPred} ${whereTail}
     ORDER BY ${orderClause}
     LIMIT ? OFFSET ?`,
    )
    .all(...cardParams, ...whereParams, ...orderParams, fx.pageSize, offset) as Record<string, unknown>[];

  const pinnedIds = new Set(pinnedRows.map((r) => r.oracle_id as string));
  const merged: Record<string, unknown>[] = [];
  if (fx.showPinned) {
    for (const r of pinnedRows) {
      if (!merged.find((m) => m.oracle_id === r.oracle_id)) merged.push(r);
    }
  }
  for (const r of pageRows) {
    if (fx.showPinned && pinnedIds.has(r.oracle_id as string)) continue;
    merged.push(r);
  }

  const oracleIds = merged.map((r) => r.oracle_id as string);
  if (!oracleIds.length) {
    return { columns: heatmapColumns, rows: [], total };
  }

  const inList = oracleIds.map(() => "?").join(",");

  const printSql =
    setOrder.length > 0
      ? `
    SELECT p.*, pc.usd, pc.usd_foil, pc.eur, pc.tix
    FROM printings p
    LEFT JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
    WHERE p.oracle_id IN (${inList})
      AND p.set_code IN (${setOrder.map(() => "?").join(",")})
  `
      : `
    SELECT p.*, pc.usd, pc.usd_foil, pc.eur, pc.tix
    FROM printings p
    LEFT JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
    WHERE p.oracle_id IN (${inList})
  `;
  const printingRows = db
    .prepare(printSql)
    .all(...oracleIds, ...(setOrder.length ? setOrder : [])) as {
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
  }[];

  const byOracle = new Map<string, Map<string, (typeof printingRows)[0]>>();
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

  const priceSetsForCells = setOrder;

  const rows: RowDTO[] = merged.map((card) => {
    const oid = card.oracle_id as string;
    const pmap = byOracle.get(oid) ?? new Map();
    const cells: (CellDTO | null)[] = setOrder.map((code) => {
      const p = pmap.get(code);
      if (!p) return null;
      const oq = ownedMap.get(p.scryfall_id) ?? 0;
      const wlisted = wl.has(p.scryfall_id);
      const pm = printingMatchesCell(fx, code, p, priceSetsForCells, oq, wlisted);
      return {
        scryfall_id: p.scryfall_id,
        usd: p.usd,
        usd_foil: p.usd_foil,
        eur: p.eur,
        tix: p.tix,
        rarity: p.rarity,
        image_small: p.image_uri_small,
        image_normal: p.image_uri_normal ?? null,
        image_large: p.image_uri_large ?? null,
        scryfall_uri: p.scryfall_uri,
        tcgplayer_url: p.tcgplayer_url,
        cardmarket_url: p.cardmarket_url,
        owned_qty: oq,
        watchlisted: wlisted,
        printing_matches: pm,
      };
    });

    const priced: { idx: number; v: number }[] = [];
    cells.forEach((cell, idx) => {
      if (!cell) return;
      const v = cell.usd ?? cell.usd_foil;
      if (v == null || !(v > 0)) return;
      priced.push({ idx, v });
    });
    const price_low_cols: number[] = [];
    const price_high_cols: number[] = [];
    if (priced.length >= 2) {
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

    return {
      oracle_id: oid,
      name: card.name as string,
      mana_cost: (card.mana_cost as string) ?? null,
      colors: JSON.parse((card.colors as string) || "[]") as string[],
      color_identity: JSON.parse((card.color_identity as string) || "[]") as string[],
      is_reserved: Boolean(card.is_reserved),
      type_line: (card.type_line as string) ?? null,
      legalities: JSON.parse((card.legalities as string) || "{}") as Record<string, string>,
      cells,
      owned_qty,
      watchlisted,
      pinned: pin.has(oid),
      price_low_cols,
      price_high_cols,
      group_key: fx.groupBy === "none" ? null : group_key,
    };
  });

  return { columns: heatmapColumns, rows, total };
}
