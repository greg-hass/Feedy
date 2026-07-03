# Feeds Interaction Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Feeds management, add swipe-to-pause, align toolbar states with Latest, and eliminate layout shifts when opening New Folder or Select.

**Architecture:** Keep the existing feed API and `excludeFromTimeline` persistence. Add a small pure pause-state helper for testable labels and PATCH payloads, reuse existing sheet and icon-button patterns, and keep the normal feed list mounted while overlays or selection controls appear.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Lucide React, Node test runner.

---

## File Structure

- Create `src/lib/feed-pause.ts`: pure pause/resume labels and PATCH payload construction.
- Create `src/lib/feed-pause.test.ts`: pause/resume unit coverage.
- Create `src/lib/feeds-ui.test.ts`: focused source-level UI regression assertions used by this repository's dependency-light test setup.
- Modify `src/components/feeds-screen.tsx`: stable toolbar states, remove swipe hint, and render New Folder as a sheet.
- Modify `src/components/forms.tsx`: add the New Folder sheet and simplify quick feed editing.
- Modify `src/components/feed-library-components.tsx`: pause/resume swipe mutation and paused row indicator.
- Modify `src/app/app/feeds/[feedId]/page.tsx`: remove mute-rule editing and provide compact pause/resume.

### Task 1: Introduce testable pause semantics

**Files:**
- Create: `src/lib/feed-pause.test.ts`
- Create: `src/lib/feed-pause.ts`

- [ ] **Step 1: Write the failing pause helper tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getFeedPauseActionLabel,
  getFeedPausePatch,
} from "@/lib/feed-pause";

