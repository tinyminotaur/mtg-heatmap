import { sql } from "@vercel/postgres";

export type AuthUser = {
  id: string;
  handle: string | null;
  is_guest: boolean;
};

let schemaEnsured = false;

export function userDbEnabled(): boolean {
  const pg = (process.env.POSTGRES_URL ?? "").trim();
  const neon = (process.env.DATABASE_URL ?? "").trim();
  return Boolean(pg || neon);
}

export async function ensureUserDbSchema(): Promise<void> {
  if (!userDbEnabled()) return;
  // Neon/Vercel integrations commonly provide DATABASE_URL; @vercel/postgres expects POSTGRES_URL.
  if (!(process.env.POSTGRES_URL ?? "").trim() && (process.env.DATABASE_URL ?? "").trim()) {
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
  }
  if (schemaEnsured) return;
  // Minimal durable user data store (separate from SQLite catalog DB).
  await sql`CREATE TABLE IF NOT EXISTS auth_users (
    id uuid PRIMARY KEY,
    handle text UNIQUE,
    password_scrypt text,
    is_guest boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );`;

  await sql`CREATE TABLE IF NOT EXISTS auth_sessions (
    token text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );`;

  await sql`CREATE TABLE IF NOT EXISTS user_pinned (
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    oracle_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, oracle_id)
  );`;

  await sql`CREATE TABLE IF NOT EXISTS user_owned (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    scryfall_id text NOT NULL,
    condition text DEFAULT 'NM',
    is_foil boolean NOT NULL DEFAULT false,
    purchase_price numeric,
    acquired_date date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
  );`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_owned_user ON user_owned(user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_owned_scryfall ON user_owned(scryfall_id);`;

  await sql`CREATE TABLE IF NOT EXISTS user_watchlist (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    scryfall_id text NOT NULL,
    added_at_price numeric,
    alert_above numeric,
    alert_below numeric,
    created_at timestamptz NOT NULL DEFAULT now()
  );`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_watchlist_user ON user_watchlist(user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_watchlist_scryfall ON user_watchlist(scryfall_id);`;

  await sql`CREATE TABLE IF NOT EXISTS user_saved_views (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    name text,
    filter_state text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_saved_views_user ON user_saved_views(user_id);`;

  schemaEnsured = true;
}

export async function createGuestUserAndSession(args: {
  userId: string;
  token: string;
  expiresAtIso: string;
}): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  await sql`INSERT INTO auth_users (id, handle, password_scrypt, is_guest)
            VALUES (${args.userId}::uuid, NULL, NULL, true)
            ON CONFLICT (id) DO NOTHING;`;
  await sql`INSERT INTO auth_sessions (token, user_id, expires_at)
            VALUES (${args.token}, ${args.userId}::uuid, ${args.expiresAtIso}::timestamptz)
            ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at;`;
}

export async function getUserBySessionToken(token: string): Promise<AuthUser | null> {
  if (!userDbEnabled()) return null;
  await ensureUserDbSchema();
  const r = await sql<AuthUser>`
    SELECT u.id::text AS id, u.handle, u.is_guest
    FROM auth_sessions s
    JOIN auth_users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()
    LIMIT 1
  `;
  return r.rows[0] ?? null;
}

export async function getUserByHandle(handle: string): Promise<(AuthUser & { password_scrypt: string | null }) | null> {
  if (!userDbEnabled()) return null;
  await ensureUserDbSchema();
  const h = handle.trim().toLowerCase();
  const r = await sql<(AuthUser & { password_scrypt: string | null })>`
    SELECT id::text AS id, handle, is_guest, password_scrypt
    FROM auth_users
    WHERE LOWER(handle) = ${h}
    LIMIT 1
  `;
  return r.rows[0] ?? null;
}

export async function upgradeGuestToPasswordAccount(args: {
  userId: string;
  handle: string;
  passwordScrypt: string;
}): Promise<AuthUser> {
  if (!userDbEnabled()) return { id: args.userId, handle: args.handle, is_guest: false };
  await ensureUserDbSchema();
  const h = args.handle.trim();
  const r = await sql<AuthUser>`
    UPDATE auth_users
    SET handle = ${h}, password_scrypt = ${args.passwordScrypt}, is_guest = false
    WHERE id = ${args.userId}::uuid
    RETURNING id::text AS id, handle, is_guest
  `;
  if (!r.rows[0]) {
    // If the guest row didn't exist, create it as a non-guest.
    const ins = await sql<AuthUser>`
      INSERT INTO auth_users (id, handle, password_scrypt, is_guest)
      VALUES (${args.userId}::uuid, ${h}, ${args.passwordScrypt}, false)
      RETURNING id::text AS id, handle, is_guest
    `;
    return ins.rows[0]!;
  }
  return r.rows[0];
}

