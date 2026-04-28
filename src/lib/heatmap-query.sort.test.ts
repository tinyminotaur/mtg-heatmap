import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDbAt } from "@/lib/db";
import { getHeatmapData } from "@/lib/heatmap-query";
import { defaultHeatmapFilters } from "@/lib/filter-state";

describe("getHeatmapData sorting + pagination", () => {
  it("paginates correctly when sorting by price_min asc", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-heatmap-test-"));
    const dbPath = path.join(dir, "mtg.db");
    const db = openDbAt(dbPath);
    try {
      db.exec(`
        DELETE FROM prices_current;
        DELETE FROM printings;
        DELETE FROM cards;
        DELETE FROM sets;
      `);

      db.prepare(
        `INSERT INTO sets (code, name, release_date, set_type, icon_svg_path, is_digital, is_promo, parent_set_code)
         VALUES (?, ?, ?, NULL, NULL, 0, 0, NULL)`,
      ).run("s1", "Set One", "1994-01-01");
      db.prepare(
        `INSERT INTO sets (code, name, release_date, set_type, icon_svg_path, is_digital, is_promo, parent_set_code)
         VALUES (?, ?, ?, NULL, NULL, 0, 0, NULL)`,
      ).run("s2", "Set Two", "1995-01-01");

      const insCard = db.prepare(
        `INSERT INTO cards (oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, is_reserved, legalities)
         VALUES (?, ?, NULL, NULL, NULL, NULL, '[]', '[]', 0, '{}')`,
      );
      insCard.run("o1", "Alpha");
      insCard.run("o2", "Beta");
      insCard.run("o3", "Gamma");

      const insPrinting = db.prepare(
        `INSERT INTO printings (scryfall_id, oracle_id, set_code, collector_number, rarity, released_at, image_uri_large, image_uri_normal, image_uri_small, scryfall_uri, tcgplayer_url, cardmarket_url, is_foil_only, is_nonfoil_only, is_promo, frame_effects, finishes)
         VALUES (?, ?, ?, '1', 'rare', '1994-01-01', NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, '[]', '[]')`,
      );
      const insPrice = db.prepare(
        `INSERT INTO prices_current (scryfall_id, usd, usd_foil, usd_etched, eur, eur_foil, tix, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, datetime('now'))`,
      );

      // Ensure per-card minimum USD in visible sets is 1, 2, 3.
      insPrinting.run("p1s1", "o1", "s1");
      insPrice.run("p1s1", 1);
      insPrinting.run("p1s2", "o1", "s2");
      insPrice.run("p1s2", 10);

      insPrinting.run("p2s1", "o2", "s1");
      insPrice.run("p2s1", 2);
      insPrinting.run("p2s2", "o2", "s2");
      insPrice.run("p2s2", 20);

      insPrinting.run("p3s1", "o3", "s1");
      insPrice.run("p3s1", 3);
      insPrinting.run("p3s2", "o3", "s2");
      insPrice.run("p3s2", 30);

      const mkFilters = (page: number) => ({
        ...defaultHeatmapFilters,
        showPinned: false,
        page,
        pageSize: 1,
        sortSlots: [{ key: "price_min" as const, dir: "asc" as const }],
        sort: "price_min:asc",
      });

      const p0 = getHeatmapData(db, mkFilters(0)).rows.map((r) => r.name);
      const p1 = getHeatmapData(db, mkFilters(1)).rows.map((r) => r.name);
      const p2 = getHeatmapData(db, mkFilters(2)).rows.map((r) => r.name);

      expect(p0).toEqual(["Alpha"]);
      expect(p1).toEqual(["Beta"]);
      expect(p2).toEqual(["Gamma"]);
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});

