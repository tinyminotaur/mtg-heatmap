import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getHeatmapData, parseFilters } from "@/lib/heatmap-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const f = parseFilters(req.nextUrl.searchParams);
    const data = getHeatmapData(db, f);
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    // Always return `message` so clients can show it; paths are generic (no secrets in this POC).
    return NextResponse.json({ error: "heatmap_failed", message }, { status: 500 });
  }
}
