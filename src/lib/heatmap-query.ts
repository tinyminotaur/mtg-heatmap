import type Database from "better-sqlite3";
import { LOCAL_USER_ID, POC_RELEASE_CUTOFF } from "@/lib/constants";

export type HeatmapFilters = {
  rarity: string[];
  sets: string[];
  yearMin: number | null;
  yearMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  colors: string[];
  formats: string[];
  types: string[];
  owned: boolean | null;
  watchlist: boolean | null;
  pinned: boolean | null;
  reservedOnly: boolean | null;
  includeDigital: boolean;
  specialGroup: string | null;
  search: string;
  sort: string;
  page: number;
  pageSize: number;
  showPinned: boolean;
};

export type ColumnMeta = {
  code: string;
  name: string;
  release_date: string | null;
  set_type: string | null;
  icon_svg_path: string | null;
  year: number | null;
};

export type CellDTO = {
  scryfall_id: string;
  usd: number | null;
  usd_foil: number | null;
  eur: number | null;
  tix: number | null;
  rarity: string | null;
  image_small: string | null;
  scryfall_uri: string | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
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
  best_deal_col: number | null;
};

const defaultFilters: HeatmapFilters = {
  rarity: [],
  sets: [],
  yearMin: null,
  yearMax: null,
  priceMin: null,
  priceMax: null,
  colors: [],
  formats: [],
  types: [],
  owned: null,
  watchlist: null,
  pinned: null,
  reservedOnly: null,
  includeDigital: false,
  specialGroup: null,
  search: "",
  sort: "name",
  page: 0,
  pageSize: 1000,
  showPinned: true,
};

export function parseFilters(sp: URLSearchParams): HeatmapFilters {
  const rarity = sp.get("rarity")?.split(",").filter(Boolean) ?? [];
  const sets = sp.get("sets")?.split(",").filter(Boolean) ?? [];
  const colors = sp.get("colors")?.split(",").filter(Boolean) ?? [];
  const formats = sp.get("formats")?.split(",").filter(Boolean) ?? [];
  const types = sp.get("types")?.split(",").filter(Boolean) ?? [];
  const yearMin = sp.get("yearMin") ? Number(sp.get("yearMin")) : null;
  const yearMax = sp.get("yearMax") ? Number(sp.get("yearMax")) : null;
  const priceMin = sp.get("priceMin") ? Number(sp.get("priceMin")) : null;
  const priceMax = sp.get("priceMax") ? Number(sp.get("priceMax")) : null;
  const parseBool = (k: string): boolean | null => {
    const v = sp.get(k);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return null;
  };
  return {
    ...defaultFilters,
    rarity,
    sets,
    colors,
    formats,
    types,
    yearMin: Number.isFinite(yearMin as number) ? yearMin : null,
    yearMax: Number.isFinite(yearMax as number) ? yearMax : null,
    priceMin: Number.isFinite(priceMin as number) ? priceMin : null,
    priceMax: Number.isFinite(priceMax as number) ? priceMax : null,
    owned: parseBool("owned"),
    watchlist: parseBool("watchlist"),
    pinned: parseBool("pinned"),
    reservedOnly: parseBool("reserved"),
    includeDigital: sp.get("digital") === "1",
    specialGroup: sp.get("group") || null,
    search: sp.get("q") ?? "",
    sort: sp.get("sort") ?? "name",
    page: Math.max(0, Number(sp.get("page") ?? 0) || 0),
    pageSize: Math.min(1500, Math.max(1, Number(sp.get("pageSize") ?? 1000) || 1000)),
    showPinned: sp.get("hidePinned") !== "1",
  };
}

