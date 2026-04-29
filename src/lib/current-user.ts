import crypto from "node:crypto";
import { readSessionCookieToken, setSessionCookie } from "@/lib/auth-cookies";
import { createGuestUserAndSession, getUserBySessionToken, type AuthUser } from "@/lib/userdb";
import { userDbEnabled } from "@/lib/userdb";

export type CurrentUser = AuthUser;

const SESSION_DAYS = 30;

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Resolve user from signed cookie; optionally create a guest user/session. */
export async function getOrCreateCurrentUser(args?: { createIfMissing?: boolean }): Promise<CurrentUser | null> {
  if (!userDbEnabled()) return null;
  const token = await readSessionCookieToken();
  if (token) {
    const u = await getUserBySessionToken(token);
    if (u) return u;
  }
  if (args?.createIfMissing !== true) return null;

  const userId = crypto.randomUUID();
  const newToken = crypto.randomBytes(32).toString("hex");
  await createGuestUserAndSession({ userId, token: newToken, expiresAtIso: addDaysIso(SESSION_DAYS) });
  await setSessionCookie(newToken, { days: SESSION_DAYS });
  return { id: userId, handle: null, is_guest: true };
}

