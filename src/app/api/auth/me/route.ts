import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

export async function GET() {
  const u = await getOrCreateCurrentUser({ createIfMissing: true });
  return NextResponse.json({ ok: true, user: u });
}

