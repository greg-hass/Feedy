# Task for worker

[Read from: /Users/greg/Developer/Feedy/context.md, /Users/greg/Developer/Feedy/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
In the Feedy project at /Users/greg/Developer/Feedy, adopt the Sheet primitive in two more files. The Sheet component is at `@/components/ui/sheet` and exports `Sheet` with props: `{ title, subtitle?, onClose, children?, className?, panelClassName?, showHandle? }`.

## File 1: src/app/app/folders/[folderId]/page.tsx

The **FolderBulkMoveSheet** component has an outer backdrop div and inner panel div that need to be replaced with `<Sheet>`. 

Replace the outer structure (backdrop div + panel div + drag handle + header with title 'Move selected feeds' and subtitle and close button with X icon) with:
```tsx
<Sheet
  title="Move selected feeds"
  subtitle={`Choose where to place ${selectedCount} selected ${selectedCount === 1 ? "feed" : "feeds"}.`}
  onClose={onClose}
  panelClassName="max-h-[min(72vh,640px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-subtle bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-[0_-18px_48px_rgba(0,0,0,0.34)]"
>
  <folder list content as children>
</Sheet>
```

Remove the drag handle, header (title/subtitle), and close button (Sheet provides these). Add `type="button"` to the folder move buttons. Add import: `import { Sheet } from "@/components/ui/sheet";`. If X from lucide-react is no longer used, remove it from the import.

## File 2: src/app/app/feeds/[feedId]/page.tsx

The **EditFeedModal** component has an outer backdrop div and inner panel div that need to be replaced with `<Sheet>`.

Replace the outer structure (backdrop div + panel div + h3 'Edit feed' + p with feed.sourceUrl) with:
```tsx
<Sheet
  title="Edit feed"
  subtitle={feed.sourceUrl}
  onClose={onClose}
  showHandle={false}
  panelClassName="w-full max-w-md rounded-t-[24px] bg-[var(--surface)] p-5 pb-8"
>
  <form content, pause button, save button, delete button as children>
</Sheet>
```

Remove the title/subtitle header (Sheet provides these). Add import: `import { Sheet } from "@/components/ui/sheet";`. Add `type="button"` to the delete button. If any imports become unused, remove them.

## Verification
After both changes, run:
```bash
npx tsx --test src/lib/feeds-ui.test.ts src/components/ui/sheet.test.ts
npm run lint
npm run build
```
All must pass.

---
Update progress at: /Users/greg/Developer/Feedy/.pi-subagents/artifacts/progress/d43a0d96/progress.md

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```