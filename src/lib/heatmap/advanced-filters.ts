export type FilterGroup = {
  op: "and" | "or";
  rules: Array<FilterGroup | FilterRule>;
};

export type FilterRule =
  | { field: "name"; op: "contains"; value: string }
  | { field: "oracle_text"; op: "contains"; value: string }
  | { field: "type_line"; op: "contains"; value: string }
  | { field: "reserved"; op: "is"; value: boolean }
  | { field: "cmc"; op: "between"; value: [number, number] }
  | { field: "color_identity"; op: "in"; value: string[] } // W/U/B/R/G/C
  | { field: "format"; op: "in"; value: string[] } // standard, modern, ...
  | { field: "rarity"; op: "in"; value: string[] } // common, uncommon, ...
  | { field: "price_usd_like"; op: "gt" | "lt"; value: number }
  | { field: "price_usd_like"; op: "between"; value: [number, number] }
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
    else if (field === "oracle_text" && rop === "contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "type_line" && rop === "contains" && typeof value === "string") parsed.push({ field, op: rop, value });
    else if (field === "reserved" && rop === "is" && typeof value === "boolean") parsed.push({ field, op: rop, value });
    else if (field === "cmc" && rop === "between" && isNumberTuple2(value)) parsed.push({ field, op: rop, value });
    else if (field === "color_identity" && rop === "in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "format" && rop === "in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "rarity" && rop === "in" && isStringArray(value)) parsed.push({ field, op: rop, value });
    else if (field === "price_usd_like" && (rop === "gt" || rop === "lt") && typeof value === "number" && Number.isFinite(value))
      parsed.push({ field, op: rop, value });
    else if (field === "price_usd_like" && rop === "between" && isNumberTuple2(value)) parsed.push({ field, op: rop, value });
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
  opts: { userId: string },
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
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
        params.push(`%${r.value.trim()}%`);
        return `c.name LIKE ?`;
      case "oracle_text":
        params.push(`%${r.value.trim().toLowerCase()}%`);
        return `LOWER(COALESCE(c.oracle_text, '')) LIKE ?`;
      case "type_line":
        params.push(`%${r.value.trim().toLowerCase()}%`);
        return `LOWER(COALESCE(c.type_line, '')) LIKE ?`;
      case "reserved":
        return r.value ? `c.is_reserved = 1` : `c.is_reserved = 0`;
      case "cmc": {
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
        return `(${parts.join(" OR ")})`;
      }
      case "format": {
        const fmts = r.value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!fmts.length) return "";
        const parts: string[] = [];
        for (const fmt of fmts) {
          params.push(fmt);
          parts.push(`json_extract(c.legalities, '$.' || ?) = 'legal'`);
        }
        return `(${parts.join(" OR ")})`;
      }
      case "rarity": {
        const rs = r.value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!rs.length) return "";
        const ph = rs.map(() => "?").join(",");
        params.push(...rs);
        return `EXISTS (SELECT 1 FROM printings p2 WHERE p2.oracle_id = c.oracle_id AND p2.rarity IN (${ph}))`;
      }
      case "price_usd_like": {
        if (r.op === "gt") {
          params.push(r.value);
          return `EXISTS (
            SELECT 1 FROM printings p3 JOIN prices_current pc3 ON pc3.scryfall_id = p3.scryfall_id
            WHERE p3.oracle_id = c.oracle_id
              AND COALESCE(pc3.usd, pc3.usd_foil) IS NOT NULL
              AND COALESCE(pc3.usd, pc3.usd_foil) > ?
          )`;
        }
        if (r.op === "lt") {
          params.push(r.value);
          return `EXISTS (
            SELECT 1 FROM printings p3 JOIN prices_current pc3 ON pc3.scryfall_id = p3.scryfall_id
            WHERE p3.oracle_id = c.oracle_id
              AND COALESCE(pc3.usd, pc3.usd_foil) IS NOT NULL
              AND COALESCE(pc3.usd, pc3.usd_foil) < ?
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

