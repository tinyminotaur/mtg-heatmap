import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { oracle_id?: string };
    const oid = body.oracle_id;
    if (!oid) return NextResponse.json({ error: "missing_oracle_id" }, { status: 400 });
    const db = getDb();
    const userId = LOCAL_USER_ID;
    const exists = db
      .prepare(`SELECT 1 FROM pinned WHERE user_id = ? AND oracle_id = ?`)
      .get(userId, oid);
    if (exists) {
      db.prepare(`DELETE FROM pinned WHERE user_id = ? AND oracle_id = ?`).run(userId, oid);
      return NextResponse.json({ oracle_id: oid, pinned: false });
    }
    db.prepare(`INSERT INTO pinned (user_id, oracle_id) VALUES (?, ?)`).run(userId, oid);
    return NextResponse.json({ oracle_id: oid, pinned: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "toggle_failed" }, { status: 500 });
  }
}
