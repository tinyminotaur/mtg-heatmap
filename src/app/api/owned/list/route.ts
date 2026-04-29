import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUserId } from "@/lib/require-user";
import { deleteOwned, listOwned, updateOwned } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  const owned = await listOwned(userId);
  const db = getDb();
  const sids = [...new Set(owned.map((o) => o.scryfall_id))];
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
  const rows = owned.map((o) => ({ ...o, ...(bySid.get(o.scryfall_id) ?? {}) }));
  rows.sort((a, b) => String(a.card_name ?? "").localeCompare(String(b.card_name ?? "")) || String(a.set_code ?? "").localeCompare(String(b.set_code ?? "")));
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as {
      id?: string;
      condition?: string;
      purchase_price?: number | null;
      notes?: string | null;
      acquired_date?: string | null;
    };
    if (!body.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
    await updateOwned({
      userId,
      id: body.id,
      condition: body.condition,
      purchase_price: body.purchase_price,
      notes: body.notes,
      acquired_date: body.acquired_date,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
