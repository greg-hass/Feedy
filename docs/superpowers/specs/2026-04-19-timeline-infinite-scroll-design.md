# Timeline Infinite Scroll

## Goal
Remove the hard 100-item timeline cap by loading older articles progressively as the user scrolls, without changing the current refresh or item interaction behavior.

## Scope
This pass covers one improvement:

1. Replace the timeline's fixed 100-item cutoff with cursor-based infinite scroll.

It does not change the reader, feed cards, search UI, refresh controls, or offline behavior.

## Current Problems

- The timeline query in [`src/lib/data.ts`](/Users/greg/Projects/Feedy/src/lib/data.ts) uses `take: 100`, which prevents older items beyond the first page from ever appearing in the timeline.
- The timeline screen in [`src/components/screens.tsx`](/Users/greg/Projects/Feedy/src/components/screens.tsx) assumes the visible feed is a single page of items and does not load more content when the user approaches the bottom.

## Proposed Design

### 1. Cursor-based timeline paging

Change the timeline data layer to return a page of items plus pagination metadata:

- `items`: the current batch of timeline items
- `nextCursor`: the cursor needed to fetch the next page, or `null` if there are no more older items
- `hasMore`: a boolean the UI can use to decide whether to keep watching the end of the list

Use a 100-item page size for the initial fetch and subsequent pages so the first release stays close to the current timeline density.

The cursor should be derived from the last item in the current page using the existing sort order, plus a unique tie-breaker such as `id`. The paging key should be stable and deterministic so newly inserted articles do not reshuffle older pages unexpectedly.

The first page should preserve today's behavior as closely as possible. In practice that means the initial request still returns the most recent timeline items first, but the limit becomes an explicit page size rather than a hard ceiling.

### 2. Timeline accumulation in the screen layer

Update the timeline screen to keep a growing in-memory list of loaded pages instead of replacing the list every time a new page is fetched.

The screen should:

- render the first page immediately
- append older pages below the existing list
- avoid duplicate fetches while a page request is in flight
- stop requesting more once `hasMore` is false

This state should stay local to the timeline screen so the change does not leak into the rest of the app.

### 3. Sentinel-driven loading

Use a small bottom-of-list sentinel with `IntersectionObserver` to trigger the next fetch when the user gets near the end of the loaded items.

The trigger should be conservative:

- only load when the sentinel is visible
- only load if the current page is not already fetching
- only load if more older items remain

If the browser does not support `IntersectionObserver`, the timeline should still render normally and allow the current page of items to be used without crashing.

## Architecture

The data layer owns cursor selection and page shape, while the timeline screen owns accumulation and the viewport trigger.

That separation keeps pagination logic testable without coupling it to the rest of the mobile shell. It also lets the current refresh behavior continue to prepend new items at the top without needing a separate infinite-scroll model for refresh updates.

## Data Flow

### Initial load

1. The timeline screen requests the first page.
2. The data layer returns the newest items plus pagination metadata.
3. The screen renders the items and stores the cursor for the next page.

### Infinite scroll

1. The user scrolls near the bottom of the loaded list.
2. The sentinel becomes visible.
3. The screen requests the next page using the saved cursor.
4. The new items are appended below the existing list.
5. The process repeats until `hasMore` becomes false.

### Refresh interaction

1. A refresh returns newer items at the top.
2. The screen keeps the current scroll position stable.
3. Any already-loaded older pages remain in place below the refreshed top section.

## Error Handling

- If a page request fails, the current items should remain visible and the user should see the existing error state or retry surface rather than losing the list.
- If a browser does not support `IntersectionObserver`, the page should remain usable with the already loaded items.
- If the cursor is missing or invalid, the screen should stop paging instead of looping or requesting the same page repeatedly.
- Duplicate page loads should be prevented by request state, not by assuming the network will always respond quickly.

## Testing

Add focused checks for:

- the timeline data layer returning a cursor and `hasMore` metadata for the first page
- the next-page fetch using the cursor from the last loaded item
- the timeline screen appending, rather than replacing, already loaded items
- the infinite-scroll trigger stopping when no more pages remain

The tests should stay local to the timeline data and screen behavior. No browser automation is required for this pass.

## Non-Goals

- No reader redesign
- No feed-card redesign
- No global service worker rewrite
- No background sync
- No changes to search highlighting, login, or haptics
- No change to the current refresh toast behavior

## Success Criteria

- The timeline can load beyond the first 100 items.
- Older items appear progressively as the user scrolls downward.
- Refresh behavior at the top of the timeline remains stable.
- The current UI remains visually familiar, with no new pagination controls exposed unless they are needed for failure recovery.
