import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUserId } from "@/lib/require-user";
import { listOwnedScryfallIds, listWatchlistScryfallIds, userDbEnabled } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const userId = await requireUserId();
  const rows = db
    .prepare(
      `SELECT p.scryfall_id, p.set_code, p.rarity, p.released_at, p.collector_number,
              s.name AS set_name, s.release_date AS set_release
       FROM printings p
       JOIN sets s ON s.code = p.set_code
       WHERE p.oracle_id = ?
       ORDER BY COALESCE(p.released_at, s.release_date, '') ASC, LOWER(s.name) ASC
       LIMIT 350`,
    )
    .all(oracleId) as {
    scryfall_id: string;
    set_code: string;
    rarity: string | null;
    released_at: string | null;
    collector_number: string | null;
    set_name: string;
    set_release: string | null;
  }[];

  let ownedCount = new Map<string, number>();
  let watchSet = new Set<string>();
  if (userDbEnabled()) {
    const [ownedSids, wlSids] = await Promise.all([
      listOwnedScryfallIds(userId),
      listWatchlistScryfallIds(userId),
    ]);
    for (const sid of ownedSids) ownedCount.set(sid, (ownedCount.get(sid) ?? 0) + 1);
    watchSet = new Set(wlSids);
  } else {
    // SQLite fallback.
    const ownedRows = db
      .prepare(`SELECT scryfall_id, COUNT(*) AS n FROM owned_cards WHERE user_id = ? GROUP BY scryfall_id`)
      .all(userId) as { scryfall_id: string; n: number }[];
    ownedCount = new Map(ownedRows.map((r) => [r.scryfall_id, r.n]));
    watchSet = new Set(
      (db.prepare(`SELECT scryfall_id FROM watchlist WHERE user_id = ?`).all(userId) as { scryfall_id: string }[]).map(
        (r) => r.scryfall_id,
      ),
    );
  }

  const printings: CardPrintingApiRow[] = rows.map((r) => ({
    scryfall_id: r.scryfall_id,
    set_code: r.set_code,
    set_name: r.set_name,
    rarity: r.rarity,
    released_at: r.released_at,
    collector_number: r.collector_number,
    set_release: r.set_release,
    owned_qty: ownedCount.get(r.scryfall_id) ?? 0,
    watchlisted: watchSet.has(r.scryfall_id),
  }));

  return NextResponse.json({ printings });
}
