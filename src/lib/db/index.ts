import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { LOCAL_USER_ID } from "@/lib/constants";
import { INIT_SQL } from "@/lib/db/schema";

/** Enables `expr REGEXP pattern` (used for mana_cost symbol checks in heatmap SQL). */
function registerSqliteRegexp(db: Database.Database) {
  db.function("regexp", { deterministic: true }, (pattern: unknown, value: unknown) => {
    if (pattern == null || value == null) return 0;
    try {
      return new RegExp(String(pattern), "u").test(String(value)) ? 1 : 0;
    } catch {
      return 0;
    }
  });
}

let dbInstance: Database.Database | null = null;

/** Older DBs may lack image columns added after first POC schema. */
function migratePrintingsImageColumns(db: Database.Database) {
  const cols = db.prepare(`PRAGMA table_info(printings)`).all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("image_uri_normal")) {
    db.exec("ALTER TABLE printings ADD COLUMN image_uri_normal TEXT");
  }
  if (!names.has("image_uri_large")) {
    db.exec("ALTER TABLE printings ADD COLUMN image_uri_large TEXT");
  }
}

export function getDbFilePath(): string {
  return resolveDbPath();
}

function resolveDbPath(): string {
  // SQLite catalog DB path (do NOT use DATABASE_URL; Vercel/Neon sets that to Postgres).
  const raw = process.env.MTG_SQLITE_PATH ?? "./data/mtg.db";
  const cleaned = raw.replace(/^file:/, "").replace(/^\.\//, "");
  return path.isAbsolute(cleaned)
    ? cleaned
    : path.join(/* turbopackIgnore: true */ process.cwd(), cleaned);
}

/** Bundled at build on Vercel; serverless FS is read-only except /tmp. */
function bundledDbPath(): string {
  return path.join(process.cwd(), "data", "mtg.db");
}

/**
 * On Vercel, open a writable copy under /tmp (WAL + toggles need writes).
 * Fresh file per deployment via VERCEL_DEPLOYMENT_ID.
 */
function resolveServerlessWritableDbPath(): string | null {
  if (process.env.VERCEL !== "1") return null;
  /** Explicit SQLite path wins (e.g. local mounted volume). */
  if ((process.env.MTG_SQLITE_PATH ?? "").trim()) return null;
  const src = bundledDbPath();
  if (!fs.existsSync(src)) return null;
  const id = process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  const dest = path.join("/tmp", `mtg-heatmap-${id}.db`);
  try {
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  } catch {
    /* concurrent cold start */
  }
  return fs.existsSync(dest) ? dest : null;
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = resolveServerlessWritableDbPath() ?? resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  registerSqliteRegexp(db);
  db.exec(INIT_SQL);
  migratePrintingsImageColumns(db);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, NULL, datetime('now'))`,
  ).run(LOCAL_USER_ID);
  dbInstance = db;
  return db;
}

/** For scripts / tests that need a fresh handle */
export function openDbAt(filePath: string): Database.Database {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  registerSqliteRegexp(db);
  db.exec(INIT_SQL);
  migratePrintingsImageColumns(db);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, NULL, datetime('now'))`,
  ).run(LOCAL_USER_ID);
  return db;
}
