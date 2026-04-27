/**
 * Preset column-exclusion groups → Scryfall `set_type` values.
 * Toggling a group adds its types to the column filter (hide those columns).
 * @see https://scryfall.com/docs/api#enum-values-set-type
 */
export const COLUMN_EXCLUDE_GROUP_PRESETS: Record<
  string,
  { label: string; description: string; setTypes: string[] }
> = {
  promo_collectors: {
    label: "Promos & collector products",
    description: "Promo, From the Vault, spellbooks, Alchemy, etc.",
    setTypes: ["promo", "from_the_vault", "treasure_chest", "spellbook", "alchemy", "minigame"],
  },
  commander_multiplayer: {
    label: "Commander & multiplayer",
    description: "Commander decks, Planechase, Archenemy, Duel Decks",
    setTypes: ["commander", "planechase", "archenemy", "duel_deck"],
  },
  draft_innovation: {
    label: "DraftInnovation",
    description: "Conspiracy, Battlebond-style draft products",
    setTypes: ["draft_innovation"],
  },
  memorabilia_fun: {
    label: "Memorabilia & Un-sets",
    description: "World Championship decks, memorabilia, funny sets",
    setTypes: ["memorabilia", "funny"],
  },
  box_starter: {
    label: "Box & starter products",
    description: "Non-booster box products and starters",
    setTypes: ["box", "starter", "premium_deck"],
  },
};

export function expandExcludeGroupTypes(groupIds: string[]): string[] {
  const out = new Set<string>();
  for (const id of groupIds) {
    const g = COLUMN_EXCLUDE_GROUP_PRESETS[id];
    if (g) for (const t of g.setTypes) out.add(t);
  }
  return [...out];
}
