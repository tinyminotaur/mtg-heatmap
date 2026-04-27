/**
 * Debug: detect legacy duplicate column block in heatmap-query.ts before Next parses it.
 * Writes NDJSON to .cursor/debug-e53e3b.log (session e53e3b).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const file = path.join(root, "src/lib/heatmap-query.ts");
const resolveCol = path.join(root, "src/lib/heatmap-column-resolve.ts");
const logPath = path.join(root, ".cursor/debug-e53e3b.log");
const endpoint =
  "http://127.0.0.1:7544/ingest/d3bac746-7f30-4189-a378-b3d32ca27dd5";
/** Cursor debug log + local ingest only; Vercel/CI has no `.cursor/` and must not call localhost. */
const debugLogEnabled =
  process.env.VERCEL !== "1" && process.env.CI !== "true" && process.env.CI !== "1";

const text = fs.readFileSync(file, "utf8");
const lines = text.split("\n");
const line466 = lines[465] ?? "";
const hasLegacyColRows = text.includes("const colRows = db.prepare(colSql)");
const hasLegacySortColumnMeta = /\bconst\s+columns\s*=\s*sortColumnMeta\s*\(/.test(text);
const constColumnsDecls = (text.match(/\bconst\s+columns\b/g) ?? []).length;
const getHeatmapCount = (text.match(/\bexport\s+function\s+getHeatmapData\b/g) ?? []).length;

let resolveColText = "";
let resolveColExists = false;
let resolveColBytes = 0;
let resolveColHasExport = false;
try {
  resolveColExists = fs.existsSync(resolveCol);
  if (resolveColExists) {
    resolveColText = fs.readFileSync(resolveCol, "utf8");
    resolveColBytes = Buffer.byteLength(resolveColText, "utf8");
    resolveColHasExport = /\bexport\s+function\s+resolveHeatmapColumns\b/.test(resolveColText);
  }
} catch (e) {
  resolveColText = String(e);
}

const usesAliasResolveImport = /from\s+["']@\/lib\/heatmap-column-resolve["']/.test(text);

const payload = {
  sessionId: "e53e3b",
  hypothesisId: "H_scan",
  location: "scripts/debug-heatmap-query-scan.mjs",
  message: "heatmap-query.ts static scan (prebuild)",
  data: {
    file,
    lineCount: lines.length,
    line466Preview: line466.slice(0, 140),
    hasLegacyColRows,
    hasLegacySortColumnMeta,
    constColumnsDecls,
    getHeatmapCount,
    hasResolveImport:
      text.includes("heatmap-column-resolve") && /\bresolveHeatmapColumns\b/.test(text),
    hasInlineResolveHeatmapColumns: /\bexport\s+function\s+resolveHeatmapColumns\b/.test(text),
    hasHeatmapColumns: text.includes("heatmapColumns"),
    resolveColPath: resolveCol,
    resolveColExists,
    resolveColBytes,
    resolveColHasExport,
    resolveColImportLine: text.split("\n").find((l) => l.includes("heatmap-column-resolve")) ?? null,
    usesAliasResolveImport,
    gitHeadHint: "If legacy flags true, disk file is not at commit 4753fa9+; git pull or remove duplicate block.",
  },
  timestamp: Date.now(),
};

// #region agent log
if (debugLogEnabled) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore log failures */
  }
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e53e3b" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
// #endregion

const bad =
  hasLegacyColRows ||
  hasLegacySortColumnMeta ||
  constColumnsDecls > 1 ||
  getHeatmapCount > 1;

if (bad) {
  console.error(
    "\n[debug-heatmap-query-scan] src/lib/heatmap-query.ts still matches the LEGACY duplicate-column pattern.\n" +
      "This causes Turbopack: the name `columns` is defined multiple times.\n" +
      "Fix: ensure you are on latest main (git pull), discard local edits to that file, or remove the block with colSql/colRows/const columns=sortColumnMeta inside getHeatmapData.\n" +
      `Scan data: ${JSON.stringify(payload.data)}\n`,
  );
  process.exit(1);
}

const importsResolveModule =
  /\bresolveHeatmapColumns\b/.test(text) &&
  /from\s+["'](?:@\/lib\/|\.\/)heatmap-column-resolve["']/.test(text);
const brokenSplit =
  importsResolveModule &&
  (!resolveColExists || !resolveColHasExport || resolveColBytes < 400);
if (usesAliasResolveImport) {
  console.error(
    "\n[debug-heatmap-query-scan] heatmap-query.ts imports resolveHeatmapColumns from `@/lib/heatmap-column-resolve`.\n" +
      "Next.js 16 Turbopack can report that module as having no exports. Use a relative import instead:\n" +
      '  import { resolveHeatmapColumns } from "./heatmap-column-resolve";\n' +
      "See current main / AGENTS.md.\n",
  );
  process.exit(1);
}
if (brokenSplit) {
  console.error(
    "\n[debug-heatmap-query-scan] heatmap-query imports resolveHeatmapColumns from heatmap-column-resolve,\n" +
      "but that file is missing, too small, or has no `export function resolveHeatmapColumns`.\n" +
      "This matches Turbopack: Export resolveHeatmapColumns doesn't exist in target module.\n" +
      "Fix: restore src/lib/heatmap-column-resolve.ts from the repo (git checkout -- src/lib/heatmap-column-resolve.ts) or pull latest.\n" +
      `Scan data: ${JSON.stringify(payload.data)}\n`,
  );
  process.exit(1);
}
