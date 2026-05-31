# Feedy

Feedy is a production-oriented, self-hosted, mobile-first PWA feed reader for standard RSS/Atom feeds, Reddit via RSS only, and YouTube via RSS only. The whole stack runs through Docker with PostgreSQL, Redis, a Next.js app, and a BullMQ worker.

Repository: [github.com/greg-hass/Feedy](https://github.com/greg-hass/Feedy)

Operational docs:

- [Architecture](./ARCHITECTURE.md)
- [Deployment](./DEPLOYMENT.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

## Stack

- Next.js 16 + App Router + TypeScript
- Tailwind CSS 4
- TanStack Query
- Prisma ORM + PostgreSQL
- Redis + BullMQ worker for refreshes and icon jobs
- Readability extraction with `@mozilla/readability`
- Docker + Docker Compose

## Architecture

- `src/app`: mobile-only PWA routes, API routes, login, reader mode
- `src/components`: phone-first UI shell, forms, list cards, navigation
- `src/lib`: auth, data access, feed parsing, discovery, OPML, reader extraction, queues
- `src/worker.ts`: BullMQ worker plus automatic refresh scheduler
- `prisma/schema.prisma`: normalized schema for users, folders, feeds, items, bookmarks, read state, jobs, logs, settings
- `docker-compose.yml`: app, worker, PostgreSQL, Redis

## Feature Coverage

- Single-user login with hashed password
- RSS, Atom, Reddit RSS, YouTube channel RSS, and YouTube playlist RSS ingestion
- Folder and feed management
- Unread timeline, saved items, read/unread state
- Manual feed, folder, and global refresh
- Automatic scheduled refresh via worker
- Reader mode with readability extraction
- Local feed search
- Keyword-based discovery via pluggable search logic
- OPML import/export
- JSON backup export
- Favicon/source icon caching to persistent storage
- Light and dark mode
- Installable mobile PWA shell with offline fallback page

## RSS-only Reddit and YouTube

Reddit and YouTube are consumed strictly via RSS feeds. No Reddit API or YouTube API is used anywhere in the project.

Examples:

- Reddit subreddit: `https://www.reddit.com/r/selfhosted/.rss`
- Reddit search RSS: `https://www.reddit.com/search.rss?q=selfhosted`
- YouTube channel: `https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw`
- YouTube playlist: `https://www.youtube.com/feeds/videos.xml?playlist_id=PL590L5WQmH8fJ54F7gqU7vk0Y7yL3m6D_`

## Quick Start

1. Copy the environment file.

```bash
cp .env.example .env
```

2. Set at least:

- `AUTH_SECRET` to a unique random value of at least 32 characters, for example from `openssl rand -base64 32`
- `APP_USERNAME`
- `APP_PASSWORD` to a non-placeholder password
- `APP_URL` such as `http://192.168.1.186:4000` for a trusted private network
- `COOKIE_SECURE=false` when intentionally using private-network HTTP

3. Start the stack.

```bash
docker compose up --build
```

4. Open your configured URL, for example [http://192.168.1.186:4000](http://192.168.1.186:4000), on your trusted private network, then install it to the home screen.

Do not expose the HTTP private-network setup to the public internet. Public deployments must use HTTPS with `COOKIE_SECURE=true`.

## Docker Notes

- `web` serves the Next.js app
- `worker` processes feed refreshes and icon jobs
- `postgres` stores app data
- `redis` stores BullMQ queue state
- persistent volumes:
  - `postgres_data`
  - `redis_data`
  - `app_data`

The entrypoint runs:

1. `prisma migrate deploy`
2. `npm run seed`
3. the web server or worker

That means first boot will create the single user from `.env` automatically.
If the database already contains more than one user, startup now fails instead of guessing which account to use.

If you inherit a legacy database with multiple users, repair it before starting the stack:

```bash
npm run repair:single-user
```

That command keeps the oldest user row, removes the extras, and re-syncs the surviving account from the current environment values.

## Reverse Proxy

Feedy is reverse-proxy friendly. Put Caddy, Nginx, or Traefik in front of the `web` container and forward to container port `3000`.

Recommended proxy behavior:

- preserve `Host`
- pass `X-Forwarded-*` headers
- terminate TLS at the proxy
- set `APP_URL` to the public HTTPS URL
- set `COOKIE_SECURE=true` behind HTTPS

At runtime, production startup rejects placeholder credentials, public HTTP URLs, and HTTPS configurations that do not use secure cookies.

## Mobile UX / PWA

- Start URL: `/app/unread`
- Display mode: `standalone`
- Bottom navigation for the main sections
- Offline shell fallback at `/offline`
- Service worker caches shell routes but does not aggressively cache API responses, which helps avoid stale feed content

## Authentication

Single-user auth is driven by environment variables:

- `APP_USERNAME`
- `APP_PASSWORD`
- `AUTH_SECRET`

The password is hashed and stored in PostgreSQL. Sessions are cookie-based and signed with `AUTH_SECRET`.

## Refresh Behavior

- Manual refresh:
  - one feed
  - one folder
  - all feeds
- Automatic refresh:
  - worker checks due feeds every minute
  - each feed can override the default interval
- Request boundaries:
  - manual folder or all-feed refresh accepts up to 500 feeds per request
  - a single feed refresh rejects responses containing more than 1,000 items
  - remote media probes and refresh enqueueing run in bounded batches
- Concurrency protection:
  - BullMQ uses deterministic `jobId`s per feed refresh
- Reliability:
  - retries with exponential backoff
  - refresh logs and refresh job rows are stored in PostgreSQL
  - malformed or failing feeds update feed health and last error state

## Discover Search

Discover works by keyword only and does not require exact feed URLs.

Current providers:

- website search results with feed autodiscovery
- Reddit URL normalization into RSS results
- YouTube RSS URL normalization

The discovery logic is intentionally isolated in `src/lib/feed/discover.ts` so additional providers can be added later.

## Import / Export

- Import OPML from the mobile import/export screen, limited to 1 MB and 500 subscriptions per upload
- Export subscriptions as OPML
- Export a portable JSON backup of folders, feeds, items, bookmarks, read states, and settings for libraries with up to 25,000 articles

Folder structure is preserved when OPML outlines include nested feed groups.

## Health And Readiness

`GET /api/health` is a readiness endpoint for deployment tooling and reverse proxies. It checks PostgreSQL and Redis with bounded deadlines:

- returns HTTP `200` with both dependency checks healthy when the app is ready
- returns HTTP `503` when either required dependency is unavailable or times out

## Development

Install dependencies:

```bash
npm install
```

Generate Prisma client:

```bash
npx prisma generate
```

For local development through Docker, start the normal Compose stack:

```bash
docker compose up --build
```

The values in `.env.example` use Docker service names such as `postgres` and `redis`. If you instead run `npm run dev` directly on the host, point `DATABASE_URL` and `REDIS_URL` at reachable host services, typically `localhost`, before starting the development server.

Build:

```bash
npm run build
```

Run worker locally if you already have PostgreSQL and Redis available:

```bash
npm run worker
```

Run validation locally:

```bash
npm test
npm run lint
npm run build
npx prisma validate
npm audit --audit-level=low
```

For an opt-in integration pass against real Postgres and Redis, set `FEEDY_INTEGRATION_TESTS=true` along with `TEST_DATABASE_URL` and `TEST_REDIS_URL`, then run `npm test`.

## Ubuntu Server Deploy

Feedy can be deployed on an Ubuntu server with Docker Compose using the published image at `ghcr.io/greg-hass/feedy:latest`.

1. Clone the repo on the server.
2. Copy `.env.example` to `.env` and set `APP_URL`, `AUTH_SECRET`, `APP_USERNAME`, `APP_PASSWORD`, and `POSTGRES_PASSWORD`.
3. Start the stack:

```bash
docker compose -f docker-compose.deploy.yml up -d
```

The GitHub Actions workflow at `.github/workflows/publish-ghcr.yml` publishes the image to GHCR automatically on pushes to `main`. Before publishing, it installs locked dependencies and requires tests, lint, Prisma validation, dependency audit, and a production application build to pass.

## Backup Notes

For full recovery, keep:

- PostgreSQL volume backup
- Redis volume if you want queue state preserved
- `app_data` volume for cached icons
- or use the JSON export for application-level portability when the library contains no more than 25,000 articles

For larger libraries or full disaster recovery, retain PostgreSQL and `app_data` volume backups rather than relying on the portable JSON export.

## Limitations

- Discovery currently uses keyword-driven web search and feed autodiscovery, so result quality depends on index visibility of the source
- Reordering UI is not drag-and-drop yet, though schema and position fields are ready for it
- Reader extraction happens on demand when opening an item rather than precomputing every article

## Extension Points

- richer discovery providers
- precomputed reader extraction jobs
- smarter ranking for discovery and unread views
- background cleanup / retention policies
- richer import diagnostics and duplicate merge controls
