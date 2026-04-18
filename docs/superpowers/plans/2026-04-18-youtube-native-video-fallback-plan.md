# YouTube Native Video Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play YouTube items with native `<video>` when a direct stream can be resolved, and fall back to the current YouTube iframe player when it cannot.

**Architecture:** Add a narrow server-side stream-resolution layer that tries to turn a YouTube video id into a direct media URL plus a resumable start time. The client reader and inline card should prefer a native `<video>` element when that URL exists, but keep the existing iframe path as a fallback so current YouTube functionality remains intact.

**Tech Stack:** Next.js 16, React 19, TypeScript, current YouTube iframe API, native HTML `<video>`, existing item parsing/storage model, optional lightweight YouTube stream-resolution library or service.

---

### Task 1: Add a server-side YouTube stream resolver

**Files:**
- Create: `src/lib/youtube/stream-resolver.ts`
- Modify: `package.json`
- Modify: `src/app/api/items/[itemId]/reader/route.ts`
- Modify: `src/app/api/items/[itemId]/route.ts` if needed for any shared item response shape

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveYouTubeStream } from "@/lib/youtube/stream-resolver";

describe("resolveYouTubeStream", () => {
  it("returns null when the video id cannot be resolved", async () => {
    await expect(resolveYouTubeStream("not-a-real-id")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/youtube/stream-resolver.test.ts -v`
Expected: FAIL because the resolver module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function resolveYouTubeStream(videoId: string): Promise<{ src: string; type: string } | null> {
  return null;
}
```

- [ ] **Step 4: Add the real resolver path**

Implement the extractor using a direct-stream library that can read YouTube player metadata and expose a playable URL. Prefer a small wrapper that returns:

```ts
type ResolvedYouTubeStream = {
  src: string;
  type: string;
  poster?: string | null;
};
```

Use it from the reader route so the API can include a native-video payload when available, while leaving `youtubeVideoId` in place for fallback rendering.

- [ ] **Step 5: Run the targeted test and typecheck**

Run:
`npx vitest run src/lib/youtube/stream-resolver.test.ts -v`
`npx tsc --noEmit`
Expected: resolver test passes; typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/youtube/stream-resolver.ts src/app/api/items/[itemId]/reader/route.ts
git commit -m "feat: add youtube stream resolver"
```

### Task 2: Extend reader data to support native video fallback

**Files:**
- Modify: `src/types/app.ts`
- Modify: `src/lib/serializers.ts`
- Modify: `src/app/api/items/[itemId]/reader/route.ts`
- Modify: `src/app/reader/[itemId]/page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { serializeItem } from "@/lib/serializers";

describe("serializeItem", () => {
  it("preserves a resolved video payload when present", () => {
    const item = serializeItem({
      id: "1",
      title: "Video",
      summary: null,
      readabilityHtml: null,
      contentHtml: null,
      canonicalUrl: null,
      mediaUrl: null,
      publishedAt: null,
      youtubeVideoId: "abc123",
      feed: { id: "f1", title: "Feed", label: null, sourceType: "YOUTUBE_RSS" },
      bookmarks: [],
      readStates: [],
      video: { src: "https://example.com/video.mp4", type: "video/mp4" },
    } as never);

    expect(item.video).toEqual({ src: "https://example.com/video.mp4", type: "video/mp4" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/serializers.test.ts -v`
Expected: FAIL because the item type does not include a video payload yet.

- [ ] **Step 3: Write minimal implementation**

Add an optional `video` field to the serialized item shape and reader response types:

```ts
video?: {
  src: string;
  type: string;
  poster?: string | null;
} | null;
```

- [ ] **Step 4: Render native video when the payload exists**

In the reader page, prefer `<video controls playsInline>` when `data.video` is present, and fall back to the current YouTube iframe when it is not.

- [ ] **Step 5: Run the targeted test and typecheck**

Run:
`npx vitest run src/lib/serializers.test.ts -v`
`npx tsc --noEmit`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/app.ts src/lib/serializers.ts src/app/api/items/[itemId]/reader/route.ts src/app/reader/[itemId]/page.tsx
git commit -m "feat: prefer native video in reader when available"
```

### Task 3: Wire the inline card to keep using the same fallback rules

**Files:**
- Modify: `src/components/item-card.tsx`
- Modify: `src/components/youtube-inline-player.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getSavedYouTubeProgressSeconds } from "@/components/youtube-inline-player";

describe("youtube inline player fallback behavior", () => {
  it("still exposes saved progress for the iframe fallback path", () => {
    expect(typeof getSavedYouTubeProgressSeconds).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/youtube-inline-player.test.ts -v`
Expected: the test suite fails until the fallback path is updated and exported cleanly.

- [ ] **Step 3: Update the card rendering**

Keep the current inline YouTube player as the fallback when no native stream is resolved. Make the play button choose the native `<video>` path when the item has a resolved video payload.

- [ ] **Step 4: Run typecheck and a browser smoke test**

Run:
`npx tsc --noEmit`
`npx eslint src/components/item-card.tsx src/components/youtube-inline-player.tsx src/app/reader/[itemId]/page.tsx`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/item-card.tsx src/components/youtube-inline-player.tsx
git commit -m "feat: keep inline youtube fallback stable"
```

### Task 4: Verify the full fallback chain

**Files:**
- Modify: none

- [ ] **Step 1: Start the app and open a YouTube item**

Confirm the app chooses native video when the resolver returns a playable stream.

- [ ] **Step 2: Simulate resolver failure**

Temporarily force the resolver to return `null` and confirm the iframe fallback still works exactly as it does today.

- [ ] **Step 3: Confirm tab switching and backgrounding**

Switch bottom tabs and background the app to verify playback behavior stays alive through the chosen path.

- [ ] **Step 4: Restore any temporary test hooks**

Remove the temporary forced-failure toggle, if any was introduced for verification.

---

**Coverage check**
- YouTube stream resolution: Task 1
- Native video in reader: Task 2
- Inline fallback stability: Task 3
- End-to-end verification: Task 4

**Risk note**
- If the chosen extractor library cannot reliably produce a playable stream in this environment, keep the fallback architecture and stop short of changing the non-YouTube playback path.
