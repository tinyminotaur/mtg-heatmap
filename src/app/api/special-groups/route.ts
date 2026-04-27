import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`SELECT slug, name FROM special_groups ORDER BY name`).all() as {
    slug: string;
    name: string;
  }[];
  return NextResponse.json(rows);
}
