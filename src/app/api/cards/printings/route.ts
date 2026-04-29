import { NextRequest, NextResponse } from "next/server";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export type CardPrintingApiRow = {
  scryfall_id: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  released_at: string | null;
  collector_number: string | null;
  set_release: string | null;
  owned_qty: number;
  watchlisted: boolean;
};

/** GET ?oracle_id= — all printings for an oracle with local owned qty / watchlist flags. */
export async function GET(req: NextRequest) {
  const oracleId = req.nextUrl.searchParams.get("oracle_id")?.trim() ?? "";
  if (!oracleId) return NextResponse.json({ error: "missing_oracle_id" }, { status: 400 });

  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM cards WHERE oracle_id = ?`).get(oracleId);
  if (!exists) return NextResponse.json({ printings: [] as CardPrintingApiRow[] });

  const userId = LOCAL_USER_ID;
  const rows = db
    .prepare(
      `SELECT p.scryfall_id, p.set_code, p.rarity, p.released_at, p.collector_number,
              s.name AS set_name, s.release_date AS set_release,
              (SELECT COUNT(*) FROM owned_cards o WHERE o.user_id = ? AND o.scryfall_id = p.scryfall_id) AS owned_qty,
              EXISTS(SELECT 1 FROM watchlist w WHERE w.user_id = ? AND w.scryfall_id = p.scryfall_id) AS watchlisted
       FROM printings p
       JOIN sets s ON s.code = p.set_code
       WHERE p.oracle_id = ?
       ORDER BY COALESCE(p.released_at, s.release_date, '') ASC, LOWER(s.name) ASC
       LIMIT 350`,
    )
    .all(userId, userId, oracleId) as {
    scryfall_id: string;
    set_code: string;
    rarity: string | null;
    released_at: string | null;
    collector_number: string | null;
    set_name: string;
    set_release: string | null;
    owned_qty: number;
    watchlisted: number;
  }[];

  const printings: CardPrintingApiRow[] = rows.map((r) => ({
    scryfall_id: r.scryfall_id,
    set_code: r.set_code,
    set_name: r.set_name,
    rarity: r.rarity,
    released_at: r.released_at,
    collector_number: r.collector_number,
    set_release: r.set_release,
    owned_qty: r.owned_qty,
    watchlisted: r.watchlisted === 1,
  }));

  return NextResponse.json({ printings });
}
