import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { requireUserId } from "@/lib/require-user";
import { addOwnedCopy, ownedQtyForScryfall, removeOwnedCopy, userDbEnabled } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST { scryfall_id, action?: "add" | "remove" } — default add one NM copy; remove drops one row */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { scryfall_id?: string; action?: string };
    const sid = body.scryfall_id;
    if (!sid) return NextResponse.json({ error: "missing_scryfall_id" }, { status: 400 });
    const userId = await requireUserId();

    if (!userDbEnabled()) {
      const db = getDb();
      if (body.action === "remove") {
        const row = db
          .prepare(`SELECT id FROM owned_cards WHERE user_id = ? AND scryfall_id = ? ORDER BY created_at DESC LIMIT 1`)
          .get(userId, sid) as { id: string } | undefined;
        if (row) db.prepare(`DELETE FROM owned_cards WHERE id = ?`).run(row.id);
      } else {
        db.prepare(
          `INSERT INTO owned_cards (id, user_id, scryfall_id, condition, is_foil, created_at)
           VALUES (?, ?, ?, 'NM', 0, datetime('now'))`,
        ).run(randomUUID(), userId, sid);
      }
      const qty = (
        db.prepare(`SELECT COUNT(*) AS n FROM owned_cards WHERE user_id = ? AND scryfall_id = ?`).get(userId, sid) as {
          n: number;
        }
      ).n;
      return NextResponse.json({ scryfall_id: sid, quantity: qty });
    }

    if (body.action === "remove") {
      await removeOwnedCopy({ userId, scryfallId: sid });
    } else {
      await addOwnedCopy({ userId, id: randomUUID(), scryfallId: sid });
    }

    const qty = await ownedQtyForScryfall({ userId, scryfallId: sid });

    return NextResponse.json({ scryfall_id: sid, quantity: qty });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "toggle_failed" }, { status: 500 });
  }
}
