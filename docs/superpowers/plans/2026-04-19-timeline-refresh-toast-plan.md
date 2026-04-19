# Timeline Refresh Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the timeline anchored during refreshes, show a toast when new articles arrive, and let the user jump to the first item in the new block.

**Architecture:** Put the new-item detection in a tiny pure helper so the refresh math is easy to test and reuse. Keep the UI work local to the timeline screen by adding a small toast component plus a scroll-anchor/refetch observer inside `UnreadScreen`; no global notification store is needed.

**Tech Stack:** Next.js 16 app router, React 19, TypeScript, TanStack Query, existing `Button` component, `node:test`, `tsx`, `eslint`.

---

### Task 1: Add a pure timeline refresh diff helper

**Files:**
- Create: `src/lib/timeline-refresh.ts`
- Create: `src/lib/timeline-refresh.test.ts`

- [ ] **Step 1: Write the failing test**

Add a focused unit test for the new-item diff logic:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeTimelineRefreshDelta } from "@/lib/timeline-refresh";

describe("computeTimelineRefreshDelta", () => {
  it("returns the contiguous new prefix and the oldest new item id", () => {
    const delta = computeTimelineRefreshDelta(["a", "b", "c"], ["x", "y", "a", "b", "c"]);

    assert.equal(delta.newCount, 2);
    assert.equal(delta.jumpTargetId, "y");
  });

  it("returns no jump target when the list did not gain new ids", () => {
    const delta = computeTimelineRefreshDelta(["a", "b", "c"], ["a", "b", "c"]);

    assert.equal(delta.newCount, 0);
    assert.equal(delta.jumpTargetId, null);
  });
});
```

Run:
`npx tsx --test src/lib/timeline-refresh.test.ts`

Expected: fail until `src/lib/timeline-refresh.ts` exports `computeTimelineRefreshDelta`.

- [ ] **Step 2: Confirm the failure is the right one**

Make sure the test fails because the helper is missing, not because the assertions or import path are wrong.

- [ ] **Step 3: Implement the helper**

Add the smallest possible pure function:

```ts
export type TimelineRefreshDelta = {
  newCount: number;
  jumpTargetId: string | null;
};

export function computeTimelineRefreshDelta(
  beforeIds: string[],
  afterIds: string[],
): TimelineRefreshDelta {
  const beforeIdsSet = new Set(beforeIds);
  const newIds: string[] = [];

  for (const id of afterIds) {
    if (beforeIdsSet.has(id)) {
      break;
    }

    newIds.push(id);
  }

  return {
    newCount: newIds.length,
    jumpTargetId: newIds.at(-1) ?? null,
  };
}
```

Keep the helper intentionally narrow:
- it only looks for a contiguous new prefix at the top of the list
- it treats the last id in that prefix as the jump target
- it does not touch React state or the DOM

- [ ] **Step 4: Run the test again**

Run:
`npx tsx --test src/lib/timeline-refresh.test.ts`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline-refresh.ts src/lib/timeline-refresh.test.ts
git commit -m "test: add timeline refresh diff helper"
```

### Task 2: Wire the toast and scroll anchor into the timeline screen

**Files:**
- Create: `src/components/timeline-refresh-toast.tsx`
- Modify: `src/components/screens.tsx`

- [ ] **Step 1: Add the toast component**