export async function createSessionForUser(args: {
  userId: string;
  token: string;
  expiresAtIso: string;
}): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  await sql`INSERT INTO auth_sessions (token, user_id, expires_at)
            VALUES (${args.token}, ${args.userId}::uuid, ${args.expiresAtIso}::timestamptz)
            ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at;`;
}

export async function togglePinnedOracle(args: { userId: string; oracleId: string }): Promise<boolean> {
  if (!userDbEnabled()) return false;
  await ensureUserDbSchema();
  const del = await sql`DELETE FROM user_pinned WHERE user_id = ${args.userId}::uuid AND oracle_id = ${args.oracleId}`;
  // @vercel/postgres exposes rowCount on the result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowCount = (del as any).rowCount as number | undefined;
  if (rowCount && rowCount > 0) return false;
  await sql`INSERT INTO user_pinned (user_id, oracle_id) VALUES (${args.userId}::uuid, ${args.oracleId})
            ON CONFLICT DO NOTHING;`;
  return true;
}

export async function getPinnedOracleIds(userId: string): Promise<string[]> {
  if (!userDbEnabled()) return [];
  await ensureUserDbSchema();
  const r = await sql<{ oracle_id: string }>`SELECT oracle_id FROM user_pinned WHERE user_id = ${userId}::uuid`;
  return r.rows.map((x) => x.oracle_id);
}

export async function addOwnedCopy(args: { userId: string; id: string; scryfallId: string }): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  await sql`INSERT INTO user_owned (id, user_id, scryfall_id, condition, is_foil)
            VALUES (${args.id}::uuid, ${args.userId}::uuid, ${args.scryfallId}, 'NM', false);`;
}

export async function removeOwnedCopy(args: { userId: string; scryfallId: string }): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  await sql`DELETE FROM user_owned
            WHERE id = (
              SELECT id FROM user_owned
              WHERE user_id = ${args.userId}::uuid AND scryfall_id = ${args.scryfallId}
              ORDER BY created_at DESC
              LIMIT 1
            );`;
}

export async function ownedQtyForScryfall(args: { userId: string; scryfallId: string }): Promise<number> {
  if (!userDbEnabled()) return 0;
  await ensureUserDbSchema();
  const r = await sql<{ n: number }>`
    SELECT COUNT(*)::int AS n FROM user_owned
    WHERE user_id = ${args.userId}::uuid AND scryfall_id = ${args.scryfallId}
  `;
  return r.rows[0]?.n ?? 0;
}

export async function listOwned(userId: string): Promise<
  {
    id: string;
    scryfall_id: string;
    condition: string | null;
    is_foil: boolean;
    purchase_price: number | null;
    acquired_date: string | null;
    notes: string | null;
    created_at: string;
  }[]
> {
  if (!userDbEnabled()) return [];
  await ensureUserDbSchema();
  const r = await sql<{
    id: string;
    scryfall_id: string;
    condition: string | null;
    is_foil: boolean;
    purchase_price: number | null;
    acquired_date: string | null;
    notes: string | null;
    created_at: string;
  }>`
    SELECT id::text AS id, scryfall_id, condition, is_foil, purchase_price, acquired_date::text AS acquired_date,
           notes, created_at::text AS created_at
    FROM user_owned
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
  `;
  return r.rows;
}

export async function listOwnedScryfallIds(userId: string): Promise<string[]> {
  if (!userDbEnabled()) return [];
  await ensureUserDbSchema();
  const r = await sql<{ scryfall_id: string }>`
    SELECT scryfall_id FROM user_owned WHERE user_id = ${userId}::uuid
  `;
  return r.rows.map((x) => x.scryfall_id);
}

export async function updateOwned(args: {
  userId: string;
  id: string;
  condition?: string;
  purchase_price?: number | null;
  notes?: string | null;
  acquired_date?: string | null;
}): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (args.condition !== undefined) {
    fields.push(`condition = $${fields.length + 2}`);
    vals.push(args.condition);
  }
  if (args.purchase_price !== undefined) {
    fields.push(`purchase_price = $${fields.length + 2}`);
    vals.push(args.purchase_price);
  }
  if (args.notes !== undefined) {
    fields.push(`notes = $${fields.length + 2}`);
    vals.push(args.notes);
  }
  if (args.acquired_date !== undefined) {
    fields.push(`acquired_date = $${fields.length + 2}`);
    vals.push(args.acquired_date);
  }
  if (!fields.length) return;
  // Use a raw query string to avoid template limitations for dynamic SET.
  const q = `UPDATE user_owned SET ${fields.join(", ")} WHERE id = $1::uuid AND user_id = '${args.userId}'::uuid`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).query(q, [args.id, ...vals]);
}

export async function deleteOwned(args: { userId: string; id: string }): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  await sql`DELETE FROM user_owned WHERE id = ${args.id}::uuid AND user_id = ${args.userId}::uuid;`;
}

