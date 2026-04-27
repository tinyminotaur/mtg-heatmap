/**
 * Inserts a small deterministic dataset so the UI can run before a full Scryfall refresh.
 * Run: pnpm db:seed
 */
import fs from "node:fs";
import path from "node:path";
import { getDbFilePath, openDbAt } from "../src/lib/db";
import { LOCAL_USER_ID } from "../src/lib/constants";

const dbPath = getDbFilePath();

const sets = [
  ["LEA", "Limited Edition Alpha", "1993-08-05", "core", "/set-icons/lea.svg", 0],
  ["LEB", "Limited Edition Beta", "1993-10-01", "core", "/set-icons/leb.svg", 0],
  ["2ED", "Unlimited Edition", "1993-12-01", "core", "/set-icons/2ed.svg", 0],
];

const cards = [
  {
    oracle_id: "oracle-black-lotus",
    name: "Black Lotus",
    mana_cost: "{0}",
    cmc: 0,
    type_line: "Artifact",
    oracle_text: "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
    colors: "[]",
    color_identity: "[]",
    is_reserved: 1,
    legalities: JSON.stringify({ vintage: "restricted", commander: "banned" }),
  },
  {
    oracle_id: "oracle-dark-ritual",
    name: "Dark Ritual",
    mana_cost: "{B}",
    cmc: 1,
    type_line: "Instant",
    oracle_text: "Add {B}{B}{B}.",
    colors: '["B"]',
    color_identity: '["B"]',
    is_reserved: 0,
    legalities: JSON.stringify({ modern: "legal", legacy: "legal" }),
  },
];

function scryfallImageTier(smallUrl: string, tier: "normal" | "large") {
  return smallUrl.replace("/small/", `/${tier}/`);
}

const printings = [
  {
    scryfall_id: "lea-lotus",
    oracle_id: "oracle-black-lotus",
    set_code: "LEA",
    collector_number: "1",
    rarity: "rare",
    released_at: "1993-08-05",
    image_uri_small: "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000001.jpg",
    image_uri_normal: scryfallImageTier(
      "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000001.jpg",
      "normal",
    ),
    image_uri_large: scryfallImageTier(
      "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000001.jpg",
      "large",
    ),
    scryfall_uri: "https://scryfall.com/card/lea/1/black-lotus",
    tcgplayer_url: null as string | null,
    cardmarket_url: null as string | null,
  },
  {
    scryfall_id: "leb-lotus",
    oracle_id: "oracle-black-lotus",
    set_code: "LEB",
    collector_number: "1",
    rarity: "rare",
    released_at: "1993-10-01",
    image_uri_small: "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000002.jpg",
    image_uri_normal: scryfallImageTier(
      "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000002.jpg",
      "normal",
    ),
    image_uri_large: scryfallImageTier(
      "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000002.jpg",
      "large",
    ),
    scryfall_uri: "https://scryfall.com/card/leb/1/black-lotus",
    tcgplayer_url: null,
    cardmarket_url: null,
  },
  {
    scryfall_id: "2ed-ritual",
    oracle_id: "oracle-dark-ritual",
    set_code: "2ED",
    collector_number: "104",
    rarity: "common",
    released_at: "1993-12-01",
    image_uri_small: "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000003.jpg",
    image_uri_normal: scryfallImageTier(
      "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000003.jpg",
      "normal",
    ),
    image_uri_large: scryfallImageTier(
      "https://cards.scryfall.io/small/front/0/0/00000000-0000-0000-0000-000000000003.jpg",
      "large",
    ),
    scryfall_uri: "https://scryfall.com/card/2ed/104/dark-ritual",
    tcgplayer_url: null,
    cardmarket_url: null,
  },
];

const prices = [
  { id: "lea-lotus", usd: 42000, usd_foil: null, eur: null, tix: null },
  { id: "leb-lotus", usd: 38000, usd_foil: null, eur: null, tix: null },
  { id: "2ed-ritual", usd: 2.5, usd_foil: null, eur: 2.1, tix: 0.02 },
];

function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDbAt(dbPath);

  const insSet = db.prepare(
    `INSERT INTO sets (code, name, release_date, set_type, icon_svg_path, is_digital, is_promo) VALUES (?,?,?,?,?,?,0)`,
  );
  for (const s of sets) insSet.run(...s);

  const insCard = db.prepare(
    `INSERT INTO cards (oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, is_reserved, legalities)
     VALUES (@oracle_id,@name,@mana_cost,@cmc,@type_line,@oracle_text,@colors,@color_identity,@is_reserved,@legalities)`,
  );
  for (const c of cards) insCard.run(c);

  const insP = db.prepare(
    `INSERT INTO printings (scryfall_id, oracle_id, set_code, collector_number, rarity, released_at, image_uri_large, image_uri_normal, image_uri_small, scryfall_uri, tcgplayer_url, cardmarket_url, is_foil_only, is_nonfoil_only, is_promo, frame_effects, finishes)
     VALUES (@scryfall_id,@oracle_id,@set_code,@collector_number,@rarity,@released_at,@image_uri_large,@image_uri_normal,@image_uri_small,@scryfall_uri,@tcgplayer_url,@cardmarket_url,0,0,0,'[]','["nonfoil"]')`,
  );
  for (const p of printings) insP.run(p);

  const insPrice = db.prepare(
    `INSERT INTO prices_current (scryfall_id, usd, usd_foil, usd_etched, eur, eur_foil, tix, updated_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'))`,
  );
  for (const pr of prices) {
    insPrice.run(pr.id, pr.usd, pr.usd_foil, null, pr.eur, null, pr.tix);
  }

  const powerOracle = JSON.stringify(["oracle-black-lotus"]);
  db.prepare(
    `INSERT OR REPLACE INTO special_groups (slug, name, oracle_ids) VALUES ('power_nine','Power Nine (demo)',?)`,
  ).run(powerOracle);

  db.prepare(
    `INSERT OR IGNORE INTO pinned (user_id, oracle_id) VALUES (?, 'oracle-black-lotus')`,
  ).run(LOCAL_USER_ID);

  db.close();
  console.log("Demo DB written to", dbPath);
}

main();
