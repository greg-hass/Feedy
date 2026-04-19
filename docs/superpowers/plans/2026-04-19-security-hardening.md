# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove request-time auth writes, sanitize feed HTML before it reaches the reader, and add Redis-backed rate limiting to the most abuse-prone endpoints.

**Architecture:** Split auth bootstrapping from request-time session lookup so protected page loads stay read-only. Centralize reader HTML sanitization in one helper and reuse it at parsing and render time. Add a small fixed-window Redis rate limiter that returns `429` and `Retry-After`, then wire it into login, import, and refresh routes.

**Tech Stack:** Next.js route handlers, Prisma, Redis/ioredis, `sanitize-html`, `node:test`, `tsx`.

---

### Task 1: Split auth bootstrap from request-time auth

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `prisma/seed.ts`
- Test: `src/lib/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadUserBySessionId } from "@/lib/auth";

describe("loadUserBySessionId", () => {
  it("loads the current user without writing", async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          id: "user-1",
          username: "admin",
          settings: { id: "settings-1" },
        }),
        update: async () => {
          throw new Error("update should not be called");
        },
      },
    } as const;

    const user = await loadUserBySessionId(prisma, "user-1");
    assert.equal(user?.id, "user-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/auth.test.ts -v`
Expected: FAIL because `loadUserBySessionId` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function loadUserBySessionId(
  client: { user: { findUnique: typeof prisma.user.findUnique } },
  userId: string,
) {
  return client.user.findUnique({
    where: { id: userId },
    include: { settings: true },
  });
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const user = await loadUserBySessionId(prisma, session.userId);
  if (!user) {
    redirect("/login");
  }

  return user;
}
```

Move the current env-driven user sync logic into a dedicated helper such as `syncSingleUserFromEnv()` and keep that helper for bootstrap paths only. Update `authenticate()` to call the bootstrap helper, and update `prisma/seed.ts` to call the same helper instead of duplicating the create/update logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/auth.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts prisma/seed.ts src/lib/auth.test.ts
git commit -m "fix: make request auth read-only"
```

### Task 2: Sanitize feed HTML with one shared helper

**Files:**
- Create: `src/lib/sanitize-reader-html.ts`
- Modify: `src/lib/feed/parse.ts`
- Modify: `src/lib/feed/reader.ts`
- Modify: `src/app/reader/[itemId]/page.tsx`
- Test: `src/lib/sanitize-reader-html.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeReaderHtml } from "@/lib/sanitize-reader-html";

describe("sanitizeReaderHtml", () => {
  it("removes script tags and event handlers", () => {
    const dirty = `<p>Hello <script>alert(1)</script><img src="https://example.com/x.png" onerror="alert(2)"><a href="https://example.com" onclick="alert(3)">link</a></p>`;
    const clean = sanitizeReaderHtml(dirty);

    assert.equal(clean.includes("<script>"), false);
    assert.equal(clean.includes("onerror"), false);
    assert.equal(clean.includes("onclick"), false);
    assert.match(
      clean,
      /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">link<\/a>/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/sanitize-reader-html.test.ts -v`
Expected: FAIL because `sanitizeReaderHtml` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import sanitizeHtml from "sanitize-html";

const readerSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "figure", "figcaption"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },
};

export function sanitizeReaderHtml(html: string | null | undefined) {
  if (!html) {
    return "";
  }

  return sanitizeHtml(html, readerSanitizeOptions);
}
```

Use the helper in `src/lib/feed/parse.ts` before storing `contentHtml`, reuse it in `src/lib/feed/reader.ts` instead of duplicating the sanitizer config, and wrap the final `dangerouslySetInnerHTML` value in `src/app/reader/[itemId]/page.tsx` with the same helper as a defense-in-depth guard.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/sanitize-reader-html.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sanitize-reader-html.ts src/lib/feed/parse.ts src/lib/feed/reader.ts src/app/reader/[itemId]/page.tsx src/lib/sanitize-reader-html.test.ts
git commit -m "fix: sanitize reader html consistently"
```

### Task 3: Add Redis-backed rate limiting to login, import, and refresh routes

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/import/opml/route.ts`
- Modify: `src/app/api/refresh/all/route.ts`
- Modify: `src/app/api/folders/[folderId]/refresh/route.ts`
- Modify: `src/app/api/feeds/[feedId]/refresh/route.ts`
- Test: `src/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFixedWindowRateLimiter } from "@/lib/rate-limit";

class FakeRedis {
  private readonly counts = new Map<string, number>();
  private readonly expiries = new Map<string, number>();

  async incr(key: string) {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number) {
    this.expiries.set(key, seconds);
    return 1;
  }

