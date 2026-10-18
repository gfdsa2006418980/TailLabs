# Shared leaderboard setup

The game stays on GitHub Pages. A Cloudflare Worker exposes the public leaderboard API, and Cloudflare D1 stores the shared top ten for each challenge size.

## Create the free backend

1. Create or sign in to a Cloudflare account on the Free plan.
2. From this repository, run `npx --yes wrangler@4.44.0 login` and complete the browser sign-in.
3. Run `npx --yes wrangler@4.44.0 d1 create taillabs-leaderboard`. If Wrangler offers to add the database binding, accept it. Otherwise copy the returned database ID into `wrangler.toml` as `database_id`.
4. Apply the table schema with `npx --yes wrangler@4.44.0 d1 execute taillabs-leaderboard --remote --file=worker/schema.sql`.
5. Deploy the API with `npx --yes wrangler@4.44.0 deploy`.
6. Open the returned `workers.dev` URL plus `/api/health`; it should return `{"ok":true}`.

## Connect the game

Set the GitHub repository variable `VITE_LEADERBOARD_API_URL` to the Worker URL, without a trailing slash. In GitHub, open **Settings → Secrets and variables → Actions → Variables**. The Pages workflow injects this value into the production build. For local development, put the same value in the ignored `.env.local` file as `VITE_LEADERBOARD_API_URL=...`.

The browser keeps its existing local records as a fallback. Shared results are recalculated by the Worker from the round fields, names are trimmed to 12 characters, challenge sizes are checked, and only the top ten per size remain in D1. The public client can still be modified to submit fabricated but plausible rounds; this lightweight leaderboard is not a cheat-proof competitive service.

## GitHub account rename

The production origin in `wrangler.toml` is `https://tailmaskgames.github.io`. After changing the GitHub username, redeploy the existing Worker with `npx --yes wrangler@4.44.0 deploy` so its CORS allowlist accepts the new Pages origin. A Pages deployment does not deploy the Worker. Keep the existing Worker URL and D1 database; the GitHub account rename does not require creating another backend.

## Local API preview

Run `npx --yes wrangler@4.44.0 dev` in one terminal and the Vite development server in another. Wrangler uses a local D1 database by default; initialize it with `npx --yes wrangler@4.44.0 d1 execute taillabs-leaderboard --local --file=worker/schema.sql`.
