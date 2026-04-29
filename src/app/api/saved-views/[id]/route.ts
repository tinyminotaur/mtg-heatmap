import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";
import { requireUserId } from "@/lib/require-user";
import { deleteSavedView, getSavedView, updateSavedView, userDbEnabled } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function canonicalizeQuery(raw: string): string {
  const sp = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const f = parseHeatmapUrlSearchParams(sp);
  const out = serializeHeatmapUrlParams(f);
  return out.toString();
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  if (userDbEnabled()) {
    const row = await getSavedView({ userId, id });
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ id: row.id, name: row.name, query: row.filter_state, created_at: row.created_at });
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, name, filter_state AS query, created_at
       FROM saved_views
       WHERE user_id = ? AND id = ?`,
    )
    .get(userId, id) as
    | { id: string; name: string | null; query: string; created_at: string | null }
    | undefined;
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { name?: string | null; query?: string };
    const name = typeof body.name === "string" ? body.name.trim() : null;
    const query = typeof body.query === "string" ? canonicalizeQuery(body.query) : null;

    const fields: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) {
      fields.push("name = ?");
      vals.push(name);
    }
    if (body.query !== undefined) {
      fields.push("filter_state = ?");
      vals.push(query ?? "");
    }
    if (!fields.length) return NextResponse.json({ ok: true });

    const userId = await requireUserId();
    if (userDbEnabled()) {
      const ok = await updateSavedView({ userId, id, name: body.name !== undefined ? name : undefined, filter_state: body.query !== undefined ? (query ?? "") : undefined });
      if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    vals.push(userId, id);
    const db = getDb();
    const res = db.prepare(`UPDATE saved_views SET ${fields.join(", ")} WHERE user_id = ? AND id = ?`).run(...vals);
    if (res.changes === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "update_failed", message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  if (userDbEnabled()) {
    const ok = await deleteSavedView({ userId, id });
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  const db = getDb();
  const res = db.prepare(`DELETE FROM saved_views WHERE user_id = ? AND id = ?`).run(userId, id);
  if (res.changes === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

