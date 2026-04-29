import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUserId } from "@/lib/require-user";
import { togglePinnedOracle, userDbEnabled } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { oracle_id?: string };
    const oid = body.oracle_id;
    if (!oid) return NextResponse.json({ error: "missing_oracle_id" }, { status: 400 });
    const userId = await requireUserId();
    if (!userDbEnabled()) {
      const db = getDb();
      const exists = db.prepare(`SELECT 1 FROM pinned WHERE user_id = ? AND oracle_id = ?`).get(userId, oid);
      if (exists) {
        db.prepare(`DELETE FROM pinned WHERE user_id = ? AND oracle_id = ?`).run(userId, oid);
        return NextResponse.json({ oracle_id: oid, pinned: false });
      }
      db.prepare(`INSERT INTO pinned (user_id, oracle_id) VALUES (?, ?)`).run(userId, oid);
      return NextResponse.json({ oracle_id: oid, pinned: true });
    }
    const pinned = await togglePinnedOracle({ userId, oracleId: oid });
    return NextResponse.json({ oracle_id: oid, pinned });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "toggle_failed" }, { status: 500 });
  }
}
