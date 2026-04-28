import { NextResponse } from "next/server";
import { getDb, getDbFilePath } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lightweight DB check — use when `/api/heatmap` returns 500 to see the real failure. */
export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
    const counts = {
      sets: (db.prepare("SELECT COUNT(*) AS n FROM sets").get() as { n: number }).n,
      cards: (db.prepare("SELECT COUNT(*) AS n FROM cards").get() as { n: number }).n,
      printings: (db.prepare("SELECT COUNT(*) AS n FROM printings").get() as { n: number }).n,
      prices: (db.prepare("SELECT COUNT(*) AS n FROM prices_current").get() as { n: number }).n,
    };
    const bundled = path.join(process.cwd(), "data", "mtg.db");
    return NextResponse.json({
      ok: true,
      sqlite: row.v,
      dbPath: getDbFilePath(),
      cwd: process.cwd(),
      counts,
      vercel: process.env.VERCEL === "1",
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      remoteDbUrlSet: Boolean((process.env.REMOTE_MTG_DB_URL ?? "").trim()),
      bundledDb: {
        path: bundled,
        exists: fs.existsSync(bundled),
        size: fs.existsSync(bundled) ? fs.statSync(bundled).size : null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
