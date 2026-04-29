import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/require-user";
import { updateWatchlist } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { alert_above?: number | null; alert_below?: number | null };
  const userId = await requireUserId();
  await updateWatchlist({ userId, id, alert_above: body.alert_above, alert_below: body.alert_below });
  return NextResponse.json({ ok: true });
}