  async ttl(key: string) {
    return this.expiries.get(key) ?? -1;
  }
}

describe("createFixedWindowRateLimiter", () => {
  it("blocks after the configured limit is exceeded", async () => {
    const limiter = createFixedWindowRateLimiter(new FakeRedis() as never);

    assert.equal(
      (await limiter.check("login:127.0.0.1:admin", { limit: 2, windowSeconds: 60 })).allowed,
      true,
    );
    assert.equal(
      (await limiter.check("login:127.0.0.1:admin", { limit: 2, windowSeconds: 60 })).allowed,
      true,
    );
    assert.equal(
      (await limiter.check("login:127.0.0.1:admin", { limit: 2, windowSeconds: 60 })).allowed,
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/rate-limit.test.ts -v`
Expected: FAIL because `createFixedWindowRateLimiter` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import { getRedis } from "@/lib/redis";

export function createFixedWindowRateLimiter(client = getRedis()) {
  return {
    async check(key: string, input: { limit: number; windowSeconds: number }) {
      const redisKey = `rate-limit:${key}`;
      const count = await client.incr(redisKey);
      if (count === 1) {
        await client.expire(redisKey, input.windowSeconds);
      }

      const ttl = await client.ttl(redisKey);
      return {
        allowed: count <= input.limit,
        remaining: Math.max(0, input.limit - count),
        retryAfterSeconds: ttl > 0 ? ttl : input.windowSeconds,
      };
    },
  };
}
```

Use this helper in:

- `src/app/api/auth/login/route.ts` with an IP + username key before `authenticate()`
- `src/app/api/import/opml/route.ts` with a user + route key after `assertApiUser()`
- `src/app/api/refresh/all/route.ts` with a user + route key before queueing the batch
- `src/app/api/folders/[folderId]/refresh/route.ts` with a user + route key before queueing the folder batch
- `src/app/api/feeds/[feedId]/refresh/route.ts` with a user + route key before queueing the single-feed refresh

When the limit is exceeded, return `429` and include a `Retry-After` header. Keep the existing login response shape intact by returning JSON `429` for JSON login requests and a redirect back to `/login` for form posts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/rate-limit.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Run a route smoke test**

Run:

```bash
docker compose build web worker
docker compose up -d --force-recreate web worker
```

Then verify:

```bash
curl -i -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"wrong"}'
```

Expected: after the configured number of attempts, the response becomes `429 Too Many Requests` and includes `Retry-After`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.ts src/app/api/auth/login/route.ts src/app/api/import/opml/route.ts src/app/api/refresh/all/route.ts src/app/api/folders/[folderId]/refresh/route.ts src/app/api/feeds/[feedId]/refresh/route.ts src/lib/rate-limit.test.ts
git commit -m "fix: add rate limiting to abuse-prone routes"
```

### Task 4: Final verification and handoff

**Files:**
- Verify: `src/lib/auth.ts`
- Verify: `src/lib/sanitize-reader-html.ts`
- Verify: `src/lib/rate-limit.ts`
- Verify: route handlers touched above

- [ ] **Step 1: Run the full TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Run targeted lint**

Run:

```bash
npx eslint \
  src/lib/auth.ts \
  src/lib/auth.test.ts \
  src/lib/sanitize-reader-html.ts \
  src/lib/sanitize-reader-html.test.ts \
  src/lib/rate-limit.ts \
  src/lib/rate-limit.test.ts \
  src/app/api/auth/login/route.ts \
  src/app/api/import/opml/route.ts \
  src/app/api/refresh/all/route.ts \
  src/app/api/folders/[folderId]/refresh/route.ts \
  src/app/api/feeds/[feedId]/refresh/route.ts \
  src/lib/feed/parse.ts \
  src/lib/feed/reader.ts \
  src/app/reader/[itemId]/page.tsx
```

Expected: PASS, aside from any pre-existing warnings already known in unrelated files.

- [ ] **Step 3: Rebuild the containers**

Run:

```bash
docker compose build web worker
docker compose up -d --force-recreate web worker
```

Expected: both services rebuild successfully and restart cleanly.

- [ ] **Step 4: Commit the final state**

```bash
git add src/lib/auth.ts src/lib/sanitize-reader-html.ts src/lib/rate-limit.ts src/app/api/auth/login/route.ts src/app/api/import/opml/route.ts src/app/api/refresh/all/route.ts src/app/api/folders/[folderId]/refresh/route.ts src/app/api/feeds/[feedId]/refresh/route.ts src/lib/feed/parse.ts src/lib/feed/reader.ts src/app/reader/[itemId]/page.tsx
git commit -m "fix: harden auth reader and refresh paths"
```
