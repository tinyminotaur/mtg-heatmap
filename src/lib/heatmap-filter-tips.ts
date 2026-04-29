/**
 * Plain-language copy for heatmap filter tooltips (chip bar, sheet, etc.).
 * Each value is one or more short paragraphs.
 */
export const HEATMAP_FILTER_TIPS = {
  showEmptyColumns: [
    "By default, a set only becomes a column if at least one card that matches your filters was printed in that set.",
    "Empty cols adds every other in-scope set (still respecting year, edition allowlist, hide rules, etc.) as a column even when no row would have a card in that set—useful for comparing release slots side by side.",
  ],
  matchStrict: [
    "Some row filters (rarity, USD min/max in visible sets, owned-only, watchlist-only) apply to individual printings, not the whole card.",
    "Strict cells: a printing that fails those checks is drawn like an empty square—no price tint or art—so the grid only “counts” matching versions.",
    "Turn off for Context mode: those printings stay visible but are dimmed so you can still see price and art.",
  ],
  showPinnedStrip: [
    "Oracle cards you have pinned appear in a dedicated block at the top of the heatmap (once per card), above the normal sort order.",
    "Use it as a short favorites rail while you scroll the rest of the list. Turning it off removes that block; pins themselves are not deleted.",
  ],
  hidePinnedStrip: [
    "Hides the pinned summary block at the top of the heatmap. Same idea as turning off “Pinned strip” in the chip bar.",
  ],
  pinnedOnly: [
    "Restricts rows to oracle cards you have pinned in this app. Unrelated to the pinned strip layout option.",
  ],
  facetsBadge: [
    "“Facets” are row filters that look at printings: rarity, release year, mana cost (CMC), and USD range (evaluated in your visible set columns unless you widen scope in the chip bar).",
    "This badge only tells you whether any of those are turned on. Open Sheet filters to change them.",
  ],
  sheetCmc: [
    "Filters oracle cards by converted mana cost (total mana value on the front face). Matches Scryfall’s `cmc` field.",
    "Null or missing mana cost in the database is treated as 0 for min/max comparisons.",
  ],
  valueAggVisible: [
    "For min / median / max row sorts, values use the same Scryfall price field as the Price control (USD, USD foil-preferring, EUR, or tix), only from printings in sets that appear as columns (after column filters).",
    "When a rarity facet is on, those aggregates only count printings of the selected rarities—matching the Min / Median / Max cells in value-column layout.",
  ],
  valueAggAll: [
    "For min / median / max row sorts, values use the same price field as the Price control and consider every printing of the card (still subject to card-level filters), not only the sets shown as columns.",
    "With a rarity facet, aggregates only include printings of those rarities, like the value-column cells.",
  ],
  headerColumnSort: [
    "Temporarily sorts every row by that set’s price for the printing in that column, using the same field as the Price control (missing price sorts last).",
    "Does not change your saved primary sort chips; clear with the × badge when you are done exploring.",
  ],
  groupBy: [
    "Visually groups rows under a header (Reserved vs not, first color identity pip, or a short type-line prefix).",
    "Use “Expand all groups” in the chip bar when collapsed sections hide cards you care about.",
  ],
  primarySort: [
    "Primary order for rows on this page. Name and print-count keys sort on oracle data; price keys use the same Scryfall field as the Price control with the aggregate scope (visible vs all) beside this control.",
    "Additional tie-break sorts can be set in the URL as sk= for power users.",
  ],
  sheetSearch: [
    "Filters cards by oracle name (substring match). Independent of the / quick-search overlay, which updates the URL the same way.",
  ],
  sheetYear: [
    "Limits which sets qualify as columns by set release year. Rows are still cards that match your other filters; they do not need a printing in every visible year.",
  ],
  sheetPrice: [
    "Requires at least one printing in a visible column set whose USD (non-foil, else foil) falls in the range. Empty cells do not satisfy the filter unless the printing exists and qualifies.",
  ],
  sheetRarity: [
    "Requires the card to have at least one printing of the selected rarities somewhere (not necessarily in every column).",
  ],
  includeDigital: [
    "Allows digitally released sets (MTGO, Arena, etc.) in the column catalog and column filters. Off by default for this POC-era scope.",
  ],
  reservedListOnly: [
    "Keeps only cards on the Reserved List. Does not, by itself, restrict columns to old sets—pair with year or set filters if you want that.",
  ],
  ownedOnly: [
    "Only cards you have marked as owned (any printing quantity) for this local user.",
  ],
  watchlistOnly: [
    "Only cards on your local watchlist (any printing).",
  ],
  specialGroup: [
    "Optional curated slug resolved server-side (e.g. pre-built oracle lists). Leave blank for normal browsing.",
  ],
  columnOrder: [
    "Controls left-to-right order of set columns. Row filters and sorts are unchanged; this is presentation only.",
  ],
  priceMode: [
    "Which Scryfall price field tints each cell and the in-cell label: USD non-foil, USD preferring foil, EUR, or event tickets.",
    "In “Value columns” layout, this same field picks which printing wins Min / Median / Max and what number is shown (URL pm=).",
  ],
  heatmapColumnLayoutSets: [
    "Classic heatmap: one column per edition in scope, one cell per (card, printing) pair.",
  ],
  heatmapColumnLayoutValue: [
    "Three columns — Min, Median, Max — computed across the same visible editions as set mode (respects vscope visible vs all).",
    "Each cell shows that aggregate and uses the printing that supplies it; hover preview names the edition.",
  ],
  heatmapColumnLayoutPrintings: [
    "Expanded set columns: one column per edition *variant* (e.g. base, foil-only, nonfoil-only, promos) in scope.",
    "Use this when you want foil and nonfoil versions to be separate columns instead of collapsing to a single “best” printing per set.",
  ],
  matchFooter: [
    "Match mode affects cells when row filters target printings: strict hides non-matching versions; context dims them but keeps price visible.",
  ],
} as const;
