# Feedy Timeline Refresh Toast Design

## Goal

When the timeline refreshes while the user is actively browsing it, keep the scroll position stable, surface a toast that explains how many new articles arrived, and let the user jump directly to the oldest of the newly inserted articles.

## Scope

In scope:
- Timeline refreshes triggered automatically or manually.
- Keeping the current scroll position unchanged across refreshes.
- Showing a toast when refresh introduces new timeline articles.
- Providing a jump action that lands on the oldest newly added article.

Out of scope:
- Changing article ordering rules.
- Changing feed ingestion or refresh cadence.
- Adding a global notification system outside the timeline refresh flow.
- Marking articles read automatically as part of refresh.

## Current State

The timeline lives in [`src/components/screens.tsx`](/Users/greg/Projects/Feedy/src/components/screens.tsx).

Refreshes are already coordinated by `useRefreshController`, which tracks refresh batches and refetches the `items` query when a refresh is active. The timeline also already persists scroll state and uses anchor restoration to avoid losing position during navigation.

What is missing today is a user-facing signal that new content arrived, plus a deliberate way to navigate to the newly inserted block without forcing the timeline back to the top.

## Design

### 1. Refresh snapshot and diff

Before a refresh starts, capture the current ordered timeline item IDs for the active view.

After refresh completes and the timeline query has been refetched, compare the new ordered list against that snapshot:
- Count how many items are newly present.
- Identify the contiguous block of new items that appeared at the top of the timeline.
- Record the `itemId` of the oldest item in that new block.

This should work for both:
- automatic background refreshes
- manual refreshes triggered by the user

If the refresh does not add any timeline items, the UI should not show a new-articles toast.

### 2. Scroll behavior

Refreshing must not reset the user’s scroll position.

The current scroll location should remain stable while the refresh batch runs and after the refetch completes. The only time the timeline should move is if the user explicitly chooses the jump action from the toast.

### 3. Toast behavior

When new articles are detected, show a toast message like:
- `5 new articles`

The toast should include an action:
- `Go to first new article`

The action should scroll to the oldest article in the newly inserted top block, not to the very top of the page. That puts the user at the boundary between old and new content, which makes it easy to review the fresh batch from there.

If only one new item arrived, the jump action should still work and land on that item.

### 4. State ownership

Keep the refresh batch tracking where it already lives, but extend the timeline screen with local state for:
- the snapshot of item IDs before refresh
- the detected new-item count
- the detected jump target item ID
- toast visibility and dismissal

The timeline should not need a new global store for this. This is a local interaction tied to one screen.

### 5. Error handling

If refresh fails:
- keep the current scroll position unchanged
- do not show the new-articles toast
- leave the existing refresh error behavior intact

If the refresh succeeds but the timeline query is temporarily stale or empty during refetch:
- prefer waiting for the refetched items before deciding whether to show the toast
- avoid flashing a false `0 new articles` state

## Data Flow

1. User taps refresh or an automatic refresh runs.
2. The timeline records the current ordered item IDs.
3. Refresh completes and the `items` query refetches.
4. The timeline compares the before/after lists.
5. If new items exist, it shows a toast and stores the jump target ID.
6. If the user taps the toast action, the view scrolls to the oldest newly inserted article.

## Verification

- Confirm the scroll position does not jump when refresh completes.
- Confirm a toast appears only when refresh adds new timeline items.
- Confirm the toast count matches the number of newly inserted timeline items.
- Confirm the jump action lands on the oldest item in the new block.
- Confirm both automatic refreshes and manual refreshes use the same behavior.

## Non-Goals

- No feed-level toast system.
- No background polling UI beyond the existing refresh controller.
- No change to timeline ordering or ranking.
- No new unread/read state behavior.
