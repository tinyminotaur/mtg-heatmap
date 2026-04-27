/**
 * Downloads Scryfall default_cards bulk JSON, streams into SQLite (POC: released_at <= 2005-12-31).
 * Run: SCRYFALL_USER_AGENT="mtg-heatmap/1.0 (https://example.com)" pnpm db:refresh
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import streamArray from "stream-json/streamers/stream-array.js";
import type Database from "better-sqlite3";
import { getDbFilePath, openDbAt } from "../src/lib/db";
import { LOCAL_USER_ID, POC_RELEASE_CUTOFF } from "../src/lib/constants";

/** Strip to printable ASCII for HTTP headers (undici requires ByteString / Latin-1). */
function asciiUserAgent(raw: string, maxLen = 256): string {
  const t = [...raw]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c <= 126 ? ch : "-";
    })
    .join("")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, maxLen);
  return t || "mtg-heatmap/1.0 (+https://api.scryfall.com)";
}

/**
 * Single source of truth for Scryfall requests. Never pass through unvalidated env
 * (CI secrets / YAML can contain Unicode punctuation that breaks fetch()).
 */
function scryfallUserAgent(): string {
  const raw = (process.env.SCRYFALL_USER_AGENT ?? "").trim();
  const ua = raw ? asciiUserAgent(raw) : asciiUserAgent("");
  for (let i = 0; i < ua.length; i++) {
    const c = ua.charCodeAt(i);
    if (c > 127) {
      throw new Error(
        `SCRYFALL_USER_AGENT must be ASCII-only (got non-ASCII at index ${i}, U+${c.toString(16)}).`,
      );
    }
  }
  return ua;
}

const UA = scryfallUserAgent();

const dbPath = getDbFilePath();

type SetNested = {
  code: string;
  name: string;
  released_at?: string | null;
  set_type?: string | null;
  digital?: boolean;
};

type ScryfallCard = {
  object: string;
  id: string;
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  reserved?: boolean;
  legalities?: Record<string, string>;
  digital?: boolean;
  released_at?: string | null;
  /** Bulk default_cards uses a string set code; single-card API uses a nested object. */
  set?: string | SetNested;
  set_name?: string;
  set_type?: string;
  collector_number?: string;
  rarity?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  scryfall_uri?: string;
  purchase_uris?: { tcgplayer?: string; cardmarket?: string };
  prices?: {
    usd?: string | number | null;
    usd_foil?: string | number | null;
    eur?: string | number | null;
    tix?: string | number | null;
  };
  promo?: boolean;
  finishes?: string[];
  frame_effects?: string[];
};

function resolveSet(card: ScryfallCard): SetNested | null {
  if (typeof card.set === "object" && card.set && "code" in card.set) {
    const s = card.set as SetNested;
    return s.code ? s : null;
  }
  if (typeof card.set === "string" && card.set.length > 0) {
    return {
      code: card.set,
      name: card.set_name ?? card.set,
      released_at: card.released_at ?? null,
      set_type: card.set_type ?? null,
      digital: Boolean(card.digital),
    };
  }
  return null;
}

function releaseCutoff(card: ScryfallCard): string | null {
  const s = resolveSet(card);
  return card.released_at || s?.released_at || null;
}

