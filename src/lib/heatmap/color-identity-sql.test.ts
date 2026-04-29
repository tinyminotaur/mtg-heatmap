import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultHeatmapFilters } from "@/lib/filter-state";
import { openDbAt } from "@/lib/db";
import {
  SCRYFALL_MANA_EXCLUDE_COLORLESS_SYMBOL_PATTERNS,
  colorLaneWhereClause,
} from "@/lib/heatmap/color-identity-sql";
import { defaultColorOrFull } from "@/lib/heatmap/color-lanes";

describe("colorLaneWhereClause", () => {
  it("requires every colorAnd pip via mana-cost lane matching (e.g. R and G both present)", () => {
    const r = colorLaneWhereClause({
      ...defaultHeatmapFilters,
      colorNot: [],
      colorOr: ["W", "U", "B", "C"],
      colorAnd: ["R", "G"],
    });
    expect(r).not.toBeNull();
    expect(r!.sql).toContain("mana_cost");
    expect(r!.sql).not.toContain("instr(");
    expect(r!.params).toContain(String.raw`\{[^}]*R[^}]*\}`);
    expect(r!.params).toContain(String.raw`\{[^}]*G[^}]*\}`);
  });

  it("SQLite: colorAnd R+G excludes mono-R and allows pure RG (including dual lands)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-color-json-each-"));
    const dbPath = path.join(dir, "t.db");
    const db = openDbAt(dbPath);
    try {
      db.exec(`
        CREATE TABLE c (
          oracle_id TEXT PRIMARY KEY,
          color_identity TEXT,
          colors TEXT,
          mana_cost TEXT,
          type_line TEXT,
          oracle_text TEXT
        );
        INSERT INTO c VALUES ('mono-r', '["R"]', '["R"]', '{R}', 'Creature', '');
        INSERT INTO c VALUES ('mono-u', '["U"]', '["U"]', '{U}', 'Creature', '');
        INSERT INTO c VALUES ('rg', '["R","G"]', '["R","G"]', '{R}{G}', 'Creature', '');
        INSERT INTO c VALUES ('brg', '["B","R","G"]', '["B","R","G"]', '{B}{R}{G}', 'Creature', '');
        INSERT INTO c VALUES ('rg-dual-land', '["R","G"]', '[]', NULL, 'Land — Forest Mountain', '({T}: Add {R} or {G}.)');
      `);
      // UI shape when R+G are in Must have: Any-of holds the other pips.
      const clause = colorLaneWhereClause({
        ...defaultHeatmapFilters,
        colorNot: [],
        colorOr: ["W", "U", "B", "C"],
        colorAnd: ["R", "G"],
      });
      expect(clause).not.toBeNull();
      const rows = db
        .prepare(`SELECT oracle_id FROM c WHERE ${clause!.sql}`)
        .all(...clause!.params) as { oracle_id: string }[];
      expect(rows.map((x) => x.oracle_id).sort()).toEqual(["brg", "rg", "rg-dual-land"]);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("colorLaneWhereClause (exclude C)", () => {
  it("excludes {C} mana symbols when C is in Not", () => {
    const r = colorLaneWhereClause({
      ...defaultHeatmapFilters,
      colorNot: ["C"],
      colorOr: defaultColorOrFull(),
      colorAnd: [],
    });
    expect(r).not.toBeNull();
    expect(r!.sql).toContain("mana_cost");
    expect(r!.sql).toContain("REGEXP");
    // Ensure we bind at least one `{...C...}` symbol pattern.
    expect(r!.params).toEqual(expect.arrayContaining([String.raw`\{[^}]*C[^}]*\}`]));
  });

  it("REGEXP matches Scryfall generic and X in mana_cost (SQLite extension)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-regex-test-"));
    const dbPath = path.join(dir, "t.db");
    const db = openDbAt(dbPath);
    try {
      const hasGeneric = db
        .prepare(`SELECT 1 AS ok WHERE '{2}{U}{U}' REGEXP ?`)
        .get(SCRYFALL_MANA_EXCLUDE_COLORLESS_SYMBOL_PATTERNS[0]) as { ok: number } | undefined;
      expect(hasGeneric?.ok).toBe(1);

      const hasX = db
        .prepare(`SELECT 1 AS ok WHERE '{X}{U}' REGEXP ?`)
        .get(SCRYFALL_MANA_EXCLUDE_COLORLESS_SYMBOL_PATTERNS[1]) as { ok: number } | undefined;
      expect(hasX?.ok).toBe(1);

      const noGeneric = db
        .prepare(`SELECT 1 AS ok WHERE NOT ('{U}{U}' REGEXP ?)`)
        .get(SCRYFALL_MANA_EXCLUDE_COLORLESS_SYMBOL_PATTERNS[0]) as { ok: number } | undefined;
      expect(noGeneric?.ok).toBe(1);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
