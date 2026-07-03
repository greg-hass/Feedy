# Feedy application assessment

Date: 2026-07-03 (updated after reliability and UX improvements)

## Audit scope

Combined architecture, wiring, UX, and accessibility review of the Feedy repository. The intended user goal is to sign in, discover and organize feeds, read or save items, and manage refresh and storage settings from a mobile-first PWA.

## Evidence and limits

- Source, route, schema, configuration, and automated tests were inspected.
- `npm run lint`, `npm run test` (230 tests), and `npm run build` completed successfully.
- `.env.example` was added with all required variables and non-secret development values.
- `dependency-preflight.ts` provides bounded, injectable PostgreSQL and Redis readiness checks with actionable errors that never expose credentials.
- Docker could not be checked because Docker is not installed or not available on this machine. This remains an environmental blocker.
- No current-run screenshots were captured because the running product could not be rendered without Docker or local PostgreSQL/Redis. Visual findings are source-based and must be confirmed in a healthy runtime. This audit does not claim WCAG compliance.

## Resolved findings

### P1: development startup contract — RESOLVED

- `.env.example` now documents every required variable with non-secret development values.
- `TROUBLESHOOTING.md` defines two explicit supported paths (Docker Compose vs direct `npm run dev`) and adds diagnostics for missing `DATABASE_URL`, Redis unavailable, port conflicts, and stale `.next/dev/lock`.
- `src/lib/dependency-preflight.ts` provides bounded, injectable checks that throw actionable errors naming the missing service without exposing connection details.
- The health route at `/api/health` reuses `checkRuntimeDependencies` and returns 503 with a safe error label on failure.

### P1: inactive navigation unreadable in light mode — RESOLVED

- `--nav-inactive` token added: `#52525b` (light), `#d4d4d8` (dark).
- `app-shell.tsx` uses `var(--nav-inactive)` instead of hard-coded `#ffffff`.
- `aria-current={active ? "page" : undefined}` added to the active navigation link.
- Theme contract test (`theme-contract.test.ts`) provides regression protection.

### P1: duplicate create requests — RESOLVED

- All create/edit form buttons changed from `onClick={() => mutation.mutate()}` to `type="submit"`.
- Edit sheets (EditFolderSheet, EditFeedSheet) now wrap their fields in `<form onSubmit>` elements.
- Buttons disable during pending state.
- Submitted values are trimmed.
- Create-form errors are announced with `role="alert"`.
- Source-contract tests in `feeds-ui.test.ts` verify no `onClick` mutation handlers remain on `<Button>` components.

### P2: modal accessibility — RESOLVED

- New `Sheet` primitive (`src/components/ui/sheet.tsx`) provides:
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby` connected to the title
  - Escape key closes the sheet
  - Focus trap (Tab stays within the sheet)
  - Initial focus on first interactive control
  - Focus restoration to trigger element on close
  - Backdrop click closes, panel click does not
  - Close button with `aria-label="Close {title}"`
- Adopted in: AddFolderSheet, EditFolderSheet, EditFeedSheet, BulkMoveSheet, FeedHealthSheet, FolderBulkMoveSheet, EditFeedModal.
- Tests verify dialog semantics and helper functions (`isEscapeKey`, `findFirstFocusable`).

### P2: mutation feedback — RESOLVED

- Login errors use `role="alert"`.
- Password visibility button no longer has `tabIndex={-1}` (keyboard-focusable).
- Discovery search input has `aria-label="Search feeds"`.
- Add-feed errors surfaced with `role="alert"` near discovery results.
- Settings screen has a polite live region (`aria-live="polite"`) that announces success or error for the most recent setting change.
- Cadence and retention buttons expose `aria-pressed` for their selected state.
- Duplicate import/export links replaced with a single "Manage imports and backups" action.

### P2: semantic color token incorrect — RESOLVED

- `--success` corrected from `#ef4444` (red) to `#059669` (green) in light mode.
- `--success` corrected from `#f87171` (light red) to `#34d399` (green) in dark mode.
- Contrast values updated accordingly.
- Theme contract test verifies green success values.

## Remaining limitations

### P3: visual hierarchy is polished but dense

The UI consistently uses rounded cards, small uppercase eyebrow text, and numerous nested surfaces. On mobile this can make secondary screens feel busy and reduce scan speed. Treat as future polish, not a structural rewrite.

### Runtime verification blocked

Docker is not available on this machine. The following could not be verified and require a healthy runtime with PostgreSQL and Redis:

- No current-run screenshots at 390x844 or 1280x720.
- No authenticated end-to-end flow (login, timeline, discovery, add feed, move to folder, mark read, bookmark, reader mode, settings persistence, OPML export, JSON backup, logout).
- No keyboard-only traversal test of sheets (Enter to open, Escape to close, focus starts inside, focus returns to trigger, Tab cannot escape).
- No 200% zoom or reduced-motion test.
- No Docker Compose configuration or healthcheck execution.
- No real feed discovery, refresh, OPML, reader extraction, or worker execution against live PostgreSQL and Redis.

## Test suite status

- 230 tests across 70 suites, all passing.
- New test files: `dependency-preflight.test.ts` (5 tests), `sheet.test.tsx` (9 tests), `theme-contract.test.ts` (5 tests), `async-feedback.test.ts` (8 tests).
- Existing test files updated: `feeds-ui.test.ts` (now 10 tests, up from 8).
- Lint and build pass cleanly.

## Recommended next steps

1. Install Docker and run `docker compose up --build` to verify the full stack.
2. Capture the six named screenshots at 390x844 after each page is stable.
3. Exercise the full authenticated core flow.
4. Test keyboard-only sheet behavior and focus management in a real browser.
5. Test at 200% zoom and with reduced motion enabled.
6. Address P3 visual density as a separate polish pass.