function priceMaybe(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function passesPoc(card: ScryfallCard): boolean {
  const d = releaseCutoff(card);
  if (!d) return false;
  return d <= POC_RELEASE_CUTOFF;
}

async function downloadBulk(uri: string, dest: string) {
  const res = await fetch(uri, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`Bulk download failed: ${res.status}`);
  await pipeline(res.body as NodeJS.ReadableStream, createWriteStream(dest));
}

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const manifestRes = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": UA },
  });
  if (!manifestRes.ok) throw new Error(`Manifest ${manifestRes.status}`);
  const manifest = (await manifestRes.json()) as {
    data: { type: string; download_uri: string }[];
  };
  const def = manifest.data.find((d) => d.type === "default_cards");
  if (!def) throw new Error("default_cards not found in bulk-data manifest");

  const tmp = path.join(path.dirname(dbPath), "default-cards.json.tmp");
  console.log("Downloading", def.download_uri);
  await downloadBulk(def.download_uri, tmp);

  const db = openDbAt(dbPath);
  let committed = false;
  let n = 0;
  try {
    db.exec("BEGIN");
    const clear = [
    "DELETE FROM owned_cards",
    "DELETE FROM watchlist",
    "DELETE FROM pinned",
    "DELETE FROM prices_history",
    "DELETE FROM prices_current",
    "DELETE FROM printings",
    "DELETE FROM cards",
    "DELETE FROM sets",
    "DELETE FROM special_groups",
  ];
  for (const s of clear) db.exec(s);

  const insSet = db.prepare(
    `INSERT OR REPLACE INTO sets (code, name, release_date, set_type, icon_svg_path, is_digital, is_promo, parent_set_code)
     VALUES (@code,@name,@release_date,@set_type,@icon_svg_path,@is_digital,0,NULL)`,
  );
  const insCard = db.prepare(
    `INSERT OR REPLACE INTO cards (oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, is_reserved, legalities)
     VALUES (@oracle_id,@name,@mana_cost,@cmc,@type_line,@oracle_text,@colors,@color_identity,@is_reserved,@legalities)`,
  );
  const insP = db.prepare(
    `INSERT OR REPLACE INTO printings (scryfall_id, oracle_id, set_code, collector_number, rarity, released_at, image_uri_large, image_uri_normal, image_uri_small, scryfall_uri, tcgplayer_url, cardmarket_url, is_foil_only, is_nonfoil_only, is_promo, frame_effects, finishes)
     VALUES (@scryfall_id,@oracle_id,@set_code,@collector_number,@rarity,@released_at,@image_uri_large,@image_uri_normal,@image_uri_small,@scryfall_uri,@tcgplayer_url,@cardmarket_url,@is_foil_only,@is_nonfoil_only,@is_promo,@frame_effects,@finishes)`,
  );
  const insPrice = db.prepare(
    `INSERT OR REPLACE INTO prices_current (scryfall_id, usd, usd_foil, usd_etched, eur, eur_foil, tix, updated_at)
     VALUES (@scryfall_id,@usd,@usd_foil,NULL,@eur,NULL,@tix,datetime('now'))`,
  );

    const seenSets = new Set<string>();
    const readStream = fs.createReadStream(tmp);
    const pipelineChain = chain([readStream, parser(), streamArray()]);

    for await (const chunk of pipelineChain) {
    const card = (chunk as { value: ScryfallCard }).value;
    if (!card || card.object !== "card") continue;
    const layout = (card as { layout?: string }).layout;
    if (layout === "token" || layout === "double_faced_token" || layout === "emblem") continue;
    if (!passesPoc(card)) continue;
    const setInfo = resolveSet(card);
    if (!setInfo) continue;
    if (card.digital || setInfo.digital) continue;

    const setCode = setInfo.code;
    if (!seenSets.has(setCode)) {
      seenSets.add(setCode);
      insSet.run({
        code: setCode,
        name: setInfo.name,
        release_date: setInfo.released_at ?? card.released_at ?? null,
        set_type: setInfo.set_type ?? null,
        icon_svg_path: `/set-icons/${setCode}.svg`,
        is_digital: setInfo.digital ? 1 : 0,
      });
    }

    const rel = releaseCutoff(card) ?? setInfo.released_at ?? null;
    const finishes = JSON.stringify(card.finishes ?? []);
    const frameFx = JSON.stringify(card.frame_effects ?? []);
    const foilOnly = card.finishes?.length === 1 && card.finishes[0] === "foil" ? 1 : 0;
    const nonfoilOnly = card.finishes?.length === 1 && card.finishes[0] === "nonfoil" ? 1 : 0;

    insCard.run({
      oracle_id: card.oracle_id,
      name: card.name,
      mana_cost: card.mana_cost ?? null,
      cmc: card.cmc ?? null,
      type_line: card.type_line ?? null,
      oracle_text: card.oracle_text ?? null,
      colors: JSON.stringify(card.colors ?? []),
      color_identity: JSON.stringify(card.color_identity ?? card.colors ?? []),
      is_reserved: card.reserved ? 1 : 0,
      legalities: JSON.stringify(card.legalities ?? {}),
    });

    insP.run({
      scryfall_id: card.id,
      oracle_id: card.oracle_id,
      set_code: setCode,
      collector_number: card.collector_number ?? "",
      rarity: card.rarity ?? "",
      released_at: rel,
      image_uri_large: card.image_uris?.large ?? null,
      image_uri_normal: card.image_uris?.normal ?? null,
      image_uri_small: card.image_uris?.small ?? null,
      scryfall_uri: card.scryfall_uri ?? null,
      tcgplayer_url: card.purchase_uris?.tcgplayer ?? null,
      cardmarket_url: card.purchase_uris?.cardmarket ?? null,
      is_foil_only: foilOnly,
      is_nonfoil_only: nonfoilOnly,
      is_promo: card.promo ? 1 : 0,
      frame_effects: frameFx,
      finishes,
    });

    const pr = card.prices ?? {};
    insPrice.run({
      scryfall_id: card.id,
      usd: priceMaybe(pr.usd),
      usd_foil: priceMaybe(pr.usd_foil),
      eur: priceMaybe(pr.eur),
      tix: priceMaybe(pr.tix),
    });

    n++;
      if (n % 50_000 === 0) console.log("…", n, "printings");
    }

    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR REPLACE INTO prices_history (scryfall_id, snapshot_date, usd, usd_foil, eur, tix)
     SELECT scryfall_id, ?, usd, usd_foil, eur, tix FROM prices_current`,
    ).run(today);

    seedSpecialGroups(db);

    db.exec("COMMIT");
    committed = true;
  } catch (err) {
    if (!committed) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  console.log("Refresh complete:", n, "printings ingested (POC cutoff).");
}

function seedSpecialGroups(db: Database.Database) {
  const names = [
    "Black Lotus",
    "Ancestral Recall",
    "Time Walk",
    "Timetwister",
    "Mox Pearl",
    "Mox Sapphire",
    "Mox Jet",
    "Mox Ruby",
    "Mox Emerald",
  ];
  const rows = db
    .prepare(`SELECT oracle_id FROM cards WHERE name IN (${names.map(() => "?").join(",")})`)
    .all(...names) as { oracle_id: string }[];
  const ids = [...new Set(rows.map((r) => r.oracle_id))];
  if (ids.length) {
    db.prepare(
      `INSERT OR REPLACE INTO special_groups (slug, name, oracle_ids) VALUES ('power_nine','Power Nine',?)`,
    ).run(JSON.stringify(ids));
  }
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, NULL, datetime('now'))`,
  ).run(LOCAL_USER_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
