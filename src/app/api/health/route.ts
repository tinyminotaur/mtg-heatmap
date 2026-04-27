import { NextResponse } from "next/server";
import { getDb, getDbFilePath } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lightweight DB check — use when `/api/heatmap` returns 500 to see the real failure. */
export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
    return NextResponse.json({
      ok: true,
      sqlite: row.v,
      dbPath: getDbFilePath(),
      cwd: process.cwd(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
