import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { CONDITION_VALUE_MULT, LOCAL_USER_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.condition, pc.usd, pc.usd_foil FROM owned_cards o
       LEFT JOIN prices_current pc ON pc.scryfall_id = o.scryfall_id
       WHERE o.user_id = ?`,
    )
    .all(LOCAL_USER_ID) as {
    condition: string;
    usd: number | null;
    usd_foil: number | null;
  }[];

  let total = 0;
  for (const r of rows) {
    const p = r.usd ?? r.usd_foil;
    if (p == null) continue;
    const m = CONDITION_VALUE_MULT[r.condition] ?? 1;
    total += p * m;
  }

  return NextResponse.json({ total_usd: total, copies: rows.length });
}
