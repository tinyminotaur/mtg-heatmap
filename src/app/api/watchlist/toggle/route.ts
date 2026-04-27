import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { scryfall_id?: string };
    const sid = body.scryfall_id;
    if (!sid) return NextResponse.json({ error: "missing_scryfall_id" }, { status: 400 });
    const db = getDb();
    const userId = LOCAL_USER_ID;
    const existing = db
      .prepare(`SELECT id FROM watchlist WHERE user_id = ? AND scryfall_id = ?`)
      .get(userId, sid) as { id: string } | undefined;
    if (existing) {
      db.prepare(`DELETE FROM watchlist WHERE id = ?`).run(existing.id);
      return NextResponse.json({ scryfall_id: sid, watchlisted: false });
    }
    const priceRow = db
      .prepare(`SELECT usd, usd_foil FROM prices_current WHERE scryfall_id = ?`)
      .get(sid) as { usd: number | null; usd_foil: number | null } | undefined;
    const addedAt = priceRow?.usd ?? priceRow?.usd_foil ?? null;
    db.prepare(
      `INSERT INTO watchlist (id, user_id, scryfall_id, added_at_price, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(randomUUID(), userId, sid, addedAt);
    return NextResponse.json({ scryfall_id: sid, watchlisted: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "toggle_failed" }, { status: 500 });
  }
}
