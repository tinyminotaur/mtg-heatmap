import type { HeatmapFilters } from "@/lib/filter-state";
import { cellPriceForMode, type PriceMode } from "@/lib/price-scale";
import type { CellDTO } from "@/lib/heatmap/dto";

type PrintingRow = {
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

export function printingMatchesCell(
  f: HeatmapFilters,
  setCode: string,
  p: { rarity: string | null; usd: number | null; usd_foil: number | null; scryfall_id: string },
  priceSets: string[],
  ownedQty: number,
  watchlisted: boolean,
): boolean {
  if (f.rarity.length) {
    if (!p.rarity || !f.rarity.includes(p.rarity)) return false;
  }
  const wantsPrice = f.priceMin != null || f.priceMax != null;
  if (wantsPrice && priceSets.includes(setCode)) {
    const v = p.usd ?? p.usd_foil;
    if (v == null || !(v > 0)) return false;
    if (f.priceMin != null && v < f.priceMin) return false;
    if (f.priceMax != null && v > f.priceMax) return false;
  }
  if (f.owned === true && ownedQty <= 0) return false;
  if (f.watchlist === true && !watchlisted) return false;
  return true;
}

export function printingToCellDto(
  p: PrintingRow,
  fx: HeatmapFilters,
  setCode: string,
  priceSetsForCells: string[],
  ownedMap: Map<string, number>,
  wl: Set<string>,
  extra: Pick<CellDTO, "display_price" | "source_set_code" | "source_set_name" | "aggregate_note">,
): CellDTO {
  const oq = ownedMap.get(p.scryfall_id) ?? 0;
  const wlisted = wl.has(p.scryfall_id);
  const pm = printingMatchesCell(fx, setCode, p, priceSetsForCells, oq, wlisted);
  return {
    scryfall_id: p.scryfall_id,
    usd: p.usd,
    usd_foil: p.usd_foil,
    eur: p.eur,
    tix: p.tix,
    rarity: p.rarity,
    image_small: p.image_uri_small,
    image_normal: p.image_uri_normal,
    image_large: p.image_uri_large,
    scryfall_uri: p.scryfall_uri,
    tcgplayer_url: p.tcgplayer_url,
    cardmarket_url: p.cardmarket_url,
    owned_qty: oq,
    watchlisted: wlisted,
    printing_matches: pm,
    ...extra,
  };
}

export function buildValueLayoutCells(
  pmap: Map<string, PrintingRow>,
  physicalSetCodes: string[],
  setDisplayName: (code: string) => string,
  fx: HeatmapFilters,
  field: PriceMode,
  ownedMap: Map<string, number>,
  wl: Set<string>,
): (CellDTO | null)[] {
  type E = { v: number; code: string; p: PrintingRow };
  const entries: E[] = [];
  const codesToScan =
    fx.valueAggScope === "all"
      ? [...pmap.keys()].sort((a, b) => a.localeCompare(b))
      : physicalSetCodes;
  for (const code of codesToScan) {
    const p = pmap.get(code);
    if (!p) continue;
    const v = cellPriceForMode(
      { usd: p.usd, usd_foil: p.usd_foil, eur: p.eur, tix: p.tix },
      field,
    );
    if (v == null || !(v > 0)) continue;
    const oq = ownedMap.get(p.scryfall_id) ?? 0;
    const wlisted = wl.has(p.scryfall_id);
    if (!printingMatchesCell(fx, code, p, physicalSetCodes, oq, wlisted)) continue;
    entries.push({ v, code, p });
  }
  entries.sort((a, b) => a.v - b.v || a.code.localeCompare(b.code));
  if (!entries.length) return [null, null, null];

  const minE = entries[0]!;
  const maxE = entries[entries.length - 1]!;
  const n = entries.length;
  let median: number;
  let medPrimary: E;
  let aggregateNote: string | null = null;
  if (n % 2 === 1) {
    medPrimary = entries[Math.floor(n / 2)]!;
    median = medPrimary.v;
  } else {
    const lo = entries[n / 2 - 1]!;
    const hi = entries[n / 2]!;
    median = (lo.v + hi.v) / 2;
    medPrimary = hi;
    if (Math.abs(lo.v - hi.v) > 1e-6 || lo.code !== hi.code) {
      aggregateNote = `Median ${median.toFixed(2)} between ${setDisplayName(lo.code)} (${lo.v}) and ${setDisplayName(hi.code)} (${hi.v})`;
    }
  }

  const priceSets = physicalSetCodes;
  const minCell = printingToCellDto(minE.p, fx, minE.code, priceSets, ownedMap, wl, {
    display_price: minE.v,
    source_set_code: minE.code,
    source_set_name: setDisplayName(minE.code),
    aggregate_note: null,
  });
  const maxCell = printingToCellDto(maxE.p, fx, maxE.code, priceSets, ownedMap, wl, {
    display_price: maxE.v,
    source_set_code: maxE.code,
    source_set_name: setDisplayName(maxE.code),
    aggregate_note: null,
  });
  const medCell = printingToCellDto(medPrimary.p, fx, medPrimary.code, priceSets, ownedMap, wl, {
    display_price: median,
    source_set_code: medPrimary.code,
    source_set_name: setDisplayName(medPrimary.code),
    aggregate_note: aggregateNote,
  });
  return [minCell, medCell, maxCell];
}

