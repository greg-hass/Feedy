# Feedy Settings Storage and Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a database/status section to Settings with safe purge controls, keep YouTube playback alive across tabs/backgrounding, and remove the bookmark overlay from bookmarked YouTube thumbnails.

**Architecture:** Keep the UI changes in the existing settings and item-card surfaces, but move the actual database/storage calculations into a dedicated server-side settings storage API. Use one shared YouTube playback session in `Providers` so the visible inline player and the hidden background player stay in sync across tabs, and keep the bookmark visual cleanup limited to the YouTube thumbnail path in the card renderer.

**Tech Stack:** Next.js 16 app router, React 19, TypeScript, TanStack Query, Prisma/Postgres, existing YouTube iframe player.

---

### Task 1: Add storage metrics and purge APIs

**Files:**
- Create: `src/app/api/settings/storage/route.ts`
- Create: `src/app/api/settings/purge/route.ts`
- Create: `src/lib/settings-storage.ts`
- Create: `src/lib/settings-storage.test.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/types/app.ts`
- Modify: `src/components/screens.tsx`

- [ ] **Step 1: Write the failing test**

Add a focused `node:test` file for the storage helper:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, getPurgeCutoffDate } from "@/lib/settings-storage";

describe("settings storage helpers", () => {
  it("formats database size in readable units", () => {
    assert.equal(formatBytes(1536), "1.5 KB");
  });

  it("computes purge cutoff dates from the retention window", () => {
    assert.equal(
      getPurgeCutoffDate(30, new Date("2026-04-18T12:00:00.000Z")).toISOString(),
      "2026-03-19T12:00:00.000Z",
    );
  });
});
```

Run:
`npx tsx --test src/lib/settings-storage.test.ts`
Expected: fail until `src/lib/settings-storage.ts` exports `formatBytes` and `getPurgeCutoffDate`.

- [ ] **Step 2: Run the test and confirm the failure is the right one**

The test should fail because the helper exports do not exist yet, not because of a typo in the test.

- [ ] **Step 3: Write the minimal helper and routes**

Start with a thin storage helper that computes counts from Prisma and a purge helper that only deletes read, unbookmarked items older than the chosen threshold:

```ts
export type StorageSummary = {
  databaseSizeBytes: number;
  feedCount: number;
  articleCount: number;
  bookmarkedArticleCount: number;
  readArticleCount: number;
  oldestArticlePublishedAt: string | null;
  retentionDays: number;
  purgeEligibleCount: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

export function getPurgeCutoffDate(retentionDays: number, now = new Date()): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}
```

Export the data through:
```ts
GET /api/settings/storage
POST /api/settings/purge
```

The `POST` route should accept:
```ts
{
  retentionDays: number;
  dryRun?: boolean;
}
```

And return:
```ts
{
  purgeEligibleCount: number;
  deletedCount?: number;
}
```

Implementation detail for the async helpers:
- `buildStorageSummary(userId)` should use Prisma counts for feeds and items, plus a raw `pg_database_size(current_database())` query for the database size.
- `purgeReadArticles(userId, retentionDays, dryRun)` should compute the cutoff with `getPurgeCutoffDate`, join through `readStates` and `bookmarks`, and only delete items where the user has read the item and there is no matching bookmark row for that user/item pair.

- [ ] **Step 4: Update the Settings screen to show the new card**

Add a `Database` card near the existing `Storage retention` card in `src/components/screens.tsx` that uses the storage API data to render:
- database size
- feed count
- article count
- retention days
- oldest article age
- purge button with a confirmation copy that includes the count

Keep the card visually consistent with the existing rounded-card style already used in Settings.

- [ ] **Step 5: Run typecheck and a targeted lint pass**

Run:
`npx tsc --noEmit`
`npx eslint src/lib/settings-storage.ts src/app/api/settings/storage/route.ts src/app/api/settings/purge/route.ts src/components/screens.tsx`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings-storage.ts src/app/api/settings/storage/route.ts src/app/api/settings/purge/route.ts src/components/screens.tsx src/types/app.ts src/lib/db.ts
git commit -m "feat: add storage metrics and purge controls"
```

### Task 2: Keep YouTube playback alive across tabs and backgrounding

**Files:**
- Modify: `src/components/providers.tsx`
- Modify: `src/components/item-card.tsx`
- Modify: `src/components/youtube-inline-player.tsx`
- Create: `src/lib/youtube-playback-session.ts`
- Create: `src/lib/youtube-playback-session.test.ts`

- [ ] **Step 1: Write the failing test**

Add a small `node:test` file for the background-player gating helper:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldMountBackgroundYouTubePlayer } from "@/lib/youtube-playback-session";

