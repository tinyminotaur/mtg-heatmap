/** §11.4 — Color identity lanes for heatmap URL + SQL (W/U/B/R/G/C). */

export const COLOR_PIPS = ["W", "U", "B", "R", "G", "C"] as const;
export type ColorPip = (typeof COLOR_PIPS)[number];

const WUBRG_LIST = ["W", "U", "B", "R", "G"] as const;
const WUBRG = new Set<string>(WUBRG_LIST);

export function isValidColorPip(c: string): c is ColorPip {
  return (COLOR_PIPS as readonly string[]).includes(c);
}

export type ColorLanes = {
  colorNot: string[];
  colorOr: string[];
  colorAnd: string[];
};

/** Full default: every pip is in the Or lane (effective “no color restriction” in SQL). */
export function defaultColorOrFull(): string[] {
  return normalizeColorLaneList([...COLOR_PIPS]);
}

/**
 * Reproduce “exact color identity = And set” by also excluding every other pip (Not ∪ complement of And).
 * Idempotent if Not already contains those exclusions.
 */
export function mergeExactAndIntoNotLanes(
  colorNot: string[],
  colorOr: string[],
  colorAnd: string[],
): { colorNot: string[]; colorOr: string[]; colorAnd: string[] } {
  const and = normalizeColorLaneList(colorAnd);
  if (!and.length) {
    return {
      colorNot: normalizeColorLaneList(colorNot),
      colorOr: normalizeColorLaneList(colorOr),
      colorAnd: and,
    };
  }
  const andSet = new Set(and);
  const complement = COLOR_PIPS.filter((p) => !andSet.has(p));
  return {
    colorNot: normalizeColorLaneList([...normalizeColorLaneList(colorNot), ...complement]),
    colorOr: normalizeColorLaneList(colorOr),
    colorAnd: and,
  };
}

/** True when lanes match the default (all in Or, nothing in Not/And). */
export function isNoOpColorLaneState(f: ColorLanes): boolean {
  const not = normalizeColorLaneList(f.colorNot);
  const or = normalizeColorLaneList(f.colorOr);
  const and = normalizeColorLaneList(f.colorAnd);
  if (not.length || and.length) return false;
  const full = defaultColorOrFull();
  if (or.length !== full.length) return false;
  return full.every((p) => or.includes(p));
}

/** Dedupe, uppercase, filter to allowed pips, stable WUBRGC order. */
export function normalizeColorLaneList(raw: string[]): string[] {
  const s = new Set<string>();
  for (const x of raw) {
    const u = String(x).trim().toUpperCase();
    if (isValidColorPip(u)) s.add(u);
  }
  return [...s].sort((a, b) => COLOR_PIPS.indexOf(a as ColorPip) - COLOR_PIPS.indexOf(b as ColorPip));
}

/**
 * Keep lane membership stable when moving pips.
 * We allow `C` to coexist with WUBRG (mana-cost semantics: cards can require {C} and {R}, etc.).
 */
export function sanitizeLaneWithNewPip(lane: string[], add: ColorPip): string[] {
  const next = new Set(lane.filter((x) => isValidColorPip(x)));
  next.delete(add);
  next.add(add);
  return normalizeColorLaneList([...next]);
}

export type ColorLaneKey = "not" | "or" | "and";

/** Visual / keyboard cycle order: Must have → Any of → Exclude (matches ColorFilter rows). */
export const COLOR_LANE_CYCLE: ColorLaneKey[] = ["and", "or", "not"];

export function laneOfPip(pip: string, f: ColorLanes): ColorLaneKey {
  if (f.colorNot.includes(pip)) return "not";
  if (f.colorAnd.includes(pip)) return "and";
  if (f.colorOr.includes(pip)) return "or";
  return "or";
}

/** Move one pip to a lane. Always derive from the latest filter snapshot (e.g. URL `patch` base), not stale UI props. */
export function moveColorPip(f: ColorLanes, pip: ColorPip, lane: ColorLaneKey): ColorLanes {
  let colorNot = f.colorNot.filter((x) => x !== pip);
  let colorOr = f.colorOr.filter((x) => x !== pip);
  let colorAnd = f.colorAnd.filter((x) => x !== pip);

  if (lane === "not") colorNot = sanitizeLaneWithNewPip(colorNot, pip);
  else if (lane === "or") colorOr = sanitizeLaneWithNewPip(colorOr, pip);
  else colorAnd = sanitizeLaneWithNewPip(colorAnd, pip);

  return { colorNot, colorOr, colorAnd };
}

export function cycleColorPip(f: ColorLanes, pip: ColorPip, dir: "up" | "down"): ColorLanes {
  const cur = laneOfPip(pip, f);
  const i = COLOR_LANE_CYCLE.indexOf(cur);
  const nextLane =
    dir === "down"
      ? COLOR_LANE_CYCLE[(i + 1) % 3]!
      : COLOR_LANE_CYCLE[(i + 2) % 3]!;
  return moveColorPip(f, pip, nextLane);
}

export function colorLanesActive(f: ColorLanes): boolean {
  return !isNoOpColorLaneState(f);
}
