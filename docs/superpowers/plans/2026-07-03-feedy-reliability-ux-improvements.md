# Feedy Reliability and UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Feedy start predictably, eliminate known interaction defects, improve accessible feedback and modal behavior, and complete a real mobile UX verification pass.

**Architecture:** Keep the current Next.js, TanStack Query, Prisma, and Tailwind architecture. Address reliability first, then correctness, accessibility, and visual polish in separate reviewable changes. Add small reusable primitives only where several existing surfaces need the same behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Prisma, PostgreSQL, Redis, Node test runner, Docker Compose.

---

## File map

- Create `.env.example`: checked, non-secret environment template for Docker and local development.
- Modify `README.md`: make supported startup paths and dependency requirements explicit.
- Modify `TROUBLESHOOTING.md`: add dependency and stale-dev-server diagnostics.
- Create `src/lib/dependency-preflight.ts`: bounded PostgreSQL and Redis readiness checks with actionable errors.
- Create `src/lib/dependency-preflight.test.ts`: preflight behavior tests.
- Modify `src/app/api/health/route.ts`: reuse readiness checks without exposing credentials.
- Modify `src/components/forms.tsx`: single-submit behavior, field labels, errors, and sheet primitive adoption.
- Create `src/components/ui/sheet.tsx`: accessible bottom-sheet semantics and focus lifecycle.
- Create `src/components/ui/sheet.test.tsx`: semantic and Escape/focus contract tests.
- Modify `src/components/login-form.tsx`: keyboard-accessible password toggle and announced errors.
- Modify `src/components/discover-screen.tsx`: accessible search label and add error feedback.
- Modify `src/components/settings-screen.tsx`: mutation feedback, selected-state semantics, and simplified import/export navigation.
- Modify `src/components/app-shell.tsx`: semantic inactive navigation color and current-page state.
- Modify `src/app/globals.css`: correct success colors and navigation token.
- Create `src/lib/theme-contract.test.ts`: regression checks for semantic theme tokens.
- Modify `src/lib/feeds-ui.test.ts`: form submission and sheet accessibility contracts.
- Create `.audit/2026-07-03-app-assessment/screenshots/`: verified runtime screenshots after implementation.
- Modify `.audit/2026-07-03-app-assessment/README.md`: close findings with evidence and remaining limits.

## Task 1: Make startup deterministic

**Files:**

- Create: `.env.example`
- Create: `src/lib/dependency-preflight.ts`
- Create: `src/lib/dependency-preflight.test.ts`
- Modify: `src/app/api/health/route.ts`
- Modify: `README.md:60`
- Modify: `TROUBLESHOOTING.md`

- [ ] **Step 1: Add failing dependency-preflight tests**

Test injected PostgreSQL and Redis checks rather than opening real connections:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRuntimeDependencies } from "./dependency-preflight";

