export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS sets (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  release_date TEXT,
  set_type TEXT,
  icon_svg_path TEXT,
  is_digital INTEGER DEFAULT 0,
  is_promo INTEGER DEFAULT 0,
  parent_set_code TEXT
);

CREATE TABLE IF NOT EXISTS cards (
  oracle_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mana_cost TEXT,
  cmc REAL,
  type_line TEXT,
  oracle_text TEXT,
  colors TEXT,
  color_identity TEXT,
  is_reserved INTEGER DEFAULT 0,
  legalities TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);

CREATE TABLE IF NOT EXISTS printings (
  scryfall_id TEXT PRIMARY KEY,
  oracle_id TEXT NOT NULL REFERENCES cards(oracle_id),
  set_code TEXT NOT NULL REFERENCES sets(code),
  collector_number TEXT,
  rarity TEXT,
  released_at TEXT,
  image_uri_normal TEXT,
  image_uri_small TEXT,
  scryfall_uri TEXT,
  tcgplayer_url TEXT,
  cardmarket_url TEXT,
  is_foil_only INTEGER DEFAULT 0,
  is_nonfoil_only INTEGER DEFAULT 0,
  is_promo INTEGER DEFAULT 0,
  frame_effects TEXT,
  finishes TEXT
);
CREATE INDEX IF NOT EXISTS idx_printings_oracle ON printings(oracle_id);
CREATE INDEX IF NOT EXISTS idx_printings_set ON printings(set_code);

CREATE TABLE IF NOT EXISTS prices_current (
  scryfall_id TEXT PRIMARY KEY REFERENCES printings(scryfall_id),
  usd REAL, usd_foil REAL, usd_etched REAL,
  eur REAL, eur_foil REAL,
  tix REAL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS prices_history (
  scryfall_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  usd REAL, usd_foil REAL, eur REAL, tix REAL,
  PRIMARY KEY (scryfall_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS owned_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  scryfall_id TEXT NOT NULL REFERENCES printings(scryfall_id),
  condition TEXT DEFAULT 'NM',
  is_foil INTEGER DEFAULT 0,
  purchase_price REAL,
  acquired_date TEXT,
  notes TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_owned_user ON owned_cards(user_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  scryfall_id TEXT NOT NULL REFERENCES printings(scryfall_id),
  added_at_price REAL,
  alert_above REAL,
  alert_below REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS pinned (
  user_id TEXT NOT NULL REFERENCES users(id),
  oracle_id TEXT NOT NULL REFERENCES cards(oracle_id),
  PRIMARY KEY (user_id, oracle_id)
);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT,
  filter_state TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS special_groups (
  slug TEXT PRIMARY KEY,
  name TEXT,
  oracle_ids TEXT
);
`;
