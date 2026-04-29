import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import MiniSearch from "minisearch";
import { getDb, getDbFilePath } from "@/lib/db";

export const dynamic = "force-dynamic";

type Doc = { oracle_id: string; name: string; default_scryfall_id: string | null };

const g = globalThis as unknown as {
  __cardMiniSearch?: MiniSearch;
  __cardMiniMtimeMs?: number;
};

function getIndex(): MiniSearch {
  const dbPath = getDbFilePath();
  let mtime = 0;
  try {
    mtime = fs.statSync(dbPath).mtimeMs;
  } catch {
    mtime = Date.now();
  }
  if (g.__cardMiniSearch && g.__cardMiniMtimeMs === mtime) return g.__cardMiniSearch;

  const db = getDb();
  const rows = db.prepare(`SELECT oracle_id, name FROM cards`).all() as Doc[];
  const mini = new MiniSearch({
    fields: ["name"],
    storeFields: ["oracle_id", "name"],
    idField: "oracle_id",
  });
  mini.addAll(rows);
  g.__cardMiniSearch = mini;
  g.__cardMiniMtimeMs = mtime;
  return mini;
}

/** Earliest-released printing per oracle (stable default for “add one copy” flows). */
function attachDefaultScryfallIds(hits: Omit<Doc, "default_scryfall_id">[]): Doc[] {
  if (hits.length === 0) return [];
  const db = getDb();
  const ids = [...new Set(hits.map((h) => h.oracle_id))];
  const ph = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT oracle_id, scryfall_id, released_at FROM printings WHERE oracle_id IN (${ph})`)
    .all(...ids) as { oracle_id: string; scryfall_id: string; released_at: string | null }[];
  const byOracle = new Map<string, { scryfall_id: string; released_at: string | null }[]>();
  for (const r of rows) {
    const list = byOracle.get(r.oracle_id) ?? [];
    list.push(r);
    byOracle.set(r.oracle_id, list);
  }
  const pick = (oid: string): string | null => {
    const list = byOracle.get(oid);
    if (!list?.length) return null;
    list.sort((a, b) => String(a.released_at ?? "").localeCompare(String(b.released_at ?? "")));
    return list[0].scryfall_id;
  };
  return hits.map((h) => ({ ...h, default_scryfall_id: pick(h.oracle_id) }));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] as Doc[] });
  try {
    const mini = getIndex();
    const raw = mini.search(q, { fuzzy: 0.2, prefix: true }).slice(0, 25);
    const partial = raw.map((r) => ({
      oracle_id: String(r.id),
      name: typeof r.name === "string" ? r.name : "",
    }));
    const hits = attachDefaultScryfallIds(partial);
    return NextResponse.json({ results: hits });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
