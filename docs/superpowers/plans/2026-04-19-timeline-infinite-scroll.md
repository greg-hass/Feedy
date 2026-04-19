# Timeline Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the timeline's hard 100-item cap by loading older articles progressively as the user scrolls.

**Architecture:** Keep the existing `/api/items` array response for feed and folder screens, and add a cursor-based page response only when the timeline asks for it. Use a tiny shared pagination helper to build `items`, `nextCursor`, and `hasMore`, then switch the timeline screen to `useInfiniteQuery` with a bottom sentinel that fetches the next page when it becomes visible. The refresh toast, scroll restoration, and item interactions should continue to work off the flattened timeline list.

**Tech Stack:** Next.js App Router, React Query v5, TypeScript, Prisma, `node:test`, `tsx`.

---

### Task 1: Add cursor paging for the timeline API

**Files:**
- Create: `src/lib/timeline-pagination.ts`
- Test: `src/lib/timeline-pagination.test.ts`
- Modify: `src/lib/data.ts`
- Modify: `src/app/api/items/route.ts`
- Modify: `src/types/app.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTimelinePage } from "@/lib/timeline-pagination";

describe("timeline pagination", () => {
  it("returns a cursor and hasMore when there is another page", () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      id: `item-${index}`,
      uniqueKey: `unique-${index}`,
    }));

    const page = buildTimelinePage(records, 100);

    assert.equal(page.items.length, 100);
    assert.equal(page.hasMore, true);
    assert.equal(page.nextCursor, "unique-99");
  });

  it("returns no cursor when the page is complete", () => {
    const records = Array.from({ length: 3 }, (_, index) => ({
      id: `item-${index}`,
      uniqueKey: `unique-${index}`,
    }));

    const page = buildTimelinePage(records, 100);

    assert.equal(page.items.length, 3);
    assert.equal(page.hasMore, false);
    assert.equal(page.nextCursor, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/timeline-pagination.test.ts -v`
Expected: FAIL because `buildTimelinePage` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type TimelinePage<TItem> = {
  items: TItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function buildTimelinePage<TItem extends { uniqueKey: string }>(
  records: TItem[],
  pageSize: number,
): TimelinePage<TItem> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;

  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.uniqueKey ?? null : null,
    hasMore,
  };
}
```

In `src/lib/data.ts`, keep `getTimelineItems()` returning the current array for feed/folder callers, and add a new `getTimelineItemPage()` helper that:

- reuses the same timeline filters
- applies a `uniqueKey` tie-breaker to the sort order
- accepts `cursor` and `pageSize`
- fetches `pageSize + 1` rows so `buildTimelinePage()` can compute `hasMore`

The timeline page query should use `cursor: { uniqueKey: cursor }` and `skip: 1` when a cursor is present.

In `src/app/api/items/route.ts`, extend the query schema with:

```ts
cursor: z.string().optional(),
pageSize: z.coerce.number().int().positive().max(100).optional(),
```

When `pageSize` is present, return:

```ts
return NextResponse.json({
  items: page.items.map(serializeItem),
  nextCursor: page.nextCursor,
  hasMore: page.hasMore,
});
```

Keep the existing array response path for callers that do not request pagination.

In `src/types/app.ts`, add:

```ts
export type TimelineItemsPageResponse = {
  items: ItemRecord[];
  nextCursor: string | null;
  hasMore: boolean;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/timeline-pagination.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline-pagination.ts src/lib/timeline-pagination.test.ts src/lib/data.ts src/app/api/items/route.ts src/types/app.ts
git commit -m "feat: add timeline page cursor response"
```

### Task 2: Convert the timeline screen to infinite scroll

**Files:**
- Create: `src/lib/timeline-infinite-scroll.ts`
- Test: `src/lib/timeline-infinite-scroll.test.ts`
- Modify: `src/components/screens.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  flattenTimelinePages,
  shouldLoadNextTimelinePage,
} from "@/lib/timeline-infinite-scroll";

