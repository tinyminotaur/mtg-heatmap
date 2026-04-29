import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "mtg_session";
const DEFAULT_DAYS = 30;

function secretBytes(): Buffer {
  const raw = (process.env.AUTH_COOKIE_SECRET ?? "").trim();
  if (!raw) return Buffer.alloc(0);
  return Buffer.from(raw, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

export function signSessionToken(token: string): string | null {
  const sec = secretBytes();
  if (!sec.length) return null;
  const sig = crypto.createHmac("sha256", sec).update(token, "utf8").digest();
  return `${token}.${b64url(sig)}`;
}

export function verifySignedToken(raw: string): string | null {
  const sec = secretBytes();
  if (!sec.length) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const token = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  let sigBuf: Buffer;
  try {
    sigBuf = fromB64url(sig);
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", sec).update(token, "utf8").digest();
  if (sigBuf.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expected)) return null;
  return token;
}

export async function setSessionCookie(token: string, opts?: { days?: number }) {
  const signed = signSessionToken(token);
  if (!signed) return;
  const days = opts?.days ?? DEFAULT_DAYS;
  const jar = await cookies();
  jar.set(COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookieToken(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySignedToken(raw);
}

