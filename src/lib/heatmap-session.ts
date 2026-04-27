/** Remember heatmap URL + active saved view when navigating away (e.g. /owned). sessionStorage = per tab. */

const SESSION_KEY = "mtg-heatmap:session-v1";

export type HeatmapSessionSnapshot = {
  /** URL search string without leading `?` */
  search: string;
  activeViewId: string | null;
  snapshotQuery: string | null;
};

export function readHeatmapSession(): HeatmapSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<HeatmapSessionSnapshot>;
    if (typeof v.search !== "string") return null;
    return {
      search: v.search,
      activeViewId: typeof v.activeViewId === "string" ? v.activeViewId : null,
      snapshotQuery: typeof v.snapshotQuery === "string" ? v.snapshotQuery : null,
    };
  } catch {
    return null;
  }
}

export function writeHeatmapSession(s: HeatmapSessionSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}
