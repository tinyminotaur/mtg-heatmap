import { describe, expect, it } from "vitest";
import {
  cellEligibleForHeatmapHoverPreview,
  formatHeatmapCellPriceLabel,
  priceToTier,
  tierToColor,
} from "./price-scale";

const empty = { usd: null, usd_foil: null, eur: null, tix: null };

describe("priceToTier", () => {
  it("maps ranges", () => {
    expect(priceToTier(null)).toBe(0);
    expect(priceToTier(0.5)).toBe(1);
    expect(priceToTier(3)).toBe(2);
    expect(priceToTier(10)).toBe(3);
    expect(priceToTier(50)).toBe(4);
    expect(priceToTier(200)).toBe(5);
    expect(priceToTier(900)).toBe(6);
  });
});

describe("tierToColor", () => {
  it("returns hex", () => {
    expect(tierToColor(1, true)).toMatch(/^#/);
  });
});

describe("cellEligibleForHeatmapHoverPreview", () => {
  type C = {
    usd: number | null;
    usd_foil: number | null;
    eur: number | null;
    tix: number | null;
    printing_matches: boolean;
  };
  const cell = (over: Partial<C>): C => ({
    usd: null,
    usd_foil: null,
    eur: null,
    tix: null,
    printing_matches: true,
    ...over,
  });

  it("requires a positive price for the active mode", () => {
    expect(cellEligibleForHeatmapHoverPreview(null, "context", "usd")).toBe(false);
    expect(cellEligibleForHeatmapHoverPreview(cell({ usd: null, usd_foil: null }), "context", "usd")).toBe(
      false,
    );
    expect(cellEligibleForHeatmapHoverPreview(cell({ usd: 2.5 }), "context", "usd")).toBe(true);
  });

  it("excludes strict non-matching printings even if priced", () => {
    expect(cellEligibleForHeatmapHoverPreview(cell({ usd: 5, printing_matches: false }), "strict", "usd")).toBe(
      false,
    );
    expect(cellEligibleForHeatmapHoverPreview(cell({ usd: 5, printing_matches: false }), "context", "usd")).toBe(
      true,
    );
  });
});

describe("formatHeatmapCellPriceLabel", () => {
  it("returns null when no price for mode", () => {
    expect(formatHeatmapCellPriceLabel(empty, "usd")).toBe(null);
    expect(formatHeatmapCellPriceLabel({ usd: 0, usd_foil: null, eur: null, tix: null }, "usd")).toBe(null);
  });

  it("formats usd / foil / eur / tix", () => {
    expect(formatHeatmapCellPriceLabel({ usd: 4.5, usd_foil: null, eur: null, tix: null }, "usd")).toBe("$4.50");
    expect(formatHeatmapCellPriceLabel({ usd: 12.2, usd_foil: null, eur: null, tix: null }, "usd")).toBe("$13");
    expect(
      formatHeatmapCellPriceLabel({ usd: null, usd_foil: 12, eur: null, tix: null }, "usd_foil"),
    ).toBe("$12");
    expect(formatHeatmapCellPriceLabel({ usd: null, usd_foil: null, eur: 3.25, tix: null }, "eur")).toBe("€3.25");
    expect(formatHeatmapCellPriceLabel({ usd: null, usd_foil: null, eur: null, tix: 2.5 }, "tix")).toBe("2.5");
  });
});
