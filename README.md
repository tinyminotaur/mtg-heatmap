# MTG Heatmap

Next.js heatmap for Magic cards (SQLite + Scryfall-shaped data).

## Local dev

```bash
pnpm install
pnpm db:seed   # tiny demo DB (optional if you use db:refresh)
pnpm dev
```

Full Scryfall bulk (default_cards, POC release cutoff in `src/lib/constants.ts`):

```bash
export SCRYFALL_USER_AGENT="mtg-heatmap/1.0 (https://github.com/YOU/REPO)"
pnpm db:refresh
```

## Production (Vercel)

### Build-time database

- If **`REMOTE_MTG_DB_URL`** is set on Vercel, the build downloads that URL to `data/mtg.db` (use a stable raw file URL).
- Otherwise **`VERCEL=1`** builds run **`pnpm db:seed`** (tiny demo).

Stable URL after CI publishes the DB (replace owner/repo):

`https://github.com/tinyminotaur/mtg-heatmap/releases/download/db-nightly/mtg.db`

Set **`NEXT_PUBLIC_SITE_URL`** to your canonical URL (e.g. `https://mtg.tinyminotaur.co`).

### Nightly Scryfall refresh (GitHub Actions)

Workflow: [`.github/workflows/scryfall-nightly.yml`](.github/workflows/scryfall-nightly.yml)

1. **Repo secret `SCRYFALL_USER_AGENT`** — optional but recommended ([Scryfall guidance](https://scryfall.com/docs/api)); use **plain ASCII** (no “smart” punctuation). If unset, CI uses `mtg-heatmap/1.0 (+https://github.com/<owner>/<repo>)` from the workflow.
2. **Optional `VERCEL_DEPLOY_HOOK_URL`** — create a [Deploy Hook](https://vercel.com/docs/deploy-hooks) in the Vercel project and add it as a repo secret so each successful refresh triggers a production redeploy (pulls the new `mtg.db` via `REMOTE_MTG_DB_URL`).
3. **Vercel env `REMOTE_MTG_DB_URL`** — set to the `releases/download/db-nightly/mtg.db` URL above so production builds bundle the nightly DB.

The workflow runs **09:00 UTC** daily, on **manual** “Run workflow”, or on **`repository_dispatch`** `scryfall-refresh`.

### Optional: trigger refresh from Vercel

Route: **`GET /api/cron/scryfall`** (dispatches the GitHub workflow; does **not** run the bulk job inside Vercel).

On Vercel set:

- `CRON_SECRET` — match Vercel’s cron auth header
- `GITHUB_REPO_DISPATCH_TOKEN` — classic PAT with **`repo`** scope (or fine-grained with Contents + Actions write as needed for `repository_dispatch`)
- `CRON_GITHUB_REPO` — e.g. `tinyminotaur/mtg-heatmap`

Add a [Vercel Cron](https://vercel.com/docs/cron-jobs) in the dashboard (or `vercel.json` `crons`) pointing at `/api/cron/scryfall` if you want the job kicked from your project **in addition to** the GitHub schedule (usually pick **one** to avoid double refreshes).
