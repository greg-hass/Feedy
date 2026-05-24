# YouTube Thumbnail Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YouTube cards use the highest available thumbnail quality and portrait-first artwork for identified Shorts.

**Architecture:** Centralize ordered YouTube thumbnail URL creation in the existing thumbnail helper. Server preview resolution uses landscape quality candidates before RSS metadata, while client cards use the persisted Shorts classification to prepend portrait candidates and select portrait layout.

**Tech Stack:** TypeScript, Next.js App Router, React, Node test runner, Sharp

---

### Task 1: Shared Thumbnail Candidate Policy

**Files:**
- Modify: `src/lib/feed/youtube-thumbnail.ts`
- Create: `src/lib/feed/youtube-thumbnail.test.ts`

- [ ] **Step 1: Write failing quality-order tests**

Add tests that call `getYouTubeThumbnailUrls("video-id")` and assert the quality order is `maxresdefault`, `hq720`, `sddefault`, `hqdefault`, `mqdefault`, `0`, then `default`. Add a Shorts case with `{ isShort: true, existingUrl: "https://rss.invalid/thumb.jpg" }` and assert `oar2`, `maxres2`, `hq2`, and `frame0` precede landscape candidates while the existing URL is last.

- [ ] **Step 2: Run the focused test to observe failure**

Run: `npx tsx --test src/lib/feed/youtube-thumbnail.test.ts`

Expected: FAIL because the current helper lacks options and does not use the quality order.

- [ ] **Step 3: Implement the ordered candidate helper**

Update `getYouTubeThumbnailUrls` to accept:

```ts
type YouTubeThumbnailOptions = {
  existingUrl?: string | null;
  isShort?: boolean;
};
```

Build candidates from portrait quality names only when `isShort` is true, followed by the shared landscape quality names, then append a distinct `existingUrl`. Return a deduplicated array.

- [ ] **Step 4: Run the focused test to confirm it passes**

Run: `npx tsx --test src/lib/feed/youtube-thumbnail.test.ts`

Expected: PASS.

### Task 2: Quality-First Stored Preview Resolution

**Files:**
- Modify: `src/lib/feed/youtube-preview.ts`
- Modify: `src/lib/feed/youtube.test.ts`

- [ ] **Step 1: Write a failing server-selection regression test**

Add a test with a lower-resolution RSS URL and a usable `maxresdefault` response. Assert `resolveYouTubePreviewUrl` returns the generated `maxresdefault` URL and does not select the RSS asset first.

- [ ] **Step 2: Run the YouTube tests to observe failure**

Run: `npx tsx --test src/lib/feed/youtube.test.ts`

Expected: FAIL because RSS-provided thumbnail candidates are currently inserted before generated candidates.

- [ ] **Step 3: Implement quality-first probing**

Change preview resolution to try `getYouTubeThumbnailUrls(videoId)` first. If none is usable, add oEmbed, watch-page, and RSS candidate URLs in a deduplicated fallback collection and run the existing byte/placeholder validation over them.

- [ ] **Step 4: Run YouTube tests to confirm the behavior**

Run: `npx tsx --test src/lib/feed/youtube.test.ts src/lib/feed/youtube-thumbnail.test.ts`

Expected: PASS.

### Task 3: Shorts-Aware Client Display

**Files:**
- Modify: `src/lib/data.ts`
- Modify: `src/lib/serializers.ts`
- Modify: `src/types/app.ts`
- Modify: `src/components/item-card.tsx`

- [ ] **Step 1: Expose persisted Shorts classification**

Select `youtubeIsShort` with timeline/reader items, serialize it, and add `youtubeIsShort: boolean` to `ItemRecord`.

- [ ] **Step 2: Use the shared candidates in the card**

Replace the manual `[item.mediaUrl, ...getYouTubeThumbnailUrls(...)]` construction with:

```ts
getYouTubeThumbnailUrls(item.youtubeVideoId, {
  existingUrl: item.mediaUrl,
  isShort: item.youtubeIsShort,
})
```

- [ ] **Step 3: Present known Shorts as portrait images**

Choose `aspect-[9/16]` for YouTube Short preview containers and keep `aspect-video` for normal items so portrait candidates are not cropped into landscape cards.

- [ ] **Step 4: Run static validation**

Run: `npm run lint && npm run build`

Expected: both exit successfully, proving the new selected field and serialized type are wired consistently.

### Task 4: Full Verification

**Files:**
- Verify all modified source, test, and documentation files.

- [ ] **Step 1: Run all automated checks**

Run: `npm test && npm run lint && npm run build`

Expected: all tests pass and the application builds.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check && git diff --stat && git status --short --branch`

Expected: no whitespace errors and only the intended thumbnail-quality files plus this specification and plan are modified.
