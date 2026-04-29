# Heatmap UI ↔ URL ↔ API mapping

Reference for filter/sort/views. Authoritative parser/serializer: `src/lib/heatmap-url-params.ts` and `HeatmapFilters` in `src/lib/filter-state.ts`.

## Primary controls (spec bar)

| UI control | URL params | Server / notes |
|------------|------------|----------------|
| Search | `q` | `cardWhereClause`: name, type_line, oracle_text (`LIKE`) when length ≥ 2 |
| Colors WUBRG | `colors` comma list | `colorMode` `any` vs `exact` (see `colorMode`) |
| Color mode | `colorMode=any\|exact` | SQL on `cards.color_identity` / colors JSON |
| Rarity pills | `rarity` comma | `buildHaving`: printings rarity IN |
| Sets picker | `sets` allowlist, `hideSets`, `exclTypes`, `exclGroups` | Column resolution in `resolveHeatmapColumns` |
| Status tabs | `owned`, `watchlist` (`1`/`0`/absent) | `buildHaving`; `none` = both `0` |
| Price | `priceMin`, `priceMax` | `buildHaving` + visible set codes |
| Sort (virtual) | `sort`, `sk` | SQL `ORDER BY` in `getHeatmapData` |
| Column price sort | `hcol`, `hdir` | Header column USD-like price subquery |
| Saved views | — | `localStorage` query snapshot via `saved-views.ts` |

## Session / display (often preserved on “clear filters”)

| Concern | Params |
|---------|--------|
| Price field | `pm` |
| Column layout | `hlay` |
| Value agg scope | `vscope` |
| Column order | `colSort` |
| Match / empty cols | `strict`, `emptyCols` |
| Quick pins | `qr`, `qc` |
| Pagination | `page`, `pageSize` |
| Density | client-only (Heatmap session / UI state) |

## Facets

`GET /api/heatmap/facets` mirrors heatmap query params; returns counts for tabs and facet buckets (see route handler).