describe("background YouTube session", () => {
  it("keeps the background player mounted only while playback is active off the source tab", () => {
    assert.equal(
      shouldMountBackgroundYouTubePlayer({
        pathname: "/app/saved",
        activeState: "playing",
        sourcePathname: "/app/unread",
      }),
      true,
    );
  });
});
```

Run:
`npx tsx --test src/lib/youtube-playback-session.test.ts`
Expected: fail until the helper exists and `Providers` uses it.

- [ ] **Step 2: Run the test and confirm the failure is the right one**

The failure should be about the missing helper export, not about app behavior.

- [ ] **Step 3: Keep the shared playback session mounted**

Make the existing `BackgroundYouTubePlayer` path in `src/components/providers.tsx` the single source of truth for active playback while leaving the visible inline player in `src/components/item-card.tsx` as the user-facing surface.

Use a state shape like:

```ts
type ActiveYouTubePlayback = {
  itemId: string;
  videoId: string;
  title: string;
  startSeconds: number;
  sourcePathname: string;
  state: "playing" | "paused" | "buffering" | "ended";
};
```

When the pathname changes away from the source tab, keep the hidden background player mounted so audio continues. When the user returns to the source tab, the inline player should continue from the shared session state instead of restarting.

- [ ] **Step 4: Update the item card to avoid tearing down active playback**

Keep the inline `YouTubeInlinePlayer` in the card, but make sure the card checks the shared playback session before it resets or hides the inline surface.

The goal is:
- switch tabs inside Feedy without stopping audio
- return to the original tab and keep the same video session alive

- [ ] **Step 5: Run typecheck and lint**

Run:
`npx tsc --noEmit`
`npx eslint src/components/providers.tsx src/components/item-card.tsx src/components/youtube-inline-player.tsx`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/providers.tsx src/components/item-card.tsx src/components/youtube-inline-player.tsx
git commit -m "feat: keep youtube playback alive across tabs"
```

### Task 3: Remove the YouTube bookmark overlay badge

**Files:**
- Modify: `src/components/item-card.tsx`
- Modify: `src/components/youtube-inline-player.tsx` if needed for any shared YouTube UI state
- Create: `src/components/item-card-youtube.ts`
- Create: `src/components/item-card-youtube.test.ts`

- [ ] **Step 1: Write the failing test**

Add a small `node:test` file that makes the YouTube overlay rule explicit:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldShowYoutubeBookmarkOverlay } from "@/components/item-card-youtube";

describe("youtube card chrome", () => {
  it("hides the bookmark overlay badge for youtube cards", () => {
    assert.equal(
      shouldShowYoutubeBookmarkOverlay({
        youtubeVideoId: "abc123",
        sourceType: "YOUTUBE_RSS",
      }),
      false,
    );
  });
});
```

Run:
`npx tsx --test src/components/item-card-youtube.test.ts`
Expected: fail until the helper exists and `item-card.tsx` uses it.

- [ ] **Step 2: Run the test and confirm the failure is the right one**

The test should fail because the helper export does not exist yet, not because of test setup.

- [ ] **Step 3: Remove the YouTube overlay badge**

In `src/components/item-card.tsx`, keep bookmark state and bookmark actions, but delete the absolutely positioned bookmark badge that sits over the YouTube thumbnail/video surface.

The non-YouTube item card path should remain unchanged.

Use the bookmark action in the footer as the only bookmark affordance for YouTube items.

- [ ] **Step 4: Run typecheck and lint**

Run:
`npx tsc --noEmit`
`npx eslint src/components/item-card.tsx`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/item-card.tsx src/components/youtube-inline-player.tsx
git commit -m "feat: remove youtube bookmark overlay badge"
```

### Task 4: Verify the full behavior on device

**Files:**
- Modify: none

- [ ] **Step 1: Start the app and inspect Settings**

Open Settings and confirm the new database card shows:
- database size
- feed count
- article count
- retention window
- oldest article age

- [ ] **Step 2: Preview and run a purge**

Trigger a dry-run purge first and confirm the number matches the read, unbookmarked items older than the threshold.
Then confirm a real purge removes only that same eligible set.

- [ ] **Step 3: Verify YouTube playback persistence**

Play a YouTube item in a timeline card, switch to another bottom tab, then return to the original tab.
Confirm audio keeps playing and the visible player resumes the same session.

- [ ] **Step 4: Verify the bookmark overlay cleanup**

Open a bookmarked YouTube item and confirm the thumbnail/video surface no longer shows the extra top-right bookmark overlay badge.

Check a non-YouTube bookmarked item too so the existing bookmark presentation there still works.
