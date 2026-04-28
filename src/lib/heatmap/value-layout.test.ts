import { describe, expect, it } from "vitest";
import { defaultHeatmapFilters } from "@/lib/filter-state";
import { buildValueLayoutCells, printingMatchesCell } from "./value-layout";

type PRow = {
  oracle_id: string;
  set_code: string;
  scryfall_id: string;
  usd: number | null;
  usd_foil: number | null;
  eur: number | null;
  tix: number | null;
  rarity: string | null;
  image_uri_small: string | null;
  image_uri_normal: string | null;
  image_uri_large: string | null;
  scryfall_uri: string | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
};

const pr = (over: Partial<PRow>): PRow => ({
  oracle_id: "o1",
  set_code: "lea",
  scryfall_id: `${Math.random()}`,
  usd: null,
  usd_foil: null,
  eur: null,
  tix: null,
  rarity: "rare",
  image_uri_small: null,
  image_uri_normal: null,
  image_uri_large: null,
  scryfall_uri: null,
  tcgplayer_url: null,
  cardmarket_url: null,
  ...over,
});

describe("printingMatchesCell", () => {
  it("enforces rarity filter when present", () => {
    const f = { ...defaultHeatmapFilters, rarity: ["common"] };
    expect(
      printingMatchesCell(
        f,
        "lea",
        { rarity: "rare", usd: 5, usd_foil: null, scryfall_id: "s1" },
        ["lea"],
        0,
        false,
      ),
    ).toBe(false);
    expect(
      printingMatchesCell(
        f,
        "lea",
        { rarity: "common", usd: 5, usd_foil: null, scryfall_id: "s1" },
        ["lea"],
        0,
        false,
      ),
    ).toBe(true);
  });

  it("enforces owned/watchlist toggles when requested", () => {
    const fOwned = { ...defaultHeatmapFilters, owned: true };
    expect(
      printingMatchesCell(
        fOwned,
        "lea",
        { rarity: "rare", usd: 5, usd_foil: null, scryfall_id: "s1" },
        ["lea"],
        0,
        false,
      ),
    ).toBe(false);
    expect(
      printingMatchesCell(
        fOwned,
        "lea",
        { rarity: "rare", usd: 5, usd_foil: null, scryfall_id: "s1" },
        ["lea"],
        2,
        false,
      ),
    ).toBe(true);

    const fWl = { ...defaultHeatmapFilters, watchlist: true };
    expect(
      printingMatchesCell(
        fWl,
        "lea",
        { rarity: "rare", usd: 5, usd_foil: null, scryfall_id: "s1" },
        ["lea"],
        0,
        false,
      ),
    ).toBe(false);
    expect(
      printingMatchesCell(
        fWl,
        "lea",
        { rarity: "rare", usd: 5, usd_foil: null, scryfall_id: "s1" },
        ["lea"],
        0,
        true,
      ),
    ).toBe(true);
  });
});

describe("buildValueLayoutCells", () => {
  const setDisplayName = (code: string) => code.toUpperCase();

  it("returns [null,null,null] when no qualifying printings", () => {
    const f = { ...defaultHeatmapFilters, heatmapColumnLayout: "value" as const };
    const pmap = new Map<string, PRow>([["lea", pr({ set_code: "lea", usd: null })]]);
    const cells = buildValueLayoutCells(
      pmap,
      ["lea"],
      setDisplayName,
      f,
      "usd",
      new Map(),
      new Set(),
    );
    expect(cells).toEqual([null, null, null]);
  });

  it("computes min/median/max and sets aggregate_note for even median", () => {
    const f = { ...defaultHeatmapFilters, heatmapColumnLayout: "value" as const };
    const a = pr({ set_code: "lea", usd: 1, scryfall_id: "a" });
    const b = pr({ set_code: "leb", usd: 3, scryfall_id: "b" });
    const c = pr({ set_code: "2ed", usd: 9, scryfall_id: "c" });
    const d = pr({ set_code: "3ed", usd: 11, scryfall_id: "d" });
    const pmap = new Map<string, PRow>([
      ["lea", a],
      ["leb", b],
      ["2ed", c],
      ["3ed", d],
    ]);

    const cells = buildValueLayoutCells(
      pmap,
      ["lea", "leb", "2ed", "3ed"],
      setDisplayName,
      f,
      "usd",
      new Map(),
      new Set(),
    );

    expect(cells[0]?.display_price).toBe(1);
    expect(cells[2]?.display_price).toBe(11);
    expect(cells[1]?.display_price).toBe(6); // (3 + 9) / 2
    expect(cells[1]?.aggregate_note).toContain("between");
  });
});

