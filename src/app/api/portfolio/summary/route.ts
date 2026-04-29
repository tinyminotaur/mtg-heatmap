import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CONDITION_VALUE_MULT } from "@/lib/constants";
import type { PortfolioSummary } from "@/lib/portfolio-summary";
import { requireUserId } from "@/lib/require-user";
import { listOwned, listWatchlist, userDbEnabled, getPinnedOracleIds } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const userId = await requireUserId();

  let ownedPriceRows: { condition: string; usd: number | null; usd_foil: number | null }[] = [];
  let ownedSids: string[] = [];
  if (userDbEnabled()) {
    const owned = await listOwned(userId);
    ownedSids = owned.map((o) => o.scryfall_id);
    const uniq = [...new Set(ownedSids)];
    const prices =
      uniq.length > 0
        ? (db
            .prepare(
              `SELECT scryfall_id, usd, usd_foil FROM prices_current WHERE scryfall_id IN (${uniq.map(() => "?").join(",")})`,
            )
            .all(...uniq) as { scryfall_id: string; usd: number | null; usd_foil: number | null }[])
        : [];
    const bySid = new Map(prices.map((p) => [p.scryfall_id, p]));
    ownedPriceRows = owned.map((o) => ({
      condition: o.condition ?? "NM",
      ...(bySid.get(o.scryfall_id) ?? { usd: null, usd_foil: null }),
    }));
  } else {
    const rows = db
      .prepare(
        `SELECT o.scryfall_id, o.condition, pc.usd, pc.usd_foil FROM owned_cards o
         LEFT JOIN prices_current pc ON pc.scryfall_id = o.scryfall_id
         WHERE o.user_id = ?`,
      )
      .all(userId) as { scryfall_id: string; condition: string; usd: number | null; usd_foil: number | null }[];
    ownedSids = rows.map((r) => r.scryfall_id);
    ownedPriceRows = rows;
  }

  let total_usd = 0;
  for (const r of ownedPriceRows) {
    const p = r.usd ?? r.usd_foil;
    if (p == null) continue;
    const m = CONDITION_VALUE_MULT[r.condition] ?? 1;
    total_usd += p * m;
  }

  const uniqOwned = [...new Set(ownedSids)];
  const uniqueOracles =
    uniqOwned.length > 0
      ? ((db
          .prepare(
            `SELECT COUNT(DISTINCT oracle_id) AS n FROM printings WHERE scryfall_id IN (${uniqOwned.map(() => "?").join(",")})`,
          )
          .get(...uniqOwned) as { n: number })?.n ?? 0)
      : 0;

  let wlSids: string[] = [];
  let wlPriceRows: { usd: number | null; usd_foil: number | null }[] = [];
  if (userDbEnabled()) {
    const wl = await listWatchlist(userId);
    wlSids = wl.map((w) => w.scryfall_id);
  } else {
    wlSids = (db
      .prepare(`SELECT scryfall_id FROM watchlist WHERE user_id = ?`)
      .all(userId) as { scryfall_id: string }[]).map((r) => r.scryfall_id);
  }
  const uniqWl = [...new Set(wlSids)];
  if (uniqWl.length) {
    const prices = db
      .prepare(`SELECT usd, usd_foil FROM prices_current WHERE scryfall_id IN (${uniqWl.map(() => "?").join(",")})`)
      .all(...uniqWl) as { usd: number | null; usd_foil: number | null }[];
    wlPriceRows = prices;
  }

  let watchlist_total_usd = 0;
  for (const r of wlPriceRows) {
    const p = r.usd ?? r.usd_foil;
    if (p != null && p > 0) watchlist_total_usd += p;
  }

  const pinnedRow = userDbEnabled()
    ? { n: (await getPinnedOracleIds(userId)).length }
    : (db.prepare(`SELECT COUNT(*) AS n FROM pinned WHERE user_id = ?`).get(userId) as { n: number });

  const out: PortfolioSummary = {
    total_usd,
    copies: ownedPriceRows.length,
    unique_oracles: uniqueOracles,
    watchlist_entries: wlSids.length,
    watchlist_total_usd,
    pinned_oracles: pinnedRow.n ?? 0,
  };

  return NextResponse.json(out);
}