function yearFromDate(d: string | null): number | null {
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
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

function buildHaving(f: HeatmapFilters, userId: string): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.rarity.length) {
    parts.push(
      `EXISTS (SELECT 1 FROM printings p2 WHERE p2.oracle_id = c.oracle_id AND p2.rarity IN (${f.rarity.map(() => "?").join(",")}))`,
    );
    params.push(...f.rarity);
  }
  if (f.priceMin != null) {
    parts.push(`EXISTS (
      SELECT 1 FROM printings p3 JOIN prices_current pc3 ON pc3.scryfall_id = p3.scryfall_id
      WHERE p3.oracle_id = c.oracle_id AND COALESCE(pc3.usd, pc3.usd_foil) IS NOT NULL
      AND COALESCE(pc3.usd, pc3.usd_foil) >= ?
    )`);
    params.push(f.priceMin);
  }
  if (f.priceMax != null) {
    parts.push(`EXISTS (
      SELECT 1 FROM printings p4 JOIN prices_current pc4 ON pc4.scryfall_id = p4.scryfall_id
      WHERE p4.oracle_id = c.oracle_id AND COALESCE(pc4.usd, pc4.usd_foil) IS NOT NULL
      AND COALESCE(pc4.usd, pc4.usd_foil) <= ?
    )`);
    params.push(f.priceMax);
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

export function getHeatmapData(
  db: Database.Database,
  f: HeatmapFilters,
): { columns: ColumnMeta[]; rows: RowDTO[]; total: number } {
  const userId = LOCAL_USER_ID;

  const { sql: cardPred, params: cardParams } = cardWhereClause(f);
  const { sql: havingSql, params: havingParams } = buildHaving(f, userId);

  const countSql = `SELECT COUNT(*) AS n FROM cards c WHERE ${cardPred} ${havingSql}`;
  const total = (db.prepare(countSql).get(...cardParams, ...havingParams) as { n: number }).n;

  let orderBy = "c.name COLLATE NOCASE ASC";
  if (f.sort === "reserved") orderBy = "c.is_reserved DESC, c.name COLLATE NOCASE ASC";
  if (f.sort === "printings") {
    orderBy =
      "(SELECT COUNT(*) FROM printings p0 WHERE p0.oracle_id = c.oracle_id) DESC, c.name COLLATE NOCASE ASC";
  }

  const pinnedRows: Record<string, unknown>[] = f.showPinned
    ? (db
        .prepare(
          `SELECT c.* FROM cards c
       JOIN pinned pin ON pin.oracle_id = c.oracle_id AND pin.user_id = ?
       WHERE ${cardPred} ${havingSql}
       ORDER BY ${orderBy}`,
        )
        .all(userId, ...cardParams, ...havingParams) as Record<string, unknown>[])
    : [];

  const offset = f.page * f.pageSize;
  const pageRows = db
    .prepare(
      `SELECT c.* FROM cards c
     WHERE ${cardPred} ${havingSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    )
    .all(...cardParams, ...havingParams, f.pageSize, offset) as Record<string, unknown>[];

  const pinnedIds = new Set(pinnedRows.map((r) => r.oracle_id as string));
  const merged: Record<string, unknown>[] = [];
  if (f.showPinned) {
    for (const r of pinnedRows) {
      if (!merged.find((m) => m.oracle_id === r.oracle_id)) merged.push(r);
    }
  }
  for (const r of pageRows) {
    if (f.showPinned && pinnedIds.has(r.oracle_id as string)) continue;
    merged.push(r);
  }

  const oracleIds = merged.map((r) => r.oracle_id as string);
  if (!oracleIds.length) {
    return { columns: [], rows: [], total };
  }

  const inList = oracleIds.map(() => "?").join(",");

  let colSql = `
    SELECT DISTINCT s.code, s.name, s.release_date, s.set_type, s.icon_svg_path
    FROM sets s
    INNER JOIN printings p ON p.set_code = s.code
    WHERE p.oracle_id IN (${inList})
    AND (s.release_date IS NULL OR s.release_date <= ?)
  `;
  const colParams: unknown[] = [...oracleIds, POC_RELEASE_CUTOFF];
  if (!f.includeDigital) colSql += ` AND s.is_digital = 0`;
  if (f.sets.length) {
    colSql += ` AND s.code IN (${f.sets.map(() => "?").join(",")})`;
    colParams.push(...f.sets);
  }
  if (f.yearMin != null) {
    colSql += ` AND CAST(strftime('%Y', s.release_date) AS INTEGER) >= ?`;
    colParams.push(f.yearMin);
  }
  if (f.yearMax != null) {
    colSql += ` AND CAST(strftime('%Y', s.release_date) AS INTEGER) <= ?`;
    colParams.push(f.yearMax);
  }
  colSql += ` ORDER BY s.release_date ASC, s.code ASC`;

  const colRows = db.prepare(colSql).all(...colParams) as Omit<ColumnMeta, "year">[];
  const columns: ColumnMeta[] = colRows.map((r) => ({
    ...r,
    year: yearFromDate(r.release_date),
  }));
  const setOrder = columns.map((c) => c.code);

  const printStmt = db.prepare(`
    SELECT p.*, pc.usd, pc.usd_foil, pc.eur, pc.tix
    FROM printings p
    LEFT JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
    WHERE p.oracle_id IN (${inList})
  `);
  const printingRows = printStmt.all(...oracleIds) as {
    oracle_id: string;
    set_code: string;
    scryfall_id: string;
    usd: number | null;
    usd_foil: number | null;
    eur: number | null;
    tix: number | null;
    rarity: string | null;
    image_uri_small: string | null;
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

  const rows: RowDTO[] = merged.map((card) => {
    const oid = card.oracle_id as string;
    const pmap = byOracle.get(oid) ?? new Map();
    const cells: (CellDTO | null)[] = setOrder.map((code) => {
      const p = pmap.get(code);
      if (!p) return null;
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
      };
    });

    let bestIdx: number | null = null;
    let bestP: number | null = null;
    cells.forEach((cell, idx) => {
      if (!cell) return;
      const v = cell.usd ?? cell.usd_foil;
      if (v == null || v <= 0) return;
      if (bestP === null || v < bestP) {
        bestP = v;
        bestIdx = idx;
      }
    });

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
      best_deal_col: bestIdx,
    };
  });

  return { columns, rows, total };
}
