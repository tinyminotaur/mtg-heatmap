/** §11.10 — Saved heatmap views in localStorage. */

export type SavedView = {
  id: string;
  name: string;
  /** Serialized URL query (no leading `?`). */
  query: string;
  isDefault?: boolean;
  /** Shipped views — not removable from the selector. */
  builtIn?: boolean;
};

const STORAGE_KEY = "mtg-heatmap:saved-views-v1";

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedSavedViews();
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v) || v.length === 0) return seedSavedViews();
    return v.filter(
      (x): x is SavedView =>
        x &&
        typeof x === "object" &&
        typeof (x as SavedView).id === "string" &&
        typeof (x as SavedView).name === "string" &&
        typeof (x as SavedView).query === "string",
    );
  } catch {
    return seedSavedViews();
  }
}

export function persistSavedViews(views: SavedView[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function seedSavedViews(): SavedView[] {
  const defaults: SavedView[] = [
    { id: "sv-default", name: "All Cards", query: "", isDefault: true, builtIn: true },
    { id: "sv-owned", name: "My Collection", query: "owned=1", isDefault: false, builtIn: true },
    { id: "sv-wishlist", name: "Wishlist", query: "watchlist=1", isDefault: false, builtIn: true },
  ];
  persistSavedViews(defaults);
  return defaults;
}

export function ensureSavedViewsLoaded(): SavedView[] {
  const cur = loadSavedViews();
  if (cur.length) return cur;
  return seedSavedViews();
}

export function upsertSavedView(views: SavedView[], view: SavedView): SavedView[] {
  const i = views.findIndex((v) => v.id === view.id);
  const next = [...views];
  if (i >= 0) next[i] = view;
  else next.push(view);
  persistSavedViews(next);
  return next;
}

export function deleteSavedView(views: SavedView[], id: string): SavedView[] {
  const next = views.filter((v) => v.id !== id);
  persistSavedViews(next);
  return next;
}

export function duplicateSavedView(views: SavedView[], id: string): SavedView[] {
  const src = views.find((v) => v.id === id);
  if (!src) return views;
  const copy: SavedView = {
    id: uid(),
    name: `${src.name} copy`,
    query: src.query,
  };
  return upsertSavedView(views, copy);
}