Create a tiny client component that renders above the bottom navigation and uses the existing button styling:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function TimelineRefreshToast({
  count,
  onJump,
  onDismiss,
}: {
  count: number;
  onJump: () => void;
  onDismiss: () => void;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-[84px] z-40 px-5">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.22)]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {count} new articles
          </p>
          <p className="text-xs text-secondary">
            The timeline stayed in place while we refreshed it.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={onJump}>
            View new articles
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-subtle bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-secondary"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
```

The copy should stay friendly and non-contradictory:
- the toast says `new articles`
- the action says `View new articles`
- the jump behavior still lands on the first item in the new block

- [ ] **Step 2: Add the timeline refresh state and anchor bookkeeping**

Update `UnreadScreen` in `src/components/screens.tsx` to keep three pieces of local state:

```ts
const [refreshToast, setRefreshToast] = useState<{
  count: number;
  jumpTargetId: string;
} | null>(null);
const pendingRefreshIdsRef = useRef<string[] | null>(null);
const pendingScrollAnchorRef = useRef<{ itemId: string; top: number } | null>(null);
```

Use the existing refresh controller only as the trigger source. When `refresh.active` flips on, capture the current list of timeline ids and the topmost visible item:

```ts
function captureTimelineScrollAnchor(timelineFixedTop: number) {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-timeline-item-id]"),
  );
  const threshold = timelineFixedTop + 12;

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > threshold) {
      return {
        itemId: element.dataset.timelineItemId ?? "",
        top: rect.top,
      };
    }
  }

  return null;
}
```

Store that anchor before the refetch resolves so the scroll correction can keep the same article in place after new items are inserted above it.

Also clear both refs when:
- the refresh finishes without producing a new `items.data` list
- the timeline query key changes because the user changed filters or search text
- the user dismisses the toast

- [ ] **Step 3: Compare the old and new ids after the refetch**

When `items.data` updates and `pendingRefreshIdsRef.current` is set, compare the old and new ordered ids with `computeTimelineRefreshDelta(...)`.

If `newCount > 0`:
- restore scroll by finding the same anchor item in the new DOM and correcting `window.scrollY` by the difference between the saved top and the new top
- show `TimelineRefreshToast`
- store `jumpTargetId` so the action can scroll directly to the oldest item in the new block

If `newCount === 0`:
- clear the pending refresh refs
- do not show a toast

If the refresh returns to idle before `items.data` changes:
- clear the pending refresh refs
- leave the toast hidden

The important behavior is that the user’s current reading position stays put while the refreshed items are inserted above it.

Implementation shape to use:

```ts
useLayoutEffect(() => {
  if (!items.data?.length) {
    return;
  }

  const nextIds = items.data.map((item) => item.id);
  const previousIds = pendingRefreshIdsRef.current;
  pendingRefreshIdsRef.current = null;

  if (!previousIds) {
    return;
  }

  const delta = computeTimelineRefreshDelta(previousIds, nextIds);
  if (delta.newCount <= 0) {
    pendingScrollAnchorRef.current = null;
    setRefreshToast(null);
    return;
  }

  const anchor = pendingScrollAnchorRef.current;
  if (anchor) {
    const element = document.querySelector<HTMLElement>(
      `[data-timeline-item-id="${anchor.itemId}"]`,
    );
    if (element) {
      const nextTop = element.getBoundingClientRect().top;
      window.scrollBy({ top: nextTop - anchor.top, behavior: "auto" });
    }
  }

  setRefreshToast({ count: delta.newCount, jumpTargetId: delta.jumpTargetId ?? nextIds[0] });
  pendingScrollAnchorRef.current = null;
}, [items.data]);
```

- [ ] **Step 4: Wire the toast actions**

Render the toast near the bottom of `UnreadScreen`:

```tsx
<TimelineRefreshToast
  count={refreshToast?.count ?? 0}
  onJump={() => {
    const targetId = refreshToast?.jumpTargetId;
    if (!targetId) {
      return;
    }

    const element = document.querySelector<HTMLElement>(
      `[data-timeline-item-id="${targetId}"]`,
    );
    element?.scrollIntoView({ block: "start", behavior: "smooth" });
    setRefreshToast(null);
  }}
  onDismiss={() => setRefreshToast(null)}
/>
```

Keep the action simple:
- `View new articles` scrolls to the oldest item in the new prefix
- `Dismiss` closes the toast without moving the timeline

- [ ] **Step 5: Run typecheck and lint**

Run:
`npx tsc --noEmit`
`npx eslint src/components/screens.tsx src/components/timeline-refresh-toast.tsx src/lib/timeline-refresh.ts`

Expected: pass.

- [ ] **Step 6: Smoke test the behavior in the browser**

Manual checks:
- open `/app/unread`
- scroll somewhere in the middle of the timeline
- trigger a refresh from the header button or pull-to-refresh
- confirm the current article stays in place when the refreshed items land
- confirm the toast appears only when there are new articles
- click `View new articles` and confirm the view jumps to the first article after the new block
- confirm dismissing the toast leaves the timeline untouched

- [ ] **Step 7: Commit**

```bash
git add src/components/screens.tsx src/components/timeline-refresh-toast.tsx src/lib/timeline-refresh.ts
git commit -m "feat: show timeline refresh toast"
```
