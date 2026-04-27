import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getHeatmapData, parseFilters } from "@/lib/heatmap-query";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const f = parseFilters(req.nextUrl.searchParams);
    const data = getHeatmapData(db, f);
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "heatmap_failed" }, { status: 500 });
  }
}
