import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUserId } from "@/lib/require-user";
import { listWatchlist } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  const wl = await listWatchlist(userId);
  const db = getDb();
  const sids = [...new Set(wl.map((w) => w.scryfall_id))];
  const meta =
    sids.length > 0
      ? (db
          .prepare(
            `SELECT p.scryfall_id, c.name AS card_name, s.name AS set_name, s.code AS set_code,
                    pc.usd, pc.usd_foil
             FROM printings p
             JOIN cards c ON c.oracle_id = p.oracle_id
             JOIN sets s ON s.code = p.set_code
             LEFT JOIN prices_current pc ON pc.scryfall_id = p.scryfall_id
             WHERE p.scryfall_id IN (${sids.map(() => "?").join(",")})`,
          )
          .all(...sids) as {
          scryfall_id: string;
          card_name: string;
          set_name: string;
          set_code: string;
          usd: number | null;
          usd_foil: number | null;
        }[])
      : [];
  const bySid = new Map(meta.map((m) => [m.scryfall_id, m]));
  const rows = wl.map((w) => ({ ...w, ...(bySid.get(w.scryfall_id) ?? {}) }));
  rows.sort((a, b) => String(a.card_name ?? "").localeCompare(String(b.card_name ?? "")));
  return NextResponse.json(rows);
}
