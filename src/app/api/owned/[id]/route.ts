import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/require-user";
import { deleteOwned } from "@/lib/userdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await requireUserId();
  await deleteOwned({ userId, id });
  return NextResponse.json({ ok: true });
}
