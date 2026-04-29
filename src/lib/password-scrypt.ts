import crypto from "node:crypto";

const KEYLEN = 64;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64url(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16);
  const N = 1 << 15; // 32768
  const r = 8;
  const p = 1;
  const dk = crypto.scryptSync(password, salt, KEYLEN, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${b64url(salt)}$${b64url(dk)}`;
}

export function verifyPasswordScrypt(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  if (parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let want: Buffer;
  try {
    salt = fromB64url(parts[4]!);
    want = fromB64url(parts[5]!);
  } catch {
    return false;
  }
  const got = crypto.scryptSync(password, salt, want.length, { N, r, p, maxmem: 128 * 1024 * 1024 });
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}

