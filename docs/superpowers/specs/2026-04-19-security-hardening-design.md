# Security Hardening and Performance Cleanup

## Goal
Reduce the highest-risk security and performance issues in the app without a broad architectural rewrite.

## Scope
This pass covers three shared concerns:

1. Stop `ensureSingleUser()` from writing on every server-rendered app request.
2. Sanitize feed HTML before it is rendered in the reader.
3. Add rate limiting to login, OPML import, and refresh endpoints.

It does not cover timeline pagination, offline caching expansion, or a full auth/session redesign.

## Current Problems

- `ensureSingleUser()` in [`src/lib/auth.ts`](/Users/greg/Projects/Feedy/src/lib/auth.ts) updates the user record every time `requireUser()` runs.
- Reader content in [`src/app/reader/[itemId]/page.tsx`](/Users/greg/Projects/Feedy/src/app/reader/[itemId]/page.tsx) renders `readabilityHtml` or `contentHtml` with `dangerouslySetInnerHTML`.
- Login, import, and refresh routes have no explicit throttling.

## Proposed Design

### 1. Auth bootstrap without repeated writes

Split the current single-user bootstrap behavior into two paths:

- A bootstrap/update path used when the app starts or when authentication needs to reconcile env-driven defaults.
- A read-only path used by request-time authorization.

`requireUser()` should only:

- read the session cookie
- load the current user by ID
- redirect if the session is invalid

It should not rewrite the user or settings record on every page load.

The env-driven single-user sync can remain available, but it should be called from a startup/bootstrap path rather than every app render.

### 2. Shared HTML sanitization

Reuse the existing `sanitize-html` dependency already used in [`src/lib/feed/reader.ts`](/Users/greg/Projects/Feedy/src/lib/feed/reader.ts).

Create a shared helper that normalizes feed HTML into a safe subset for reader rendering. The helper should be used in two places:

- at feed parsing time, before `contentHtml` is stored
- at reader render time, as a final guard before `dangerouslySetInnerHTML`

This gives defense in depth:

- hostile content is stripped before persistence
- any legacy rows or unexpected content are still sanitized at display time

The helper should preserve the current readable rendering style as much as possible, including common inline formatting and images where already allowed.

### 3. Redis-backed rate limiting

Add a small reusable rate-limit helper that uses Redis and returns a deterministic `429` response with `Retry-After`.

Apply it to:

- [`src/app/api/auth/login/route.ts`](/Users/greg/Projects/Feedy/src/app/api/auth/login/route.ts)
- [`src/app/api/import/opml/route.ts`](/Users/greg/Projects/Feedy/src/app/api/import/opml/route.ts)
- [`src/app/api/refresh/all/route.ts`](/Users/greg/Projects/Feedy/src/app/api/refresh/all/route.ts)
- [`src/app/api/folders/[folderId]/refresh/route.ts`](/Users/greg/Projects/Feedy/src/app/api/folders/[folderId]/refresh/route.ts)
- [`src/app/api/feeds/[feedId]/refresh/route.ts`](/Users/greg/Projects/Feedy/src/app/api/feeds/[feedId]/refresh/route.ts)

Keying rules:

- Login: IP + username
- Authenticated mutations: user ID + route name

The limits should be conservative enough to stop brute force and refresh spam, but not so tight that normal app use feels blocked.

## Data Flow

### Auth

1. Request enters an app route.
2. `requireUser()` validates the session and loads the user.
3. No write occurs unless the app is explicitly bootstrapping the single-user record.

### Reader

1. Feed parsing strips unsafe HTML before storing `contentHtml`.
2. Reader rendering sanitizes any displayed HTML again.
3. `dangerouslySetInnerHTML` only receives sanitized markup.

### Rate-limited routes

1. Request arrives at login/import/refresh endpoint.
2. The route checks Redis for the caller’s budget.
3. If the limit is exceeded, the route returns `429` and a `Retry-After` header.
4. Otherwise the request continues normally.

## Error Handling

- Rate-limited requests return a clear `429 Too Many Requests` response.
- Reader sanitization should never break the page; if markup cannot be trusted, fall back to plain summary text.
- Auth bootstrap failures should fail closed for protected routes, rather than silently continuing with inconsistent session state.

## Testing

Add focused tests for:

- read-only `requireUser()` behavior
- HTML sanitization of malicious and normal sample content
- rate limiting for login bursts
- rate limiting for repeated refresh/import requests

The tests should verify observable behavior, not internal implementation details.

## Non-Goals

- No timeline pagination or infinite scroll changes
- No offline caching redesign
- No full session/auth system replacement
- No new third-party dependency unless the existing helpers are insufficient

## Success Criteria

- Server-rendered app requests no longer perform a user write on every render.
- Malicious feed HTML is neutralized before it can execute in reader view.
- Repeated login/import/refresh abuse receives `429` responses instead of hammering the app.
- The scope stays small enough to ship as one hardening pass.
