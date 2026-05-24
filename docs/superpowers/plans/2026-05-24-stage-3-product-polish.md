# Stage 3 Product Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve backup UX, resolve safe image-rendering warnings, and align user-facing documentation with shipped operational limits.

**Architecture:** Keep message formatting in a pure tested helper; leave server enforcement in existing routes while exposing it in `ImportExportScreen`. Adopt `next/image` only in ways that preserve the security boundary: local assets optimized normally and remote or dynamic media rendered `unoptimized`.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, TanStack Query, `next/image`, `node:test`, `tsx`.

---

### Task 1: Import/Export Guidance And Download Errors

**Files:**
- Create: `src/lib/import-export-ui.ts`
- Create: `src/lib/import-export-ui.test.ts`
- Modify: `src/components/screens.tsx`

- [ ] **Step 1: Add a failing unit test for OPML summary formatting**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatImportSummary } from "@/lib/import-export-ui";

describe("formatImportSummary", () => {
  it("reports successful, duplicate, folder, and failed results", () => {
    assert.equal(
      formatImportSummary({ imported: 2, duplicates: 1, foldersCreated: 3, failed: 1 }),
      "2 imported · 1 duplicates skipped · 3 folders created · 1 failed",
    );
  });
});
```

- [ ] **Step 2: Verify the new test fails**

Run: `npx tsx --test src/lib/import-export-ui.test.ts`

Expected: failure because `@/lib/import-export-ui` does not yet exist.

- [ ] **Step 3: Implement the pure formatting helper**

```ts
export type ImportSummary = {
  imported?: number;
  duplicates?: number;
  failed?: number;
  foldersCreated?: number;
};

export function formatImportSummary(result: ImportSummary) {
  const parts = [
    `${result.imported ?? 0} imported`,
    `${result.duplicates ?? 0} duplicates skipped`,
    `${result.foldersCreated ?? 0} folders created`,
  ];
  if ((result.failed ?? 0) > 0) parts.push(`${result.failed} failed`);
  return parts.join(" · ");
}
```

- [ ] **Step 4: Wire the import result and managed JSON export experience**

In `ImportExportScreen`, replace inline result string construction with `formatImportSummary`, show the OPML and JSON limits, and add a JSON download mutation that:

```ts
const response = await fetch("/api/export/json", { credentials: "same-origin" });
if (!response.ok) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(data?.error || "Export failed");
}
const url = URL.createObjectURL(await response.blob());
const anchor = document.createElement("a");
anchor.href = url;
anchor.download = "feedy-backup.json";
anchor.click();
URL.revokeObjectURL(url);
```

Change the Settings JSON shortcut to navigate to `/app/import-export` so all UI-initiated JSON exports show errors.

- [ ] **Step 5: Verify the helper test passes**

Run: `npx tsx --test src/lib/import-export-ui.test.ts`

Expected: pass.

### Task 2: Safe Next Image Adoption

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/feed-avatar.tsx`
- Modify: `src/components/item-card.tsx`
- Modify: `src/components/media-surface.tsx`
- Modify: `src/components/screens.tsx`
- Modify: `src/app/reader/[itemId]/page.tsx`

- [ ] **Step 1: Convert app-controlled images to optimized `Image`**

Import `Image` from `next/image` and replace the login icon and header accent icon with sized `Image` components using their local `/public` sources.

- [ ] **Step 2: Convert dynamic and remote media without creating a fetch proxy**

Use `Image` with `unoptimized` for `/api/icons/...`, discovery favicons, item thumbnails, video posters, and reader media. For aspect-ratio media containers, set the parent `relative`, use `fill`, and retain existing `onLoad`/`onError` fallback logic.

- [ ] **Step 3: Confirm lint no longer reports raw-image warnings**

Run: `npm run lint`

Expected: exit 0 without `@next/next/no-img-element` warnings.

### Task 3: Document Operational Behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add readiness and limit documentation**

Document `/api/health` readiness checks, OPML and JSON export limits, bulk refresh and feed processing caps, and database backup guidance for large libraries.

- [ ] **Step 2: Add CI publication gate documentation**

State that the GHCR workflow runs tests, lint, Prisma validation, dependency audit, and an application build before publishing.

### Task 4: Final Verification

**Files:**
- Verify all Stage 3 modified files.

- [ ] **Step 1: Run complete checks**

```bash
npm test
npm run lint
npm run build
npx prisma validate
npm audit --audit-level=low
docker compose config --quiet
git diff --check
```

Expected: all commands exit successfully and lint reports no raw-image warnings.
