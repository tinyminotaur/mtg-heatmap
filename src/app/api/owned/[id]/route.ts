import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getDb();
  db.prepare(`DELETE FROM owned_cards WHERE id = ? AND user_id = ?`).run(id, LOCAL_USER_ID);
  return NextResponse.json({ ok: true });
}
