import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { hashPasswordScrypt } from "@/lib/password-scrypt";
import { upgradeGuestToPasswordAccount } from "@/lib/userdb";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { handle?: string; password?: string } | null;
  const handle = (body?.handle ?? "").trim();
  const password = body?.password ?? "";
  if (handle.length < 2 || handle.length > 32) {
    return NextResponse.json({ ok: false, error: "handle" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
    return NextResponse.json({ ok: false, error: "handle_chars" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: "password" }, { status: 400 });
  }

  const cur = await getOrCreateCurrentUser({ createIfMissing: true });
  if (!cur) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const passwordScrypt = hashPasswordScrypt(password);
  const user = await upgradeGuestToPasswordAccount({ userId: cur.id, handle, passwordScrypt });
  return NextResponse.json({ ok: true, user });
}

