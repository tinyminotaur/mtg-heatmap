import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { LOCAL_USER_ID } from "@/lib/constants";
import { INIT_SQL } from "@/lib/db/schema";

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
  const raw = process.env.DATABASE_URL ?? "./data/mtg.db";
  const cleaned = raw.replace(/^file:/, "").replace(/^\.\//, "");
  return path.isAbsolute(cleaned)
    ? cleaned
    : path.join(/* turbopackIgnore: true */ process.cwd(), cleaned);
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
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
  db.exec(INIT_SQL);
  migratePrintingsImageColumns(db);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, NULL, datetime('now'))`,
  ).run(LOCAL_USER_ID);
  return db;
}