export async function toggleWatchlist(args: {
  userId: string;
  id: string;
  scryfallId: string;
  addedAtPrice: number | null;
}): Promise<boolean> {
  if (!userDbEnabled()) return false;
  await ensureUserDbSchema();
  const del = await sql`DELETE FROM user_watchlist WHERE user_id = ${args.userId}::uuid AND scryfall_id = ${args.scryfallId}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowCount = (del as any).rowCount as number | undefined;
  if (rowCount && rowCount > 0) return false;
  await sql`INSERT INTO user_watchlist (id, user_id, scryfall_id, added_at_price)
            VALUES (${args.id}::uuid, ${args.userId}::uuid, ${args.scryfallId}, ${args.addedAtPrice});`;
  return true;
}

export async function listWatchlist(userId: string): Promise<
  {
    id: string;
    scryfall_id: string;
    added_at_price: number | null;
    alert_above: number | null;
    alert_below: number | null;
    created_at: string;
  }[]
> {
  if (!userDbEnabled()) return [];
  await ensureUserDbSchema();
  const r = await sql<{
    id: string;
    scryfall_id: string;
    added_at_price: number | null;
    alert_above: number | null;
    alert_below: number | null;
    created_at: string;
  }>`
    SELECT id::text AS id, scryfall_id, added_at_price, alert_above, alert_below, created_at::text AS created_at
    FROM user_watchlist
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
  `;
  return r.rows;
}

export async function listWatchlistScryfallIds(userId: string): Promise<string[]> {
  if (!userDbEnabled()) return [];
  await ensureUserDbSchema();
  const r = await sql<{ scryfall_id: string }>`
    SELECT scryfall_id FROM user_watchlist WHERE user_id = ${userId}::uuid
  `;
  return r.rows.map((x) => x.scryfall_id);
}

export async function updateWatchlist(args: {
  userId: string;
  id: string;
  alert_above?: number | null;
  alert_below?: number | null;
}): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (args.alert_above !== undefined) {
    fields.push(`alert_above = $${fields.length + 2}`);
    vals.push(args.alert_above);
  }
  if (args.alert_below !== undefined) {
    fields.push(`alert_below = $${fields.length + 2}`);
    vals.push(args.alert_below);
  }
  if (!fields.length) return;
  const q = `UPDATE user_watchlist SET ${fields.join(", ")} WHERE id = $1::uuid AND user_id = '${args.userId}'::uuid`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).query(q, [args.id, ...vals]);
}

export type SavedViewRow = {
  id: string;
  name: string | null;
  filter_state: string;
  created_at: string | null;
};

export async function listSavedViews(userId: string): Promise<SavedViewRow[]> {
  if (!userDbEnabled()) return [];
  await ensureUserDbSchema();
  const r = await sql<SavedViewRow>`
    SELECT id::text AS id, name, filter_state, created_at::text AS created_at
    FROM user_saved_views
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC NULLS LAST, name ASC NULLS LAST
  `;
  return r.rows;
}

export async function createSavedView(args: {
  userId: string;
  id: string;
  name: string | null;
  filter_state: string;
}): Promise<void> {
  if (!userDbEnabled()) return;
  await ensureUserDbSchema();
  await sql`INSERT INTO user_saved_views (id, user_id, name, filter_state)
            VALUES (${args.id}::uuid, ${args.userId}::uuid, ${args.name}, ${args.filter_state});`;
}

export async function getSavedView(args: { userId: string; id: string }): Promise<SavedViewRow | null> {
  if (!userDbEnabled()) return null;
  await ensureUserDbSchema();
  const r = await sql<SavedViewRow>`
    SELECT id::text AS id, name, filter_state, created_at::text AS created_at
    FROM user_saved_views
    WHERE user_id = ${args.userId}::uuid AND id = ${args.id}::uuid
    LIMIT 1
  `;
  return r.rows[0] ?? null;
}

export async function updateSavedView(args: {
  userId: string;
  id: string;
  name?: string | null;
  filter_state?: string;
}): Promise<boolean> {
  if (!userDbEnabled()) return false;
  await ensureUserDbSchema();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (args.name !== undefined) {
    fields.push(`name = $${fields.length + 2}`);
    vals.push(args.name);
  }
  if (args.filter_state !== undefined) {
    fields.push(`filter_state = $${fields.length + 2}`);
    vals.push(args.filter_state);
  }
  if (!fields.length) return true;
  const q = `UPDATE user_saved_views SET ${fields.join(", ")} WHERE id = $1::uuid AND user_id = '${args.userId}'::uuid`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (sql as any).query(q, [args.id, ...vals]);
  return Boolean(res?.rowCount ? res.rowCount > 0 : true);
}

export async function deleteSavedView(args: { userId: string; id: string }): Promise<boolean> {
  if (!userDbEnabled()) return false;
  await ensureUserDbSchema();
  const res = await sql`DELETE FROM user_saved_views WHERE id = ${args.id}::uuid AND user_id = ${args.userId}::uuid`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowCount = (res as any).rowCount as number | undefined;
  return Boolean(rowCount && rowCount > 0);
}

