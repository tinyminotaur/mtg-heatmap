import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SavedViewDTO = {
  id: string;
  name: string | null;
  query: string;
  created_at: string | null;
};

function canonicalizeQuery(raw: string): string {
  const sp = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const f = parseHeatmapUrlSearchParams(sp);
  const out = serializeHeatmapUrlParams(f);
  return out.toString();
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, filter_state AS query, created_at
       FROM saved_views
       WHERE user_id = ?
       ORDER BY created_at DESC, name COLLATE NOCASE ASC`,
    )
    .all(LOCAL_USER_ID) as SavedViewDTO[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string | null; query?: string };
    const name = typeof body.name === "string" ? body.name.trim() : null;
    const query = typeof body.query === "string" ? body.query : "";
    const canonical = canonicalizeQuery(query);

    const id = crypto.randomUUID();
    const db = getDb();
    db.prepare(
      `INSERT INTO saved_views (id, user_id, name, filter_state, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(id, LOCAL_USER_ID, name, canonical);

    return NextResponse.json({ id, name, query: canonical }, { status: 201 });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "create_failed", message }, { status: 500 });
  }
}

