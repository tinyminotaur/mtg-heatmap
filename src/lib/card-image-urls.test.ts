import { describe, expect, it } from "vitest";
import { cardImageUrlForDetail, cardImageUrlForPreview, cardImageUrlForRowPreview } from "./card-image-urls";
import type { CellDTO, RowDTO } from "./heatmap-query";

const base = (u: string | null) =>
  ({
    scryfall_id: "x",
    usd: null,
    usd_foil: null,
    eur: null,
    tix: null,
    rarity: null,
    scryfall_uri: null,
    tcgplayer_url: null,
    cardmarket_url: null,
    owned_qty: 0,
    watchlisted: false,
    printing_matches: true,
    image_small: u,
  }) as CellDTO;

describe("cardImageUrlForPreview", () => {
  it("prefers image_normal", () => {
    const c = { ...base("https://cards.scryfall.io/small/front/x.jpg"), image_normal: "https://n" };
    expect(cardImageUrlForPreview(c)).toBe("https://n");
  });

  it("upgrades Scryfall small to normal path", () => {
    const c = base("https://cards.scryfall.io/small/front/0/0/a.jpg");
    expect(cardImageUrlForPreview(c)).toBe("https://cards.scryfall.io/normal/front/0/0/a.jpg");
  });
});

describe("cardImageUrlForDetail", () => {
  it("prefers image_large from cell", () => {
    const c = {
      ...base("https://cards.scryfall.io/small/front/x.jpg"),
      image_large: "https://L",
    };
    expect(cardImageUrlForDetail(c)).toBe("https://L");
  });

  it("upgrades normal to large when large missing", () => {
    const c = {
      ...base(null),
      image_normal: "https://cards.scryfall.io/normal/front/0/0/a.jpg",
    };
    expect(cardImageUrlForDetail(c)).toBe("https://cards.scryfall.io/large/front/0/0/a.jpg");
  });

  it("upgrades small to large when that is all we have", () => {
    const c = base("https://cards.scryfall.io/small/front/0/0/a.jpg");
    expect(cardImageUrlForDetail(c)).toBe("https://cards.scryfall.io/large/front/0/0/a.jpg");
  });
});

describe("cardImageUrlForRowPreview", () => {
  it("picks first cell with normal, else upgrades small", () => {
    const a = {
      ...base("https://cards.scryfall.io/small/front/a.jpg"),
      image_normal: "https://first-normal",
    };
    const b = base("https://cards.scryfall.io/small/front/b.jpg");
    const row: RowDTO = {
      oracle_id: "o",
      name: "N",
      cmc: 0,
      mana_cost: null,
      colors: [],
      color_identity: [],
      is_reserved: false,
      type_line: null,
      legalities: {},
      cells: [null, a, b],
      printings_count: 2,
      owned_qty: 0,
      watchlisted: false,
      pinned: false,
      quick_pin_row: false,
      price_low_cols: [],
      price_high_cols: [],
      group_key: null,
    };
    expect(cardImageUrlForRowPreview(row)).toBe("https://first-normal");
  });
});
