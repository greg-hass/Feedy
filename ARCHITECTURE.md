# Architecture

Feedy is a single-user, self-hosted PWA feed reader built around a small set of durable services:

- `web`: Next.js app and API routes
- `worker`: BullMQ worker plus scheduled refresh/retention jobs
- `postgres`: application data, job state, logs, settings
- `redis`: queue state and background job coordination

## Core flows

- Login and bootstrap live in `src/lib/auth.ts`
- Timeline and item queries live in `src/lib/data.ts`
- Navigation payloads and counts live in `src/lib/navigation-data.ts`
- Feed refresh orchestration lives in `src/lib/feed/service.ts` and `src/lib/refresh-orchestration.ts`
- Background processing lives in `src/worker.ts`

## Data model

The Prisma schema centers on:

- `User` and `Settings`
- `Folder` and `Feed`
- `Item`
- `ReadState` and `Bookmark`
- `RefreshJob` and `RefreshLog`
- `ImportExportRecord`

## Important constraints

- The app is intentionally single-user.
- Reddit and YouTube are RSS-only.
- Refreshes are bounded by workload limits and queue dedupe.
- Reader content is cached in PostgreSQL after first extraction.
- Discovery is keyword-driven and returns ranked feed suggestions rather than exact URLs only.

## Where to look first

- `src/lib/feed/parse.ts` for feed parsing and provider-specific ingest
- `src/lib/feed/discover.ts` for discovery orchestration
- `src/lib/http.ts` for outbound request safety and concurrency limits
- `src/lib/navigation-data.ts` for dashboard counts and performance stats
- `src/app/api/*` for route boundaries

