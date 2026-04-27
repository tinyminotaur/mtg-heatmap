import { describe, expect, it } from "vitest";
import { defaultHeatmapFilters } from "@/lib/filter-state";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";

describe("parseHeatmapUrlSearchParams + serializeHeatmapUrlParams (§11.11)", () => {
  it("round-trips layered year + price (11.14#1 style)", () => {
    const a = new URLSearchParams();
    a.set("yearMin", "1993");
    a.set("yearMax", "2005");
    a.set("priceMin", "1");
    a.set("priceMax", "50");
    const f = parseHeatmapUrlSearchParams(a);
    expect(f.yearMin).toBe(1993);
    expect(f.yearMax).toBe(2005);
    expect(f.priceMin).toBe(1);
    expect(f.priceMax).toBe(50);
    const b = serializeHeatmapUrlParams(f);
    const f2 = parseHeatmapUrlSearchParams(b);
    expect(f2).toEqual(f);
  });

  it("round-trips smart-column flags (11.14#2)", () => {
    const f = {
      ...defaultHeatmapFilters,
      showEmptyColumns: true,
      matchMode: "strict" as const,
    };
    const sp = serializeHeatmapUrlParams(f);
    const f2 = parseHeatmapUrlSearchParams(sp);
    expect(f2.showEmptyColumns).toBe(true);
    expect(f2.matchMode).toBe("strict");
  });

  it("merges s= blob then named params override (11.11)", () => {
    const inner = new URLSearchParams();
    inner.set(
      "s",
      typeof Buffer !== "undefined"
        ? Buffer.from(JSON.stringify({ rarity: "mythic,rare", yearMin: "2010" }), "utf8").toString("base64url")
        : "",
    );
    if (typeof Buffer === "undefined") {
      return;
    }
    inner.set("yearMin", "2000");
    const f = parseHeatmapUrlSearchParams(inner);
    expect(f.yearMin).toBe(2000);
    expect(f.rarity).toEqual(["mythic", "rare"]);
  });

  it("maps legacy price_avg to median", () => {
    const a = new URLSearchParams();
    a.set("sort", "price_avg");
    const f = parseHeatmapUrlSearchParams(a);
    expect(f.sortSlots[0]?.key).toBe("price_median");
  });

  it("parses multi-sort sk (11.5.5)", () => {
    const a = new URLSearchParams();
    a.set("sk", "reserved~name~price_min:asc");
    const f = parseHeatmapUrlSearchParams(a);
    expect(f.sortSlots.map((s) => `${s.key}:${s.dir ?? ""}`)).toEqual([
      "reserved:",
      "name:",
      "price_min:asc",
    ]);
  });

  it("saved-view style gc JSON (11.14#11)", () => {
    const f = { ...defaultHeatmapFilters, groupBy: "reserved" as const, groupCollapsedKeys: ["Core"] };
    const sp = serializeHeatmapUrlParams(f);
    const f2 = parseHeatmapUrlSearchParams(sp);
    expect(f2.groupCollapsedKeys).toEqual(["Core"]);
  });

  it("round-trips value column layout and cell price field", () => {
    const f = {
      ...defaultHeatmapFilters,
      heatmapColumnLayout: "value" as const,
      cellPriceField: "eur" as const,
    };
    const sp = serializeHeatmapUrlParams(f);
    expect(sp.get("hlay")).toBe("value");
    expect(sp.get("pm")).toBe("eur");
    const f2 = parseHeatmapUrlSearchParams(sp);
    expect(f2.heatmapColumnLayout).toBe("value");
    expect(f2.cellPriceField).toBe("eur");
  });
});
