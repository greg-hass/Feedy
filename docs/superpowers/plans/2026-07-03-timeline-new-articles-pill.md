# Timeline New Articles Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the intrusive timeline refresh dialog with a compact five-second pill that scrolls only to the exact new-article boundary captured after refresh.

**Architecture:** Preserve the existing contiguous-prefix calculation and stored jump target. Move timer ownership into the notification component, expose one click callback, and guard scrolling so a missing target never triggers fallback movement.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Node test runner.

---

## File Structure

- Modify `src/components/timeline-refresh-toast.tsx`: compact pill presentation and five-second lifecycle.
- Modify `src/components/unread-screen.tsx`: exact-target guarded scroll with reduced-motion support.
- Modify `src/lib/timeline-refresh.ts`: singular/plural pill label helper.
- Modify `src/lib/timeline-refresh.test.ts`: label and stable-boundary tests.
- Create `src/lib/timeline-refresh-ui.test.ts`: dependency-light UI contract coverage.

### Task 1: Define notification labels and preserve the stable boundary

**Files:**
- Modify: `src/lib/timeline-refresh.ts`
- Modify: `src/lib/timeline-refresh.test.ts`

- [ ] **Step 1: Add failing label tests**

```ts
import {
  computeTimelineRefreshDelta,
  formatTimelineRefreshLabel,
} from "@/lib/timeline-refresh";

it("formats singular and plural notification labels", () => {
  assert.equal(formatTimelineRefreshLabel(1), "↑ 1 new article");
  assert.equal(formatTimelineRefreshLabel(3), "↑ 3 new articles");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test src/lib/timeline-refresh.test.ts
```

Expected: FAIL because `formatTimelineRefreshLabel` is not exported.

- [ ] **Step 3: Implement the label helper**

```ts
export function formatTimelineRefreshLabel(count: number) {
  return `↑ ${count.toLocaleString()} new ${count === 1 ? "article" : "articles"}`;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx tsx --test src/lib/timeline-refresh.test.ts
```

Expected: all timeline refresh tests pass, including the existing assertion that `["x", "y", "a"]` targets `"y"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline-refresh.ts src/lib/timeline-refresh.test.ts
git commit -m "Add timeline refresh pill labels"
```

### Task 2: Replace the dialog with a five-second compact pill

**Files:**
- Create: `src/lib/timeline-refresh-ui.test.ts`
- Modify: `src/components/timeline-refresh-toast.tsx`

- [ ] **Step 1: Write failing UI contract tests**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../components/timeline-refresh-toast.tsx", import.meta.url),
  "utf8",
);

describe("TimelineRefreshToast", () => {
  it("renders one compact action without dialog copy", () => {
    assert.match(source, /formatTimelineRefreshLabel\(count\)/);
    assert.doesNotMatch(source, /The timeline stayed in place/);
    assert.doesNotMatch(source, />Dismiss</);
    assert.doesNotMatch(source, /View new articles/);
  });

  it("auto-dismisses after five seconds and clears its timer", () => {
    assert.match(source, /window\.setTimeout\(\(\) => onDismissRef\.current\(\), 5_000\)/);
    assert.match(source, /window\.clearTimeout\(timer\)/);
  });

  it("announces politely without taking focus", () => {
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /aria-label=\{formatTimelineRefreshLabel\(count\)\}/);
  });
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```bash
npx tsx --test src/lib/timeline-refresh-ui.test.ts
```

Expected: FAIL because the current component renders a large card with two actions and no timer.

- [ ] **Step 3: Implement the compact pill**

Replace the component body with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

import { formatTimelineRefreshLabel } from "@/lib/timeline-refresh";

export function TimelineRefreshToast({
  count,
  onJump,
  onDismiss,
}: {
  count: number;
  onJump: () => void;
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (count <= 0) return;
    const timer = window.setTimeout(() => onDismissRef.current(), 5_000);
    return () => window.clearTimeout(timer);
  }, [count]);

  if (count <= 0) return null;

  const label = formatTimelineRefreshLabel(count);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-40 flex justify-center px-5"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onJump}
        aria-label={formatTimelineRefreshLabel(count)}
        className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--accent)]/25 bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--accent)] shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
      >
        <ArrowUp className="size-3.5" aria-hidden />
        {label.replace(/^↑ /, "")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test src/lib/timeline-refresh.test.ts src/lib/timeline-refresh-ui.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/timeline-refresh-toast.tsx src/lib/timeline-refresh-ui.test.ts
git commit -m "Replace timeline refresh dialog with pill"
```

### Task 3: Guard exact-target scrolling

**Files:**
- Modify: `src/lib/timeline-refresh-ui.test.ts`
- Modify: `src/components/unread-screen.tsx`

- [ ] **Step 1: Add failing exact-target assertions**

```ts
const unreadSource = readFileSync(
  new URL("../components/unread-screen.tsx", import.meta.url),
  "utf8",
);

it("scrolls only the captured target and has no fallback movement", () => {
  assert.match(unreadSource, /if \(!element\) \{\s*setRefreshToast\(null\);\s*return;\s*\}/);
  assert.match(unreadSource, /window\.matchMedia\("\\(prefers-reduced-motion: reduce\\)"\)/);
  assert.match(unreadSource, /element\.scrollIntoView/);
  assert.doesNotMatch(unreadSource, /window\.scrollTo/);
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```bash
npx tsx --test src/lib/timeline-refresh-ui.test.ts
```

Expected: FAIL because the current click handler does not explicitly guard the missing element or reduced motion.

- [ ] **Step 3: Implement the guarded click behavior**

Replace the jump handler after querying the stored ID:

```ts
if (!element) {
  setRefreshToast(null);
  return;
}

const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

element.scrollIntoView({
  block: "start",
  behavior: reduceMotion ? "auto" : "smooth",
});
setRefreshToast(null);
```

Do not add `window.scrollTo`, index-based lookup, or fallback IDs.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test src/lib/timeline-refresh.test.ts src/lib/timeline-refresh-ui.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/unread-screen.tsx src/lib/timeline-refresh-ui.test.ts
git commit -m "Guard timeline refresh jump targets"
```

### Task 4: Full verification

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] **Step 1: Check the diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only planned files are modified.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 3: Run all tests**

Run:

```bash
npm run test
```

Expected: zero failures.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: exit 0. Existing unrelated Turbopack NFT and Node `url.parse()` warnings may remain.

- [ ] **Step 5: Review final scope**

Run:

```bash
git log -4 --oneline
git status --short
```

Expected: the implementation contains only label, pill, timer, exact-target guard, tests, and approved documentation changes.
