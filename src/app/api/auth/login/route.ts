import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth-cookies";
import { verifyPasswordScrypt } from "@/lib/password-scrypt";
import { createSessionForUser, getUserByHandle } from "@/lib/userdb";

export const runtime = "nodejs";

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { handle?: string; password?: string } | null;
  const handle = (body?.handle ?? "").trim();
  const password = body?.password ?? "";
  if (!handle || !password) return NextResponse.json({ ok: false }, { status: 400 });

  const u = await getUserByHandle(handle);
  if (!u?.password_scrypt) return NextResponse.json({ ok: false }, { status: 401 });
  if (!verifyPasswordScrypt(password, u.password_scrypt)) return NextResponse.json({ ok: false }, { status: 401 });

  const token = crypto.randomBytes(32).toString("hex");
  await createSessionForUser({ userId: u.id, token, expiresAtIso: addDaysIso(30) });
  await setSessionCookie(token, { days: 30 });
  return NextResponse.json({ ok: true, user: { id: u.id, handle: u.handle, is_guest: u.is_guest } });
}

