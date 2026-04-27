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
const logPath = path.join(root, ".cursor/debug-e53e3b.log");
const endpoint =
  "http://127.0.0.1:7544/ingest/d3bac746-7f30-4189-a378-b3d32ca27dd5";

const text = fs.readFileSync(file, "utf8");
const lines = text.split("\n");
const line466 = lines[465] ?? "";
const hasLegacyColRows = text.includes("const colRows = db.prepare(colSql)");
const hasLegacySortColumnMeta = /\bconst\s+columns\s*=\s*sortColumnMeta\s*\(/.test(text);
const constColumnsDecls = (text.match(/\bconst\s+columns\b/g) ?? []).length;
const getHeatmapCount = (text.match(/\bexport\s+function\s+getHeatmapData\b/g) ?? []).length;

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
    hasResolveImport: text.includes("heatmap-column-resolve"),
    hasHeatmapColumns: text.includes("heatmapColumns"),
    gitHeadHint: "If legacy flags true, disk file is not at commit 4753fa9+; git pull or remove duplicate block.",
  },
  timestamp: Date.now(),
};

// #region agent log
fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`);
fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e53e3b" },
  body: JSON.stringify(payload),
}).catch(() => {});
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
