export type CellDTO = {
  scryfall_id: string;
  usd: number | null;
  usd_foil: number | null;
  eur: number | null;
  tix: number | null;
  rarity: string | null;
  image_small: string | null;
  /** Omitted from `/api/heatmap` JSON to keep payloads small; UI falls back to `image_small`. */
  image_normal?: string | null;
  image_large?: string | null;
  scryfall_uri: string | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
  owned_qty: number;
  watchlisted: boolean;
  /** Printing-level predicates (rarity / visible-set price / per-printing owned & watchlist). */
  printing_matches: boolean;
  /** Value-column layout: aggregate shown in cell / tier (same units as `cellPriceField` URL param). */
  display_price?: number | null;
  /** Set whose printing supplies art / links for this aggregate. */
  source_set_code?: string | null;
  source_set_name?: string | null;
  /** When median spans two printings, short explanation for preview. */
  aggregate_note?: string | null;
};

export type RowDTO = {
  oracle_id: string;
  name: string;
  mana_cost: string | null;
  colors: string[];
  color_identity: string[];
  is_reserved: boolean;
  type_line: string | null;
  legalities: Record<string, string>;
  cells: (CellDTO | null)[];
  /** Number of printings (versions) in the current count scope. */
  printings_count: number;
  owned_qty: number;
  watchlisted: boolean;
  pinned: boolean;
  price_low_cols: number[];
  price_high_cols: number[];
  /** Single-level group key for §11.6 UI (null when not grouping). */
  group_key: string | null;
};

