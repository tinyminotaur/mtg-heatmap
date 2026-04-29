import { describe, expect, it } from "vitest";
import { defaultHeatmapFilters, type HeatmapFilters } from "@/lib/filter-state";
import { defaultColorOrFull } from "@/lib/heatmap/color-lanes";
import { buildSoloEditionViewFilters } from "@/lib/heatmap/solo-edition-view";

describe("buildSoloEditionViewFilters", () => {
  it("isolates one set, clears facets/search, keeps row sort and layout knobs", () => {
    const base: HeatmapFilters = {
      ...defaultHeatmapFilters,
      search: "bolt",
      rarity: ["rare"],
      colorOr: ["R"],
      sortSlots: [{ key: "price_median", dir: "desc" }],
      sort: "price_median:desc",
      sets: ["m21", "eld"],
      cellPriceField: "usd_foil",
      colSort: "code",
      valueAggScope: "all",
      pageSize: 500,
    };
    const out = buildSoloEditionViewFilters(base, "mid");
    expect(out.search).toBe("");
    expect(out.rarity).toEqual([]);
    expect(out.colorOr).toEqual(defaultColorOrFull());
    expect(out.sets).toEqual(["mid"]);
    expect(out.sortSlots).toEqual([{ key: "price_median", dir: "desc" }]);
    expect(out.cellPriceField).toBe("usd_foil");
    expect(out.colSort).toBe("code");
    expect(out.valueAggScope).toBe("all");
    expect(out.pageSize).toBe(500);
    expect(out.page).toBe(0);
    expect(out.heatmapColumnLayout).toBe("sets");
  });

  it("returns current filters unchanged for invalid codes", () => {
    const base: HeatmapFilters = { ...defaultHeatmapFilters, search: "x" };
    expect(buildSoloEditionViewFilters(base, "")).toEqual(base);
    expect(buildSoloEditionViewFilters(base, "__foo")).toEqual(base);
  });
});
