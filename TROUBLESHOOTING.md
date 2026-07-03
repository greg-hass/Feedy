# Troubleshooting

## Supported startup paths

Feedy has two supported ways to start:

1. **Full stack (recommended):** `docker compose up --build` — starts PostgreSQL, Redis, web, and worker together.
2. **Direct Next.js dev:** start PostgreSQL and Redis on the host, set `DATABASE_URL` and `REDIS_URL` to `localhost`, run migrations and seed, then `npm run dev`.

## App will not start

- Check `APP_URL`, `AUTH_SECRET`, `APP_USERNAME`, and `APP_PASSWORD`.
- Public deployments must use HTTPS with `COOKIE_SECURE=true`.
- Startup fails if the database already contains multiple users. Run:

```bash
npm run repair:single-user
```

## `DATABASE_URL` is missing or unreachable

The Next.js dev server starts even without `DATABASE_URL`, but every API route that touches the database will fail silently. Prisma reads `DATABASE_URL` from the process environment, not from `src/lib/env.ts` defaults.

- If running directly (`npm run dev`), ensure `.env` exists with `DATABASE_URL` pointing to a reachable PostgreSQL instance using `localhost` as the host (not `postgres`, which is the Docker Compose service name).
- If running in Docker, ensure the `.env` uses the service hostname `postgres`.
- Verify with `curl http://localhost:4000/api/health` — a 503 means a dependency is down.

## Redis is unavailable

The worker and refresh queue require Redis. If Redis is down, the web UI loads but feeds never refresh.

- If running directly, ensure Redis is running on the host and `REDIS_URL` points to `localhost`.
- If running in Docker, ensure the `.env` uses the service hostname `redis`.
- The server will repeatedly attempt reconnection. Restart the app after fixing Redis.

## Port 3000 or 4000 is already in use

Next.js dev defaults to port 3000. The Docker Compose setup maps to host port 4000.

- Find the process: `lsof -i :3000` or `lsof -i :4000`
- Kill it or use a different port: `npm run dev -- -p 3001`

## `.next/dev/lock` is held by another process

A stale Next.js dev server can hold a lock file in `.next/dev/`, preventing a new server from starting cleanly.

- Kill any orphaned `next dev` or `node` processes.
- Remove the lock: `rm -rf .next/dev/lock`
- Restart `npm run dev`.

## Web UI loads but no feeds refresh

- Confirm Redis is reachable.
- Confirm the worker container is running.
- Check `/api/health` for dependency readiness.
- Look for refresh failures in PostgreSQL `RefreshJob` and `RefreshLog`.

## Feed import or refresh is slow

- Large YouTube feeds can still be expensive to parse.
- Navigation performance stats scan recent refresh logs and are refreshed on a poll interval.
- Reader extraction does an outbound fetch only when `readabilityHtml` is missing.

## Discovery returns weak results

- Discovery is keyword-driven and depends on search engine visibility.
- Try a direct feed URL or a source-specific URL such as Reddit `.rss` or YouTube channel/playlist RSS.

## Need to verify the system

Useful checks:

```bash
npm test
npm run lint
npm run build
curl http://localhost:4000/api/health
```
