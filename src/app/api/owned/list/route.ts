import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.id, o.scryfall_id, o.condition, o.is_foil, o.purchase_price, o.acquired_date, o.notes,
              c.name AS card_name, s.name AS set_name, s.code AS set_code,
              pc.usd, pc.usd_foil
       FROM owned_cards o
       JOIN printings p ON p.scryfall_id = o.scryfall_id
       JOIN cards c ON c.oracle_id = p.oracle_id
       JOIN sets s ON s.code = p.set_code
       LEFT JOIN prices_current pc ON pc.scryfall_id = o.scryfall_id
       WHERE o.user_id = ?
       ORDER BY c.name, s.release_date`,
    )
    .all(LOCAL_USER_ID) as Record<string, unknown>[];
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      condition?: string;
      purchase_price?: number | null;
      notes?: string | null;
      acquired_date?: string | null;
    };
    if (!body.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
    const db = getDb();
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (body.condition) {
      fields.push("condition = ?");
      vals.push(body.condition);
    }
    if (body.purchase_price !== undefined) {
      fields.push("purchase_price = ?");
      vals.push(body.purchase_price);
    }
    if (body.notes !== undefined) {
      fields.push("notes = ?");
      vals.push(body.notes);
    }
    if (body.acquired_date !== undefined) {
      fields.push("acquired_date = ?");
      vals.push(body.acquired_date);
    }
    if (!fields.length) return NextResponse.json({ ok: true });
    vals.push(body.id, LOCAL_USER_ID);
    db.prepare(
      `UPDATE owned_cards SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
    ).run(...vals);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
