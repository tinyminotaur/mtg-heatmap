import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT w.id, w.scryfall_id, w.added_at_price, w.alert_above, w.alert_below,
              c.name AS card_name, s.name AS set_name, s.code AS set_code,
              pc.usd, pc.usd_foil
       FROM watchlist w
       JOIN printings p ON p.scryfall_id = w.scryfall_id
       JOIN cards c ON c.oracle_id = p.oracle_id
       JOIN sets s ON s.code = p.set_code
       LEFT JOIN prices_current pc ON pc.scryfall_id = w.scryfall_id
       WHERE w.user_id = ?
       ORDER BY c.name`,
    )
    .all(LOCAL_USER_ID) as Record<string, unknown>[];
  return NextResponse.json(rows);
}
