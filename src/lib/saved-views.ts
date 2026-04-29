/** §11.10 — Saved heatmap views in localStorage + tab order. */

import { CHALLENGER_PRESET_QUERY, FUNNY_PRESET_QUERY } from "@/lib/view-tab-presets";

export type SavedView = {
  id: string;
  name: string;
  /** Serialized URL query (no leading `?`). */
  query: string;
  isDefault?: boolean;
};

const STORAGE_KEY = "mtg-heatmap:saved-views-v1";
const ORDER_KEY = "mtg-heatmap:saved-view-order-v1";

/** Legacy built-ins replaced by locked scope tabs + seeded presets. */
const LEGACY_VIEW_IDS = new Set(["sv-default", "sv-owned", "sv-wishlist"]);

export const PRESET_CHALLENGER_ID = "sv-preset-challenger";
export const PRESET_FUNNY_ID = "sv-preset-funny";

const DEFAULT_PRESETS: SavedView[] = [
  { id: PRESET_CHALLENGER_ID, name: "Challenger", query: CHALLENGER_PRESET_QUERY },
  { id: PRESET_FUNNY_ID, name: "Funny", query: FUNNY_PRESET_QUERY },
];

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function mergePresets(views: SavedView[]): SavedView[] {
  const byId = new Set(views.map((v) => v.id));
  const next = [...views];
  for (const p of DEFAULT_PRESETS) {
    if (!byId.has(p.id)) next.push(p);
  }
  return next;
}

function stripLegacy(views: SavedView[]): SavedView[] {
  return views.filter((v) => !LEGACY_VIEW_IDS.has(v.id));
}

export function loadSavedViewOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function persistSavedViewOrder(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = mergePresets([]);
      persistSavedViews(seed);
      persistSavedViewOrder(seed.map((s) => s.id));
      return seed;
    }
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v) || v.length === 0) {
      const seed = mergePresets([]);
      persistSavedViews(seed);
      persistSavedViewOrder(seed.map((s) => s.id));
      return seed;
    }
    const parsed = v.filter(
      (x): x is SavedView =>
        x &&
        typeof x === "object" &&
        typeof (x as SavedView).id === "string" &&
        typeof (x as SavedView).name === "string" &&
        typeof (x as SavedView).query === "string",
    );
    const migrated = mergePresets(stripLegacy(parsed));
    persistSavedViews(migrated);
    return migrated;
  } catch {
    const seed = mergePresets([]);
    persistSavedViews(seed);
    persistSavedViewOrder(seed.map((s) => s.id));
    return seed;
  }
}

export function persistSavedViews(views: SavedView[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function ensureSavedViewsLoaded(): SavedView[] {
  const cur = loadSavedViews();
  if (cur.length) return cur;
  const seed = mergePresets([]);
  persistSavedViews(seed);
  persistSavedViewOrder(seed.map((s) => s.id));
  return seed;
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

/** Sort `views` by `order` (unknown ids follow in stable order). */
export function orderSavedViews(views: SavedView[], order: string[]): SavedView[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...views].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.name.localeCompare(b.name);
  });
}
