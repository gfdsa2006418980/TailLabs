# Shared leaderboard setup

The games stay on GitHub Pages. A Cloudflare Worker exposes the public leaderboard APIs, and Cloudflare D1 stores TL001 challenge rankings and TL002 runner scores in separate tables.

## Create the free backend

1. Create or sign in to a Cloudflare account on the Free plan.
2. From this repository, run `npx --yes wrangler@4.44.0 login` and complete the browser sign-in.
3. Run `npx --yes wrangler@4.44.0 d1 create taillabs-leaderboard`. If Wrangler offers to add the database binding, accept it. Otherwise copy the returned database ID into `wrangler.toml` as `database_id`.
4. Apply the table schema with `npx --yes wrangler@4.44.0 d1 execute taillabs-leaderboard --remote --file=worker/schema.sql`.
5. Deploy the API with `npx --yes wrangler@4.44.0 deploy`.
6. Open the returned `workers.dev` URL plus `/api/health`; it should return `{"ok":true}`.

## Connect the game

Set the GitHub repository variable `VITE_LEADERBOARD_API_URL` to the Worker URL, without a trailing slash. In GitHub, open **Settings → Secrets and variables → Actions → Variables**. The Pages workflow injects this value into the production build. For local development, put the same value in the ignored `.env.local` file as `VITE_LEADERBOARD_API_URL=...`.

The browser keeps existing local records as a fallback. TL001 results are recalculated by the Worker from round fields. TL002 uses the separate `runner_leaderboard_scores` table and `/api/runner-leaderboard` plus `/api/runner-scores`; its score is recalculated as `(distance + coins) × speed multiplier`, rounded down. Names are trimmed to 12 characters. The public clients can still be modified to submit fabricated but plausible runs; these lightweight leaderboards are not cheat-proof competitive services.

To add the TL002 table to an existing D1 database without touching TL001 records, run `npx --yes wrangler@4.44.0 d1 execute taillabs-leaderboard --remote --file=worker/migrations/0002_tl002_runner_leaderboard.sql`. New D1 databases can use the complete `worker/schema.sql` instead.

## Daily and all-time rankings

Both games default to the current daily board, with an all-time tab. Daily records use the submission timestamp in Taiwan time (UTC+8), from 00:00 inclusive to the next 00:00 exclusive. Renaming a record preserves its timestamp. TL001 still separates challenge sizes and keeps its existing completed/progress ranking rules; TL002 sorts by total score.

GET `/api/leaderboard?target=10&period=daily&page=1` and `/api/runner-leaderboard?period=history&page=1` return `entries`, `page`, `pageSize`, `totalEntries`, `totalPages`, `period`, and `day` (a Taiwan date for daily rankings, otherwise null). Pages contain up to 10 entries; each board exposes only its first 100 entries, up to 10 pages. Empty boards return page 1 of 1. Invalid pages outside 1–10 are rejected; a stale page beyond the available results is clamped to the last page. The API defaults to history when `period` is omitted.

Scores are retained in D1 instead of being deleted when they leave the all-time top 100, so a new daily result can still appear on its daily board. Each browser fallback retains the union of its all-time top 100 and current daily top 100. Scores deleted by older deployments are not reconstructed. Apply `worker/migrations/0003_daily_rankings.sql` after the TL002 migration to add time lookup indexes; these migrations only add tables/indexes and preserve existing scores. Then deploy the Worker and rebuild Pages together.

## GitHub account rename

The Worker allowlist in `wrangler.toml` includes both the legacy Pages origin (`https://tailmaskgames.github.io`) and the renamed account origin (`https://gfdsa2006418980.github.io`). After changing this list, redeploy the existing Worker with `npx --yes wrangler@4.44.0 deploy`; a Pages deployment does not deploy the Worker. Keep the existing Worker URL and D1 database binding so leaderboard records remain in the same database.

## Local API preview

Run `npx --yes wrangler@4.44.0 dev` in one terminal and the Vite development server in another. Wrangler uses a local D1 database by default; initialize it with `npx --yes wrangler@4.44.0 d1 execute taillabs-leaderboard --local --file=worker/schema.sql`.
