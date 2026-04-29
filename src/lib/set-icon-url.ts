/**
 * Set icon paths in the DB are often placeholder `/set-icons/{code}.svg` (no static files in prod).
 * Match {@link HeatmapGrid} behavior: use Scryfall’s hosted SVGs unless we have a real URL/path.
 */
export function scryfallSetIconSvgUrl(setCode: string): string {
  return `https://svgs.scryfall.io/sets/${setCode.toLowerCase()}.svg`;
}

export function resolveSetIconSvgUrl(
  setCode: string,
  icon_svg_path: string | null | undefined,
): string {
  const p = icon_svg_path?.trim() ?? "";
  if (p && !p.startsWith("/set-icons/")) {
    return p;
  }
  return scryfallSetIconSvgUrl(setCode);
}
