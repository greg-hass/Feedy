# AGENTS.md

## Project Overview

Feedy — a self-hosted, mobile-first PWA feed reader for RSS/Atom feeds, Reddit (via RSS), and YouTube (via RSS). Single-user by design.

Stack: Next.js 16, TypeScript, Tailwind CSS 4, Prisma, PostgreSQL 16, Redis 7, BullMQ, Docker.

Repository: [github.com/greg-hass/Feedy](https://github.com/greg-hass/Feedy)

---

## Priorities

1. Correctness
2. Reliability
3. Maintainability
4. Security
5. Performance

Prefer simple, explicit solutions. Do not optimize prematurely.

---

## Architecture

### Services (Docker Compose)

| Service | Purpose | Port |
|---------|---------|------|
| `web` | Next.js app + API routes | 4000 → 3000 |
| `worker` | BullMQ worker + refresh scheduler | — |
| `postgres` | PostgreSQL 16 (app data, job state, logs) | internal |
| `redis` | Queue state, background job coordination | internal |
| `migrate` | One-shot Prisma migration on boot | — |

All services have healthchecks. The `web` service depends on `migrate` completing successfully.

### Key Paths

- `src/app/` — Next.js App Router routes (mobile-first PWA)
- `src/components/` — UI shell, forms, cards, navigation
- `src/lib/auth.ts` — login and bootstrap
- `src/lib/data.ts` — timeline and item queries
- `src/lib/feed/parse.ts` — feed parsing and provider-specific ingest
- `src/lib/feed/discover.ts` — feed discovery orchestration
- `src/lib/feed/service.ts` — feed refresh orchestration
- `src/lib/refresh-orchestration.ts` — refresh orchestration
- `src/lib/navigation-data.ts` — dashboard counts and stats
- `src/lib/http.ts` — outbound request safety and concurrency limits
- `src/worker.ts` — BullMQ worker + scheduled jobs
- `prisma/schema.prisma` — normalized schema
- `docker/entrypoint.sh` — container entrypoint (migrate or worker)

### Data Model

Prisma schema: `User`, `Settings`, `Folder`, `Feed`, `Item`, `ReadState`, `Bookmark`, `RefreshJob`, `RefreshLog`, `ImportExportRecord`.

Feed types: `RSS`, `ATOM`, `REDDIT_RSS`, `YOUTUBE_CHANNEL_RSS`, `YOUTUBE_PLAYLIST_RSS`, `YOUTUBE_RSS`, `UNKNOWN`.

### Important Constraints

- **Single-user.** Not a multi-tenant app.
- **RSS-only for Reddit and YouTube.** No API integrations.
- **Reader content is cached** in PostgreSQL after first extraction (Readability).
- **Refreshes are bounded** by workload limits and queue dedupe.
- **Discovery is keyword-driven** — returns ranked feed suggestions, not exact URLs.

---

## Development

```bash
npm install
npm run prisma:generate
npm run dev          # Next.js dev server
```

Worker (separate terminal):

```bash
npm run worker
```

### Scripts

```bash
npm run dev              # Next.js dev
npm run build            # Production build (standalone output)
npm run start            # node .next/standalone/server.js
npm run lint             # ESLint
npm run test             # tsx --test (finds *.test.ts / *.test.tsx)
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations (production)
npm run prisma:push      # Push schema (dev)
npm run seed             # Seed single user
npm run repair:single-user  # Repair single-user state
npm run worker           # BullMQ worker
```

---

## Docker

### Local Development

```bash
docker compose up --build
```

### Production

```bash
docker compose -f docker-compose.deploy.yml up -d
```

Image: `ghcr.io/greg-hass/feedy:latest`

### Required Environment

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | JWT/cookie signing secret |
| `APP_USERNAME` | Single user login |
| `APP_PASSWORD` | Single user password |
| `APP_URL` | Public URL (e.g. `http://192.168.1.186:4000`) |
| `COOKIE_SECURE` | `false` for LAN HTTP, `true` for public HTTPS |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |

### Service Commands

```bash
docker compose config          # Validate compose
docker compose build           # Build images
docker compose up -d           # Start
docker compose ps              # Status
docker compose logs            # Logs
docker compose logs -f web     # Follow specific service
```

### Volumes

- `postgres_data` — PostgreSQL data
- `redis_data` — Redis AOF data
- `app_data` — Shared app data (mounted to `/app/data`)

---

## Rules

- Do not make cosmetic-only changes.
- Do not rename services, containers, networks, volumes, routes, environment variables, or APIs without justification.
- Do not introduce unnecessary abstractions.
- Preserve existing architecture unless structural issues require change.
- Prefer existing patterns over introducing new ones.
- Keep diffs focused and minimal.
- Avoid speculative refactors.

New dependencies must:

- Solve a problem not reasonably handled by existing tooling or dependencies
- Be actively maintained
- Have acceptable security posture
- Be justified in the change summary

---

## Validation

Commands run by `/land` and CI. Runtime daemons (worker) are NOT validation commands.

```bash
npm run lint
npm run test
npm run build
```

## Testing

Before completing any task:

1. Validate configuration
2. Run `npm run lint`
3. Run `npm run test`
4. Run `npm run build` if changes affect build
5. Verify containers start and are healthy
6. Verify no regressions

All checks must pass before task completion.

---

## Persistence & Data Safety

- Database migrations must be backwards compatible.
- Never drop tables, columns, or volumes without backup and rollback plans.
- Preserve persistent volume mappings and storage layouts.
- Prisma schema changes should be migration-safe.

---

## Security

- Secrets must never be committed.
- Do not hardcode credentials, API keys, or tokens.
- Do not expose admin interfaces publicly.
- Prefer least-privilege access.
- Validate all external input.

---

## Output Expectations

When making changes:

- Explain what changed and why
- Identify risks and tradeoffs
- List affected files
- List commands run and results
- Keep explanations concise