describe("timeline infinite scroll", () => {
  it("appends already loaded pages in order", () => {
    const items = flattenTimelinePages([
      { items: [{ id: "a" }] },
      { items: [{ id: "b" }, { id: "c" }] },
    ]);

    assert.deepEqual(items.map((item) => item.id), ["a", "b", "c"]);
  });

  it("stops loading when the sentinel is hidden or a fetch is active", () => {
    assert.equal(
      shouldLoadNextTimelinePage({
        hasMore: true,
        isBottomVisible: true,
        isFetchingNextPage: false,
      }),
      true,
    );

    assert.equal(
      shouldLoadNextTimelinePage({
        hasMore: false,
        isBottomVisible: true,
        isFetchingNextPage: false,
      }),
      false,
    );

    assert.equal(
      shouldLoadNextTimelinePage({
        hasMore: true,
        isBottomVisible: true,
        isFetchingNextPage: true,
      }),
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/timeline-infinite-scroll.test.ts -v`
Expected: FAIL because `flattenTimelinePages` and `shouldLoadNextTimelinePage` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/timeline-infinite-scroll.ts`:

```ts
export function flattenTimelinePages<TItem>(
  pages: Array<{ items: TItem[] }> | undefined,
) {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function shouldLoadNextTimelinePage({
  hasMore,
  isBottomVisible,
  isFetchingNextPage,
}: {
  hasMore: boolean;
  isBottomVisible: boolean;
  isFetchingNextPage: boolean;
}) {
  return hasMore && isBottomVisible && !isFetchingNextPage;
}
```

In `src/components/screens.tsx`, switch the timeline query from `useQuery` to `useInfiniteQuery` and flatten the pages for rendering:

```ts
const items = useInfiniteQuery({
  queryKey: ["items", "timeline", stateFilter, sourceFilter, deferredQuery.trim()],
  queryFn: ({ pageParam }) => {
    const params = new URLSearchParams();
    params.set("pageSize", "100");

    if (stateFilter !== "UNREAD") {
      params.set("stateFilter", stateFilter);
    }
    if (sourceFilter !== "ALL") {
      params.set("sourceFilter", sourceFilter);
    }
    if (deferredQuery.trim()) {
      params.set("q", deferredQuery.trim());
    }
    if (pageParam) {
      params.set("cursor", pageParam);
    }

    return api<TimelineItemsPageResponse>(`/api/items?${params.toString()}`);
  },
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  staleTime: 15_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

const timelineItems = useMemo(
  () => flattenTimelinePages(items.data?.pages),
  [items.data?.pages],
);
```

Update the refresh snapshot, pending-read patch, refresh delta calculation, and empty-state/render checks to use `timelineItems` instead of assuming a single `items.data` array.

Add a bottom sentinel:

```tsx
const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
const [isBottomVisible, setIsBottomVisible] = useState(false);

useEffect(() => {
  const sentinel = bottomSentinelRef.current;
  if (!sentinel || typeof IntersectionObserver === "undefined") {
    return;
  }

  const observer = new IntersectionObserver(
    ([entry]) => setIsBottomVisible(entry.isIntersecting),
    { rootMargin: "300px 0px" },
  );

  observer.observe(sentinel);
  return () => observer.disconnect();
}, [timelineItems.length, items.hasNextPage, items.isFetchingNextPage]);

useEffect(() => {
  if (
    shouldLoadNextTimelinePage({
      hasMore: items.hasNextPage ?? false,
      isBottomVisible,
      isFetchingNextPage: items.isFetchingNextPage,
    })
  ) {
    void items.fetchNextPage();
  }
}, [isBottomVisible, items.fetchNextPage, items.hasNextPage, items.isFetchingNextPage]);
```

Render the sentinel after the timeline items:

```tsx
<div ref={bottomSentinelRef} aria-hidden className="h-px w-full" />
```

Update the pending-read cache patch to write into infinite-query pages instead of a flat array:

```ts
queryClient.setQueriesData<InfiniteData<TimelineItemsPageResponse>>(
  { queryKey: ["items", "timeline"] },
  (current) =>
    current
      ? {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((entry) =>
              entry.id === pendingReadItemId ? { ...entry, read: true } : entry,
            ),
          })),
        }
      : current,
);
```

Keep the refresh toast and scroll-restoration logic unchanged except for reading from the flattened timeline list.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx tsc --noEmit
npx eslint src/components/screens.tsx src/lib/timeline-pagination.ts src/lib/timeline-pagination.test.ts src/lib/timeline-infinite-scroll.ts src/lib/timeline-infinite-scroll.test.ts src/lib/data.ts src/app/api/items/route.ts src/types/app.ts
```

Expected: TypeScript passes and ESLint only reports the repo's existing image/hook warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline-infinite-scroll.ts src/lib/timeline-infinite-scroll.test.ts src/components/screens.tsx
git commit -m "feat: add timeline infinite scroll"
```

### Task 3: Final verification and rebuild

**Files:**
- No code changes

- [ ] **Step 1: Run the focused pagination tests**

Run: `npx tsx --test src/lib/timeline-pagination.test.ts -v`
Expected: PASS.

- [ ] **Step 2: Run the full type and lint check**

Run:

```bash
npx tsc --noEmit
npx eslint src/components/screens.tsx src/lib/timeline-pagination.ts src/lib/timeline-pagination.test.ts src/lib/data.ts src/app/api/items/route.ts src/types/app.ts
```

Expected: PASS with only the existing repo warnings.

- [ ] **Step 3: Rebuild the containers**

Run:

```bash
docker compose build web worker && docker compose up -d --force-recreate web worker
```

Expected: both images build successfully and the `web` and `worker` containers restart cleanly.
