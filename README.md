# MTG Heatmap

Next.js heatmap for Magic cards (SQLite + Scryfall-shaped data).

## Local dev

```bash
pnpm install
pnpm db:seed   # small demo dataset (optional if you already have data/mtg.db)
pnpm dev
```

## Production (Vercel)

- **`VERCEL=1` builds** run `pnpm db:seed` first, then `next build`, so a demo `data/mtg.db` is created and bundled with API routes.
- **Runtime**: on Vercel the app copies that DB to `/tmp` so SQLite can use WAL and writes (owned / watchlist toggles).
- For a **full** card catalog, run `pnpm db:refresh` locally, commit or upload the resulting DB, and adjust paths — the demo seed is only a few cards so the UI is not empty.

Set **`NEXT_PUBLIC_SITE_URL`** to your canonical URL (e.g. `https://mtg.tinyminotaur.co`) for sitemap/metadata.