describe("checkRuntimeDependencies", () => {
  it("reports both dependencies as ready", async () => {
    const result = await checkRuntimeDependencies({
      checkDatabase: async () => undefined,
      checkRedis: async () => undefined,
    });
    assert.deepEqual(result, { database: true, redis: true });
  });

  it("fails with an actionable database message", async () => {
    await assert.rejects(
      () =>
        checkRuntimeDependencies({
          checkDatabase: async () => {
            throw new Error("connection refused");
          },
          checkRedis: async () => undefined,
        }),
      /PostgreSQL is unavailable/,
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npx tsx --test src/lib/dependency-preflight.test.ts
```

Expected: failure because `dependency-preflight.ts` does not exist.

- [ ] **Step 3: Implement bounded, injectable checks**

Export `checkRuntimeDependencies`, accept optional injected check functions, and use the existing Prisma and Redis clients by default. Wrap failures with messages that name the missing service but never include connection URLs or credentials. Apply a short timeout so health checks cannot hang indefinitely.

The public result must remain:

```ts
export type DependencyReadiness = {
  database: boolean;
  redis: boolean;
};
```

- [ ] **Step 4: Reuse the helper in the health route**

Keep the route response compatible with existing health tests. Return a non-200 readiness response when either dependency fails and expose only boolean status plus a safe error label.

- [ ] **Step 5: Add a complete environment template**

Include every required variable with non-secret development values:

```dotenv
AUTH_SECRET=replace-with-at-least-32-random-characters
APP_USERNAME=admin
APP_PASSWORD=change-me
APP_URL=http://localhost:4000
COOKIE_SECURE=false
DATABASE_URL=postgresql://feedy:feedy@postgres:5432/feedy?schema=public
REDIS_URL=redis://redis:6379
```

Document that Docker service hostnames work inside Compose, while direct `npm run dev` requires `localhost` database and Redis URLs.

- [ ] **Step 6: Update startup and troubleshooting documentation**

Define two explicit supported paths:

1. Full stack: `docker compose up --build`.
2. Direct Next.js: start PostgreSQL and Redis, use localhost URLs, run migrations/seed, then run `npm run dev`.

Add diagnostics for `DATABASE_URL` missing, Redis unavailable, port 3000 already occupied, and `.next/dev/lock` held by another process.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm run lint
npm run test
npm run build
docker compose config
```

Expected: all pass; if Docker is unavailable, record that as an environmental blocker rather than claiming Compose validation.

Commit:

```bash
git add .env.example README.md TROUBLESHOOTING.md src/lib/dependency-preflight.ts src/lib/dependency-preflight.test.ts src/app/api/health/route.ts
git commit -m "fix: make runtime dependency setup explicit"
```

## Task 2: Eliminate duplicate submissions and expose form failures

**Files:**

- Modify: `src/components/forms.tsx:12`
- Modify: `src/lib/feeds-ui.test.ts:22`

- [ ] **Step 1: Add failing source-contract tests**

Add assertions that create buttons submit only through the form:

```ts
it("submits create forms through onSubmit only", () => {
  assert.match(formsSource, /<Button type="submit"/);
  assert.doesNotMatch(
    formsSource,
    /<Button onClick=\{\(\) => mutation\.mutate\(\)\}[^>]*>\s*Create folder/,
  );
  assert.doesNotMatch(
    formsSource,
    /<Button onClick=\{\(\) => mutation\.mutate\(\)\}[^>]*>\s*\{mutation\.isPending/,
  );
});

it("announces create-form errors", () => {
  assert.match(formsSource, /role="alert"/);
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npx tsx --test src/lib/feeds-ui.test.ts
```

Expected: failure on missing `type="submit"` and missing alert semantics.

- [ ] **Step 3: Make each form own submission**

For both create forms:

- Keep the mutation call only in `onSubmit`.
- Set the primary button to `type="submit"`.
- Disable it while pending as well as when required input is empty.
- Trim submitted title and URL values.
- Give every input/select an explicit label.

Use this button shape:

```tsx
<Button
  type="submit"
  className="mt-3 w-full"
  disabled={!title.trim() || mutation.isPending}
>
  {mutation.isPending ? "Creating..." : "Create folder"}
</Button>
```

- [ ] **Step 4: Add local announced errors**

Render mutation errors immediately below the affected form:

```tsx
{mutation.error ? (
  <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
    {mutation.error.message}
  </p>
) : null}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx tsx --test src/lib/feeds-ui.test.ts
npm run lint
npm run test
```

Expected: all pass.

Commit:

```bash
git add src/components/forms.tsx src/lib/feeds-ui.test.ts
git commit -m "fix: prevent duplicate feed and folder creation"
```

## Task 3: Add accessible sheet behavior

**Files:**

- Create: `src/components/ui/sheet.tsx`
- Create: `src/components/ui/sheet.test.tsx`
- Modify: `src/components/forms.tsx:58`
- Modify: `src/components/feed-library-components.tsx`
- Modify: `src/app/app/folders/[folderId]/page.tsx`
- Modify: `src/app/app/feeds/[feedId]/page.tsx`

- [ ] **Step 1: Write failing sheet tests**

Render the primitive and assert:

```tsx
const html = renderToStaticMarkup(
  <Sheet title="Edit feed" onClose={() => undefined}>
    <button>Save</button>
  </Sheet>,
);

assert.match(html, /role="dialog"/);
assert.match(html, /aria-modal="true"/);
assert.match(html, /aria-labelledby="[^"]+"/);
```

Add a behavioral test with a DOM-capable harness only if already available; do not add a dependency solely for this task. Otherwise, extract and unit-test the Escape-key predicate and focus-target selection helpers.

- [ ] **Step 2: Verify failure**

Run:

```bash
npx tsx --test src/components/ui/sheet.test.tsx
```

Expected: failure because the primitive does not exist.

- [ ] **Step 3: Implement one focused sheet primitive**

The primitive must:

- expose `role="dialog"` and `aria-modal="true"`;
- connect the visible title through `aria-labelledby`;
- close on Escape;
- focus the first interactive control on mount;
- keep Tab navigation within the sheet;
- restore focus to the previously focused trigger on unmount;
- close on backdrop click but not panel click;
- support existing class names through `className` and `panelClassName`;
- render an icon close button with `aria-label="Close {title}"`.

Do not introduce a new dependency.

- [ ] **Step 4: Replace existing sheet wrappers**

Adopt the primitive in add/edit/move/health sheets while preserving the current visual classes and behavior. Remove duplicated backdrop click handling and unnamed close buttons.

- [ ] **Step 5: Verify keyboard contracts and commit**

Run:

```bash
npx tsx --test src/components/ui/sheet.test.tsx src/lib/feeds-ui.test.ts
npm run lint
npm run test
npm run build
```

Expected: all pass.

Commit:

```bash
git add src/components/ui/sheet.tsx src/components/ui/sheet.test.tsx src/components/forms.tsx src/components/feed-library-components.tsx src/app/app/folders/'[folderId]'/page.tsx src/app/app/feeds/'[feedId]'/page.tsx
git commit -m "feat: make bottom sheets keyboard accessible"
```

## Task 4: Correct navigation and semantic colors

**Files:**

- Modify: `src/components/app-shell.tsx:159`
- Modify: `src/app/globals.css:3`
- Create: `src/lib/theme-contract.test.ts`

- [ ] **Step 1: Add failing theme-contract tests**

Read the CSS and shell sources and assert:

```ts
assert.match(cssSource, /--nav-inactive:/);
assert.match(cssSource, /--success:\s*#(?:059669|10b981|34d399)/i);
assert.doesNotMatch(shellSource, /active \? "var\(--accent\)" : "#ffffff"/);
assert.match(shellSource, /aria-current=\{active \? "page" : undefined\}/);
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npx tsx --test src/lib/theme-contract.test.ts
```

Expected: failure on the hard-coded white inactive color, missing token, red success token, and missing current-page semantics.

- [ ] **Step 3: Implement semantic tokens**

Use:

```css
:root {
  --nav-inactive: #52525b;
  --success: #059669;
  --success-contrast: #ffffff;
}

.dark {
  --nav-inactive: #d4d4d8;
  --success: #34d399;
  --success-contrast: #052e16;
}
```

Use `var(--nav-inactive)` for inactive navigation and add `aria-current="page"` to the active link.

- [ ] **Step 4: Verify contrast manually**

In a healthy runtime, inspect light and dark themes at 390×844. Confirm inactive icons and 10px labels remain readable against the glass surface, and active state remains distinct without relying only on color.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx tsx --test src/lib/theme-contract.test.ts
npm run lint
npm run test
npm run build
```

Expected: all pass.

Commit:

```bash
git add src/components/app-shell.tsx src/app/globals.css src/lib/theme-contract.test.ts
git commit -m "fix: correct navigation contrast and status colors"
```

## Task 5: Make async actions understandable

**Files:**

- Modify: `src/components/login-form.tsx:20`
- Modify: `src/components/discover-screen.tsx`
- Modify: `src/components/settings-screen.tsx:31`
- Create: `src/lib/async-feedback.test.ts`

- [ ] **Step 1: Add failing UI contract tests**

Assert that:

- login errors use `role="alert"`;
- password visibility remains keyboard-focusable;
- discovery exposes a search label and add failure alert;
- settings exposes a polite success status and alert failure;
- selected cadence/retention controls expose `aria-pressed`;
- only one import/export link is presented.

- [ ] **Step 2: Verify failure**

Run:

```bash
npx tsx --test src/lib/async-feedback.test.ts
```

Expected: failure for each missing contract.

- [ ] **Step 3: Improve login and discovery feedback**

- Remove `tabIndex={-1}` from the password visibility button.
- Add `role="alert"` to login errors.
- Give the discovery search input an explicit accessible label.
- Render `addFeed.error` in an alert near the affected results.
- Keep buttons disabled only for conflicting in-flight requests.

- [ ] **Step 4: Improve settings feedback**

Track the most recent setting label and render one compact status region:

```tsx
<p
  role={settings.error ? "alert" : "status"}
  aria-live="polite"
  className={settings.error ? "text-[var(--danger)]" : "text-secondary"}
>
  {settings.error
    ? `Could not save ${pendingLabel}. ${settings.error.message}`
    : settings.isSuccess
      ? `${pendingLabel} saved.`
      : null}
</p>
```

Add `aria-pressed` to accent, cadence, and retention choices. Disable each affected group while its mutation is pending.

- [ ] **Step 5: Remove the false import/export choice**

Replace the two links to the same route with one full-width action labelled `Manage imports and backups`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx tsx --test src/lib/async-feedback.test.ts
npm run lint
npm run test
npm run build
```

Expected: all pass.

Commit:

```bash
git add src/components/login-form.tsx src/components/discover-screen.tsx src/components/settings-screen.tsx src/lib/async-feedback.test.ts
git commit -m "feat: clarify async action status and errors"
```

## Task 6: Complete runtime and visual verification

**Files:**

- Create: `.audit/2026-07-03-app-assessment/screenshots/01-login-mobile.png`
- Create: `.audit/2026-07-03-app-assessment/screenshots/02-timeline-light.png`
- Create: `.audit/2026-07-03-app-assessment/screenshots/03-timeline-dark.png`
- Create: `.audit/2026-07-03-app-assessment/screenshots/04-discover-results.png`
- Create: `.audit/2026-07-03-app-assessment/screenshots/05-add-feed-sheet.png`
- Create: `.audit/2026-07-03-app-assessment/screenshots/06-settings.png`
- Modify: `.audit/2026-07-03-app-assessment/README.md`

- [ ] **Step 1: Start the complete stack**

Run:

```bash
docker compose config
docker compose up --build -d
docker compose ps
```

Expected: `migrate` exits successfully; `web`, `worker`, `postgres`, and `redis` become healthy.

- [ ] **Step 2: Exercise the core flow**

Verify in order:

1. Login succeeds and invalid login is announced.
2. Timeline loads and refresh state resolves.
3. Discovery returns results and one feed can be added exactly once.
4. Feed can be moved into a newly created folder.
5. Item can be marked read, bookmarked, opened in reader, and returned from.
6. Settings persist after reload.
7. OPML export downloads and JSON backup exports.
8. Logout returns to login.

- [ ] **Step 3: Verify accessibility behavior**

Using keyboard only:

- traverse all login controls;
- open and close each sheet with Enter and Escape;
- verify focus starts inside and returns to the trigger;
- verify Tab cannot escape an open sheet;
- verify visible focus on navigation and settings controls;
- test at 200% browser zoom and with reduced motion.

- [ ] **Step 4: Capture and inspect screenshots**

Capture the six named states at 390×844 after each page is stable. Inspect every saved file and reject blank, loading, clipped, or incorrect states. Repeat timeline and settings checks at 1280×720 to catch unintended max-width or fixed-position behavior.

- [ ] **Step 5: Update the audit**

For each screenshot, record:

- step description;
- general health;
- strengths;
- remaining UX issues;
- accessibility evidence and limits.

Mark resolved findings explicitly and leave unresolved items prioritized.

- [ ] **Step 6: Run final validation**

Run:

```bash
npm run lint
npm run test
npm run build
docker compose config
docker compose ps
docker compose logs --tail=100 web worker
git diff --check
git status --short
```

Expected: all code checks pass, containers are healthy, logs contain no repeated dependency errors, and only intended files are changed.

## Completion criteria

- The documented startup path produces a healthy app from a clean checkout.
- Add-feed and add-folder issue exactly one request per submission.
- All sheet surfaces have correct dialog semantics and keyboard focus behavior.
- Navigation is readable in light and dark themes and exposes the current page semantically.
- Login, discovery, forms, and settings expose useful pending, success, and error states.
- Full lint, test, build, Compose, container-health, and authenticated core-flow checks pass.
- The audit contains current screenshots and lists any remaining limitations honestly.
