<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Heatmap product notes

- **Frozen panes:** Canvas draws the set header row and card-name column in viewport space (not translated with scroll); do not regress to a single `translate(-scroll)` for the whole grid.
- **Row sort by price:** `sort` / `sk` with `price_min|price_median|price_max` (+ asc/desc) must stay in SQL `ORDER BY` before `LIMIT` so pagination is correct; column list for aggregates is the global filtered column set (`resolveHeatmapColumns` in `src/lib/heatmap-column-resolve.ts`, imported from `heatmap-query.ts`), not the current page only. `vscope=all` widens aggregates to all printings. Do not reintroduce a second column query inside `getHeatmapData` in `heatmap-query.ts`.
