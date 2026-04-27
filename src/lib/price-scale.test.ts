import { describe, expect, it } from "vitest";
import { priceToTier, tierToColor } from "./price-scale";

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
