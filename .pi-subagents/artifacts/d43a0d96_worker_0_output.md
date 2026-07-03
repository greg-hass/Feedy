No staged files. All changes are in the working tree.

Both files have been updated to adopt the Sheet primitive. Here's the summary:

**What changed:**
- `src/app/app/folders/[folderId]/page.tsx` — `FolderBulkMoveSheet` now uses `<Sheet>` instead of manual backdrop/panel/handle/header/close-button markup. Folder move buttons got `type="button"`.
- `src/app/app/feeds/[feedId]/page.tsx` — `EditFeedModal` now uses `<Sheet>` with `showHandle={false}` and custom panel styling. Delete button got `type="button"`.

**What the Sheet primitive provides that the old code lacked:**
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` connecting the title
- Escape key closes the sheet
- Focus trap (Tab stays within the sheet)
- Initial focus on first interactive control
- Focus restoration to the trigger element on close
- Accessible close button with `aria-label="Close {title}"`
- Backdrop click closes, panel click does not

**Verification results:** All 217 tests pass, lint clean, build succeeds.