import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StatusResponse = {
  ok: true;
  /** UTC timestamp from `prices_current.updated_at` (SQLite `datetime('now')`). */
  last_updated_utc: string | null;
  /** Refresh schedule (informational). */
  refresh_schedule: { kind: "daily"; hour_utc: number; minute_utc: number };
};

export async function GET() {
  const db = getDb();
  const row = db
    .prepare("SELECT MAX(updated_at) AS last_updated_utc FROM prices_current")
    .get() as { last_updated_utc: string | null };
  const out: StatusResponse = {
    ok: true,
    last_updated_utc: row.last_updated_utc,
    refresh_schedule: { kind: "daily", hour_utc: 9, minute_utc: 0 },
  };
  return NextResponse.json(out);
}

