export type FilterGroup = {
  op: "and" | "or";
  rules: Array<FilterGroup | FilterRule>;
};

export type PriceCurrency = "usd" | "usd_like" | "usd_foil" | "eur" | "tix";
export type PriceScope = "any" | "visible";
export type PriceOp = "gt" | "gte" | "lt" | "lte" | "between";

export type FilterRule =
  | { field: "name"; op: "contains"; value: string }
  | { field: "name"; op: "not_contains"; value: string }
  | { field: "oracle_text"; op: "contains"; value: string }
  | { field: "oracle_text"; op: "not_contains"; value: string }
  | { field: "type_line"; op: "contains"; value: string }
  | { field: "type_line"; op: "not_contains"; value: string }
  | { field: "reserved"; op: "is"; value: boolean }
  | { field: "cmc"; op: "between"; value: [number, number] }
  | { field: "cmc"; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { field: "color_identity"; op: "in"; value: string[] } // W/U/B/R/G/C
  | { field: "color_identity"; op: "not_in"; value: string[] }
  | { field: "format"; op: "in"; value: string[] } // standard, modern, ...
  | { field: "format"; op: "not_in"; value: string[] }
  | { field: "rarity"; op: "in"; value: string[] } // common, uncommon, ...
  | { field: "rarity"; op: "not_in"; value: string[] }
  | { field: "set_code"; op: "in"; value: string[] }
  | { field: "set_code"; op: "not_in"; value: string[] }
  | { field: "set_type"; op: "in"; value: string[] }
  | { field: "set_type"; op: "not_in"; value: string[] }
  | { field: "release_year"; op: "between"; value: [number, number] }
  // Back-compat: older price rules.
  | { field: "price_usd_like"; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { field: "price_usd_like"; op: "between"; value: [number, number] }
  | { field: "price_visible_usd_like"; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { field: "price_visible_usd_like"; op: "between"; value: [number, number] }
  // New generalized price rule.
  | {
      field: "price";
      op: PriceOp;
      value: number | [number, number];
      currency: PriceCurrency;
      scope: PriceScope;
    }
  // Printing-level fields.
  | { field: "finish"; op: "in" | "not_in"; value: string[] } // foil|nonfoil|etched...
  | { field: "frame_effect"; op: "in" | "not_in"; value: string[] }
  | { field: "collector_number"; op: "eq" | "contains" | "prefix"; value: string }
  | { field: "promo"; op: "is"; value: boolean }
  | { field: "foil_only"; op: "is"; value: boolean }
  | { field: "nonfoil_only"; op: "is"; value: boolean }
  | { field: "digital_set"; op: "is"; value: boolean }
  | { field: "owned"; op: "is"; value: boolean }
  | { field: "watchlist"; op: "is"; value: boolean }
  | { field: "pinned"; op: "is"; value: boolean };

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isNumberTuple2(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    Number.isFinite(v[0]) &&
    typeof v[1] === "number" &&
    Number.isFinite(v[1])
  );
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPriceCurrency(v: unknown): v is PriceCurrency {
  return v === "usd" || v === "usd_like" || v === "usd_foil" || v === "eur" || v === "tix";
}

function isPriceScope(v: unknown): v is PriceScope {
  return v === "any" || v === "visible";
}

function isPriceOp(v: unknown): v is PriceOp {
  return v === "gt" || v === "gte" || v === "lt" || v === "lte" || v === "between";
}

export function parseAdvancedFiltersFromJson(v: unknown): FilterGroup | null {
  if (!isObject(v)) return null;
  const op = v.op;
  const rules = v.rules;
  if ((op !== "and" && op !== "or") || !Array.isArray(rules)) return null;
  const parsed: Array<FilterGroup | FilterRule> = [];
  for (const r of rules) {
    const g = parseAdvancedFiltersFromJson(r);
    if (g) {
      parsed.push(g);
      continue;
    }
    if (!isObject(r)) continue;
    const field = r.field;
    const rop = r.op;
    const value = r.value;
    if (field === "name" && rop === "contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "name" && rop === "not_contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "oracle_text" && rop === "contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "oracle_text" && rop === "not_contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "type_line" && rop === "contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "type_line" && rop === "not_contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "reserved" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "cmc" && rop === "between" && isNumberTuple2(value)) parsed.push({ field, op: rop, value });
    else if (field === "cmc" && (rop === "gt" || rop === "gte" || rop === "lt" || rop === "lte") && typeof value === "number" && Number.isFinite(value))
      parsed.push({ field, op: rop, value });
    else if (field === "color_identity" && rop === "in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "color_identity" && rop === "not_in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "format" && rop === "in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "format" && rop === "not_in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "rarity" && rop === "in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "rarity" && rop === "not_in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "set_code" && (rop === "in" || rop === "not_in") && isStringArray(value))
      parsed.push({ field, op: rop, value });
    else if (field === "set_type" && (rop === "in" || rop === "not_in") && isStringArray(value))
      parsed.push({ field, op: rop, value });
    else if (field === "release_year" && rop === "between" && isNumberTuple2(value)) parsed.push({ field, op: rop, value });
    else if (field === "price_usd_like" && (rop === "gt" || rop === "gte" || rop === "lt" || rop === "lte") && typeof value === "number" && Number.isFinite(value))
      parsed.push({ field, op: rop, value });
    else if (field === "price_usd_like" && rop === "between" && isNumberTuple2(value)) parsed.push({ field, op: rop, value });
    else if (field === "price_visible_usd_like" && (rop === "gt" || rop === "gte" || rop === "lt" || rop === "lte") && typeof value === "number" && Number.isFinite(value))
      parsed.push({ field, op: rop, value });
    else if (field === "price_visible_usd_like" && rop === "between" && isNumberTuple2(value)) parsed.push({ field, op: rop, value });
    else if (field === "price" && isPriceOp(rop) && (isFiniteNumber(value) || isNumberTuple2(value))) {
      const currency = (r as Record<string, unknown>).currency;
      const scope = (r as Record<string, unknown>).scope;
      if (isPriceCurrency(currency) && isPriceScope(scope)) {
        parsed.push({
          field: "price",
          op: rop,
          value: value as number | [number, number],
          currency,
          scope,
        });
      }
    }
    else if (field === "finish" && (rop === "in" || rop === "not_in") && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "frame_effect" && (rop === "in" || rop === "not_in") && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "collector_number" && (rop === "eq" || rop === "contains" || rop === "prefix") && isString(value))
      parsed.push({ field, op: rop, value });
    else if (field === "promo" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "foil_only" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "nonfoil_only" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "digital_set" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "owned" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "watchlist" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "pinned" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
  }
  return { op, rules: parsed };
}

export function decodeAdvancedFiltersParam(raw: string): FilterGroup | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(t, "base64url").toString("utf8")
        : (() => {
            const b64 = t.replace(/-/g, "+").replace(/_/g, "/");
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder().decode(bytes);
          })();
    return parseAdvancedFiltersFromJson(JSON.parse(json));
  } catch {
    return null;
  }
}

export function encodeAdvancedFiltersParam(g: FilterGroup): string {
  const json = JSON.stringify(g);
  if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64url");
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function compileAdvancedFiltersToSql(
  g: FilterGroup,
  opts: { userId: string; priceSetCodes?: string[]; allowVisiblePrice?: boolean },
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const priceExpr = (currency: PriceCurrency): string => {
    switch (currency) {
      case "usd":
        return `pc.usd`;
      case "usd_foil":
        // Prefer foil when available, fallback to non-foil.
        return `CASE WHEN pc.usd_foil IS NOT NULL AND pc.usd_foil > 0 THEN pc.usd_foil
             WHEN pc.usd IS NOT NULL AND pc.usd > 0 THEN pc.usd
             ELSE NULL END`;
      case "eur":
        return `pc.eur`;
      case "tix":
        return `pc.tix`;
      default:
        return `COALESCE(pc.usd, pc.usd_foil)`;
    }
  };

  const priceExists = (
    scope: PriceScope,
    currency: PriceCurrency,
    op: "cmp" | "between",
    cmp: { operator?: ">" | ">=" | "<" | "<="; value?: number; range?: [number, number] },
  ): string => {
    const vExpr = priceExpr(currency);
    const restrictVisible = scope === "visible";
    if (restrictVisible) {
      if (opts.allowVisiblePrice === false) return "";
      const codes = (opts.priceSetCodes ?? []).filter(Boolean);
      if (!codes.length) return "0=1";
      const ph = codes.map(() => "?").join(",");
      if (op === "cmp") {
        params.push(...codes, cmp.value);
        return `EXISTS (
          SELECT 1 FROM printings p JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
          WHERE p.oracle_id = c.oracle_id AND p.set_code IN (${ph})
            AND (${vExpr}) IS NOT NULL AND (${vExpr}) ${cmp.operator} ?
        )`;
      }
      const [a0, b0] = cmp.range!;
      const a = Math.min(a0, b0);
      const b = Math.max(a0, b0);
      params.push(...codes, a, b);
      return `EXISTS (
        SELECT 1 FROM printings p JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
        WHERE p.oracle_id = c.oracle_id AND p.set_code IN (${ph})
          AND (${vExpr}) IS NOT NULL AND (${vExpr}) BETWEEN ? AND ?
      )`;
    }

    if (op === "cmp") {
      params.push(cmp.value);
      return `EXISTS (
        SELECT 1 FROM printings p JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
        WHERE p.oracle_id = c.oracle_id
          AND (${vExpr}) IS NOT NULL AND (${vExpr}) ${cmp.operator} ?
      )`;
    }
    const [a0, b0] = cmp.range!;
    const a = Math.min(a0, b0);
    const b = Math.max(a0, b0);
    params.push(a, b);
    return `EXISTS (
      SELECT 1 FROM printings p JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
      WHERE p.oracle_id = c.oracle_id
        AND (${vExpr}) IS NOT NULL AND (${vExpr}) BETWEEN ? AND ?
    )`;
  };

  const compile = (node: FilterGroup | FilterRule): string => {
    if ((node as FilterGroup).rules) {
      const grp = node as FilterGroup;
      const chunks = grp.rules.map(compile).filter((s) => s.trim().length > 0);
      if (!chunks.length) return "";
      const joiner = grp.op === "or" ? " OR " : " AND ";
      return `(${chunks.join(joiner)})`;
    }
    const r = node as FilterRule;
    switch (r.field) {
      case "name":
        if (r.op === "not_contains") {
          params.push(`%${r.value.trim()}%`);
          return `c.name NOT LIKE ?`;
        }
        params.push(`%${r.value.trim()}%`);
        return `c.name LIKE ?`;
      case "oracle_text":
        if (r.op === "not_contains") {
          params.push(`%${r.value.trim().toLowerCase()}%`);
          return `LOWER(COALESCE(c.oracle_text, '')) NOT LIKE ?`;
        }
        params.push(`%${r.value.trim().toLowerCase()}%`);
        return `LOWER(COALESCE(c.oracle_text, '')) LIKE ?`;
      case "type_line":
        if (r.op === "not_contains") {
          params.push(`%${r.value.trim().toLowerCase()}%`);
          return `LOWER(COALESCE(c.type_line, '')) NOT LIKE ?`;
        }
        params.push(`%${r.value.trim().toLowerCase()}%`);
        return `LOWER(COALESCE(c.type_line, '')) LIKE ?`;
      case "reserved":
        return r.value ? `c.is_reserved = 1` : `c.is_reserved = 0`;
      case "cmc": {
        if (r.op !== "between") {
          const op = r.op === "gt" ? ">" : r.op === "gte" ? ">=" : r.op === "lt" ? "<" : "<=";
          params.push(r.value);
          return `COALESCE(c.cmc, 0) ${op} ?`;
        }
        const [a, b] = r.value;
        params.push(Math.min(a, b), Math.max(a, b));
        return `COALESCE(c.cmc, 0) BETWEEN ? AND ?`;
      }
      case "color_identity": {
        const cols = r.value.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
        if (!cols.length) return "";
        const parts: string[] = [];
        for (const col of cols) {
          if (col === "C") parts.push(`(c.color_identity IS NULL OR c.color_identity = '[]' OR TRIM(c.color_identity) = '')`);
          else {
            params.push(`"${col}"`);
            parts.push(`instr(COALESCE(c.color_identity, c.colors, ''), ?) > 0`);
          }
        }
        const inner = `(${parts.join(" OR ")})`;
        return r.op === "not_in" ? `(NOT ${inner})` : inner;
      }
      case "format": {
        const fmts = r.value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!fmts.length) return "";
        const parts: string[] = [];
        for (const fmt of fmts) {
          params.push(fmt);
          parts.push(`json_extract(c.legalities, '$.' || ?) = 'legal'`);
        }
        const inner = `(${parts.join(" OR ")})`;
        return r.op === "not_in" ? `(NOT ${inner})` : inner;
      }
      case "rarity": {
        const rs = r.value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!rs.length) return "";
        const ph = rs.map(() => "?").join(",");
        params.push(...rs);
        const inner = `EXISTS (SELECT 1 FROM printings p2 WHERE p2.oracle_id = c.oracle_id AND p2.rarity IN (${ph}))`;
        return r.op === "not_in" ? `(NOT ${inner})` : inner;
      }
      case "set_code": {
        const codes = r.value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!codes.length) return "";
        const ph = codes.map(() => "?").join(",");
        params.push(...codes);
        const inner = `EXISTS (SELECT 1 FROM printings psc WHERE psc.oracle_id = c.oracle_id AND LOWER(psc.set_code) IN (${ph}))`;
        return r.op === "not_in" ? `(NOT ${inner})` : inner;
      }
      case "set_type": {
        const tys = r.value.map((x) => String(x).trim()).filter(Boolean);
        if (!tys.length) return "";
        const ph = tys.map(() => "?").join(",");
        params.push(...tys);
        const inner = `EXISTS (
          SELECT 1 FROM printings pst
          INNER JOIN sets sst ON sst.code = pst.set_code
          WHERE pst.oracle_id = c.oracle_id AND COALESCE(sst.set_type, '') IN (${ph})
        )`;
        return r.op === "not_in" ? `(NOT ${inner})` : inner;
      }
      case "release_year": {
        const [a0, b0] = r.value;
        const a = Math.min(a0, b0);
        const b = Math.max(a0, b0);
        params.push(a, b);
        return `EXISTS (
          SELECT 1 FROM printings py
          INNER JOIN sets sy ON sy.code = py.set_code
          WHERE py.oracle_id = c.oracle_id
            AND sy.release_date IS NOT NULL
            AND CAST(strftime('%Y', sy.release_date) AS INTEGER) BETWEEN ? AND ?
        )`;
      }
      case "price_usd_like": {
        if (r.op === "gt" || r.op === "gte" || r.op === "lt" || r.op === "lte") {
          const op = r.op === "gt" ? ">" : r.op === "gte" ? ">=" : r.op === "lt" ? "<" : "<=";
          params.push(r.value);
          return `EXISTS (
            SELECT 1 FROM printings p3 JOIN prices_current pc3 ON pc3.scryfall_id = p3.scryfall_id
            WHERE p3.oracle_id = c.oracle_id
              AND COALESCE(pc3.usd, pc3.usd_foil) IS NOT NULL
              AND COALESCE(pc3.usd, pc3.usd_foil) ${op} ?
          )`;
        }
        const v = r.value as unknown;
        if (!Array.isArray(v) || v.length !== 2) return "";
        const [a, b] = v as [number, number];
        params.push(Math.min(a, b), Math.max(a, b));
        return `EXISTS (
          SELECT 1 FROM printings p3 JOIN prices_current pc3 ON pc3.scryfall_id = p3.scryfall_id
          WHERE p3.oracle_id = c.oracle_id
            AND COALESCE(pc3.usd, pc3.usd_foil) IS NOT NULL
            AND COALESCE(pc3.usd, pc3.usd_foil) BETWEEN ? AND ?
        )`;
      }
      case "price_visible_usd_like": {
        if (opts.allowVisiblePrice === false) return "";
        const codes = (opts.priceSetCodes ?? []).filter(Boolean);
        if (!codes.length) return "0=1";
        const ph = codes.map(() => "?").join(",");
        if (r.op === "gt" || r.op === "gte" || r.op === "lt" || r.op === "lte") {
          const op = r.op === "gt" ? ">" : r.op === "gte" ? ">=" : r.op === "lt" ? "<" : "<=";
          params.push(...codes, r.value);
          return `EXISTS (
            SELECT 1 FROM printings pv JOIN prices_current pcv ON pcv.scryfall_id = pv.scryfall_id
            WHERE pv.oracle_id = c.oracle_id
              AND pv.set_code IN (${ph})
              AND COALESCE(pcv.usd, pcv.usd_foil) IS NOT NULL
              AND COALESCE(pcv.usd, pcv.usd_foil) ${op} ?
          )`;
        }
        const v = r.value as unknown;
        if (!Array.isArray(v) || v.length !== 2) return "";
        const [a, b] = v as [number, number];
        params.push(...codes, Math.min(a, b), Math.max(a, b));
        return `EXISTS (
          SELECT 1 FROM printings pv JOIN prices_current pcv ON pcv.scryfall_id = pv.scryfall_id
          WHERE pv.oracle_id = c.oracle_id
            AND pv.set_code IN (${ph})
            AND COALESCE(pcv.usd, pcv.usd_foil) IS NOT NULL
            AND COALESCE(pcv.usd, pcv.usd_foil) BETWEEN ? AND ?
        )`;
      }
      case "price": {
        if (r.op === "between") {
          const v = r.value as unknown;
          if (!Array.isArray(v) || v.length !== 2) return "";
          const [a, b] = v as [number, number];
          return priceExists(r.scope, r.currency, "between", { range: [a, b] });
        }
        const op = r.op === "gt" ? ">" : r.op === "gte" ? ">=" : r.op === "lt" ? "<" : "<=";
        if (typeof r.value !== "number" || !Number.isFinite(r.value)) return "";
        return priceExists(r.scope, r.currency, "cmp", { operator: op, value: r.value });
      }
      case "finish": {
        const xs = r.value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!xs.length) return "";
        const parts: string[] = [];
        for (const x of xs) {
          params.push(`"${x}"`);
          parts.push(`instr(LOWER(COALESCE(p.finishes, '')), ?) > 0`);
        }
        const inner = `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND (${parts.join(" OR ")}))`;
        return r.op === "not_in" ? `(NOT ${inner})` : inner;
      }
      case "frame_effect": {
        const xs = r.value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!xs.length) return "";
        const parts: string[] = [];
        for (const x of xs) {
          params.push(`"${x}"`);
          parts.push(`instr(LOWER(COALESCE(p.frame_effects, '')), ?) > 0`);
        }
        const inner = `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND (${parts.join(" OR ")}))`;
        return r.op === "not_in" ? `(NOT ${inner})` : inner;
      }
      case "collector_number": {
        const v = r.value.trim();
        if (!v) return "";
        if (r.op === "eq") {
          params.push(v);
          return `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND p.collector_number = ?)`;
        }
        if (r.op === "prefix") {
          params.push(`${v}%`);
          return `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND p.collector_number LIKE ?)`;
        }
        params.push(`%${v}%`);
        return `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND p.collector_number LIKE ?)`;
      }
      case "promo": {
        return `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND p.is_promo = ${r.value ? 1 : 0})`;
      }
      case "foil_only": {
        return `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND p.is_foil_only = ${r.value ? 1 : 0})`;
      }
      case "nonfoil_only": {
        return `EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = c.oracle_id AND p.is_nonfoil_only = ${r.value ? 1 : 0})`;
      }
      case "digital_set": {
        return `EXISTS (
          SELECT 1 FROM printings p
          INNER JOIN sets s ON s.code = p.set_code
          WHERE p.oracle_id = c.oracle_id AND s.is_digital = ${r.value ? 1 : 0}
        )`;
      }
      case "owned":
        params.push(opts.userId);
        return r.value
          ? `EXISTS (
              SELECT 1 FROM owned_cards o
              WHERE o.user_id = ? AND o.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
            )`
          : `NOT EXISTS (
              SELECT 1 FROM owned_cards o
              WHERE o.user_id = ? AND o.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
            )`;
      case "watchlist":
        params.push(opts.userId);
        return r.value
          ? `EXISTS (
              SELECT 1 FROM watchlist w
              WHERE w.user_id = ? AND w.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
            )`
          : `NOT EXISTS (
              SELECT 1 FROM watchlist w
              WHERE w.user_id = ? AND w.scryfall_id IN (SELECT scryfall_id FROM printings px WHERE px.oracle_id = c.oracle_id)
            )`;
      case "pinned":
        params.push(opts.userId);
        return r.value
          ? `EXISTS (SELECT 1 FROM pinned pin WHERE pin.user_id = ? AND pin.oracle_id = c.oracle_id)`
          : `NOT EXISTS (SELECT 1 FROM pinned pin WHERE pin.user_id = ? AND pin.oracle_id = c.oracle_id)`;
      default:
        return "";
    }
  };

  const sql = compile(g);
  return { sql, params };
}

