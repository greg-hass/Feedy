# Accessibility and Robustness Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable browser zoom and add a root-level error fallback without changing the normal UI flow.

**Architecture:** Keep the viewport change confined to the root layout metadata so it only affects browser scaling. Add a minimal `app/global-error.tsx` boundary that renders the same dark Feedy visual style, includes its own `<html>` and `<body>`, and provides a retry action that remounts the route tree. Avoid touching timeline, reader, feed, or settings behavior.

**Tech Stack:** Next.js App Router file conventions, React client components, TypeScript, `node:test`, `tsx`.

---

### Task 1: Re-enable zoom in the root viewport

**Files:**
- Modify: `src/app/layout.tsx`
- Test: `src/app/layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewport } from "@/app/layout";

describe("root viewport", () => {
  it("allows user scaling", () => {
    assert.equal(viewport.userScalable, true);
    assert.notEqual(viewport.maximumScale, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/app/layout.test.ts -v`
Expected: FAIL because the viewport still locks scaling.

- [ ] **Step 3: Write minimal implementation**

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};
```

Keep the rest of [`src/app/layout.tsx`](/Users/greg/Projects/Feedy/src/app/layout.tsx) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/app/layout.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/layout.test.ts
git commit -m "fix: allow browser zoom"
```

### Task 2: Add a root global error fallback

**Files:**
- Create: `src/app/global-error.tsx`
- Test: `src/app/global-error.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import GlobalError from "@/app/global-error";

describe("GlobalError", () => {
  it("renders a retry button and safe message", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlobalError, {
        error: new Error("boom"),
        reset: () => {},
      }),
    );

    assert.match(markup, /Something went wrong/);
    assert.match(markup, /Try again/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/app/global-error.test.tsx -v`
Expected: FAIL because `src/app/global-error.tsx` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
        <main className="flex min-h-screen items-center justify-center px-5">
          <div className="w-full max-w-md rounded-[28px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_90%,black_10%)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Feedy</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">Something went wrong</h1>
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              We hit an unexpected problem while loading the app. Your data is safe, and you can try again.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
```

Keep the fallback visually aligned with the current shell, but do not add extra navigation, settings links, or recovery UI beyond the retry action.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/app/global-error.test.tsx -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/global-error.tsx src/app/global-error.test.tsx
git commit -m "feat: add global app error fallback"
```

### Task 3: Final verification and rebuild

**Files:**
- Verify: `src/app/layout.tsx`
- Verify: `src/app/global-error.tsx`

- [ ] **Step 1: Run the full TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Run targeted lint**

Run:

```bash
npx eslint src/app/layout.tsx src/app/layout.test.ts src/app/global-error.tsx src/app/global-error.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Rebuild the containers**

Run:

```bash
docker compose build web worker
docker compose up -d --force-recreate web worker
```

Expected: both services rebuild successfully and restart cleanly.

- [ ] **Step 4: Commit the final state**

```bash
git add src/app/layout.tsx src/app/layout.test.ts src/app/global-error.tsx src/app/global-error.test.tsx
git commit -m "fix: improve app accessibility and error recovery"
```