describe("feed pause semantics", () => {
  it("builds a pause request for an active feed", () => {
    assert.deepEqual(getFeedPausePatch(false), {
      excludeFromTimeline: true,
    });
    assert.equal(getFeedPauseActionLabel(false), "Pause");
  });

  it("builds a resume request for a paused feed", () => {
    assert.deepEqual(getFeedPausePatch(true), {
      excludeFromTimeline: false,
    });
    assert.equal(getFeedPauseActionLabel(true), "Resume");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test src/lib/feed-pause.test.ts
```

Expected: FAIL because `@/lib/feed-pause` does not exist.

- [ ] **Step 3: Implement the minimal helper**

```ts
export function getFeedPausePatch(isPaused: boolean) {
  return {
    excludeFromTimeline: !isPaused,
  };
}

export function getFeedPauseActionLabel(isPaused: boolean) {
  return isPaused ? "Resume" : "Pause";
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx tsx --test src/lib/feed-pause.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit the pause semantics**

```bash
git add src/lib/feed-pause.ts src/lib/feed-pause.test.ts
git commit -m "Add feed pause semantics"
```

### Task 2: Add swipe pause/resume and paused-row status

**Files:**
- Create: `src/lib/feeds-ui.test.ts`
- Modify: `src/components/feed-library-components.tsx`

- [ ] **Step 1: Write failing UI contract assertions**

Create a source-level regression test consistent with the repository's existing Node-only UI checks:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const librarySource = readFileSync(
  new URL("../components/feed-library-components.tsx", import.meta.url),
  "utf8",
);

describe("Feeds UI contracts", () => {
  it("offers pause or resume from feed swipe actions", () => {
    assert.match(librarySource, /getFeedPauseActionLabel/);
    assert.match(librarySource, /getFeedPausePatch/);
    assert.match(librarySource, /aria-label=\{`\$\{pauseLabel\}/);
  });

  it("marks paused feeds without relying on color alone", () => {
    assert.match(librarySource, /aria-label="Paused"/);
    assert.match(librarySource, />Paused</);
  });
});
```

- [ ] **Step 2: Run the UI contract test and verify RED**

Run:

```bash
npx tsx --test src/lib/feeds-ui.test.ts
```

Expected: FAIL because the pause helper and paused label are not used by the feed row.

- [ ] **Step 3: Add the pause/resume mutation and swipe action**

In `FeedRow`, import `Pause`, `Play`, `getFeedPauseActionLabel`, and `getFeedPausePatch`; derive `pauseLabel`; then add:

```tsx
const pauseFeed = useMutation({
  mutationFn: () =>
    api(`/api/feeds/${feed.id}`, {
      method: "PATCH",
      body: JSON.stringify(getFeedPausePatch(feed.excludeFromTimeline)),
    }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    await queryClient.invalidateQueries({ queryKey: ["items"] });
  },
});

const pauseLabel = getFeedPauseActionLabel(feed.excludeFromTimeline);
```

Place this action beside Edit and Delete:

```tsx
<button
  type="button"
  onClick={() => pauseFeed.mutate()}
  disabled={pauseFeed.isPending}
  className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--accent-dim)] text-[var(--accent)] disabled:opacity-60"
  aria-label={`${pauseLabel} ${feed.label || feed.title}`}
  title={pauseLabel}
>
  {feed.excludeFromTimeline ? (
    <Play className="size-4" />
  ) : (
    <Pause className="size-4" />
  )}
</button>
```

Replace the current eye-off timeline marker with a pause marker containing visible and screen-readable state:

```tsx
<span
  className="inline-flex items-center gap-1 text-[var(--accent)]"
  aria-label="Paused"
  title="Paused"
>
  <Pause className="size-3.5" />
  <span>Paused</span>
</span>
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test src/lib/feed-pause.test.ts src/lib/feeds-ui.test.ts
```

Expected: all pause and UI contract tests pass.

- [ ] **Step 5: Commit swipe pause**

```bash
git add src/components/feed-library-components.tsx src/lib/feeds-ui.test.ts
git commit -m "Add swipe controls to pause feeds"
```

### Task 3: Simplify feed editing and dedicated settings

**Files:**
- Modify: `src/lib/feeds-ui.test.ts`
- Modify: `src/components/forms.tsx`
- Modify: `src/app/app/feeds/[feedId]/page.tsx`

- [ ] **Step 1: Add failing assertions for the simplified edit surfaces**

Extend `src/lib/feeds-ui.test.ts`:

```ts
const formsSource = readFileSync(
  new URL("../components/forms.tsx", import.meta.url),
  "utf8",
);
const feedSettingsSource = readFileSync(
  new URL("../app/app/feeds/[feedId]/page.tsx", import.meta.url),
  "utf8",
);

it("removes mute-rule editing from both feed edit surfaces", () => {
  assert.doesNotMatch(formsSource, /Mute rules/);
  assert.doesNotMatch(formsSource, /splitMutePatterns/);
  assert.doesNotMatch(feedSettingsSource, /Mute rules/);
  assert.doesNotMatch(feedSettingsSource, /splitMutePatterns/);
});

it("keeps pause management on dedicated feed settings", () => {
  assert.match(feedSettingsSource, /getFeedPauseActionLabel/);
  assert.match(feedSettingsSource, /getFeedPausePatch/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test src/lib/feeds-ui.test.ts
```

Expected: FAIL because both edit surfaces still contain mute-rule controls and the settings page does not use pause semantics.

- [ ] **Step 3: Simplify `EditFeedSheet`**

Remove `splitMutePatterns`, all four mute-rule state values, the `excludeFromTimeline` state/control, the mute-rule JSX, and `muteRules`/`excludeFromTimeline` from the save payload. Keep the payload focused:

```ts
body: JSON.stringify({
  label: label || null,
  folderId: folderId || null,
  isPinned,
}),
```

Keep Label and Folder first, Pin secondary, Save as the existing full-width primary `Button`, followed by reorder and destructive controls.

- [ ] **Step 4: Simplify dedicated feed settings and retain pause**

Remove `splitMutePatterns`, all mute-rule state, mute-rule JSX, and `muteRules` from the save request. Import the pause helper and label. Keep `excludeFromTimeline` state and render a compact tint-only button:

```tsx
<button
  type="button"
  onClick={() => setExcludeFromTimeline((current) => !current)}
  aria-pressed={excludeFromTimeline}
  className={`mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
    excludeFromTimeline
      ? "border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)]"
      : "border-subtle bg-[var(--surface)] text-secondary"
  }`}
>
  {excludeFromTimeline ? (
    <Play className="size-4" />
  ) : (
    <Pause className="size-4" />
  )}
  {getFeedPauseActionLabel(excludeFromTimeline)}
</button>
```

Continue saving `excludeFromTimeline` with label and folder so Save remains atomic.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test src/lib/feed-pause.test.ts src/lib/feeds-ui.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit simplified editing**

```bash
git add src/components/forms.tsx src/app/app/feeds/[feedId]/page.tsx src/lib/feeds-ui.test.ts
git commit -m "Simplify feed editing controls"
```

### Task 4: Stabilize the Feeds toolbar and New Folder interaction

**Files:**
- Modify: `src/lib/feeds-ui.test.ts`
- Modify: `src/components/forms.tsx`
- Modify: `src/components/feeds-screen.tsx`

- [ ] **Step 1: Add failing toolbar and sheet assertions**

Extend `src/lib/feeds-ui.test.ts`:

```ts
const feedsScreenSource = readFileSync(
  new URL("../components/feeds-screen.tsx", import.meta.url),
  "utf8",
);

it("removes the obsolete swipe hint", () => {
  assert.doesNotMatch(feedsScreenSource, /Swipe a row left/);
  assert.doesNotMatch(feedsScreenSource, /feedy-swipe-hint-dismissed/);
});

it("uses tint-only active toolbar controls", () => {
  assert.match(feedsScreenSource, /variant=\{showAddFolder \? "active" : "default"\}/);
  assert.match(feedsScreenSource, /variant=\{showAddFeed \? "active" : "default"\}/);
  assert.doesNotMatch(feedsScreenSource, /variant="accent"/);
});

it("opens New Folder in a fixed sheet instead of inline flow", () => {
  assert.match(formsSource, /export function AddFolderSheet/);
  assert.match(formsSource, /className="fixed inset-0 z-50/);
  assert.match(feedsScreenSource, /<AddFolderSheet/);
  assert.doesNotMatch(feedsScreenSource, /<div className="mb-3">\s*<AddFolderForm/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test src/lib/feeds-ui.test.ts
```

Expected: FAIL because the hint exists, Add Feed is solid green, and New Folder is inline.

- [ ] **Step 3: Add `AddFolderSheet`**

Retain `AddFolderForm` for any existing callers, and add a sheet wrapper in `forms.tsx`:

```tsx
export function AddFolderSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--text-primary)]/40 px-3 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <AddFolderForm onClose={onClose} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Make toolbar state tint-only and remove the hint**

In `feeds-screen.tsx`:

- Remove `showSwipeHint`, its local-storage initializer, and the hint section.
- Dynamically import `AddFolderSheet` instead of `AddFolderForm`.
- Render `<AddFolderSheet onClose={() => setShowAddFolder(false)} />` outside normal content flow.
- Set New Folder to `variant={showAddFolder ? "active" : "default"}` and `aria-pressed={showAddFolder}`.
- Set Add Feed to `variant={showAddFeed ? "active" : "default"}` and `aria-pressed={showAddFeed}`.
- Change Select and Cancel active states to `border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)]`.
- Change the bulk Move control away from a solid green fill to the same tint-only active language.
- Keep toolbar height fixed at `h-10` in both normal and selection modes.

- [ ] **Step 5: Keep selection rendering stable**

Move the selection branch inside each existing section so the same section order and outer spacing remain mounted. For each feed position render either `FeedRow` or `SelectableFeedRow`; for each folder position render either `FolderRow` or `SelectableFolderRow`. Keep `contentVisibility` and `containIntrinsicSize: "92px"` on both row variants. Do not remount the search/stats section.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test src/lib/feed-pause.test.ts src/lib/feeds-ui.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit toolbar and stability work**

```bash
git add src/components/feeds-screen.tsx src/components/forms.tsx src/lib/feeds-ui.test.ts
git commit -m "Stabilize Feeds toolbar interactions"
```

### Task 5: Validate behavior and production build

**Files:**
- Modify only if validation reveals a defect in files already in scope.

- [ ] **Step 1: Run formatting and static checks**

Run:

```bash
git diff --check
npm run lint
```

Expected: both commands exit 0 with no lint errors.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
npm run test
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production build exits 0.

- [ ] **Step 4: Validate Docker configuration**

Run:

```bash
docker compose config --quiet
```

Expected: exit 0.

- [ ] **Step 5: Build and start the application containers**

Run:

```bash
docker compose up --build -d
docker compose ps
```

Expected: `web`, `worker`, `postgres`, and `redis` are running; healthchecked services report healthy; `migrate` completed successfully.

- [ ] **Step 6: Inspect startup logs for regressions**

Run:

```bash
docker compose logs --no-color --tail=100 web worker migrate
```

Expected: no startup exceptions, migration failures, or repeated worker crashes.

- [ ] **Step 7: Review the final diff against the approved spec**

Run:

```bash
git status --short
git diff --stat HEAD~4
git diff HEAD~4 -- src/components/feeds-screen.tsx src/components/forms.tsx src/components/feed-library-components.tsx 'src/app/app/feeds/[feedId]/page.tsx' src/lib/feed-pause.ts src/lib/feed-pause.test.ts src/lib/feeds-ui.test.ts
```

Expected: only approved Feeds interaction, pause, edit simplification, tests, and documentation changes are present.
