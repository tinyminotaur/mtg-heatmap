import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { alert_above?: number | null; alert_below?: number | null };
  const db = getDb();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (body.alert_above !== undefined) {
    fields.push("alert_above = ?");
    vals.push(body.alert_above);
  }
  if (body.alert_below !== undefined) {
    fields.push("alert_below = ?");
    vals.push(body.alert_below);
  }
  if (!fields.length) return NextResponse.json({ ok: true });
  vals.push(id, LOCAL_USER_ID);
  db.prepare(
    `UPDATE watchlist SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...vals);
  return NextResponse.json({ ok: true });
}
