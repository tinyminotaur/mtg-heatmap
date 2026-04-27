/**
 * Production build data:
 * - REMOTE_MTG_DB_URL: curl a prebuilt mtg.db (e.g. GitHub nightly release) — used on Vercel for full data.
 * - VERCEL=1 and no remote: run demo seed so `data/mtg.db` exists for output tracing.
 * Local: neither → skip (keep your existing data/ or empty build).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dataDir = path.join(process.cwd(), "data");
const dbFile = path.join(dataDir, "mtg.db");
const remote = (process.env.REMOTE_MTG_DB_URL ?? "").trim();

if (remote) {
  fs.mkdirSync(dataDir, { recursive: true });
  const curl = spawnSync(
    "curl",
    ["-fL", "--retry", "3", "--retry-delay", "2", "-o", dbFile, remote],
    { stdio: "inherit" },
  );
  if (curl.status !== 0) process.exit(curl.status ?? 1);
  if (!fs.existsSync(dbFile) || fs.statSync(dbFile).size < 4096) {
    console.error("[run-build] Downloaded mtg.db missing or too small");
    process.exit(1);
  }
} else if (process.env.VERCEL === "1") {
  const r = spawnSync("pnpm", ["run", "db:seed"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const r2 = spawnSync("pnpm", ["exec", "next", "build"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(r2.status ?? 0);
