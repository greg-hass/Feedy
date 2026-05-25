# Reddit Preview Quality And Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 14-day retention preset and store the best embedded Reddit preview image available from existing feed data.

**Architecture:** Extend the existing settings preset and Zod boundary for retention. Keep Reddit image selection inside feed parsing, using eligible high-resolution Reddit image links from already-fetched Atom content before falling back to `media:thumbnail`.

**Tech Stack:** TypeScript, Next.js App Router, React, Zod, rss-parser, Node test runner

---

### Task 1: Retention Preset

**Files:**
- Create: `src/lib/schemas.test.ts`
- Modify: `src/lib/schemas.ts`
- Modify: `src/components/screens.tsx`

- [ ] **Step 1: Write failing validation coverage**

Add a `settingsSchema` test asserting:

```ts
assert.equal(settingsSchema.parse({ itemRetentionDays: 14 }).itemRetentionDays, 14);
assert.equal(settingsSchema.safeParse({ itemRetentionDays: 13 }).success, false);
```

- [ ] **Step 2: Verify it fails**

Run: `npx tsx --test src/lib/schemas.test.ts`

Expected: FAIL because the current minimum retention is 30.

- [ ] **Step 3: Implement the preset**

Set the schema minimum to `14`, and render the retention preset buttons from `[14, 30, 90, 180, 365]`.

- [ ] **Step 4: Verify it passes**

Run: `npx tsx --test src/lib/schemas.test.ts`

Expected: PASS.

### Task 2: Reddit High-Resolution Preview Selection

**Files:**
- Modify: `src/lib/feed/parse.test.ts`
- Modify: `src/lib/feed/parse.ts`

- [ ] **Step 1: Write failing parser regressions**

Add an Atom entry with a `width=140` `media:thumbnail` and an escaped `width=1080` `preview.redd.it` image link in `content`; assert that parsed `mediaUrl` is the decoded 1080-pixel URL. Add a thumbnail-only Reddit entry and assert its thumbnail remains `mediaUrl`.

- [ ] **Step 2: Verify the high-resolution test fails**

Run: `npx tsx --test src/lib/feed/parse.test.ts`

Expected: FAIL because current parsing reads only enclosure or `media:thumbnail`.

- [ ] **Step 3: Implement safe Reddit content selection**

Add a parser-local helper that extracts HTTP(S) URLs from decoded entry content, accepts only Reddit image hosts, ranks explicit `width` values, and returns a larger content candidate only when it exceeds the thumbnail width. Use the result only for `FeedSourceType.REDDIT_RSS` media selection.

- [ ] **Step 4: Verify parser tests pass**

Run: `npx tsx --test src/lib/feed/parse.test.ts`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify all source, test, and documentation changes.

- [ ] **Step 1: Run project checks**

Run: `npm test && npm run lint && npm run build`

Expected: all commands exit successfully.

- [ ] **Step 2: Inspect changed scope**

Run: `git diff --check && git diff --stat && git status --short --branch`

Expected: no whitespace errors and changes restricted to this feature's docs, settings, and feed parser coverage/implementation.
