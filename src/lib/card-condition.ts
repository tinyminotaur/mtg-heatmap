import { CONDITION_VALUE_MULT } from "@/lib/constants";

/** Supported inventory condition codes (matches `CONDITION_VALUE_MULT`). */
export const CARD_CONDITION_CODES = ["NM", "LP", "MP", "HP", "DMG"] as const;
export type CardConditionCode = (typeof CARD_CONDITION_CODES)[number];

const NAMES: Record<CardConditionCode, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

export function isCardConditionCode(code: string): code is CardConditionCode {
  return (CARD_CONDITION_CODES as readonly string[]).includes(code);
}

export function normalizeConditionCode(code: string | null | undefined): CardConditionCode {
  const t = (code ?? "").trim().toUpperCase();
  return isCardConditionCode(t) ? t : "NM";
}

export function conditionFullName(code: string): string {
  return NAMES[code as CardConditionCode] ?? code;
}

export function conditionMultiplier(code: string): number {
  return CONDITION_VALUE_MULT[code] ?? 1;
}

/** Keyboard / typeahead label for `SelectItem` `label` where needed. */
export function conditionKeyboardLabel(code: CardConditionCode): string {
  return `${code} ${NAMES[code]}`;
}

/**
 * Compact single-line label for selects: code, grading term, multiplier vs catalog NM, % of NM.
 */
export function conditionOptionShortLabel(code: CardConditionCode): string {
  const name = NAMES[code];
  const m = conditionMultiplier(code);
  const pct = Math.round(m * 100);
  if (code === "NM") {
    return `${code} — ${name} · ×${m.toFixed(2)} (baseline = NM list)`;
  }
  return `${code} — ${name} · ×${m.toFixed(2)} (~${pct}% of NM list)`;
}
