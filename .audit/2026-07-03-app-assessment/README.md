# Feedy application assessment

Date: 2026-07-03

## Audit scope

Combined architecture, wiring, UX, and accessibility review of the Feedy repository. The intended user goal is to sign in, discover and organize feeds, read or save items, and manage refresh and storage settings from a mobile-first PWA.

## Evidence and limits

- Source, route, schema, configuration, and automated tests were inspected.
- `npm run lint`, `npm run test`, and `npm run build` completed successfully.
- The existing development server could not render a page. Requests to `localhost:3000` timed out. Its log identifies a missing `DATABASE_URL` and repeated Redis connection failures.
- Docker could not be checked because Docker is not installed or not available on this machine.
- Because the running product could not be rendered, no valid current-run screenshots could be captured. Visual and responsive findings below are source-based and must be confirmed in a healthy runtime. This audit does not claim WCAG compliance.

## Step health

1. **Application startup — blocked**
   - The documented `npm run dev` path starts Next.js but the app is not usable without PostgreSQL and Redis.
   - `src/lib/env.ts` supplies a default database URL to application code, but Prisma reads `DATABASE_URL` directly from the process environment. The current `.env` does not define it.
   - The server repeatedly attempts Redis reconnection and stopped responding to HTTP requests.

2. **Sign in — code-complete, runtime unverified**
   - The page has explicit labels, appropriate autocomplete values, a password visibility control, and clear error copy.
   - The password visibility button is removed from keyboard order with `tabIndex={-1}`, making a useful control unavailable to keyboard-only users.
   - Error feedback is visually presented but is not marked as an alert or live region.

3. **Timeline and reading — structurally strong, runtime unverified**
   - Routes, API handlers, pagination, refresh delta behavior, read state, bookmarks, reader sanitization, and media resolution have focused automated coverage.
   - Empty, loading, and error components exist.
   - The fixed mobile shell and bottom navigation need visual testing at small-height viewports, zoom, and safe-area variants.

4. **Feed discovery — code-complete, runtime unverified**
   - The separation between library results and new discovery results is clear.
   - Search begins after two characters and exposes source filters.
   - Search fields rely on placeholder text without an explicit accessible label.
   - Add failures are not surfaced next to discovery results, so a failed add can look like an inert button.

5. **Feed and folder management — wiring risk**
   - `AddFolderForm` and `AddFeedForm` place a default submit button inside a form and also call the mutation from `onClick`. A pointer activation can invoke the mutation from both click and form submit.
   - Create-folder errors are not displayed.
   - Bottom sheets are visually modal but lack `role="dialog"`, `aria-modal`, accessible dialog naming, Escape handling, initial focus, focus trapping, and focus restoration.
   - Several icon-only close buttons have no accessible name.
   - Native `confirm()` is used for destructive actions, which is functional but visually inconsistent and offers limited explanatory context.

6. **Settings and import/export — mostly wired, polish gaps**
   - Settings, storage statistics, purge, OPML import/export, and JSON export have corresponding API routes.
   - Most settings mutations do not expose success or failure feedback. A network failure can leave the user unsure whether a tap was saved.
   - “Import / Export” and “Backups” are two adjacent buttons that navigate to the same page, creating a false choice.
   - Refresh and retention option groups do not expose their selected state with `aria-pressed`.

## Strengths

- The repository is organized around clear service and ownership boundaries.
- Authentication, CSRF, security headers, outbound request restrictions, sanitization, workload bounds, queue recovery, and single-user ownership have meaningful tests.
- The schema has sensible uniqueness constraints and indexes for core timeline access patterns.
- Loading, empty, error, offline, and global-error surfaces exist.
- Mobile concerns such as safe-area spacing, pull-to-refresh, wake lock, scroll restoration, and PWA registration are deliberately handled.
- The 201-test suite is broad and fast, and the production build succeeds.

## Notable risks

### P0: none found

No evidence of an immediate destructive data or authentication defect was found.

### P1: development startup contract is misleading

The documented local workflow says `npm install`, Prisma generation, then `npm run dev`, but the web app also requires reachable PostgreSQL and Redis plus a process-level `DATABASE_URL`. On the audited machine, this produces a server that listens but does not answer requests. This prevents onboarding and masks UI defects.

Recommendation: make the supported local path explicit and self-validating. Either document Docker as required for dependencies and provide a checked `.env.example`, or add a preflight that fails quickly with actionable dependency errors.

### P1: inactive navigation can be unreadable in light mode

Inactive bottom-navigation items use hard-coded white text while the light glass surface is derived from a white surface. This is likely to produce insufficient contrast or invisible labels/icons in light mode.

Recommendation: use a semantic theme token for inactive navigation text and verify contrast for both themes and every accent.

### P1: duplicate create requests

Add-feed and add-folder buttons can submit through both `onClick` and the form `onSubmit`. Duplicate folder records are possible; feed uniqueness may convert the second request into a confusing error.

Recommendation: let the form own submission and make the button `type="submit"` without a mutation click handler.

### P2: modal accessibility is incomplete

Sheets lack modal semantics and focus management. Keyboard and screen-reader users can move into obscured page content, may not hear the dialog title, and may not return to the trigger after closing.

Recommendation: establish one existing-pattern dialog primitive with naming, Escape close, focus trap, initial focus, and restoration. Apply it without redesigning the sheets.

### P2: mutation feedback is inconsistent

Several settings and discovery actions communicate pending state but not failure. Some controls remain interactive while a shared settings mutation is pending.

Recommendation: provide local error/status feedback and prevent conflicting requests at the control-group level.

### P2: semantic color token is incorrect

`--success` is red in both light and dark themes. Even if currently unused, this is a high-risk token because future success UI will communicate the opposite state.

Recommendation: correct or remove the token and add a small theme contract test.

### P3: visual hierarchy is polished but dense

The UI consistently uses rounded cards, small uppercase eyebrow text, and numerous nested surfaces. On mobile this can make secondary screens feel busy and reduce scan speed.

Recommendation: after runtime recovery, test whether section headings and spacing can carry hierarchy without enclosing every group in a card. Treat this as polish, not a structural rewrite.

## Verification gaps

- No current-run screenshots due to the blocked runtime.
- No authenticated end-to-end flow.
- No Docker Compose configuration or healthcheck execution.
- No keyboard, screen-reader, reduced-motion, 200% zoom, or device safe-area test.
- No real feed discovery, refresh, OPML, reader extraction, or worker execution against live PostgreSQL and Redis.

## Recommended order

1. Repair and document the local startup contract.
2. Fix duplicate form submission and add regression tests.
3. Correct light-mode navigation contrast and the success token.
4. Add dialog semantics and focus behavior.
5. Add mutation error/status feedback.
6. Run an authenticated visual audit at mobile, tablet, and desktop widths with light/dark themes.
