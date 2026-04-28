/**
 * Production build data:
 * - REMOTE_MTG_DB_URL: curl a prebuilt mtg.db (e.g. GitHub nightly release) — used on Vercel for full data.
 * - VERCEL=1 and no remote: run demo seed so `data/mtg.db` exists for output tracing.
 * - VERCEL/CI + remote download fails (502, etc.): fall back to demo seed so deploys do not hard-fail on transient CDN outages.
 *   Set REMOTE_MTG_DB_STRICT=1 to disable fallback and fail the build if the download fails.
 * Local: neither → skip (keep your existing data/ or empty build).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dataDir = path.join(process.cwd(), "data");
const dbFile = path.join(dataDir, "mtg.db");
const remote = (process.env.REMOTE_MTG_DB_URL ?? "").trim();

const vercelOrCi =
  process.env.VERCEL === "1" ||
  process.env.CI === "true" ||
  process.env.CI === "1";
const strictRemote =
  (process.env.REMOTE_MTG_DB_STRICT ?? "").trim() === "1";

function runDbSeed() {
  const r = spawnSync("pnpm", ["run", "db:seed"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (remote) {
  fs.mkdirSync(dataDir, { recursive: true });
  const curl = spawnSync(
    "curl",
    [
      "-fL",
      "--retry",
      "5",
      "--retry-delay",
      "3",
      "--retry-max-time",
      "120",
      "-o",
      dbFile,
      remote,
    ],
    { stdio: "inherit" },
  );
  const ok =
    curl.status === 0 &&
    fs.existsSync(dbFile) &&
    fs.statSync(dbFile).size >= 4096;

  if (!ok) {
    try {
      fs.unlinkSync(dbFile);
    } catch {
      /* ignore */
    }
    if (vercelOrCi && !strictRemote) {
      console.warn(
        "[run-build] REMOTE_MTG_DB_URL download failed or file too small; falling back to pnpm run db:seed (transient CDN/build mirror outages).",
      );
      runDbSeed();
    } else {
      if (curl.status !== 0) process.exit(curl.status ?? 1);
      console.error("[run-build] Downloaded mtg.db missing or too small");
      process.exit(1);
    }
  }
} else if (process.env.VERCEL === "1") {
  runDbSeed();
}

const r2 = spawnSync("pnpm", ["exec", "next", "build"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(r2.status ?? 0);
