import { NextRequest, NextResponse } from "next/server";
import MiniSearch from "minisearch";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Doc = { oracle_id: string; name: string };

const g = globalThis as unknown as { __cardMiniSearch?: MiniSearch };

function getIndex(): MiniSearch {
  if (g.__cardMiniSearch) return g.__cardMiniSearch;
  const db = getDb();
  const rows = db.prepare(`SELECT oracle_id, name FROM cards`).all() as Doc[];
  const mini = new MiniSearch({
    fields: ["name"],
    storeFields: ["oracle_id", "name"],
    idField: "oracle_id",
  });
  mini.addAll(rows);
  g.__cardMiniSearch = mini;
  return mini;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] as Doc[] });
  try {
    const mini = getIndex();
    const raw = mini.search(q, { fuzzy: 0.2, prefix: true }).slice(0, 25);
    const hits: Doc[] = raw.map((r) => ({
      oracle_id: String(r.id),
      name: typeof r.name === "string" ? r.name : "",
    }));
    return NextResponse.json({ results: hits });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
