/** Response shape for GET /api/portfolio/summary */

export type PortfolioSummary = {
  /** Condition-adjusted USD total for owned copies. */
  total_usd: number;
  /** Rows in `owned_cards` (copy count). */
  copies: number;
  /** Distinct oracle ids with at least one owned copy. */
  unique_oracles: number;
  /** Rows in `watchlist`. */
  watchlist_entries: number;
  /** Sum of best USD price per watchlist printing (no condition mult). */
  watchlist_total_usd: number;
  /** Distinct oracle ids in `pinned`. */
  pinned_oracles: number;
};
