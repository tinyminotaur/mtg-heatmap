/**
 * Vercel sets VERCEL=1 during `pnpm run build`. Seed a demo DB first so `data/mtg.db`
 * exists for output file tracing; local builds skip seed so your real DB is untouched.
 */
import { spawnSync } from "node:child_process";

if (process.env.VERCEL === "1") {
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
