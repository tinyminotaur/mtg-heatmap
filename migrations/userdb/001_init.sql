-- User data DB (Postgres): auth + per-user state (pins/owned/watchlist/saved views).

CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY,
  handle text UNIQUE,
  password_scrypt text,
  is_guest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_pinned (
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  oracle_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, oracle_id)
);

CREATE TABLE IF NOT EXISTS user_owned (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  scryfall_id text NOT NULL,
  condition text DEFAULT 'NM',
  is_foil boolean NOT NULL DEFAULT false,
  purchase_price numeric,
  acquired_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_owned_user ON user_owned(user_id);
CREATE INDEX IF NOT EXISTS idx_user_owned_scryfall ON user_owned(scryfall_id);

CREATE TABLE IF NOT EXISTS user_watchlist (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  scryfall_id text NOT NULL,
  added_at_price numeric,
  alert_above numeric,
  alert_below numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user ON user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_scryfall ON user_watchlist(scryfall_id);

CREATE TABLE IF NOT EXISTS user_saved_views (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name text,
  filter_state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_saved_views_user ON user_saved_views(user_id);

