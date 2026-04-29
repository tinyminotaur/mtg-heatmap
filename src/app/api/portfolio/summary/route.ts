import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CONDITION_VALUE_MULT, LOCAL_USER_ID } from "@/lib/constants";
import type { PortfolioSummary } from "@/lib/portfolio-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const userId = LOCAL_USER_ID;

  const rows = db
    .prepare(
      `SELECT o.condition, pc.usd, pc.usd_foil FROM owned_cards o
       LEFT JOIN prices_current pc ON pc.scryfall_id = o.scryfall_id
       WHERE o.user_id = ?`,
    )
    .all(userId) as {
      condition: string;
      usd: number | null;
      usd_foil: number | null;
    }[];

  let total_usd = 0;
  for (const r of rows) {
    const p = r.usd ?? r.usd_foil;
    if (p == null) continue;
    const m = CONDITION_VALUE_MULT[r.condition] ?? 1;
    total_usd += p * m;
  }

  const uniqueRow = db
    .prepare(
      `SELECT COUNT(DISTINCT p.oracle_id) AS n
       FROM owned_cards o
       INNER JOIN printings p ON p.scryfall_id = o.scryfall_id
       WHERE o.user_id = ?`,
    )
    .get(userId) as { n: number };

  const wlRows = db
    .prepare(
      `SELECT pc.usd, pc.usd_foil FROM watchlist w
       LEFT JOIN prices_current pc ON pc.scryfall_id = w.scryfall_id
       WHERE w.user_id = ?`,
    )
    .all(userId) as { usd: number | null; usd_foil: number | null }[];

  let watchlist_total_usd = 0;
  for (const r of wlRows) {
    const p = r.usd ?? r.usd_foil;
    if (p != null && p > 0) watchlist_total_usd += p;
  }

  const pinnedRow = db
    .prepare(`SELECT COUNT(*) AS n FROM pinned WHERE user_id = ?`)
    .get(userId) as { n: number };

  const out: PortfolioSummary = {
    total_usd,
    copies: rows.length,
    unique_oracles: uniqueRow.n ?? 0,
    watchlist_entries: wlRows.length,
    watchlist_total_usd,
    pinned_oracles: pinnedRow.n ?? 0,
  };

  return NextResponse.json(out);
}
