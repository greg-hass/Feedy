# Progress — Sheet primitive adoption (folders + feeds pages)

## Status: Complete

## Changes made

### File 1: `src/app/app/folders/[folderId]/page.tsx`

- Added `import { Sheet } from "@/components/ui/sheet";`
- Replaced `FolderBulkMoveSheet`'s manual backdrop div + panel div + drag handle + header + close button with `<Sheet>` primitive
- Sheet provides: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape close, focus trap, focus restoration, backdrop click close
- Added `type="button"` to both folder move buttons
- `X` import retained — still used by the Cancel button in selection mode

### File 2: `src/app/app/feeds/[feedId]/page.tsx`

- Added `import { Sheet } from "@/components/ui/sheet";`
- Replaced `EditFeedModal`'s manual backdrop div + panel div + h3/p header with `<Sheet>` primitive
- Used `showHandle={false}` and custom `panelClassName` to match the original visual style
- Added `type="button"` to the delete button
- No imports became unused (Pause, Play still used by the pause toggle button)

## Verification

- `npx tsx --test src/lib/feeds-ui.test.ts src/components/ui/sheet.test.ts` — 10/10 pass
- `npm run lint` — clean
- `npm run build` — success
- `npm test` — 217/217 pass
