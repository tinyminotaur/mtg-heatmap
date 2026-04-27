/** Tier colors (dark mode) from spec §6 */
const DARK: Record<number, string> = {
  0: "#1f2937", // empty
  1: "#312e81", // bulk
  2: "#1e40af",
  3: "#0d9488",
  4: "#ca8a04",
  5: "#ea580c",
  6: "#dc2626",
};

const LIGHT: Record<number, string> = {
  0: "#f3f4f6",
  1: "#e0e7ff",
  2: "#bfdbfe",
  3: "#5eead4",
  4: "#fde047",
  5: "#fb923c",
  6: "#f87171",
};

export type PriceMode = "usd" | "usd_foil" | "eur" | "tix";

function pickPrice(
  cell: { usd: number | null; usd_foil: number | null; eur: number | null; tix: number | null },
  mode: PriceMode,
): number | null {
  switch (mode) {
    case "usd_foil":
      return cell.usd_foil ?? cell.usd;
    case "eur":
      return cell.eur;
    case "tix":
      return cell.tix;
    default:
      return cell.usd;
  }
}

/** Map USD (or selected field) to tier 0–6 for legend / fill */
export function priceToTier(price: number | null | undefined): number {
  if (price == null || Number.isNaN(price)) return 0;
  if (price < 1) return 1;
  if (price < 5) return 2;
  if (price < 25) return 3;
  if (price < 100) return 4;
  if (price < 500) return 5;
  return 6;
}

export function tierToColor(tier: number, dark: boolean): string {
  const pal = dark ? DARK : LIGHT;
  return pal[Math.max(0, Math.min(6, tier))] ?? pal[0];
}

export function priceToColor(
  cell: {
    usd: number | null;
    usd_foil: number | null;
    eur: number | null;
    tix: number | null;
  },
  mode: PriceMode,
  dark: boolean,
): string {
  const p = pickPrice(cell, mode);
  if (p == null || p <= 0) return tierToColor(0, dark);
  return tierToColor(priceToTier(p), dark);
}
