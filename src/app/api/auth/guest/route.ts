import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth-cookies";
import { createGuestUserAndSession } from "@/lib/userdb";
import { ensureUserDbSchema } from "@/lib/userdb";

export const runtime = "nodejs";

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export async function POST() {
  await ensureUserDbSchema();
  const userId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAtIso = addDaysIso(30);
  await createGuestUserAndSession({ userId, token, expiresAtIso });
  await setSessionCookie(token, { days: 30 });
  return NextResponse.json({ ok: true, user: { id: userId, handle: null, is_guest: true } });
}

