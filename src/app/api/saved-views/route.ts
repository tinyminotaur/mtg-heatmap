import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";
import { requireUserId } from "@/lib/require-user";
import { createSavedView, listSavedViews, userDbEnabled } from "@/lib/userdb";

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
  const userId = await requireUserId();
  if (userDbEnabled()) {
    const rows = await listSavedViews(userId);
    return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name, query: r.filter_state, created_at: r.created_at })));
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, filter_state AS query, created_at
       FROM saved_views
       WHERE user_id = ?
       ORDER BY created_at DESC, name COLLATE NOCASE ASC`,
    )
    .all(userId) as SavedViewDTO[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string | null; query?: string };
    const name = typeof body.name === "string" ? body.name.trim() : null;
    const query = typeof body.query === "string" ? body.query : "";
    const canonical = canonicalizeQuery(query);

    const id = crypto.randomUUID();
    const userId = await requireUserId();
    if (userDbEnabled()) {
      await createSavedView({ userId, id, name, filter_state: canonical });
      return NextResponse.json({ id, name, query: canonical }, { status: 201 });
    }
    const db = getDb();
    db.prepare(
      `INSERT INTO saved_views (id, user_id, name, filter_state, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(id, userId, name, canonical);

    return NextResponse.json({ id, name, query: canonical }, { status: 201 });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "create_failed", message }, { status: 500 });
  }
}

