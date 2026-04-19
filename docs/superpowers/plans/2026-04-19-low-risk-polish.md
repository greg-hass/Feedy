# Low-Risk Polish Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a few safe usability improvements without changing the core UI flow.

**Architecture:** Keep the login change isolated to the login page, put tab-navigation and haptics behind tiny reusable helpers, and introduce search highlighting as a focused UI utility that can be reused in the existing screen file. Avoid any broader screens split, reader font-size work, or gesture redesign in this pass.

**Tech Stack:** Next.js App Router, React client components, TypeScript, `node:test`, `react-dom/server`, `tsx`.

---

### Task 1: Remove the prefilled login username

**Files:**
- Modify: `src/app/login/page.tsx`
- Test: `src/app/login/page.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

describe("login page defaults", () => {
  it("does not prefill the username with admin", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    assert.equal(source.includes('defaultValue="admin"'), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/app/login/page.test.ts -v`
Expected: FAIL because the source still contains `defaultValue="admin"`.

- [ ] **Step 3: Write minimal implementation**

```tsx
<Input
  name="username"
  placeholder="Username"
  className="h-14 rounded-[18px] border-black/8 bg-white px-4 text-base text-[#101618] placeholder:text-[#7c837d]"
  autoCapitalize="none"
  autoCorrect="off"
  autoComplete="username"
/>
```

Keep the explanatory copy on the page so users still know which credentials to enter, but do not set a default username value.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/app/login/page.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/app/login/page.test.ts
git commit -m "fix: remove login username default"
```

### Task 2: Add active-tab scroll-to-top and lightweight haptics

**Files:**
- Create: `src/lib/tab-interactions.ts`
- Create: `src/lib/tab-interactions.test.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/item-card.tsx`
- Modify: `src/app/reader/[itemId]/page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isActiveTabTap, vibrateIfSupported } from "@/lib/tab-interactions";

describe("tab interactions", () => {
  it("detects taps on the active tab", () => {
    assert.equal(isActiveTabTap("/app/unread", "/app/unread"), true);
    assert.equal(isActiveTabTap("/app/unread", "/app/feeds"), false);
  });

  it("does not throw when vibration is unavailable", () => {
    assert.equal(vibrateIfSupported(undefined, 12), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/tab-interactions.test.ts -v`
Expected: FAIL because `isActiveTabTap` and `vibrateIfSupported` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function isActiveTabTap(currentPathname: string, targetHref: string) {
  return currentPathname === targetHref;
}

export function vibrateIfSupported(
  navigatorLike: { vibrate?: (pattern: number | number[]) => boolean } | undefined,
  durationMs: number,
) {
  if (!navigatorLike?.vibrate) {
    return false;
  }

  return navigatorLike.vibrate(durationMs);
}
```

Wire `src/components/app-shell.tsx` so tapping the active tab does this first:

```ts
if (isActiveTabTap(pathname, item.href)) {
  window.scrollTo({ top: 0, behavior: "auto" });
  vibrateIfSupported(window.navigator, 10);
  return;
}
```

Then continue with the existing `Link` navigation for inactive tabs.

Use the same helper in `src/components/item-card.tsx` and `src/app/reader/[itemId]/page.tsx` for bookmark-toggle taps so supported devices get a tiny feedback pulse without changing the visible UI.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/tab-interactions.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tab-interactions.ts src/lib/tab-interactions.test.ts src/components/app-shell.tsx src/components/item-card.tsx src/app/reader/[itemId]/page.tsx
git commit -m "feat: add tab scroll and haptic feedback"
```

### Task 3: Add search-term highlighting

**Files:**
- Create: `src/components/search-highlight.tsx`
- Test: `src/components/search-highlight.test.tsx`
- Modify: `src/components/screens.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchHighlight } from "@/components/search-highlight";

describe("SearchHighlight", () => {
  it("wraps matching text and leaves the rest alone", () => {
    const markup = renderToStaticMarkup(
      <SearchHighlight text="Claude design notes" query="design" />,
    );

    assert.match(markup, /<mark[^>]*>design<\/mark>/);
    assert.match(markup, /Claude/);
    assert.match(markup, /notes/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/search-highlight.test.tsx -v`
Expected: FAIL because `SearchHighlight` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
export function SearchHighlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <>{text}</>;
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded bg-[var(--accent-dim)] px-0.5 text-[inherit]">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}
```

Use the helper in [`src/components/screens.tsx`](/Users/greg/Projects/Feedy/src/components/screens.tsx) at the existing timeline and saved-search result rows so titles and short summaries visually emphasize the active search term without changing spacing or hierarchy.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/search-highlight.test.tsx -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/search-highlight.tsx src/components/search-highlight.test.tsx src/components/screens.tsx
git commit -m "feat: highlight search matches"
```

### Task 4: Final verification and rebuild

**Files:**
- Verify: `src/app/login/page.tsx`
- Verify: `src/lib/tab-interactions.ts`
- Verify: `src/components/search-highlight.tsx`
- Verify: `src/components/app-shell.tsx`
- Verify: `src/components/item-card.tsx`
- Verify: `src/app/reader/[itemId]/page.tsx`
- Verify: `src/components/screens.tsx`

- [ ] **Step 1: Run the full TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Run targeted lint**

Run:

```bash
npx eslint \
  src/app/login/page.tsx \
  src/app/login/page.test.ts \
  src/lib/tab-interactions.ts \
  src/lib/tab-interactions.test.ts \
  src/components/search-highlight.tsx \
  src/components/search-highlight.test.tsx \
  src/components/app-shell.tsx \
  src/components/item-card.tsx \
  src/app/reader/[itemId]/page.tsx \
  src/components/screens.tsx
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
git add src/app/login/page.tsx src/app/login/page.test.ts src/lib/tab-interactions.ts src/lib/tab-interactions.test.ts src/components/search-highlight.tsx src/components/search-highlight.test.tsx src/components/app-shell.tsx src/components/item-card.tsx src/app/reader/[itemId]/page.tsx src/components/screens.tsx
git commit -m "fix: ship low-risk polish updates"
```
